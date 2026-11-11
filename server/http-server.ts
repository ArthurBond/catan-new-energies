/**
 * HTTP + WebSocket server: serves the built client from `dist/`, answers `GET /api/server-info`
 * and runs the table (`GameRoom`) behind a WebSocket at `/ws`.
 *
 * It is written to sit behind an encrypted tunnel (Tailscale Funnel, see `share.ts`) as well as
 * on a home network: it reads the visitor's real address from the tunnel's `X-Forwarded-For`,
 * refuses WebSocket handshakes from other websites, limits how many sockets and messages a
 * visitor may send, answers keep-alive pings and compresses the client for slow links.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import zlib from 'node:zlib';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CLOSE_HELLO_TIMEOUT,
  CLOSE_SEAT_TAKEN_OVER,
  CLOSE_TOO_MANY_MESSAGES,
  SERVER_APP_ID,
  SERVER_INFO_META_NAME,
  SERVER_PROTOCOL_VERSION,
  type ServerInfo,
  type ServerMessage,
  type ShareInfo,
  type ShareMode,
} from '@/network/server-protocol';
import type { InviteGate } from './access';
import { createFileStore } from './persistence';
import { GameRoom, type GameRoomOptions } from './room';

export interface StartServerOptions {
  /** 0 picks a free port (tests). */
  port: number;
  /**
   * Interface(s) to listen on; default all (0.0.0.0). Several addresses listen side by side,
   * for example this computer itself plus its Tailscale address, and nothing else.
   */
  host?: string | string[];
  /** More addresses to listen on if the computer has them (failing to is not an error). */
  optionalHosts?: string[];
  savesDir: string;
  distDir: string;
  openBrowser?: boolean;
  /** Fixed bot delay; default follows the lobby's bot speed. */
  botDelayMs?: number;
  log?: (message: string) => void;
  onAction?: GameRoomOptions['onAction'];
  /** How the game is shared (shown to the client; default `lan`). */
  share?: ShareMode;
  /** When set, everyone but the host needs the invite code. */
  invite?: InviteGate | null;
  /** The links and code for the host's lobby (see `GameRoomOptions.shareInfo`). */
  shareInfo?: () => ShareInfo | null;
  /** Sockets open at once, over all visitors. Default 64. */
  maxClients?: number;
  /** Sockets open at once from one network address. Default 16. */
  maxClientsPerAddress?: number;
  /** How long a socket may stay connected without an accepted hello. Default 30 s. */
  helloTimeoutMs?: number;
  /**
   * Messages one socket may send per second (three seconds' worth at once). Default 20, far more
   * than a person plays; `Infinity` switches the limit off (the soak tests play at machine speed).
   */
  maxMessagesPerSecond?: number;
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

