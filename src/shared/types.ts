/**
 * Shared types for the ACP Inspector.
 *
 * ACP protocol types are re-exported from @agentclientprotocol/sdk.
 * Only inspector-specific types (connection config, protocol log, UI state) are defined here.
 */

// Re-export ACP SDK types used across the codebase
export type {
  InitializeResponse,
  AgentCapabilities as AcpAgentCapabilities,
  Implementation as AcpAgentInfo,
  AuthMethod as AcpAuthMethod,
  SessionNotification,
  SessionUpdate as AcpSessionUpdate,
  RequestPermissionRequest,
  RequestPermissionResponse,
  PermissionOption,
  PermissionOptionKind,
  ToolCall,
  ToolCallUpdate,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
  ToolKind,
  Diff,
  Terminal,
  Content,
  ContentChunk,
  SessionMode,
  SessionModeState,
  SessionModeId,
  ModelInfo,
  SessionModelState,
  AvailableCommand,
  AvailableCommandsUpdate,
  McpServerStdio,
  UsageUpdate,
  CurrentModeUpdate,
  Plan,
  SessionInfo as AcpSessionInfo,
} from '@agentclientprotocol/sdk';

// ---------------------------------------------------------------------------
// Inspector-specific types
// ---------------------------------------------------------------------------

export type ThemeSource = 'system' | 'light' | 'dark';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

/** Connection config for spawning an ACP agent process. */
export interface ConnectionConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly envVars: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Protocol message log — inspector-specific, not part of ACP
// ---------------------------------------------------------------------------

/** A JSON-RPC request or notification captured from the ndjson stream. */
export interface JsonRpcRequest {
  readonly jsonrpc?: string;
  readonly id?: number | string | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** A JSON-RPC response captured from the ndjson stream. */
export interface JsonRpcResponse {
  readonly jsonrpc?: string;
  readonly id?: number | string | null;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

/** Stderr or process-exit events surfaced as protocol messages. */
export interface ProcessEvent {
  readonly stderr?: string;
  readonly event?: string;
  readonly code?: number | null;
  readonly signal?: string | null;
}

/** All possible shapes of ProtocolMessage.data. */
export type ProtocolMessageData = JsonRpcRequest | JsonRpcResponse | ProcessEvent;

/** A raw JSON-RPC message logged for protocol inspection. */
export interface ProtocolMessage {
  readonly id: number;
  readonly timestamp: number;
  readonly direction: 'sent' | 'received';
  readonly sessionId?: string;
  readonly data: ProtocolMessageData;
}

/** Check if a ProtocolMessageData is a JSON-RPC request/notification. */
export function isJsonRpcRequest(data: ProtocolMessageData): data is JsonRpcRequest {
  return 'method' in data && typeof data.method === 'string';
}

/** Check if a ProtocolMessageData is a JSON-RPC response. */
export function isJsonRpcResponse(data: ProtocolMessageData): data is JsonRpcResponse {
  return 'result' in data || 'error' in data;
}

// ---------------------------------------------------------------------------
// Inspector session/output state — wraps ACP types with timestamps
// ---------------------------------------------------------------------------

/** A session update notification with inspector metadata. */
export interface InspectorSessionUpdate {
  readonly timestamp: number;
  readonly sessionId: string;
  readonly data: SessionNotification;
}

/** A permission request with inspector metadata. */
export interface InspectorPermissionRequest {
  readonly requestId: string;
  readonly timestamp: number;
  readonly sessionId: string;
  readonly data: RequestPermissionRequest;
  readonly respondedOptionId?: string;
}

/** A selectable value within a session config option. */
export interface InspectorConfigOptionValue {
  readonly value: string;
  readonly name: string;
  readonly description?: string;
}

/**
 * A session config dimension rendered as a dropdown (model, mode, effort, …).
 *
 * `id` is the ACP option id passed to session/set_config_option; `category` is the
 * spec's UX-only hint. The inspector renders one dropdown per option generically, so
 * new dimensions (e.g. effort) appear with no inspector code referencing them.
 */
export interface InspectorConfigOption {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly currentValue: string;
  readonly options: readonly InspectorConfigOptionValue[];
}

/** Inspector-enriched session info (adds loaded flag + config dropdowns to an ACP session). */
export interface InspectorSessionInfo {
  readonly sessionId: string;
  readonly loaded?: boolean;
  readonly title?: string | null;
  readonly updatedAt?: string | null;
  readonly cwd?: string;
  readonly configOptions: readonly InspectorConfigOption[];
}

/** ACP agent capabilities returned from initialize, with inspector-friendly booleans. */
export interface AgentCapabilities {
  readonly protocolVersion: string;
  readonly supportsListSessions: boolean;
  readonly supportsLoadSession: boolean;
  readonly supportsCloseSession: boolean;
  readonly raw: InitializeResponse;
}

/** Config for creating or loading a session. */
export interface SessionSetupConfig {
  readonly cwd: string;
  readonly mcpServers: readonly McpServerConfig[];
}

/** Stdio MCP server definition for the session setup UI. */
export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: readonly { readonly name: string; readonly value: string }[];
}

// Re-import for use in type definitions above
import type { SessionNotification, RequestPermissionRequest, InitializeResponse } from '@agentclientprotocol/sdk';
