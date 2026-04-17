/**
 * Generic IPC registration — wires ipcMain.handle to handler methods.
 */
import { ipcMain } from 'electron';
import type { IpcApi } from '../shared/ipc-api';
import { IPC_CHANNELS } from '../shared/ipc-api';

function extractErrorInfo(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      const message = obj.data
        ? `${obj.message}: ${typeof obj.data === 'string' ? obj.data : JSON.stringify(obj.data)}`
        : obj.message;
      return { message };
    }
  }
  return { message: String(err) };
}

/**
 * Registers ipcMain.handle for every channel in IPC_CHANNELS, dispatching
 * to the corresponding method on the handler. The cast on the handler method
 * is unavoidable here because ipcMain.handle provides untyped args — the
 * type safety boundary is enforced by the preload bridge which only exposes
 * the typed IpcApi to the renderer.
 */
export function registerIpcHandlers(handler: IpcApi): void {
  for (const [method, channel] of Object.entries(IPC_CHANNELS)) {
    const key = method as keyof IpcApi;
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- dynamic dispatch from typed IPC bridge
        return await (handler[key] as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (err) {
        const info = extractErrorInfo(err);
        const error = new Error(info.message);
        if (info.stack) {
          error.stack = info.stack;
        }
        throw error;
      }
    });
  }
}