function normalizeIp(raw: string): string {
  const ip = raw.trim().replace(/^\[|\]$/g, '').slice(0, 64);
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isLoopback(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.');
}

/**
 * The key a visitor is counted under (wrong invite codes, open sockets). An IPv6 customer owns a
 * whole /64 and can change the rest of the address at will, so IPv6 is counted per /64.
 */
export function addressKey(ip: string): string {
  if (net.isIPv4(ip) || !net.isIPv6(ip)) return ip;
  const [head = '', tail] = ip.split('%')[0]!.toLowerCase().split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const groups = tail === undefined ? front : [...front, ...new Array<string>(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

/** The request came straight from a program on this computer, not through a tunnel or proxy. */
export function isLocalRequest(req: http.IncomingMessage): boolean {
  return (
    isLoopback(normalizeIp(req.socket.remoteAddress ?? '')) &&
    req.headers['x-forwarded-for'] === undefined &&
    req.headers['x-forwarded-host'] === undefined
  );
}

/**
 * The visitor's network address. A tunnel on this computer (Tailscale Funnel, cloudflared)
 * connects from 127.0.0.1 and names the real visitor in `X-Forwarded-For`; only such a local
 * proxy is believed, and only its own (last) entry, so a visitor cannot make one up.
 */
export function clientAddress(req: http.IncomingMessage): string {
  const peer = normalizeIp(req.socket.remoteAddress ?? 'unknown');
  if (isLoopback(peer)) {
    const forwarded = normalizeIp(headerValue(req.headers['x-forwarded-for'])?.split(',').pop() ?? '');
    // Only a real address is believed; anything else in the header is ignored.
    if (net.isIP(forwarded)) return addressKey(forwarded);
  }
  return addressKey(peer);
}

/** The path and query of a request, or null when the request line is not a usable address. */
export function parseRequestUrl(req: http.IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '/', 'http://localhost');
  } catch {
    // For example "GET // HTTP/1.1": must never take the server down.
    return null;
  }
}

/**
 * Browsers always send `Origin` on a WebSocket handshake. The game's own page has the same host
 * as the request; a page on another website does not, and is refused. Programs without an
 * `Origin` (tests, command-line tools) are let through: they still need the invite code.
 */
export function isSameOriginUpgrade(req: http.IncomingMessage): boolean {
  const origin = headerValue(req.headers.origin);
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = [headerValue(req.headers.host), headerValue(req.headers['x-forwarded-host'])]
    .filter((h): h is string => typeof h === 'string')
    .map((h) => h.toLowerCase());
  return hosts.includes(originHost);
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

/**
 * Sent with every response. `no-referrer` keeps the invite code in the page address from
 * reaching other sites. For visitors from the network, the frame rules stop another site from
 * wrapping the game in its own page; on the host's own computer they are left out, so the game
 * can still be shown inside an editor's preview pane.
 */
function securityHeaders(req: http.IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  if (!isLocalRequest(req)) {
    headers['X-Frame-Options'] = 'DENY';
    headers['Content-Security-Policy'] = "frame-ancestors 'none'";
  }
  return headers;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...securityHeaders(res.req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendText(res: http.ServerResponse, status: number, text: string): void {
  res.writeHead(status, { ...securityHeaders(res.req), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
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

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.webmanifest']);
/** Below this a file fits in one network packet anyway. */
const COMPRESS_MIN_BYTES = 1400;

type Encoding = 'br' | 'gzip';

function pickEncoding(req: http.IncomingMessage): Encoding | null {
  const accepted = String(req.headers['accept-encoding'] ?? '').toLowerCase();
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

/**
 * Compressed copies of the client's files, made on first request and kept until the file changes.
 * Keyed by the file itself, not by the path asked for: on a Mac or Windows disk `/ASSETS/App.JS`
 * and `/assets/app.js` are one file, and must not be compressed and stored once per spelling.
 */
const compressedCache = new Map<string, Promise<Buffer>>();
/** The client is a handful of files; this only stops the cache growing without end. */
const COMPRESSED_CACHE_MAX = 64;

/** How many compressed copies are held (tests). */
export function compressedCacheSize(): number {
  return compressedCache.size;
}

function compressed(file: string, stat: fs.Stats, encoding: Encoding): Promise<Buffer> {
  const key = `${encoding}:${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.size}`;
  let entry = compressedCache.get(key);
  if (!entry) {
    if (compressedCache.size >= COMPRESSED_CACHE_MAX) {
      const oldest = compressedCache.keys().next().value;
      if (oldest !== undefined) compressedCache.delete(oldest);
    }
    entry = fs.promises.readFile(file).then(
      (raw) =>
        new Promise<Buffer>((resolve, reject) => {
          const done = (err: Error | null, out: Buffer) => (err ? reject(err) : resolve(out));
          if (encoding === 'br') {
            zlib.brotliCompress(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }, done);
          } else {
            zlib.gzip(raw, { level: 7 }, done);
          }
        })
    );
    compressedCache.set(key, entry);
    entry.catch(() => compressedCache.delete(key));
  }
  return entry;
}

function serveBuffer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: Buffer,
  headers: Record<string, string | number>
): void {
  res.writeHead(200, { ...securityHeaders(req), ...headers, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: string): void {
  const ext = path.extname(file).toLowerCase();
  const type = MIME_TYPES[ext] ?? 'application/octet-stream';
  const stat = fs.statSync(file);
  const encoding = COMPRESSIBLE.has(ext) && stat.size >= COMPRESS_MIN_BYTES ? pickEncoding(req) : null;
  const plain = () => {
    res.writeHead(200, { ...securityHeaders(req), 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': cache });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  };
  if (!encoding) {
    plain();
    return;
  }
  compressed(file, stat, encoding).then(
    (body) =>
      serveBuffer(req, res, body, {
        'Content-Type': type,
        'Content-Encoding': encoding,
        Vary: 'Accept-Encoding',
        'Cache-Control': cache,
      }),
    plain
  );
}

/**
 * The page with a `<meta name="catan-game-server">` tag in its head. The client reads it and
 * knows at once that it is in online mode, without a second request that could time out on a
 * slow link and drop the friend into the offline game.
 */
export function injectServerInfo(html: string, info: ServerInfo): string {
  const content = JSON.stringify(info).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const tag = `<meta name="${SERVER_INFO_META_NAME}" content="${content}" />`;
  const head = /<head[^>]*>/i.exec(html);
  if (!head) return `${tag}${html}`;
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}\n    ${tag}${html.slice(at)}`;
}

/** Tokens for a simple per-socket message limit: `burst` at once, refilled at `perSecond`. */
function createMessageBudget(burst: number, perSecond: number) {
  let tokens = burst;
  let last = Date.now();
  return (): boolean => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
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

  const share: ShareMode = options.share ?? 'lan';
  const invite = options.invite ?? null;
  const maxClients = options.maxClients ?? 64;
  const maxClientsPerAddress = options.maxClientsPerAddress ?? 16;
  const helloTimeoutMs = options.helloTimeoutMs ?? 30_000;
  const maxMessagesPerSecond = options.maxMessagesPerSecond ?? 20;

  const room = new GameRoom({
    hostKey,
    saved,
    persist: (snapshot) => store.save(snapshot),
    botDelayMs: options.botDelayMs,
    log,
    onAction: options.onAction,
    invite,
    shareInfo: options.shareInfo,
  });
  if (saved?.started) log(`Resumed the saved game (move ${saved.version}).`);

  let port = options.port;

  const serverInfo = (req: http.IncomingMessage): ServerInfo => ({
    app: SERVER_APP_ID,
    protocolVersion: SERVER_PROTOCOL_VERSION,
    port,
    // The home-network addresses are nobody's business but the host's.
    lanUrls: isLocalRequest(req)
      ? listNetworkAddresses(port)
          .filter((a) => a.usable)
          .map((a) => a.url)
      : [],
    started: room.isStarted,
    inviteRequired: invite !== null,
    share,
  });

  /** index.html as read from disk, re-read only when the file changes. */
  let indexCache: { mtimeMs: number; html: string } | null = null;
  const serveIndex = (req: http.IncomingMessage, res: http.ServerResponse, indexFile: string) => {
    const mtimeMs = fs.statSync(indexFile).mtimeMs;
    if (indexCache?.mtimeMs !== mtimeMs) indexCache = { mtimeMs, html: fs.readFileSync(indexFile, 'utf8') };
    const body = Buffer.from(injectServerInfo(indexCache.html, serverInfo(req)), 'utf8');
    serveBuffer(req, res, body, { 'Content-Type': MIME_TYPES['.html']!, 'Cache-Control': 'no-cache' });
  };

  const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = parseRequestUrl(req);
    if (!url) {
      sendText(res, 400, 'Bad request');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendText(res, 405, 'Method not allowed');
      return;
    }
    if (url.pathname === '/api/server-info') {
      sendJson(res, 200, serverInfo(req));
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
    if (isFile(target) && target !== indexFile) {
      const hashedAsset = url.pathname.startsWith('/assets/');
      serveFile(req, res, target, hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
      return;
    }
    // SPA fallback: extensionless paths get the app; missing files with an extension are 404s.
    if (target === indexFile || path.extname(url.pathname) === '' || url.pathname.endsWith('/')) {
      if (isFile(indexFile)) {
        serveIndex(req, res, indexFile);
      } else {
        sendText(res, 503, 'The game has not been built yet. Run "npm run host" (or "npm run build").');
      }
      return;
    }
    sendText(res, 404, 'Not found');
  };

  const server = http.createServer((req, res) => {
    // Whatever a visitor sends, the game must keep running for everyone else.
    try {
      handleRequest(req, res);
    } catch (e) {
      log(`A request failed: ${e instanceof Error ? e.message : String(e)}`);
      if (res.headersSent) res.destroy();
      else sendText(res, 500, 'Something went wrong');
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();
  /** Every open socket: where it came from and when, for the limits below. */
  const sockets = new Map<WebSocket, { id: string; remote: string; local: boolean; since: number }>();

  const refuseUpgrade = (socket: Duplex, status: string) => {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
  };

  /** When the table is full of sockets, one that never got past the invite prompt makes room. */
  const evictWaitingSocket = (): boolean => {
    let oldest: WebSocket | null = null;
    for (const [ws, meta] of sockets) {
      if (room.isGreeted(meta.id)) continue;
      if (!oldest || meta.since < sockets.get(oldest)!.since) oldest = ws;
    }
    if (!oldest) return false;
    sockets.delete(oldest);
    oldest.terminate();
    return true;
  };

  server.on('upgrade', (req, socket, head) => {
    // After an upgrade the socket is ours: without this, a visitor who resets the connection
    // while it is being refused would raise an unhandled error and stop the server.
    socket.on('error', () => socket.destroy());
    if (parseRequestUrl(req)?.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    if (!isSameOriginUpgrade(req)) {
      refuseUpgrade(socket, '403 Forbidden');
      return;
    }
    const remote = clientAddress(req);
    const local = isLocalRequest(req);
    if (!local) {
      let fromSameAddress = 0;
      for (const meta of sockets.values()) if (meta.remote === remote) fromSameAddress += 1;
      if (fromSameAddress >= maxClientsPerAddress) {
        refuseUpgrade(socket, '429 Too Many Requests');
        return;
      }
    }
    if (sockets.size >= maxClients && !evictWaitingSocket()) {
      refuseUpgrade(socket, '503 Service Unavailable');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.set(ws, { id: randomBytes(6).toString('hex'), remote, local, since: Date.now() });
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const meta = sockets.get(ws);
    if (!meta) {
      ws.terminate();
      return;
    }
    const { id, remote } = meta;
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const send = (message: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    };
    room.connect({
      id,
      remote,
      send,
      close: (reason: string) => ws.close(CLOSE_SEAT_TAKEN_OVER, reason),
    });

    // A socket that never gets past hello (a stranger, or a friend still typing the code) is
    // closed after a while; the browser connects again when the code is entered.
    const helloTimer = setTimeout(() => {
      if (!room.isGreeted(id)) ws.close(CLOSE_HELLO_TIMEOUT, 'no hello');
    }, helloTimeoutMs);
    helloTimer.unref();

    // People play a move every few seconds; this only stops a program flooding the server.
    const withinBudget =
      maxMessagesPerSecond === Infinity ? () => true : createMessageBudget(maxMessagesPerSecond * 3, maxMessagesPerSecond);
    let messagesBeforeHello = 0;

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      if (!withinBudget() || (!room.isGreeted(id) && ++messagesBeforeHello > 30)) {
        ws.close(CLOSE_TOO_MANY_MESSAGES, 'too many messages');
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        send({ type: 'error', message: 'The server did not understand that message.' });
        return;
      }
      // Keep-alive: answered here so a browser can tell a dead connection from a quiet table.
      if (parsed && typeof parsed === 'object' && (parsed as { type?: unknown }).type === 'ping') {
        const t = (parsed as { t?: unknown }).t;
        send({ type: 'pong', t: typeof t === 'number' && Number.isFinite(t) ? t : null });
        return;
      }
      try {
        room.handleMessage(id, parsed);
      } catch (e) {
        log(`A message from ${remote} failed: ${e instanceof Error ? e.message : String(e)}`);
        send({ type: 'error', message: 'The server could not handle that message.' });
      }
    });
    const gone = () => {
      clearTimeout(helloTimer);
      sockets.delete(ws);
      room.disconnect(id);
    };
    ws.on('close', gone);
    ws.on('error', gone);
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

  const hosts = Array.isArray(options.host) ? options.host : [options.host ?? '0.0.0.0'];
  if (hosts.length === 0) hosts.push('0.0.0.0');
  const listen = (target: net.Server, listenPort: number, address: string) =>
    new Promise<void>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        target.off('listening', onListening);
        if (err.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${listenPort} is already in use. Is the game server already running? ` +
                'Close it, or set PORT to another number.'
            )
          );
        } else if (err.code === 'EADDRNOTAVAIL') {
          reject(new Error(`This computer has no network address ${address} to listen on.`));
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        target.off('error', onError);
        resolve();
      };
      target.once('error', onError);
      target.once('listening', onListening);
      target.listen(listenPort, address);
    });

  await listen(server, options.port, hosts[0]!);
  port = (server.address() as AddressInfo).port;

  // Further addresses hand their connections to the same server.
  const extraListeners: net.Server[] = [];
  const listenAlso = async (address: string, optional: boolean) => {
    const extra = net.createServer((socket) => server.emit('connection', socket));
    try {
      await listen(extra, port, address);
      extraListeners.push(extra);
    } catch (e) {
      if (!optional) {
        for (const l of extraListeners) l.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        throw e;
      }
    }
  };
  for (const address of hosts.slice(1)) await listenAlso(address, false);
  for (const address of options.optionalHosts ?? []) await listenAlso(address, true);

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
        for (const extra of extraListeners) extra.close();
        server.close(() => resolve());
        server.closeAllConnections();
      });
      return closing;
    },
  };
}
