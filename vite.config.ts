/// <reference types="vitest" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets PAGES_BASE to that path
  base: process.env.PAGES_BASE ?? '/',
  plugins: [preact()],
  // Separate dependency caches when several dev servers share one node_modules (see PW_PORT in playwright.config.ts)
  cacheDir: process.env.PW_PORT ? `node_modules/.vite-${process.env.PW_PORT}` : 'node_modules/.vite',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'server/**/__tests__/**/*.test.ts',
    ],
  },
});
