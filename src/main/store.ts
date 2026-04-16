/**
 * Electron-store schema and factory for persistent app settings.
 */
import Store from 'electron-store';
import type { ThemeSource } from '../shared/types';

export interface StoreSchema {
  readonly themeSource: ThemeSource;
  readonly windowBounds: {
    readonly x?: number;
    readonly y?: number;
    readonly width: number;
    readonly height: number;
  };
  /** Last-used connection config fields. */
  readonly lastCommand: string;
  readonly lastArgs: string;
  readonly lastCwd: string;
  /** Last-selected shell for environment variable sourcing. */
  readonly lastShell: string;
}

export function createStore(): Store<StoreSchema> {
  return new Store<StoreSchema>({
    defaults: {
      themeSource: 'system',
      windowBounds: { width: 1100, height: 750 },
      lastCommand: '',
      lastArgs: '',
      lastCwd: '',
      lastShell: '',
    },
  });
}
