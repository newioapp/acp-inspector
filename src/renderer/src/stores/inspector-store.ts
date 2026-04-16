/**
 * Inspector store — renderer-side state for the ACP Inspector.
 */
import { create } from 'zustand';
import type {
  ConnectionStatus,
  ConnectionConfig,
  ProtocolMessage,
  SessionInfo,
  SessionUpdate,
  PermissionRequest,
  SessionSetupConfig,
  AvailableCommand,
} from '../../../shared/types';
import type { InspectorStateSnapshot } from '../../../main/main-state';

const MAX_PROTOCOL_MESSAGES = 500;
const MAX_SESSION_UPDATES = 500;

interface InspectorState {
  // Connection
  readonly connectionStatus: ConnectionStatus;
  readonly connectionError?: string;
  readonly connectionPid?: number;
  readonly connectionErrorStack?: string;
  readonly agentInfo: unknown;
  readonly supportsListSessions: boolean;
  readonly supportsLoadSession: boolean;
  readonly supportsCloseSession: boolean;
  readonly envVars: Readonly<Record<string, string>>;

  // Sessions
  readonly sessions: SessionInfo[];
  readonly activeSessionId: string | null;
  readonly prompting: boolean;

  // Output
  readonly sessionUpdates: SessionUpdate[];
  readonly protocolMessages: ProtocolMessage[];
  readonly permissionRequests: PermissionRequest[];

  // Slash commands (per session)
  readonly availableCommands: Readonly<Record<string, readonly AvailableCommand[]>>;
}

interface InspectorActions {
  // Hydration
  hydrate(snapshot: InspectorStateSnapshot): void;

  // Connection
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  setConnectionStatus(status: ConnectionStatus, error?: string, pid?: number, errorStack?: string): void;
  setAgentInfo(info: unknown): void;
  setEnvVars(envVars: Record<string, string>): void;

  // Sessions
  createSession(config: SessionSetupConfig): Promise<void>;
  loadSession(sessionId: string, config: SessionSetupConfig): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  refreshSessions(): Promise<void>;
  setActiveSession(sessionId: string | null): void;

  // Prompt
  sendPrompt(text: string): Promise<void>;
  cancelPrompt(): Promise<void>;
  setPrompting(prompting: boolean): void;

  // Events
  addProtocolMessage(msg: ProtocolMessage): void;
  addSessionUpdate(update: SessionUpdate): void;
  addPermissionRequest(req: PermissionRequest): void;
  respondPermission(requestId: string, optionId: string): Promise<void>;
  removePermissionRequest(requestId: string): void;
  setAvailableCommands(sessionId: string, commands: readonly AvailableCommand[]): void;
  updateSessionMode(sessionId: string, modeId: string): void;
  updateSessionModel(sessionId: string, modelId: string): void;

  // Clear
  clearOutput(): void;
  clearProtocolLog(): void;
}

type InspectorStore = InspectorState & InspectorActions;

