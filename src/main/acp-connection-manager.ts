/**
 * ACP connection manager — spawns an ACP agent process, manages the
 * ClientSideConnection, and relays protocol messages to the renderer.
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { Writable, Readable } from 'stream';
import * as fs from 'fs/promises';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { AnyMessage } from '@agentclientprotocol/sdk';
import type { Stream } from '@agentclientprotocol/sdk';
import type * as acp from '@agentclientprotocol/sdk';
import type {
  ConnectionConfig,
  AgentCapabilities,
  SessionInfo,
  SessionSetupConfig,
  SessionModeState,
  SessionModelState,
} from '../shared/types';
import type { ExtensionPluginRegistry } from './plugins/extension-plugin-registry';

export interface AcpConnectionListener {
  onStatusChanged(
    status: 'disconnected' | 'connecting' | 'connected' | 'error',
    error?: string,
    detail?: { pid?: number; errorStack?: string },
  ): void;
  onProtocolMessage(direction: 'sent' | 'received', data: unknown): void;
  onSessionUpdate(data: unknown): void;
  onPermissionRequest(requestId: string, data: unknown): void;
  onPromptDone(sessionId: string, stopReason: string): void;
}

/**
 * Manages a single ACP connection at a time.
 * Spawns the child process, initializes ACP, and relays events.
 */
export class AcpConnectionManager implements acp.Client {
  private child: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private listener: AcpConnectionListener;
  private pendingPermissions = new Map<string, { resolve: (resp: acp.RequestPermissionResponse) => void }>();
  private permissionCounter = 0;
  private supportsListSessions = false;
  private supportsLoadSession = false;
  private supportsCloseSession = false;
  private cwd = '';
  private readonly pluginRegistry: ExtensionPluginRegistry;

  constructor(listener: AcpConnectionListener, pluginRegistry: ExtensionPluginRegistry) {
    this.listener = listener;
    this.pluginRegistry = pluginRegistry;
  }

  get isConnected(): boolean {
    return this.connection !== null;
  }

  /** Spawn an ACP agent process, initialize the connection, return capabilities. */
  async connect(config: ConnectionConfig): Promise<AgentCapabilities> {
    if (this.connection) {
      await this.disconnect();
    }

    this.listener.onStatusChanged('connecting');
    this.cwd = config.cwd || process.cwd();

    try {
      const child = spawn(config.command, [...config.args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...config.envVars, TERM: 'dumb' },
        ...(config.cwd ? { cwd: config.cwd } : {}),
      });

      this.child = child;

      child.stderr.on('data', (data: Buffer) => {
        // Surface stderr as protocol messages for debugging
        this.listener.onProtocolMessage('received', { stderr: data.toString().trimEnd() });
      });

      child.on('error', (err) => {
        const nodeErr = err as NodeJS.ErrnoException;
        let message = err.message;
        if (nodeErr.code === 'ENOENT') {
          message = `Command not found: "${config.command}". Check that the command is available in your PATH, or use an absolute path.`;
        }
        this.listener.onStatusChanged('error', message, { errorStack: err.stack });
      });

      child.on('exit', (code, signal) => {
        if (this.child === child) {
          this.child = null;
          this.connection = null;
          this.listener.onStatusChanged('disconnected');
          this.listener.onProtocolMessage('received', {
            event: 'process_exit',
            code,
            signal,
          });
        }
      });

      const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
      const input = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
      const rawStream = ndJsonStream(output, input);

      // Tap into the raw ndjson stream to capture actual protocol messages
      const tapSent = new TransformStream<AnyMessage, AnyMessage>({
        transform: (msg, controller) => {
          this.listener.onProtocolMessage('sent', msg);
          controller.enqueue(msg);
        },
      });
      const tapReceived = new TransformStream<AnyMessage, AnyMessage>({
        transform: (msg, controller) => {
          this.listener.onProtocolMessage('received', msg);
          controller.enqueue(msg);
        },
      });

      const stream: Stream = {
        writable: tapSent.writable,
        readable: rawStream.readable.pipeThrough(tapReceived),
      };
      void tapSent.readable.pipeTo(rawStream.writable);

      const conn = new ClientSideConnection((_agent) => this, stream);
      this.connection = conn;

      const initParams = {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
      };

      const initResult = await conn.initialize(initParams);

      // Check if agent supports session/list and session/load
      const caps = initResult.agentCapabilities as Record<string, unknown> | undefined;
      const sessionCaps = caps?.sessionCapabilities as Record<string, unknown> | undefined;
      this.supportsListSessions = sessionCaps?.list !== undefined;
      this.supportsLoadSession = caps?.loadSession === true;
      this.supportsCloseSession = sessionCaps?.close !== undefined;

      this.listener.onStatusChanged('connected', undefined, { pid: child.pid });

      // Give plugin registry access to the connection for sending custom requests
      this.pluginRegistry.setConnection(conn);

      return {
        protocolVersion: String(initResult.protocolVersion),
        supportsListSessions: this.supportsListSessions,
        supportsLoadSession: this.supportsLoadSession,
        supportsCloseSession: this.supportsCloseSession,
        raw: initResult,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      const stack = err instanceof Error ? err.stack : undefined;
      this.listener.onStatusChanged('error', message, { errorStack: stack });
      await this.disconnect();
      throw err;
    }
  }

  /** Kill the child process and clean up. */
  async disconnect(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.connection = null;
    this.supportsListSessions = false;
    this.supportsLoadSession = false;
    this.supportsCloseSession = false;

    // Clean up plugin registry
    this.pluginRegistry.setConnection(null);
    this.pluginRegistry.dispose();

    // Reject all pending permission requests
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
    }
    this.pendingPermissions.clear();

