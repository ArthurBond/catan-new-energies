// Starts the built game server the way `npm run host:online` does, for the online e2e tests:
// `--share online` with a stand-in for the Tailscale program (fake-tailscale.mjs) that opens a
// real HTTPS address in front of the game, so the browsers go through TLS, wss and a proxy.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const savesDir = process.env.SAVES_DIR;
if (!savesDir) throw new Error('SAVES_DIR must be set');
fs.rmSync(savesDir, { recursive: true, force: true });
fs.mkdirSync(savesDir, { recursive: true });

// A throwaway certificate for https://localhost (the tests tell the browser to accept it).
const cert = path.join(savesDir, 'tls-cert.pem');
const key = path.join(savesDir, 'tls-key.pem');
try {
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'],
    { stdio: 'ignore' }
  );
} catch (err) {
  console.error('The online e2e tests need the "openssl" program to make a test certificate.');
  throw err;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TAILSCALE_CLI = path.join(root, 'e2e-online', 'fake-tailscale.mjs');
process.env.FAKE_TS_TLS_CERT = cert;
process.env.FAKE_TS_TLS_KEY = key;
process.argv.push('--share', 'online', '--no-open', '--skip-link-check');

import(pathToFileURL(path.join(root, 'dist-server', 'main.js')).href).catch((err) => {
  console.error(err);
  process.exit(1);
});
