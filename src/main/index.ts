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
import { isJsonRpcRequest, isJsonRpcResponse } from '../shared/types';

app.name = 'ACP Inspector';

// Enforce a single running instance: a second launch focuses the existing window
// instead of starting another copy. Set once the window manager exists.
let activeWindowManager: MainWindowManager | undefined;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    activeWindowManager?.focus();
  });
}

void app.whenReady().then(async () => {
  // A primary instance already owns the lock; this duplicate is quitting.
  if (!gotSingleInstanceLock) {
    return;
  }
  // Windows AppUserModelID — must match `appId` in electron-builder.yml.
  electronApp.setAppUserModelId('app.newio.acp-inspector');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const store = createStore();
  const mainWindowManager = new MainWindowManager(store);
  activeWindowManager = mainWindowManager;
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
        let sessionId: string | undefined;
        let rpcId: number | string | undefined;

        if (isJsonRpcRequest(data)) {
          sessionId = data.params?.sessionId as string | undefined;
          rpcId = data.id ?? undefined;
        } else if (isJsonRpcResponse(data)) {
          const result = data.result as Record<string, unknown> | undefined;
          sessionId = result?.sessionId as string | undefined;
          rpcId = data.id ?? undefined;
        }

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
        const sessionId = data.sessionId;
        const update = { timestamp: Date.now(), sessionId, data };
        mainState.sessionUpdates.push(update);
        mainWindowManager.send(EVENT_CHANNELS['session-update'], update);

        // Intercept specific update types
        const inner = data.update;
        switch (inner.sessionUpdate) {
          case 'available_commands_update': {
            slashCommandStore.set(sessionId, inner.availableCommands);
            mainWindowManager.send(EVENT_CHANNELS['available-commands'], {
              sessionId,
              commands: inner.availableCommands,
            });
            break;
          }
          case 'current_mode_update': {
            // Legacy mode echo: normalized to the generic 'mode' config option.
            const value = inner.currentModeId;
            mainState.updateSessionConfigOption(sessionId, 'mode', value);
            mainWindowManager.send(EVENT_CHANNELS['config-option-changed'], { sessionId, configId: 'mode', value });
            break;
          }
          case 'config_option_update': {
            for (const opt of inner.configOptions) {
              if (opt.type !== 'select') {
                continue;
              }
              mainState.updateSessionConfigOption(sessionId, opt.id, opt.currentValue);
              mainWindowManager.send(EVENT_CHANNELS['config-option-changed'], {
                sessionId,
                configId: opt.id,
                value: opt.currentValue,
              });
            }
            break;
          }
          default:
            // Other update types (agent_message_chunk, tool_call, etc.) are
            // handled by the renderer via the session-update push event above.
            break;
          case 'user_message_chunk':
          case 'agent_message_chunk':
          case 'agent_thought_chunk':
          case 'tool_call':
          case 'tool_call_update':
          case 'plan':
          case 'session_info_update':
          case 'usage_update':
            break;
        }
      },
      onPermissionRequest(requestId, data) {
        const sessionId = data.sessionId;
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

  // Forward OS-level theme changes to the renderer so a 'system' theme follows
  // the system appearance while the app is running.
  nativeTheme.on('updated', () => {
    mainWindowManager.send(EVENT_CHANNELS['native-theme-updated'], {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    });
  });

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
