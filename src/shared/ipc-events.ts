/**
 * Type-safe push events from main process → renderer process.
 */
import type {
  ConnectionStatus,
  ProtocolMessage,
  InspectorSessionUpdate,
  InspectorPermissionRequest,
  AvailableCommand,
} from './types';

export interface MainToRendererEvents {
  readonly 'connection-status': {
    readonly status: ConnectionStatus;
    readonly error?: string;
    readonly pid?: number;
    readonly errorStack?: string;
  };
  readonly 'protocol-message': ProtocolMessage;
  readonly 'session-update': InspectorSessionUpdate;
  readonly 'permission-request': InspectorPermissionRequest;
  readonly 'prompt-done': {
    readonly sessionId: string;
    readonly stopReason: string;
  };
  readonly 'available-commands': {
    readonly sessionId: string;
    readonly commands: readonly AvailableCommand[];
  };
  readonly 'config-option-changed': {
    readonly sessionId: string;
    readonly configId: string;
    readonly value: string;
  };
  readonly 'native-theme-updated': {
    readonly shouldUseDarkColors: boolean;
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
  'config-option-changed': 'config-option-changed',
  'native-theme-updated': 'native-theme-updated',
};
