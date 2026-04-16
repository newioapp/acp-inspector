/**
 * InspectorAPI — the shape of `window.api` exposed to the renderer.
 */
import type { IpcApi } from '../shared/ipc-api';
import type { MainToRendererEvents } from '../shared/ipc-events';

export interface InspectorAPI extends IpcApi {
  onConnectionStatus(callback: (data: MainToRendererEvents['connection-status']) => void): () => void;
  onProtocolMessage(callback: (data: MainToRendererEvents['protocol-message']) => void): () => void;
  onSessionUpdate(callback: (data: MainToRendererEvents['session-update']) => void): () => void;
  onPermissionRequest(callback: (data: MainToRendererEvents['permission-request']) => void): () => void;
  onPromptDone(callback: (data: MainToRendererEvents['prompt-done']) => void): () => void;
  onAvailableCommands(callback: (data: MainToRendererEvents['available-commands']) => void): () => void;
  onModeChanged(callback: (data: MainToRendererEvents['mode-changed']) => void): () => void;
  onModelChanged(callback: (data: MainToRendererEvents['model-changed']) => void): () => void;
}

declare global {
  interface Window {
    api: InspectorAPI;
  }
}
