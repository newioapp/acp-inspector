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
  InspectorSessionInfo,
  SessionSetupConfig,
  ProtocolMessageData,
} from '../shared/types';
import type { ExtensionPluginRegistry } from './plugins/extension-plugin-registry';

declare const __APP_VERSION__: string;

export interface AcpConnectionListener {
  onStatusChanged(
    status: 'disconnected' | 'connecting' | 'connected' | 'error',
    error?: string,
    detail?: { pid?: number; errorStack?: string },
  ): void;
  onProtocolMessage(direction: 'sent' | 'received', data: ProtocolMessageData): void;
  onSessionUpdate(data: acp.SessionNotification): void;
  onPermissionRequest(requestId: string, data: acp.RequestPermissionRequest): void;
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
      // Validate the working directory up front. spawn() reports a missing cwd
      // as an ENOENT that is indistinguishable from a missing command, so
      // without this check a bad cwd surfaces as a misleading "command not
      // found" for every agent.
      const cwdError = await validateCwd(config.cwd);
      if (cwdError) {
        throw new Error(cwdError);
      }

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
      // The pipe aborts when the agent's stdio closes — normal on disconnect
      // and on a failed spawn. Swallow the resulting AbortError; the child
      // 'error'/'exit' handlers already surface the real cause. Without this
      // catch it becomes an unhandled promise rejection.
      void tapSent.readable.pipeTo(rawStream.writable).catch(() => {});

      const conn = new ClientSideConnection((_agent) => this, stream);
      this.connection = conn;

      const initParams: acp.InitializeRequest = {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          // Advertised so agents include `type: "terminal"` methods in
          // `authMethods`. The inspector displays the command for the user to
          // run manually; it does not invoke `authenticate` itself.
          auth: { terminal: true },
        },
        clientInfo: {
          name: 'ACP Inspector',
          version: __APP_VERSION__,
        },
      };

      const initResult = await conn.initialize(initParams);

      // Check if agent supports session/list and session/load
      const caps = initResult.agentCapabilities;
      const sessionCaps = caps?.sessionCapabilities;
      this.supportsListSessions = sessionCaps?.list !== undefined && sessionCaps.list !== null;
      this.supportsLoadSession = caps?.loadSession === true;
      this.supportsCloseSession = sessionCaps?.close !== undefined && sessionCaps.close !== null;

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
  async newSession(config: SessionSetupConfig): Promise<InspectorSessionInfo> {
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
    const { models, modes } = extractSessionConfig(result);
    return {
      sessionId: result.sessionId,
      updatedAt: new Date().toISOString(),
      modes,
      models,
    };
  }

  /** Load an existing ACP session. */
  async loadSession(sessionId: string, config: SessionSetupConfig): Promise<InspectorSessionInfo> {
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
    const { models, modes } = extractSessionConfig(result);
    return {
      sessionId,
      modes,
      models,
    };
  }

  /** Close an ACP session. */
  async closeSession(sessionId: string): Promise<void> {
    const conn = this.getConnection();
    await conn.unstable_closeSession({ sessionId });
  }

  /** List existing sessions. Only works if agent advertises sessionCapabilities.list. */
  async listSessions(): Promise<InspectorSessionInfo[]> {
    const conn = this.getConnection();
    if (!this.supportsListSessions) {
      return [];
    }
    try {
      const result = await conn.listSessions({});
      return result.sessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        updatedAt: s.updatedAt,
        cwd: s.cwd,
      }));
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
    try {
      await conn.unstable_setSessionModel({ sessionId, modelId });
    } catch (err: unknown) {
      // Older agents expose model selection via the experimental
      // `unstable_setSessionModel`; newer agents drop it in favour of the stable
      // `setSessionConfigOption` and reply "method not found" (-32601). Only fall
      // back in that case — a genuine failure should surface its own error.
      if (!isMethodNotFound(err)) {
        throw err;
      }
      await conn.setSessionConfigOption({ sessionId, configId: 'model', value: modelId });
    }
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
    if (params.sessionId) {
      this.pluginRegistry.handleSessionUpdate(params.sessionId, params);
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

/**
 * Validate a connection working directory before spawning the agent.
 *
 * Returns an error message when `cwd` is set but does not point to an existing
 * directory, otherwise null. An empty/undefined cwd is valid — spawn falls back
 * to the process cwd. This exists because spawn() surfaces a non-existent cwd as
 * an ENOENT identical to a missing executable, which would otherwise be reported
 * as a misleading "command not found".
 */
export async function validateCwd(cwd: string | undefined): Promise<string | null> {
  if (!cwd) {
    return null;
  }
  try {
    const stat = await fs.stat(cwd);
    if (!stat.isDirectory()) {
      return `Working directory is not a directory: "${cwd}".`;
    }
    return null;
  } catch {
    return `Working directory does not exist: "${cwd}".`;
  }
}

/** A `select`-typed session config option (narrowed from the union). */
type SelectConfigOption = Extract<acp.SessionConfigOption, { type: 'select' }>;

/** JSON-RPC "method not found" — the agent does not implement the requested method. */
const JSON_RPC_METHOD_NOT_FOUND = -32601;

/** True when an ACP rejection indicates the method isn't implemented by the agent. */
export function isMethodNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const obj = err as Record<string, unknown>;
  return obj.code === JSON_RPC_METHOD_NOT_FOUND;
}

