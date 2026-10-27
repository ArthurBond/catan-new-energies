/**
 * HTTP + WebSocket server: serves the built client from `dist/`, answers `GET /api/server-info`
 * and runs the table (`GameRoom`) behind a WebSocket at `/ws`. Binds to all interfaces.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  SERVER_APP_ID,
  SERVER_PROTOCOL_VERSION,
  type ServerInfo,
  type ServerMessage,
} from '@/network/server-protocol';
import { createFileStore } from './persistence';
import { GameRoom, type GameRoomOptions } from './room';

export interface StartServerOptions {
  /** 0 picks a free port (tests). */
  port: number;
  /** Interface to bind; default all (0.0.0.0). */
  host?: string;
  savesDir: string;
  distDir: string;
  openBrowser?: boolean;
  /** Fixed bot delay; default follows the lobby's bot speed. */
  botDelayMs?: number;
  log?: (message: string) => void;
  onAction?: GameRoomOptions['onAction'];
}

export interface NetworkAddress {
  url: string;
  interfaceName: string;
  address: string;
  /** Plain-language hint, e.g. "virtual adapter (WSL/Hyper-V)". */
  note: string | null;
  /** Likely reachable by friends on the same Wi-Fi / tailnet. */
  usable: boolean;
}

export interface RunningServer {
  port: number;
  hostKey: string;
  hostUrl: string;
  addresses: NetworkAddress[];
  room: GameRoom;
  close(): Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|vmnet|vboxnet|br-|virbr/i;
const VPN_ADAPTER = /Tailscale|ZeroTier/i;

/** IPv4, non-internal addresses with a hint for adapters friends cannot reach. */
export function listNetworkAddresses(port: number): NetworkAddress[] {
  const result: NetworkAddress[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      const isV4 = a.family === 'IPv4' || (a.family as unknown) === 4;
      if (!isV4 || a.internal) continue;
      const linkLocal = a.address.startsWith('169.254.');
      let note: string | null = null;
      let usable = true;
      if (VIRTUAL_ADAPTER.test(name)) {
        note = 'virtual adapter (WSL/Hyper-V/VM), friends cannot use this';
        usable = false;
      } else if (linkLocal) {
        note = 'no network address assigned, friends cannot use this';
        usable = false;
      } else if (VPN_ADAPTER.test(name) || a.address.startsWith('100.')) {
        note = 'Tailscale/VPN, for friends on your tailnet';
      }
      result.push({ url: `http://${a.address}:${port}`, interfaceName: name, address: a.address, note, usable });
    }
  }
  // Wi-Fi / Ethernet first, VPN next, unusable last.
  const rank = (n: NetworkAddress) => (!n.usable ? 2 : n.note ? 1 : 0);
  return result.sort((x, y) => rank(x) - rank(y));
}

export function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* opening the browser is a convenience only */
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendText(res: http.ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

/** Resolves a URL path inside `root`, or null if it would escape it. */
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, `.${path.posix.normalize(`/${decoded}`)}`);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) return null;
  return target;
}

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: string): void {
  const type = MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const size = fs.statSync(file).size;
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const log = options.log ?? ((m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`));
  const distDir = path.resolve(options.distDir);
  const store = createFileStore(options.savesDir, log);
  const hostKey = store.hostKey();
  const saved = store.load();

  const room = new GameRoom({
    hostKey,
    saved,
    persist: (snapshot) => store.save(snapshot),
    botDelayMs: options.botDelayMs,
    log,
    onAction: options.onAction,
  });
  if (saved?.started) log(`Resumed the saved game (move ${saved.version}).`);

  let port = options.port;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendText(res, 405, 'Method not allowed');
      return;
    }
    if (url.pathname === '/api/server-info') {
      const info: ServerInfo = {
        app: SERVER_APP_ID,
        protocolVersion: SERVER_PROTOCOL_VERSION,
        port,
        lanUrls: listNetworkAddresses(port)
          .filter((a) => a.usable)
          .map((a) => a.url),
        started: room.isStarted,
      };
      sendJson(res, 200, info);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const indexFile = path.join(distDir, 'index.html');
    const target = resolveStaticPath(distDir, url.pathname);
    if (!target) {
      sendText(res, 400, 'Bad request');
      return;
    }
    if (isFile(target)) {
      const hashedAsset = url.pathname.startsWith('/assets/');
      serveFile(req, res, target, hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
      return;
    }
    // SPA fallback: extensionless paths get the app; missing files with an extension are 404s.
    if (path.extname(url.pathname) === '' || url.pathname.endsWith('/')) {
      if (isFile(indexFile)) {
        serveFile(req, res, indexFile, 'no-cache');
      } else {
        sendText(res, 503, 'The game has not been built yet. Run "npm run host" (or "npm run build").');
      }
      return;
    }
    sendText(res, 404, 'Not found');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    const id = randomBytes(6).toString('hex');
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    room.connect({
      id,
      send: (message: ServerMessage) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
      },
      close: (reason: string) => ws.close(4000, reason),
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'The server did not understand that message.' }));
        }
        return;
      }
      room.handleMessage(id, parsed);
    });
    ws.on('close', () => room.disconnect(id));
    ws.on('error', () => room.disconnect(id));
  });

  // Drop sockets that stopped answering (laptop asleep, Wi-Fi gone) so seats show as offline.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${options.port} is already in use. Is the game server already running? ` +
              'Close it, or set PORT to another number.'
          )
        );
      } else {
        reject(err);
      }
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(options.port, options.host ?? '0.0.0.0');
  });
  port = (server.address() as AddressInfo).port;

  room.resume();

  const hostUrl = `http://localhost:${port}/?host=${hostKey}`;
  if (options.openBrowser) openInBrowser(hostUrl);

  let closing: Promise<void> | null = null;
  return {
    port,
    hostKey,
    hostUrl,
    addresses: listNetworkAddresses(port),
    room,
    close() {
      closing ??= new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        room.shutdown();
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections();
      });
      return closing;
    },
  };
}