    if (!child) {
      return;
    }

    if (child.stdin && !child.stdin.destroyed) {
      child.stdin.end();
    }

    const exited = await Promise.race([
      new Promise<boolean>((resolve) => {
        child.once('exit', () => resolve(true));
        if (child.exitCode !== null) {
          resolve(true);
        }
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);

    if (!exited) {
      child.kill('SIGKILL');
    }

    this.listener.onStatusChanged('disconnected');
  }

  /** Create a new ACP session. */
  async newSession(config: SessionSetupConfig): Promise<SessionInfo> {
    const conn = this.getConnection();
    const result = await conn.newSession({
      cwd: config.cwd || this.cwd,
      mcpServers: config.mcpServers.map((s) => ({
        name: s.name,
        command: s.command,
        args: [...s.args],
        env: s.env?.map((e) => ({ name: e.name, value: e.value })) ?? [],
      })),
    });
    const r = result as Record<string, unknown>;
    return {
      sessionId: result.sessionId,
      createdAt: Date.now(),
      modes: r.modes as SessionModeState | undefined,
      models: r.models as SessionModelState | undefined,
    };
  }

  /** Load an existing ACP session. */
  async loadSession(sessionId: string, config: SessionSetupConfig): Promise<SessionInfo> {
    const conn = this.getConnection();
    const result = await conn.loadSession({
      sessionId,
      cwd: config.cwd || this.cwd,
      mcpServers: config.mcpServers.map((s) => ({
        name: s.name,
        command: s.command,
        args: [...s.args],
        env: s.env?.map((e) => ({ name: e.name, value: e.value })) ?? [],
      })),
    });
    const r = result as Record<string, unknown>;
    return {
      sessionId,
      createdAt: Date.now(),
      modes: r.modes as SessionModeState | undefined,
      models: r.models as SessionModelState | undefined,
    };
  }

  /** Close an ACP session. */
  async closeSession(sessionId: string): Promise<void> {
    const conn = this.getConnection();
    await conn.unstable_closeSession({ sessionId });
  }

  /** List existing sessions. Only works if agent advertises sessionCapabilities.list. */
  async listSessions(): Promise<SessionInfo[]> {
    const conn = this.getConnection();
    if (!this.supportsListSessions) {
      return [];
    }
    try {
      const result = await conn.listSessions({});
      const now = Date.now();
      return result.sessions.map((s) => ({ sessionId: s.sessionId, createdAt: now }));
    } catch {
      return [];
    }
  }

  /** Send a prompt — resolves when the prompt turn completes. */
  async sendPrompt(sessionId: string, text: string): Promise<void> {
    const conn = this.getConnection();

    // Let plugins transform the prompt (e.g., /model → _kiro.dev/commands/execute)
    const transformed = await this.pluginRegistry.transformPrompt(sessionId, text);
    if (transformed?.handled) {
      if (transformed.message) {
        // Surface the plugin's response message as an agent message in the output panel
        this.listener.onSessionUpdate({
          sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: transformed.message } },
        });
      }
      return;
    }

    const result = await conn.prompt({
      sessionId,
      prompt: [{ type: 'text', text }],
    });
    this.listener.onPromptDone(sessionId, result.stopReason);
  }

  /** Cancel an in-flight prompt. */
  async cancelPrompt(sessionId: string): Promise<void> {
    const conn = this.getConnection();
    await conn.cancel({ sessionId });
  }

  /** Respond to a pending permission request from the renderer. */
  respondPermission(requestId: string, optionId: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      this.pendingPermissions.delete(requestId);
      pending.resolve({ outcome: { outcome: 'selected', optionId } });
    }
  }

  /** Set the session mode. */
  async setMode(sessionId: string, modeId: string): Promise<void> {
    const conn = this.getConnection();
    await conn.setSessionMode({ sessionId, modeId });
  }

  /** Set the session model. */
  async setModel(sessionId: string, modelId: string): Promise<void> {
    const conn = this.getConnection();
    await conn.unstable_setSessionModel({ sessionId, modelId });
  }

  private getConnection(): ClientSideConnection {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    return this.connection;
  }

  // ---------------------------------------------------------------------------
  // acp.Client — session updates
  // ---------------------------------------------------------------------------

  sessionUpdate(params: acp.SessionNotification): Promise<void> {
    this.listener.onSessionUpdate(params);
    const sessionId = (params as Record<string, unknown>).sessionId as string | undefined;
    if (sessionId) {
      this.pluginRegistry.handleSessionUpdate(sessionId, params);
    }
    return Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  // acp.Client — permissions
  // ---------------------------------------------------------------------------

  requestPermission(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const requestId = `perm_${String(++this.permissionCounter)}`;
    this.listener.onPermissionRequest(requestId, params);

    return new Promise((resolve) => {
      this.pendingPermissions.set(requestId, { resolve });
    });
  }

  // ---------------------------------------------------------------------------
  // acp.Client — file system
  // ---------------------------------------------------------------------------

  async readTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
    const content = await fs.readFile(params.path, 'utf-8');
    return { content };
  }

  async writeTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
    await fs.writeFile(params.path, params.content, 'utf-8');
    return {};
  }

  // ---------------------------------------------------------------------------
  // acp.Client — extensions
  // ---------------------------------------------------------------------------

  extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.pluginRegistry.handleRequest(method, params);
  }

  extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    this.pluginRegistry.handleNotification(method, params);
    return Promise.resolve();
  }
}
