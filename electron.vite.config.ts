import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Polyfill for non-TTY environments (CI, piped output).
if (!process.stdout.clearLine) {
  process.stdout.clearLine = (): boolean => true;
  process.stdout.cursorTo = (): boolean => true;
  process.stdout.moveCursor = (): boolean => true;
}

export default defineConfig({
  main: {
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
