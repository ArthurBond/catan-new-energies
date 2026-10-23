/**
 * Entry point: `node dist-server/main.js [--no-open]` (built by `npm run build:server`).
 * Env: PORT (default 3210), NO_OPEN=1 (do not open the browser), SAVES_DIR (default ./saves),
 * BOT_DELAY_MS (fixed bot delay instead of the lobby's bot speed).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_DEFAULT_PORT } from '@/network/server-protocol';
import { startServer } from './http-server';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parsePort(raw: string | undefined): number {
  if (!raw) return SERVER_DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`PORT must be a number between 1 and 65535 (got "${raw}").`);
    process.exit(1);
  }
  return n;
}

async function main(): Promise<void> {
  const noOpen = process.argv.includes('--no-open') || process.env.NO_OPEN === '1';
  const botDelay = process.env.BOT_DELAY_MS ? Number(process.env.BOT_DELAY_MS) : undefined;
  const server = await startServer({
    port: parsePort(process.env.PORT),
    savesDir: path.resolve(process.env.SAVES_DIR ?? path.join(repoRoot, 'saves')),
    distDir: path.join(repoRoot, 'dist'),
    openBrowser: !noOpen,
    botDelayMs: botDelay !== undefined && Number.isFinite(botDelay) && botDelay >= 0 ? botDelay : undefined,
  });

  const lines = [
    '',
    '  CATAN: New Energies server is running.',
    '',
    `  You (host, keep this link private):  ${server.hostUrl}`,
    `  On this PC:                          http://localhost:${server.port}`,
    '',
    '  Friends on the same Wi-Fi open one of these:',
  ];
  const usable = server.addresses.filter((a) => a.usable);
  if (usable.length === 0) lines.push('    (no network address found; is Wi-Fi connected?)');
  for (const a of server.addresses) {
    lines.push(`    ${a.url.padEnd(28)} ${a.interfaceName}${a.note ? `  - ${a.note}` : ''}`);
  }
  lines.push(
    '',
    '  If friends cannot connect: run scripts\\windows\\allow-firewall.ps1 once as administrator,',
    '  and make sure the Wi-Fi network is set to Private in Windows settings.',
    `  ${noOpen ? '' : 'Opening the host link in your browser. '}Press Ctrl+C to stop the server.`,
    ''
  );
  console.log(lines.join('\n'));

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping the server (the game is saved).');
    void server.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err: unknown) => {
  console.error(`\n  Could not start the server: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