export const useInspectorStore = create<InspectorStore>((set, get) => ({
  connectionStatus: 'disconnected',
  connectionError: undefined,
  connectionPid: undefined,
  connectionErrorStack: undefined,
  agentInfo: null,
  supportsListSessions: false,
  supportsLoadSession: false,
  supportsCloseSession: false,
  envVars: {},
  sessions: [],
  activeSessionId: null,
  prompting: false,
  sessionUpdates: [],
  protocolMessages: [],
  permissionRequests: [],
  availableCommands: {},

  hydrate(snapshot: InspectorStateSnapshot): void {
    set({
      connectionStatus: snapshot.connectionStatus,
      connectionError: snapshot.connectionError,
      connectionPid: snapshot.connectionPid,
      connectionErrorStack: snapshot.connectionErrorStack,
      agentInfo: snapshot.agentInfo,
      supportsListSessions: snapshot.supportsListSessions,
      supportsLoadSession: snapshot.supportsLoadSession,
      supportsCloseSession: snapshot.supportsCloseSession,
      envVars: snapshot.envVars,
      sessions: [...snapshot.sessions],
      activeSessionId: snapshot.activeSessionId,
      prompting: snapshot.prompting,
      sessionUpdates: [...snapshot.sessionUpdates],
      protocolMessages: [...snapshot.protocolMessages],
      permissionRequests: [...snapshot.permissionRequests],
    });
  },

  async connect(config: ConnectionConfig): Promise<void> {
    set({ connectionStatus: 'connecting', connectionError: undefined, agentInfo: null });
    try {
      const caps = await window.api.connect(config);
      set({
        agentInfo: caps.raw,
        supportsListSessions: caps.supportsListSessions,
        supportsLoadSession: caps.supportsLoadSession,
        supportsCloseSession: caps.supportsCloseSession,
      });
    } catch (err) {
      set({
        connectionStatus: 'error',
        connectionError: err instanceof Error ? err.message : 'Connection failed',
      });
    }
  },

  async disconnect(): Promise<void> {
    set({ connectionStatus: 'disconnecting' });
    await window.api.disconnect();
    set({
      connectionStatus: 'disconnected',
      sessions: [],
      activeSessionId: null,
      prompting: false,
      permissionRequests: [],
      agentInfo: null,
      supportsListSessions: false,
      supportsLoadSession: false,
      supportsCloseSession: false,
      sessionUpdates: [],
      protocolMessages: [],
      availableCommands: {},
    });
  },

  setAvailableCommands(sessionId: string, commands: readonly AvailableCommand[]): void {
    set((s) => ({
      availableCommands: { ...s.availableCommands, [sessionId]: commands },
    }));
  },

  updateSessionMode(sessionId: string, modeId: string): void {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.sessionId === sessionId && sess.modes
          ? { ...sess, modes: { ...sess.modes, currentModeId: modeId } }
          : sess,
      ),
    }));
  },

  updateSessionModel(sessionId: string, modelId: string): void {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.sessionId === sessionId && sess.models
          ? { ...sess, models: { ...sess.models, currentModelId: modelId } }
          : sess,
      ),
    }));
  },

  setConnectionStatus(status: ConnectionStatus, error?: string, pid?: number, errorStack?: string): void {
    set({ connectionStatus: status, connectionError: error, connectionPid: pid, connectionErrorStack: errorStack });
  },

  setAgentInfo(info: unknown): void {
    set({ agentInfo: info });
  },

  setEnvVars(envVars: Record<string, string>): void {
    set({ envVars });
    void window.api.updateEnvVars(envVars);
  },

  async createSession(config: SessionSetupConfig): Promise<void> {
    const result = await window.api.newSession(config);
    set((s) => ({
      sessions: [...s.sessions, result],
      activeSessionId: result.sessionId,
    }));
  },

  async loadSession(sessionId: string, config: SessionSetupConfig): Promise<void> {
    const result = await window.api.loadSession(sessionId, config);
    set((s) => ({
      sessions: [...s.sessions, result],
      activeSessionId: result.sessionId,
    }));
  },

  async closeSession(sessionId: string): Promise<void> {
    await window.api.closeSession(sessionId);
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.sessionId !== sessionId);
      const activeSessionId = s.activeSessionId === sessionId ? (sessions[0]?.sessionId ?? null) : s.activeSessionId;
      return { sessions, activeSessionId };
    });
  },

  async refreshSessions(): Promise<void> {
    const sessions = await window.api.listSessions();
    set({ sessions });
  },

  setActiveSession(sessionId: string | null): void {
    set({ activeSessionId: sessionId });
    void window.api.setActiveSession(sessionId);
  },

  async sendPrompt(text: string): Promise<void> {
    const { activeSessionId } = get();
    if (!activeSessionId) {
      return;
    }
    // Add user message to output
    get().addSessionUpdate({
      timestamp: Date.now(),
      sessionId: activeSessionId,
      data: { update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } },
    });
    set({ prompting: true });
    await window.api.sendPrompt(activeSessionId, text);
  },

  async cancelPrompt(): Promise<void> {
    const { activeSessionId } = get();
    if (!activeSessionId) {
      return;
    }
    await window.api.cancelPrompt(activeSessionId);
  },

  setPrompting(prompting: boolean): void {
    set({ prompting });
  },

  addProtocolMessage(msg: ProtocolMessage): void {
    set((s) => ({
      protocolMessages: [...s.protocolMessages, msg].slice(-MAX_PROTOCOL_MESSAGES),
    }));
  },

  addSessionUpdate(update: SessionUpdate): void {
    set((s) => ({
      sessionUpdates: [...s.sessionUpdates, update].slice(-MAX_SESSION_UPDATES),
    }));
  },

  addPermissionRequest(req: PermissionRequest): void {
    set((s) => ({
      permissionRequests: [...s.permissionRequests, req],
    }));
  },

  async respondPermission(requestId: string, optionId: string): Promise<void> {
    const req = get().permissionRequests.find((r) => r.requestId === requestId);
    await window.api.respondPermission(requestId, optionId);
    // Mark as responded instead of removing
    set((s) => ({
      permissionRequests: s.permissionRequests.map((r) =>
        r.requestId === requestId ? { ...r, respondedOptionId: optionId } : r,
      ),
    }));
    // Inject synthetic session update so the response appears in the output timeline
    if (req) {
      get().addSessionUpdate({
        timestamp: Date.now(),
        sessionId: req.sessionId,
        data: { update: { sessionUpdate: 'permission_response', requestId, selectedOptionId: optionId } },
      });
    }
  },

  removePermissionRequest(requestId: string): void {
    set((s) => ({
      permissionRequests: s.permissionRequests.filter((r) => r.requestId !== requestId),
    }));
  },

  clearOutput(): void {
    const { activeSessionId } = get();
    set((s) => ({
      sessionUpdates: s.sessionUpdates.filter((u) => u.sessionId !== activeSessionId),
      permissionRequests: s.permissionRequests.filter((r) => r.sessionId !== activeSessionId),
    }));
    void window.api.clearMainOutput(activeSessionId);
  },

  clearProtocolLog(): void {
    const { activeSessionId } = get();
    set((s) => ({
      protocolMessages: s.protocolMessages.filter((m) => m.sessionId !== activeSessionId),
    }));
    void window.api.clearMainProtocolLog(activeSessionId);
  },
}));
