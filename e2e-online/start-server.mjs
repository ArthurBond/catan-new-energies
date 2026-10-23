// Starts the built game server for the online e2e tests with a fresh, empty saves folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const savesDir = process.env.SAVES_DIR;
if (!savesDir) throw new Error('SAVES_DIR must be set');
fs.rmSync(savesDir, { recursive: true, force: true });
fs.mkdirSync(savesDir, { recursive: true });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import(pathToFileURL(path.join(root, 'dist-server', 'main.js')).href).catch((err) => {
  console.error(err);
  process.exit(1);
});
