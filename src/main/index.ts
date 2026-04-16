/**
 * ACP Inspector — main process entry point.
 */
import { app, BrowserWindow, nativeTheme } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createStore } from './store';
import { MainWindowManager } from './main-window';
import { AcpConnectionManager } from './acp-connection-manager';
import { MainInspectorState } from './main-state';
import { IpcHandler } from './ipc-handler';
import { registerIpcHandlers } from './ipc-registry';
import { ExtensionPluginRegistry } from './plugins/extension-plugin-registry';
import { createKiroSlashCommandsPlugin } from './plugins/kiro-slash-commands-plugin';
import { SlashCommandStore } from './slash-command-store';
import { EVENT_CHANNELS } from '../shared/ipc-events';
import type { AvailableCommand } from '../shared/types';

app.name = 'ACP Inspector';

void app.whenReady().then(async () => {
  electronApp.setAppUserModelId('dev.newio.acp-inspector');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const store = createStore();
  const mainWindowManager = new MainWindowManager(store);
  const mainState = new MainInspectorState();

  // Extension plugin registry — captures custom ACP methods
  const pluginRegistry = new ExtensionPluginRegistry();
  pluginRegistry.registerFactory('_kiro.dev/commands/available', createKiroSlashCommandsPlugin);

  // Slash command store — stores ACP standard available commands per session
  const slashCommandStore = new SlashCommandStore();

  let messageCounter = 0;
  /** Maps JSON-RPC request id → sessionId for correlating responses. */
  const requestSessionMap = new Map<unknown, string>();

  const connectionManager = new AcpConnectionManager(
    {
      onStatusChanged(status, error, detail) {
        mainState.connectionStatus = status;
        mainState.connectionError = error;
        mainState.connectionPid = detail?.pid;
        mainState.connectionErrorStack = detail?.errorStack;

        if (status === 'disconnected') {
          slashCommandStore.clear();
        }

        mainWindowManager.send(EVENT_CHANNELS['connection-status'], {
          status,
          error,
          pid: detail?.pid,
          errorStack: detail?.errorStack,
        });
      },
      onProtocolMessage(direction, data) {
        const d = data as Record<string, unknown>;
        const params = d.params as Record<string, unknown> | undefined;
        const result = d.result as Record<string, unknown> | undefined;
        const rpcId = d.id;
        let sessionId = (params?.sessionId as string | undefined) ?? (result?.sessionId as string | undefined);

        // Track request id → sessionId so we can correlate responses
        if (rpcId !== undefined && sessionId) {
          requestSessionMap.set(rpcId, sessionId);
        }
        // For responses without sessionId, inherit from the matching request
        if (!sessionId && rpcId !== undefined && requestSessionMap.has(rpcId)) {
          sessionId = requestSessionMap.get(rpcId);
        }

        const msg = {
          id: ++messageCounter,
          timestamp: Date.now(),
          direction,
          sessionId,
          data,
        };
        mainState.protocolMessages.push(msg);
        mainWindowManager.send(EVENT_CHANNELS['protocol-message'], msg);
      },
      onSessionUpdate(data) {
        const sessionId = (data as Record<string, unknown>).sessionId as string | undefined;
        const update = { timestamp: Date.now(), sessionId, data };
        mainState.sessionUpdates.push(update);
        mainWindowManager.send(EVENT_CHANNELS['session-update'], update);

        // Intercept available_commands_update → store and push to renderer
        const inner = (data as Record<string, unknown>).update as Record<string, unknown> | undefined;
        if (sessionId && inner?.sessionUpdate === 'available_commands_update') {
          const commands = (inner.availableCommands as AvailableCommand[] | undefined) ?? [];
          slashCommandStore.set(sessionId, commands);
          mainWindowManager.send(EVENT_CHANNELS['available-commands'], { sessionId, commands });
        }

        // Intercept mode/model updates from the agent
        if (sessionId && inner?.sessionUpdate === 'current_mode_update') {
          const modeId = inner.modeId as string;
          mainWindowManager.send(EVENT_CHANNELS['mode-changed'], { sessionId, modeId });
        }
        if (sessionId && inner?.sessionUpdate === 'current_model_update') {
          const modelId = inner.modelId as string;
          mainWindowManager.send(EVENT_CHANNELS['model-changed'], { sessionId, modelId });
        }
      },
      onPermissionRequest(requestId, data) {
        const sessionId = (data as Record<string, unknown>).sessionId as string;
        const req = { requestId, timestamp: Date.now(), sessionId, data };
        mainState.permissionRequests.push(req);
        mainWindowManager.send(EVENT_CHANNELS['permission-request'], req);
      },
      onPromptDone(sessionId, stopReason) {
        mainState.prompting = false;
        mainWindowManager.send(EVENT_CHANNELS['prompt-done'], { sessionId, stopReason });
      },
    },
    pluginRegistry,
  );

  // Apply persisted theme
  nativeTheme.themeSource = store.get('themeSource');

  // Register IPC handlers
  const ipcHandler = new IpcHandler({ store, connectionManager, mainState, slashCommandStore });
  registerIpcHandlers(ipcHandler);

  await mainWindowManager.create();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void mainWindowManager.create();
    }
  });

  app.on('before-quit', (event) => {
    if (connectionManager.isConnected) {
      event.preventDefault();
      void connectionManager.disconnect().finally(() => app.quit());
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
