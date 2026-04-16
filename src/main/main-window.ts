/**
 * Main window manager for the ACP Inspector.
 */
import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type Store from 'electron-store';
import type { StoreSchema } from './store';

export class MainWindowManager {
  private window: BrowserWindow | null = null;
  private readonly store: Store<StoreSchema>;

  constructor(store: Store<StoreSchema>) {
    this.store = store;
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  send(channel: string, event: unknown): void {
    this.window?.webContents.send(channel, event);
  }

  async create(): Promise<BrowserWindow> {
    const bounds = this.store.get('windowBounds');

    this.window = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      ...(bounds.x !== undefined && bounds.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
      minWidth: 800,
      minHeight: 560,
      show: false,
      titleBarStyle: 'default',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });

    this.window.on('ready-to-show', () => {
      this.window?.show();
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    const saveBounds = (): void => {
      const b = this.window?.getBounds();
      if (!b) {
        return;
      }
      this.store.set('windowBounds', { x: b.x, y: b.y, width: b.width, height: b.height });
    };
    this.window.on('resized', saveBounds);
    this.window.on('moved', saveBounds);

    this.window.webContents.setWindowOpenHandler((details) => {
      void shell.openExternal(details.url);
      return { action: 'deny' };
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await this.window.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      await this.window.loadFile(join(__dirname, '../renderer/index.html'));
    }

    if (is.dev) {
      this.window.webContents.openDevTools({ mode: 'bottom' });
    }

    return this.window;
  }
}
