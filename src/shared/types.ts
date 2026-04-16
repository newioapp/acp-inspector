/**
 * Shared types for the ACP Inspector.
 */

export type ThemeSource = 'system' | 'light' | 'dark';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

/** Connection config for spawning an ACP agent process. */
export interface ConnectionConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly envVars: Readonly<Record<string, string>>;
}

/** A raw JSON-RPC message logged for protocol inspection. */
export interface ProtocolMessage {
  readonly id: number;
  readonly timestamp: number;
  readonly direction: 'sent' | 'received';
  readonly sessionId?: string;
  readonly data: unknown;
}

/** Session info returned after creating or listing sessions. */
export interface SessionInfo {
  readonly sessionId: string;
  readonly createdAt: number;
  readonly modes?: SessionModeState;
  readonly models?: SessionModelState;
}

/** ACP session mode. */
export interface SessionMode {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

/** ACP session mode state. */
export interface SessionModeState {
  readonly currentModeId: string;
  readonly availableModes: readonly SessionMode[];
}

/** ACP session model info. */
export interface SessionModel {
  readonly modelId: string;
  readonly name: string;
  readonly description?: string;
}

/** ACP session model state. */
export interface SessionModelState {
  readonly currentModelId: string;
  readonly availableModels: readonly SessionModel[];
}

/** ACP agent capabilities returned from initialize. */
export interface AgentCapabilities {
  readonly protocolVersion: string;
  readonly supportsListSessions: boolean;
  readonly supportsLoadSession: boolean;
  readonly supportsCloseSession: boolean;
  readonly raw: unknown;
}

/** Config for creating or loading a session. */
export interface SessionSetupConfig {
  readonly cwd: string;
  readonly mcpServers: readonly McpServerConfig[];
}

/** Stdio MCP server definition (matches ACP McpServerStdio). */
export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: readonly { readonly name: string; readonly value: string }[];
}

/** A session update notification relayed from the agent. */
export interface SessionUpdate {
  readonly timestamp: number;
  readonly sessionId?: string;
  readonly data: unknown;
}

/** A permission request from the agent. */
export interface PermissionRequest {
  readonly requestId: string;
  readonly timestamp: number;
  readonly sessionId: string;
  readonly data: unknown;
  readonly respondedOptionId?: string;
}

/** An ACP slash command advertised by the agent (per the ACP slash-commands spec). */
export interface AvailableCommand {
  readonly name: string;
  readonly description: string;
  readonly input?: {
    readonly hint?: string;
  };
}
