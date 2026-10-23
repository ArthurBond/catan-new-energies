// Bundles the Node game server (server/main.ts + the engine it imports from src/) into
// dist-server/main.js. Dependencies such as `ws` stay external and load from node_modules.
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  publicDir: false,
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: { format: 'es', entryFileNames: 'main.js' },
    },
  },
});
