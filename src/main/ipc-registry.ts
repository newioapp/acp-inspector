/**
 * Generic IPC registration — wires ipcMain.handle to handler methods.
 */
import { ipcMain } from 'electron';
import type { IpcApi } from '../shared/ipc-api';
import { IPC_CHANNELS } from '../shared/ipc-api';

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    // JSON-RPC error shape: { code, message, data }
    if (typeof obj.message === 'string') {
      return obj.data
        ? `${obj.message}: ${typeof obj.data === 'string' ? obj.data : JSON.stringify(obj.data)}`
        : obj.message;
    }
  }
  return String(err);
}

export function registerIpcHandlers(handler: IpcApi): void {
  for (const [method, channel] of Object.entries(IPC_CHANNELS)) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return await (handler[method as keyof IpcApi] as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        throw new Error(extractErrorMessage(err));
      }
    });
  }
}
