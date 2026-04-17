import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')) as { version: string };

// Polyfill for non-TTY environments (CI, piped output).
if (!process.stdout.clearLine) {
  process.stdout.clearLine = (): boolean => true;
  process.stdout.cursorTo = (): boolean => true;
  process.stdout.moveCursor = (): boolean => true;
}

export default defineConfig({
  main: {
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    build: {
      rollupOptions: {
        external: ['electron-store'],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
        },
      },
      isolatedEntries: true,
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