/**
 * Derive model/mode UI state from a session response.
 *
 * Newer agents report selectable models/modes through the generic `configOptions`
 * array (categories 'model' / 'mode'); older agents use the dedicated
 * `models`/`modes` fields. Prefer configOptions, falling back to the legacy
 * fields, so both styles populate the inspector's dropdowns.
 */
export function extractSessionConfig(result: acp.NewSessionResponse | acp.LoadSessionResponse): {
  models: acp.SessionModelState | undefined;
  modes: acp.SessionModeState | undefined;
} {
  const configOptions = result.configOptions ?? undefined;
  return {
    models: modelStateFromConfigOptions(configOptions) ?? result.models ?? undefined,
    modes: modeStateFromConfigOptions(configOptions) ?? result.modes ?? undefined,
  };
}

/** Build SessionModelState from the 'model' select config option, if present. */
function modelStateFromConfigOptions(
  configOptions: readonly acp.SessionConfigOption[] | undefined,
): acp.SessionModelState | undefined {
  const select = findSelectByCategory(configOptions, 'model');
  if (!select) {
    return undefined;
  }
  return {
    availableModels: flattenSelectOptions(select.options).map((o) => ({
      modelId: o.value,
      name: o.name,
      description: o.description ?? null,
    })),
    currentModelId: select.currentValue,
  };
}

/** Build SessionModeState from the 'mode' select config option, if present. */
function modeStateFromConfigOptions(
  configOptions: readonly acp.SessionConfigOption[] | undefined,
): acp.SessionModeState | undefined {
  const select = findSelectByCategory(configOptions, 'mode');
  if (!select) {
    return undefined;
  }
  return {
    availableModes: flattenSelectOptions(select.options).map((o) => ({
      id: o.value,
      name: o.name,
      description: o.description ?? null,
    })),
    currentModeId: select.currentValue,
  };
}

/** Find the first `select` config option matching the given category. */
function findSelectByCategory(
  configOptions: readonly acp.SessionConfigOption[] | undefined,
  category: acp.SessionConfigOptionCategory,
): SelectConfigOption | undefined {
  if (!configOptions) {
    return undefined;
  }
  for (const opt of configOptions) {
    if (opt.type === 'select' && opt.category === category) {
      return opt;
    }
  }
  return undefined;
}

/** Flatten possibly-grouped select options into a flat list of option values. */
function flattenSelectOptions(options: acp.SessionConfigSelectOptions): acp.SessionConfigSelectOption[] {
  const result: acp.SessionConfigSelectOption[] = [];
  for (const item of options) {
    if ('value' in item) {
      result.push(item);
    } else if ('options' in item) {
      result.push(...item.options);
    }
  }
  return result;
}
