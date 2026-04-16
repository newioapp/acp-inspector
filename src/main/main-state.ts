/**
 * Main-process in-memory state mirror for the ACP Inspector.
 *
 * Keeps uncapped buffers so no data is lost while the window is closed.
 * The snapshot() method caps arrays to MAX_SNAPSHOT_ITEMS for IPC transfer.
 */
import type { ConnectionStatus, ProtocolMessage, SessionInfo, SessionUpdate, PermissionRequest } from '../shared/types';

const MAX_SNAPSHOT_ITEMS = 500;

export interface InspectorStateSnapshot {
  readonly connectionStatus: ConnectionStatus;
  readonly connectionError?: string;
  readonly connectionPid?: number;
  readonly connectionErrorStack?: string;
  readonly agentInfo: unknown;
  readonly supportsListSessions: boolean;
  readonly supportsLoadSession: boolean;
  readonly supportsCloseSession: boolean;
  readonly envVars: Readonly<Record<string, string>>;
  readonly sessions: readonly SessionInfo[];
  readonly activeSessionId: string | null;
  readonly prompting: boolean;
  readonly sessionUpdates: readonly SessionUpdate[];
  readonly protocolMessages: readonly ProtocolMessage[];
  readonly permissionRequests: readonly PermissionRequest[];
}

export class MainInspectorState {
  connectionStatus: ConnectionStatus = 'disconnected';
  connectionError?: string;
  connectionPid?: number;
  connectionErrorStack?: string;
  agentInfo: unknown = null;
  supportsListSessions = false;
  supportsLoadSession = false;
  supportsCloseSession = false;
  envVars: Record<string, string> = {};
  sessions: SessionInfo[] = [];
  activeSessionId: string | null = null;
  prompting = false;
  sessionUpdates: SessionUpdate[] = [];
  protocolMessages: ProtocolMessage[] = [];
  permissionRequests: PermissionRequest[] = [];

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
      sessionUpdates: this.sessionUpdates.slice(-MAX_SNAPSHOT_ITEMS),
      protocolMessages: this.protocolMessages.slice(-MAX_SNAPSHOT_ITEMS),
      permissionRequests: this.permissionRequests,
    };
  }

  clearOutput(sessionId: string | null): void {
    this.sessionUpdates = this.sessionUpdates.filter((u) => u.sessionId !== sessionId);
    this.permissionRequests = this.permissionRequests.filter((r) => r.sessionId !== sessionId);
  }

  clearProtocolLog(sessionId: string | null): void {
    this.protocolMessages = this.protocolMessages.filter((m) => m.sessionId !== sessionId);
  }

  onDisconnected(): void {
    this.sessions = [];
    this.activeSessionId = null;
    this.prompting = false;
    this.permissionRequests = [];
    this.agentInfo = null;
    this.supportsListSessions = false;
    this.supportsLoadSession = false;
    this.supportsCloseSession = false;
    this.sessionUpdates = [];
    this.protocolMessages = [];
  }
}
