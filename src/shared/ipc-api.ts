/**
 * IPC contract between the main process and renderer process.
 *
 * Defines typed interfaces for all request/response IPC channels.
 * Push events from main → renderer are defined in ipc-events.ts.
 */
import type {
  ThemeSource,
  ConnectionConfig,
  AgentCapabilities,
  SessionInfo,
  SessionSetupConfig,
  AvailableCommand,
} from './types';
import type { InspectorStateSnapshot } from '../main/main-state';

export interface IpcApi {
  // Theme
  getTheme(): Promise<ThemeSource>;
  setTheme(theme: ThemeSource): Promise<void>;
  getNativeThemeDark(): Promise<boolean>;

  // Shell environment
  listShells(): Promise<string[]>;
  getShellEnv(shell: string): Promise<Record<string, string>>;

  // Dialogs
  selectDirectory(): Promise<string | undefined>;

  // Connection config
  getLastConnectionConfig(): Promise<{ command: string; args: string; cwd: string }>;

  // ACP connection lifecycle
  connect(config: ConnectionConfig): Promise<AgentCapabilities>;
  disconnect(): Promise<void>;

  // ACP session management
  newSession(config: SessionSetupConfig): Promise<SessionInfo>;
  loadSession(sessionId: string, config: SessionSetupConfig): Promise<SessionInfo>;
  closeSession(sessionId: string): Promise<void>;
  listSessions(): Promise<SessionInfo[]>;

  // ACP prompt
  sendPrompt(sessionId: string, text: string): Promise<void>;
  cancelPrompt(sessionId: string): Promise<void>;

  // ACP permission response
  respondPermission(requestId: string, optionId: string): Promise<void>;

  // Main-process state mirror
  getInspectorState(): Promise<InspectorStateSnapshot>;
  setActiveSession(sessionId: string | null): Promise<void>;
  updateEnvVars(envVars: Record<string, string>): Promise<void>;
  clearMainOutput(sessionId: string | null): Promise<void>;
  clearMainProtocolLog(sessionId: string | null): Promise<void>;

  // Slash commands
  getAvailableCommands(sessionId: string): Promise<AvailableCommand[]>;

  // Shell preference
  getLastShell(): Promise<string>;
  setLastShell(shell: string): Promise<void>;

  // Mode / model switching
  setMode(sessionId: string, modeId: string): Promise<void>;
  setModel(sessionId: string, modelId: string): Promise<void>;
}

/** Channel name for each IpcApi method. */
export const IPC_CHANNELS: { readonly [K in keyof IpcApi]: string } = {
  getTheme: 'get-theme',
  setTheme: 'set-theme',
  getNativeThemeDark: 'get-native-theme-dark',
  listShells: 'list-shells',
  getShellEnv: 'get-shell-env',
  selectDirectory: 'select-directory',
  getLastConnectionConfig: 'get-last-connection-config',
  connect: 'acp-connect',
  disconnect: 'acp-disconnect',
  newSession: 'acp-new-session',
  loadSession: 'acp-load-session',
  closeSession: 'acp-close-session',
  listSessions: 'acp-list-sessions',
  sendPrompt: 'acp-send-prompt',
  cancelPrompt: 'acp-cancel-prompt',
  respondPermission: 'acp-respond-permission',
  getInspectorState: 'get-inspector-state',
  setActiveSession: 'set-active-session',
  updateEnvVars: 'update-env-vars',
  clearMainOutput: 'clear-main-output',
  clearMainProtocolLog: 'clear-main-protocol-log',
  getAvailableCommands: 'get-available-commands',
  getLastShell: 'get-last-shell',
  setLastShell: 'set-last-shell',
  setMode: 'acp-set-mode',
  setModel: 'acp-set-model',
};
