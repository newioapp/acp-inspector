/**
 * Main process IPC handler implementations.
 */
/* eslint-disable @typescript-eslint/require-await -- IpcApi interface requires Promise returns */
import { dialog, nativeTheme } from 'electron';
import type Store from 'electron-store';
import type { IpcApi } from '../shared/ipc-api';
import type {
  ThemeSource,
  ConnectionConfig,
  AgentCapabilities,
  InspectorSessionInfo,
  SessionSetupConfig,
  AvailableCommand,
} from '../shared/types';
import type { InspectorStateSnapshot } from './main-state';
import type { StoreSchema } from './store';
import type { AcpConnectionManager } from './acp-connection-manager';
import type { MainInspectorState } from './main-state';
import type { SlashCommandStore } from './slash-command-store';
import { getShellEnv, listAvailableShells } from './shell-env';

interface IpcHandlerDeps {
  readonly store: Store<StoreSchema>;
  readonly connectionManager: AcpConnectionManager;
  readonly mainState: MainInspectorState;
  readonly slashCommandStore: SlashCommandStore;
}

export class IpcHandler implements IpcApi {
  private readonly store: Store<StoreSchema>;
  private readonly connectionManager: AcpConnectionManager;
  private readonly mainState: MainInspectorState;
  private readonly slashCommandStore: SlashCommandStore;

  constructor(deps: IpcHandlerDeps) {
    this.store = deps.store;
    this.connectionManager = deps.connectionManager;
    this.mainState = deps.mainState;
    this.slashCommandStore = deps.slashCommandStore;
  }

  // Theme
  async getTheme(): Promise<ThemeSource> {
    return this.store.get('themeSource');
  }

  async setTheme(theme: ThemeSource): Promise<void> {
    nativeTheme.themeSource = theme;
    this.store.set('themeSource', theme);
  }

  async getNativeThemeDark(): Promise<boolean> {
    return nativeTheme.shouldUseDarkColors;
  }

  // Shell environment
  async listShells(): Promise<string[]> {
    return listAvailableShells();
  }

  async getShellEnv(shell: string): Promise<Record<string, string>> {
    return getShellEnv(shell);
  }

  // Dialogs
  async selectDirectory(): Promise<string | undefined> {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? undefined : result.filePaths[0];
  }

  // ACP connection
  async getLastConnectionConfig(): Promise<{ command: string; args: string; cwd: string }> {
    return {
      command: this.store.get('lastCommand'),
      args: this.store.get('lastArgs'),
      cwd: this.store.get('lastCwd'),
    };
  }

  async connect(config: ConnectionConfig): Promise<AgentCapabilities> {
    // Persist last-used config
    this.store.set('lastCommand', config.command);
    this.store.set('lastArgs', config.args.join(' '));
    this.store.set('lastCwd', config.cwd);
    const caps = await this.connectionManager.connect(config);
    this.mainState.agentInfo = caps.raw;
    this.mainState.connectedCommand = config.command;
    this.mainState.connectedArgs = [...config.args];
    this.mainState.supportsListSessions = caps.supportsListSessions;
    this.mainState.supportsLoadSession = caps.supportsLoadSession;
    this.mainState.supportsCloseSession = caps.supportsCloseSession;
    return caps;
  }

  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
    this.mainState.onDisconnected();
  }

  // ACP sessions
  async newSession(config: SessionSetupConfig): Promise<InspectorSessionInfo> {
    const session = await this.connectionManager.newSession(config);
    const enriched = { ...session, loaded: true };
    this.mainState.sessions.push(enriched);
    this.mainState.activeSessionId = session.sessionId;
    return enriched;
  }

  async loadSession(sessionId: string, config: SessionSetupConfig): Promise<InspectorSessionInfo> {
    const session = await this.connectionManager.loadSession(sessionId, config);
    // Replace existing entry (from listSessions) instead of duplicating,
    // merging to preserve title/cwd/updatedAt from the listed session
    const idx = this.mainState.sessions.findIndex((s) => s.sessionId === sessionId);
    const existing = idx >= 0 ? this.mainState.sessions[idx] : undefined;
    const enriched = { ...existing, ...session, loaded: true };
    if (idx >= 0) {
      this.mainState.sessions[idx] = enriched;
    } else {
      this.mainState.sessions.push(enriched);
    }
    this.mainState.activeSessionId = session.sessionId;
    return enriched;
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.connectionManager.closeSession(sessionId);
    this.mainState.sessions = this.mainState.sessions.filter((s) => s.sessionId !== sessionId);
    if (this.mainState.activeSessionId === sessionId) {
      this.mainState.activeSessionId = this.mainState.sessions[0]?.sessionId ?? null;
    }
  }

  async listSessions(): Promise<InspectorSessionInfo[]> {
    const listed = await this.connectionManager.listSessions();
    const existing = new Map(this.mainState.sessions.map((s) => [s.sessionId, s]));
    const merged = listed.map((s) => {
      const prev = existing.get(s.sessionId);
      return prev ? { ...s, modes: prev.modes, models: prev.models, loaded: prev.loaded } : s;
    });
    this.mainState.sessions = merged;
    return merged;
  }

  // ACP prompt
  async sendPrompt(sessionId: string, text: string): Promise<void> {
    this.mainState.prompting = true;
    this.mainState.sessionUpdates.push({
      timestamp: Date.now(),
      sessionId,
      data: { sessionId, update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } },
    });
    // Fire-and-forget — prompt completion is pushed via event
    void this.connectionManager.sendPrompt(sessionId, text);
  }

  async cancelPrompt(sessionId: string): Promise<void> {
    await this.connectionManager.cancelPrompt(sessionId);
  }

  // Permission response
  async respondPermission(requestId: string, optionId: string): Promise<void> {
    this.connectionManager.respondPermission(requestId, optionId);
    this.mainState.permissionRequests = this.mainState.permissionRequests.filter((r) => r.requestId !== requestId);
  }

  // Main-process state mirror
  async getInspectorState(): Promise<InspectorStateSnapshot> {
    return this.mainState.snapshot();
  }

  async setActiveSession(sessionId: string | null): Promise<void> {
    this.mainState.activeSessionId = sessionId;
  }

  async updateEnvVars(envVars: Record<string, string>): Promise<void> {
    this.mainState.envVars = envVars;
  }

  async clearMainOutput(sessionId: string | null): Promise<void> {
    this.mainState.clearOutput(sessionId);
  }

  async clearMainProtocolLog(sessionId: string | null): Promise<void> {
    this.mainState.clearProtocolLog(sessionId);
  }

  async getAvailableCommands(sessionId: string): Promise<AvailableCommand[]> {
    return [...this.slashCommandStore.get(sessionId)];
  }

  async getLastShell(): Promise<string> {
    return this.store.get('lastShell');
  }

  async setLastShell(shell: string): Promise<void> {
    this.store.set('lastShell', shell);
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.connectionManager.setMode(sessionId, modeId);
    this.mainState.updateSessionMode(sessionId, modeId);
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.connectionManager.setModel(sessionId, modelId);
    this.mainState.updateSessionModel(sessionId, modelId);
  }
}
