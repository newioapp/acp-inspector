/**
 * Type-safe push events from main process → renderer process.
 */
import type { ConnectionStatus, ProtocolMessage, SessionUpdate, PermissionRequest, AvailableCommand } from './types';

export interface MainToRendererEvents {
  readonly 'connection-status': {
    readonly status: ConnectionStatus;
    readonly error?: string;
    readonly pid?: number;
    readonly errorStack?: string;
  };
  readonly 'protocol-message': ProtocolMessage;
  readonly 'session-update': SessionUpdate;
  readonly 'permission-request': PermissionRequest;
  readonly 'prompt-done': {
    readonly sessionId: string;
    readonly stopReason: string;
  };
  readonly 'available-commands': {
    readonly sessionId: string;
    readonly commands: readonly AvailableCommand[];
  };
  readonly 'mode-changed': {
    readonly sessionId: string;
    readonly modeId: string;
  };
  readonly 'model-changed': {
    readonly sessionId: string;
    readonly modelId: string;
  };
}

/** All push event channel names. */
export const EVENT_CHANNELS: { readonly [K in keyof MainToRendererEvents]: K } = {
  'connection-status': 'connection-status',
  'protocol-message': 'protocol-message',
  'session-update': 'session-update',
  'permission-request': 'permission-request',
  'prompt-done': 'prompt-done',
  'available-commands': 'available-commands',
  'mode-changed': 'mode-changed',
  'model-changed': 'model-changed',
};
