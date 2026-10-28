/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: { outDir: 'out/main' },
  },
  preload: {
    build: { outDir: 'out/preload' },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      chunkSizeWarningLimit: 1200,
      minify: true,
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});
