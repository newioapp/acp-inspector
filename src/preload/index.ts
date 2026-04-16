/**
 * Preload script — exposes the typed IPC API to the renderer via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-api';
import { EVENT_CHANNELS } from '../shared/ipc-events';
import type { MainToRendererEvents } from '../shared/ipc-events';
import type { InspectorAPI } from './index.d';

function onEvent<K extends keyof MainToRendererEvents>(
  channel: K,
  callback: (data: MainToRendererEvents[K]) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: MainToRendererEvents[K]): void => {
    callback(data);
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: InspectorAPI = {
  // IpcApi
  getTheme: () => ipcRenderer.invoke(IPC_CHANNELS.getTheme),
  setTheme: (theme) => ipcRenderer.invoke(IPC_CHANNELS.setTheme, theme),
  getNativeThemeDark: () => ipcRenderer.invoke(IPC_CHANNELS.getNativeThemeDark),
  listShells: () => ipcRenderer.invoke(IPC_CHANNELS.listShells),
  getShellEnv: (shell) => ipcRenderer.invoke(IPC_CHANNELS.getShellEnv, shell),
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.selectDirectory),
  getLastConnectionConfig: () => ipcRenderer.invoke(IPC_CHANNELS.getLastConnectionConfig),
  connect: (config) => ipcRenderer.invoke(IPC_CHANNELS.connect, config),
  disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.disconnect),
  newSession: (config) => ipcRenderer.invoke(IPC_CHANNELS.newSession, config),
  loadSession: (sessionId, config) => ipcRenderer.invoke(IPC_CHANNELS.loadSession, sessionId, config),
  closeSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.closeSession, sessionId),
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.listSessions),
  sendPrompt: (sessionId, text) => ipcRenderer.invoke(IPC_CHANNELS.sendPrompt, sessionId, text),
  cancelPrompt: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.cancelPrompt, sessionId),
  respondPermission: (requestId, optionId) => ipcRenderer.invoke(IPC_CHANNELS.respondPermission, requestId, optionId),
  getInspectorState: () => ipcRenderer.invoke(IPC_CHANNELS.getInspectorState),
  setActiveSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.setActiveSession, sessionId),
  updateEnvVars: (envVars) => ipcRenderer.invoke(IPC_CHANNELS.updateEnvVars, envVars),
  clearMainOutput: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.clearMainOutput, sessionId),
  clearMainProtocolLog: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.clearMainProtocolLog, sessionId),
  getAvailableCommands: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.getAvailableCommands, sessionId),
  getLastShell: () => ipcRenderer.invoke(IPC_CHANNELS.getLastShell),
  setLastShell: (shell) => ipcRenderer.invoke(IPC_CHANNELS.setLastShell, shell),
  setMode: (sessionId, modeId) => ipcRenderer.invoke(IPC_CHANNELS.setMode, sessionId, modeId),
  setModel: (sessionId, modelId) => ipcRenderer.invoke(IPC_CHANNELS.setModel, sessionId, modelId),

  // Push events
  onConnectionStatus: (cb) => onEvent(EVENT_CHANNELS['connection-status'], cb),
  onProtocolMessage: (cb) => onEvent(EVENT_CHANNELS['protocol-message'], cb),
  onSessionUpdate: (cb) => onEvent(EVENT_CHANNELS['session-update'], cb),
  onPermissionRequest: (cb) => onEvent(EVENT_CHANNELS['permission-request'], cb),
  onPromptDone: (cb) => onEvent(EVENT_CHANNELS['prompt-done'], cb),
  onAvailableCommands: (cb) => onEvent(EVENT_CHANNELS['available-commands'], cb),
  onModeChanged: (cb) => onEvent(EVENT_CHANNELS['mode-changed'], cb),
  onModelChanged: (cb) => onEvent(EVENT_CHANNELS['model-changed'], cb),
};

contextBridge.exposeInMainWorld('api', api);
