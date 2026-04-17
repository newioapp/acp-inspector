/**
 * Inspector store — renderer-side state for the ACP Inspector.
 */
import { create } from 'zustand';
import type {
  ConnectionStatus,
  ConnectionConfig,
  ProtocolMessage,
  InspectorSessionInfo,
  InspectorSessionUpdate,
  InspectorPermissionRequest,
  SessionSetupConfig,
  AvailableCommand,
  InitializeResponse,
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
  readonly agentInfo: InitializeResponse | null;
  readonly supportsListSessions: boolean;
  readonly supportsLoadSession: boolean;
  readonly supportsCloseSession: boolean;
  readonly envVars: Readonly<Record<string, string>>;
  /** Command + args used for the active connection — surfaced to the UI so the
   *  terminal-auth card can show the exact command the user needs to run. */
  readonly connectedCommand: string | null;
  readonly connectedArgs: readonly string[];

  // Sessions
  readonly sessions: InspectorSessionInfo[];
  readonly activeSessionId: string | null;
  readonly prompting: boolean;

  // Output
  readonly sessionUpdates: InspectorSessionUpdate[];
  readonly protocolMessages: ProtocolMessage[];
  readonly permissionRequests: InspectorPermissionRequest[];

  // Slash commands (per session)
  readonly availableCommands: Readonly<Record<string, readonly AvailableCommand[]>>;

  // IPC error surfacing
  readonly ipcError: { readonly message: string; readonly stack?: string } | null;
}

interface InspectorActions {
  // Hydration
  hydrate(snapshot: InspectorStateSnapshot): void;

  // Connection
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  setConnectionStatus(status: ConnectionStatus, error?: string, pid?: number, errorStack?: string): void;
  setAgentInfo(info: InitializeResponse | null): void;
  setEnvVars(envVars: Record<string, string>): void;

  // Sessions
  createSession(config: SessionSetupConfig): Promise<void>;
  loadSession(sessionId: string, config: SessionSetupConfig): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  refreshSessions(): Promise<void>;
  setActiveSession(sessionId: string | null): Promise<void>;

  // Prompt
  sendPrompt(text: string): Promise<void>;
  cancelPrompt(): Promise<void>;
  setPrompting(prompting: boolean): void;

  // Events
  addProtocolMessage(msg: ProtocolMessage): void;
  addSessionUpdate(update: InspectorSessionUpdate): void;
  addPermissionRequest(req: InspectorPermissionRequest): void;
  respondPermission(requestId: string, optionId: string): Promise<void>;
  removePermissionRequest(requestId: string): void;
  setAvailableCommands(sessionId: string, commands: readonly AvailableCommand[]): void;
  updateSessionMode(sessionId: string, modeId: string): void;
  updateSessionModel(sessionId: string, modelId: string): void;

  // Clear
  clearOutput(): void;
  clearProtocolLog(): void;

  // Error
  clearIpcError(): void;
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
  connectedCommand: null,
  connectedArgs: [],
  ipcError: null,

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
      connectedCommand: snapshot.connectedCommand,
      connectedArgs: snapshot.connectedArgs,
      sessionUpdates: [...snapshot.sessionUpdates],
      protocolMessages: [...snapshot.protocolMessages],
      permissionRequests: [...snapshot.permissionRequests],
    });
  },

  async connect(config: ConnectionConfig): Promise<void> {
    set({
      connectionStatus: 'connecting',
      connectionError: undefined,
      agentInfo: null,
      connectedCommand: config.command,
      connectedArgs: [...config.args],
    });
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
        connectedCommand: null,
        connectedArgs: [],
      });
    }
  },

  async disconnect(): Promise<void> {
    set({ connectionStatus: 'disconnecting' });
    try {
      await window.api.disconnect();
    } catch (err) {
      surfaceError(err);
    }
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
      connectedCommand: null,
      connectedArgs: [],
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

  setAgentInfo(info: InitializeResponse | null): void {
    set({ agentInfo: info });
  },

  setEnvVars(envVars: Record<string, string>): void {
    set({ envVars });
    void window.api.updateEnvVars(envVars);
  },

  async createSession(config: SessionSetupConfig): Promise<void> {
    try {
      const result = await window.api.newSession(config);
      set((s) => ({
        sessions: [...s.sessions, { ...result, loaded: true }],
        activeSessionId: result.sessionId,
      }));
    } catch (err) {
      surfaceError(err);
    }
  },

  async loadSession(sessionId: string, config: SessionSetupConfig): Promise<void> {
    try {
      const result = await window.api.loadSession(sessionId, config);
      set((s) => ({
        sessions: [...s.sessions.filter((sess) => sess.sessionId !== sessionId), { ...result, loaded: true }],
        activeSessionId: result.sessionId,
      }));
    } catch (err) {
      surfaceError(err);
    }
  },

  async closeSession(sessionId: string): Promise<void> {
    try {
      await window.api.closeSession(sessionId);
      set((s) => {
        const sessions = s.sessions.filter((sess) => sess.sessionId !== sessionId);
        const activeSessionId = s.activeSessionId === sessionId ? (sessions[0]?.sessionId ?? null) : s.activeSessionId;
        return { sessions, activeSessionId };
      });
    } catch (err) {
      surfaceError(err);
    }
  },

  async refreshSessions(): Promise<void> {
    try {
      const listed = await window.api.listSessions();
      set((s) => {
        const loadedIds = new Set(s.sessions.filter((sess) => sess.loaded).map((sess) => sess.sessionId));
        return { sessions: listed.map((sess) => (loadedIds.has(sess.sessionId) ? { ...sess, loaded: true } : sess)) };
      });
    } catch (err) {
      surfaceError(err);
    }
  },

  async setActiveSession(sessionId: string | null): Promise<void> {
    if (sessionId) {
      const session = get().sessions.find((s) => s.sessionId === sessionId);
      if (session && !session.loaded && get().supportsLoadSession) {
        await get().loadSession(sessionId, { cwd: session.cwd ?? '', mcpServers: [] });
        return;
      }
    }
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
      data: {
        sessionId: activeSessionId,
        update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } },
      },
    });
    set({ prompting: true });
    try {
      await window.api.sendPrompt(activeSessionId, text);
    } catch (err) {
      set({ prompting: false });
      surfaceError(err);
    }
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

  addSessionUpdate(update: InspectorSessionUpdate): void {
    set((s) => ({
      sessionUpdates: [...s.sessionUpdates, update].slice(-MAX_SESSION_UPDATES),
    }));
  },

  addPermissionRequest(req: InspectorPermissionRequest): void {
    set((s) => ({
      permissionRequests: [...s.permissionRequests, req],
    }));
  },

  async respondPermission(requestId: string, optionId: string): Promise<void> {
    try {
      await window.api.respondPermission(requestId, optionId);
      // Mark as responded instead of removing
      set((s) => ({
        permissionRequests: s.permissionRequests.map((r) =>
          r.requestId === requestId ? { ...r, respondedOptionId: optionId } : r,
        ),
      }));
    } catch (err) {
      surfaceError(err);
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

  clearIpcError(): void {
    set({ ipcError: null });
  },
}));

/** Surface an IPC error to the store for modal display. */
function surfaceError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  useInspectorStore.setState({ ipcError: { message, stack } });
}
