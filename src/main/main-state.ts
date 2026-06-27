/**
 * Main-process in-memory state mirror for the ACP Inspector.
 *
 * Keeps uncapped buffers so no data is lost while the window is closed.
 * The snapshot() method caps arrays to MAX_SNAPSHOT_ITEMS for IPC transfer.
 */
import type {
  ConnectionStatus,
  ProtocolMessage,
  InspectorSessionInfo,
  InspectorSessionUpdate,
  InspectorPermissionRequest,
  InitializeResponse,
} from '../shared/types';

const MAX_SNAPSHOT_ITEMS = 500;

export interface InspectorStateSnapshot {
  readonly connectionStatus: ConnectionStatus;
  readonly connectionError?: string;
  readonly connectionPid?: number;
  readonly connectionErrorStack?: string;
  readonly agentInfo: InitializeResponse | null;
  readonly supportsListSessions: boolean;
  readonly supportsLoadSession: boolean;
  readonly supportsCloseSession: boolean;
  readonly envVars: Readonly<Record<string, string>>;
  readonly sessions: readonly InspectorSessionInfo[];
  readonly activeSessionId: string | null;
  readonly prompting: boolean;
  readonly connectedCommand: string | null;
  readonly connectedArgs: readonly string[];
  readonly sessionUpdates: readonly InspectorSessionUpdate[];
  readonly protocolMessages: readonly ProtocolMessage[];
  readonly permissionRequests: readonly InspectorPermissionRequest[];
}

export class MainInspectorState {
  connectionStatus: ConnectionStatus = 'disconnected';
  connectionError?: string;
  connectionPid?: number;
  connectionErrorStack?: string;
  agentInfo: InitializeResponse | null = null;
  supportsListSessions = false;
  supportsLoadSession = false;
  supportsCloseSession = false;
  envVars: Record<string, string> = {};
  sessions: InspectorSessionInfo[] = [];
  activeSessionId: string | null = null;
  prompting = false;
  connectedCommand: string | null = null;
  connectedArgs: readonly string[] = [];
  sessionUpdates: InspectorSessionUpdate[] = [];
  protocolMessages: ProtocolMessage[] = [];
  permissionRequests: InspectorPermissionRequest[] = [];

  snapshot(): InspectorStateSnapshot {
    return {
      connectionStatus: this.connectionStatus,
      connectionError: this.connectionError,
      connectionPid: this.connectionPid,
      connectionErrorStack: this.connectionErrorStack,
      agentInfo: this.agentInfo,
      supportsListSessions: this.supportsListSessions,
      supportsLoadSession: this.supportsLoadSession,
      supportsCloseSession: this.supportsCloseSession,
      envVars: this.envVars,
      sessions: this.sessions,
      activeSessionId: this.activeSessionId,
      prompting: this.prompting,
      connectedCommand: this.connectedCommand,
      connectedArgs: this.connectedArgs,
      sessionUpdates: this.sessionUpdates.slice(-MAX_SNAPSHOT_ITEMS),
      protocolMessages: this.protocolMessages.slice(-MAX_SNAPSHOT_ITEMS),
      permissionRequests: this.permissionRequests,
    };
  }

  updateSessionConfigOption(sessionId: string, configId: string, value: string): void {
    this.sessions = this.sessions.map((s) =>
      s.sessionId === sessionId
        ? { ...s, configOptions: s.configOptions.map((o) => (o.id === configId ? { ...o, currentValue: value } : o)) }
        : s,
    );
  }

  clearOutput(sessionId: string | null): void {
    if (sessionId === null) {
      return;
    }
    this.sessionUpdates = this.sessionUpdates.filter((u) => u.sessionId !== sessionId);
    this.permissionRequests = this.permissionRequests.filter((r) => r.sessionId !== sessionId);
  }

  clearProtocolLog(sessionId: string | null): void {
    if (sessionId === null) {
      // Clear messages not bound to any session
      this.protocolMessages = this.protocolMessages.filter((m) => m.sessionId !== undefined);
    } else {
      this.protocolMessages = this.protocolMessages.filter((m) => m.sessionId !== sessionId);
    }
  }

  onDisconnected(): void {
    this.sessions = [];
    this.activeSessionId = null;
    this.prompting = false;
    this.connectedCommand = null;
    this.connectedArgs = [];
    this.permissionRequests = [];
    this.agentInfo = null;
    this.supportsListSessions = false;
    this.supportsLoadSession = false;
    this.supportsCloseSession = false;
    this.sessionUpdates = [];
    this.protocolMessages = [];
  }
}
