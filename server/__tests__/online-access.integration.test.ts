// @vitest-environment node
/**
 * The server as friends on other networks meet it: behind a tunnel on this computer that names
 * the visitor in `X-Forwarded-For`, with the invite code switched on.
 */
import fs from 'node:fs';
import type http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  CLOSE_HELLO_TIMEOUT,
  CLOSE_TOO_MANY_MESSAGES,
  SERVER_APP_ID,
  SERVER_INFO_META_NAME,
  type ClientMessage,
  type ServerInfo,
  type ServerMessage,
  type ShareInfo,
} from '@/network/server-protocol';
import { InviteGate } from '../access';
import {
  addressKey,
  clientAddress,
  compressedCacheSize,
  injectServerInfo,
  isLocalRequest,
  isSameOriginUpgrade,
  startServer,
  type RunningServer,
} from '../http-server';

const CODE = 'PLAY2GETHER';

class Visitor {
  readonly messages: ServerMessage[] = [];
  closeCode: number | null = null;
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
    ws.on('close', (code) => (this.closeCode = code));
  }

  /** Opens a socket; rejects with `HTTP <status>` when the server refuses the handshake. */
  static open(url: string, headers: Record<string, string> = {}): Promise<Visitor> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers });
      const visitor = new Visitor(ws);
      ws.once('open', () => resolve(visitor));
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once('error', reject);
    });
  }

  send(msg: ClientMessage | Record<string, unknown>) {
    this.ws.send(JSON.stringify(msg));
  }

  async waitFor<T extends ServerMessage['type']>(type: T, timeoutMs = 4000): Promise<Extract<ServerMessage, { type: T }>> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.find((m) => m.type === type);
      if (found) return found as Extract<ServerMessage, { type: T }>;
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for "${type}" (got ${this.types().join(', ') || 'nothing'})`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  async waitForClose(timeoutMs = 4000): Promise<number> {
    const start = Date.now();
    while (this.closeCode === null) {
      if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for the socket to close');
      await new Promise((r) => setTimeout(r, 5));
    }
    return this.closeCode;
  }

  types(): string[] {
    return this.messages.map((m) => m.type);
  }

  close() {
    this.ws.close();
  }
}

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/** Sends raw bytes as a request and returns what came back (empty if the server just hung up). */
function rawRequest(port: number, text: string, { reset = false } = {}): Promise<string> {
  return new Promise((resolve) => {
    let answer = '';
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(text);
      // A visitor who slams the connection shut while the server is still answering.
      if (reset) socket.resetAndDestroy();
    });
    socket.on('data', (chunk) => (answer += chunk.toString()));
    socket.on('error', () => resolve(answer));
    socket.on('close', () => resolve(answer));
    setTimeout(() => socket.destroy(), 1500);
  });
}
/** A visitor as the tunnel presents them: from 127.0.0.1, with their address in the header. */
const from = (ip: string) => ({ 'X-Forwarded-For': ip, 'X-Forwarded-Host': 'pc.tail1.ts.net', 'X-Forwarded-Proto': 'https' });

function makeDist(tmp: string): string {
  const distDir = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><html><head><title>Catan test</title></head><body></body></html>');
  fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), `// game\n${'console.log("a move was played");\n'.repeat(200)}`);
  fs.writeFileSync(path.join(distDir, 'assets', 'tiny.js'), 'console.log(1)');
  return distDir;
}

describe('a game shared with an invite code', () => {
  let tmp: string;
  let server: RunningServer;
  let base: string;
  let wsUrl: string;
  const share: ShareInfo = {
    mode: 'online',
    links: [{ url: 'https://pc.tail1.ts.net/?join=PLAY-2GETHER', kind: 'online', label: 'Works from any network' }],
    inviteCode: 'PLAY-2GETHER',
    status: null,
  };
  const open: Visitor[] = [];
  const visit = async (headers: Record<string, string> = {}) => {
    const v = await Visitor.open(wsUrl, headers);
    open.push(v);
    return v;
  };

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-online-'));
    server = await startServer({
      port: 0,
      host: '127.0.0.1',
      savesDir: path.join(tmp, 'saves'),
      distDir: makeDist(tmp),
      openBrowser: false,
      botDelayMs: 0,
      log: () => {},
      share: 'online',
      invite: new InviteGate({ code: CODE, maxFailures: 3, windowMs: 60_000 }),
      shareInfo: () => share,
    });
    base = `http://127.0.0.1:${server.port}`;
    wsUrl = `ws://127.0.0.1:${server.port}/ws`;
  });

  afterEach(() => {
    for (const v of open.splice(0)) v.close();
  });

  afterAll(async () => {
    await server?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('tells the page it needs a code, and keeps the home addresses from visitors through the tunnel', async () => {
    const local = (await (await fetch(`${base}/api/server-info`)).json()) as ServerInfo;
    expect(local).toMatchObject({ app: SERVER_APP_ID, inviteRequired: true, share: 'online', started: false });
    expect(Array.isArray(local.lanUrls)).toBe(true);
    const remote = (await (await fetch(`${base}/api/server-info`, { headers: from('203.0.113.9') })).json()) as ServerInfo;
    expect(remote).toMatchObject({ inviteRequired: true, share: 'online' });
    expect(remote.lanUrls).toEqual([]);
  });

  it('writes the server info into the page so a slow link cannot drop a friend into the offline game', async () => {
    const res = await fetch(`${base}/`, { headers: from('203.0.113.9') });
    const html = await res.text();
    const meta = new RegExp(`<meta name="${SERVER_INFO_META_NAME}" content="([^"]+)"`).exec(html);
    expect(meta).not.toBeNull();
    const info = JSON.parse(meta![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as ServerInfo;
    expect(info).toMatchObject({ app: SERVER_APP_ID, inviteRequired: true, share: 'online', lanUrls: [] });
    expect(html).toContain('<title>Catan test</title>');
    // Any path that is the app gets the same page.
    expect(await (await fetch(`${base}/index.html`)).text()).toContain(SERVER_INFO_META_NAME);
    expect(await (await fetch(`${base}/some/route`)).text()).toContain(SERVER_INFO_META_NAME);
  });

  it('sends headers that keep the invite code and the page to itself', async () => {
    for (const url of [`${base}/`, `${base}/assets/app.js`, `${base}/assets/tiny.js`, `${base}/api/server-info`, `${base}/assets/missing.js`]) {
      // A visitor through the tunnel: no referrer, and no other site may wrap the game in a frame.
      const visitor = await fetch(url, { headers: from('203.0.113.9') });
      expect(visitor.headers.get('referrer-policy')).toBe('no-referrer');
      expect(visitor.headers.get('x-content-type-options')).toBe('nosniff');
      expect(visitor.headers.get('x-frame-options')).toBe('DENY');
      expect(visitor.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
      // The host's own computer may show the game inside an editor's preview pane.
      const local = await fetch(url);
      expect(local.headers.get('referrer-policy')).toBe('no-referrer');
      expect(local.headers.get('x-content-type-options')).toBe('nosniff');
      expect(local.headers.get('x-frame-options')).toBeNull();
    }
  });

  it('compresses the client for slow links, and only when the browser can take it', async () => {
    const original = fs.readFileSync(path.join(tmp, 'dist', 'assets', 'app.js'));
    const fetchRaw = async (encoding: string) => {
      // `fetch` would decompress by itself: ask with plain http to see the bytes on the wire.
      const { request } = await import('node:http');
      return new Promise<{ headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
        const req = request(`${base}/assets/app.js`, { headers: encoding ? { 'Accept-Encoding': encoding } : {} }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
      });
    };
    const br = await fetchRaw('gzip, deflate, br');
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers.vary).toBe('Accept-Encoding');
    expect(br.headers['cache-control']).toContain('immutable');
    expect(br.body.length).toBeLessThan(original.length / 4);
    expect(zlib.brotliDecompressSync(br.body).equals(original)).toBe(true);

    const gz = await fetchRaw('gzip');
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(zlib.gunzipSync(gz.body).equals(original)).toBe(true);

    const plain = await fetchRaw('');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.equals(original)).toBe(true);
  });

  it('survives request lines that are not an address', async () => {
    for (const target of ['//', '//[', '//x:99999', '/%', '/\\\\x']) {
      const answer = await rawRequest(server.port, `GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
      expect(answer).toMatch(/^HTTP\/1\.1 (400|404|200) /);
      // The same on the WebSocket path: the server hangs up and carries on.
      await rawRequest(
        server.port,
        `GET ${target} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    }
    expect((await fetch(`${base}/api/server-info`)).ok).toBe(true);
    expect((await rawRequest(server.port, 'GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')).startsWith('HTTP/1.1 400')).toBe(true);
  });

  it('survives a visitor who resets the connection while a handshake is being refused', async () => {
    const handshake = (origin: string) =>
      `GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`;
    for (let i = 0; i < 40; i++) await rawRequest(server.port, handshake('https://evil.example'), { reset: true });
    // Refused politely when the visitor waits for the answer.
    expect(await rawRequest(server.port, handshake('https://evil.example'))).toMatch(/^HTTP\/1\.1 403 /);
    await settle();
    expect((await fetch(`${base}/api/server-info`)).ok).toBe(true);
  });

  it('keeps one compressed copy per file, however the name is spelled', async () => {
    const get = (pathName: string) => fetch(`${base}${pathName}`, { headers: { 'Accept-Encoding': 'br' } });
    expect((await get('/assets/app.js')).status).toBe(200);
    const before = compressedCacheSize();
    // On a Mac or Windows disk these are all the same file; on Linux they do not exist.
    for (const variant of ['/ASSETS/app.js', '/assets/APP.JS', '/Assets/App.Js', '/aSSETS/aPP.jS', '/assets/app.js']) {
      const res = await get(variant);
      expect([200, 404]).toContain(res.status);
      await res.arrayBuffer();
    }
    expect(compressedCacheSize()).toBe(before);
  });

  it('shows nothing to a visitor without the code, then lets them in on the same connection', async () => {
    const v = await visit(from('203.0.113.10'));
    v.send({ type: 'hello', name: 'Finn' });
    expect(await v.waitFor('denied')).toMatchObject({ reason: 'missing', retryAfterSeconds: null });
    // Refused sockets cannot poke at the table.
    v.send({ type: 'claimSeat', playerId: 'purple', name: 'Finn' });
    v.send({ type: 'start' });
    await settle();
    expect(v.types().filter((t) => t === 'lobby' || t === 'state' || t === 'welcome' || t === 'share')).toEqual([]);
    expect(v.types()).toContain('error');

    v.send({ type: 'hello', name: 'Finn', inviteCode: 'play-2gether' });
    expect(await v.waitFor('welcome')).toMatchObject({ isHost: false, playerId: null });
    expect((await v.waitFor('lobby')).started).toBe(false);
  });

  it('gives the links and the code to the host only', async () => {
    const host = await visit();
    host.send({ type: 'hello', name: 'Hana', hostKey: server.hostKey });
    expect(await host.waitFor('welcome')).toMatchObject({ isHost: true });
    expect((await host.waitFor('share')).share).toEqual(share);

    const friend = await visit(from('203.0.113.11'));
    friend.send({ type: 'hello', name: 'Finn', inviteCode: CODE });
    await friend.waitFor('lobby');
    await settle();
    expect(friend.types()).not.toContain('share');

    // The host's window hears about a new link (the tunnel came back with it); friends do not.
    server.room.shareChanged();
    await settle();
    expect(host.types().filter((t) => t === 'share')).toHaveLength(2);
    expect(friend.types()).not.toContain('share');
  });

  it('the host key works without the invite code, a wrong host key does not', async () => {
    const impostor = await visit(from('203.0.113.12'));
    impostor.send({ type: 'hello', name: 'Mallory', hostKey: 'not-the-host-key' });
    expect(await impostor.waitFor('denied')).toMatchObject({ reason: 'missing' });
    expect(impostor.types()).not.toContain('welcome');
  });

  it('locks out an address that keeps guessing, without touching other visitors', async () => {
    const guesser = await visit(from('203.0.113.20'));
    for (let i = 0; i < 3; i++) guesser.send({ type: 'hello', name: 'G', inviteCode: `GUESS${i}XYZ` });
    await settle();
    expect(guesser.messages.filter((m) => m.type === 'denied').map((m) => (m as { reason: string }).reason)).toEqual(['wrong', 'wrong', 'wrong']);
    // Even the right code is refused now, on this socket and on a new one from the same address.
    guesser.send({ type: 'hello', name: 'G', inviteCode: CODE });
    await settle();
    const last = guesser.messages.filter((m) => m.type === 'denied').at(-1) as { reason: string; retryAfterSeconds: number; message: string };
    expect(last.reason).toBe('locked');
    expect(last.retryAfterSeconds).toBeGreaterThan(0);
    expect(last.message).toMatch(/Too many wrong codes/);
    const again = await visit(from('203.0.113.20'));
    again.send({ type: 'hello', name: 'G', inviteCode: CODE });
    expect(await again.waitFor('denied')).toMatchObject({ reason: 'locked' });

    const friend = await visit(from('203.0.113.21'));
    friend.send({ type: 'hello', name: 'Finn', inviteCode: CODE });
    expect(await friend.waitFor('welcome')).toMatchObject({ isHost: false });
    // The host is never locked out, whatever the tunnel says about addresses.
    const host = await visit(from('203.0.113.20'));
    host.send({ type: 'hello', name: 'Hana', hostKey: server.hostKey });
    expect(await host.waitFor('welcome')).toMatchObject({ isHost: true });
  });

  it('refuses a WebSocket opened by another website, and accepts the game page itself', async () => {
    await expect(visit({ Origin: 'https://evil.example' })).rejects.toThrow('HTTP 403');
    await expect(visit({ ...from('203.0.113.30'), Origin: 'https://evil.example' })).rejects.toThrow('HTTP 403');
    await expect(visit({ Origin: 'not a url' })).rejects.toThrow('HTTP 403');
    // Directly on this computer: the page's origin is the address it was opened on.
    const local = await visit({ Origin: `http://127.0.0.1:${server.port}` });
    local.send({ type: 'ping', t: 1 });
    expect(await local.waitFor('pong')).toEqual({ type: 'pong', t: 1 });
    // Through the tunnel: the page's origin is the public name the tunnel passes on.
    const tunnelled = await visit({ ...from('203.0.113.30'), Origin: 'https://pc.tail1.ts.net' });
    tunnelled.send({ type: 'ping' });
    expect(await tunnelled.waitFor('pong')).toEqual({ type: 'pong', t: null });
  });

  it('answers pings before and after hello, so a browser can tell a dead line from a quiet table', async () => {
    const v = await visit(from('203.0.113.40'));
    v.send({ type: 'ping', t: 123 });
    expect(await v.waitFor('pong')).toEqual({ type: 'pong', t: 123 });
    v.send({ type: 'hello', name: 'Finn', inviteCode: CODE });
    await v.waitFor('welcome');
    v.send({ type: 'ping', t: 456 });
    await settle();
    expect(v.messages.filter((m) => m.type === 'pong')).toEqual([
      { type: 'pong', t: 123 },
      { type: 'pong', t: 456 },
    ]);
  });

  it('closes a connection that floods the server', async () => {
    const v = await visit(from('203.0.113.41'));
    v.send({ type: 'hello', name: 'Finn', inviteCode: CODE });
    await v.waitFor('welcome');
    for (let i = 0; i < 200; i++) v.send({ type: 'ping', t: i });
    expect(await v.waitForClose()).toBe(CLOSE_TOO_MANY_MESSAGES);
  });
});

describe('limits on connections', () => {
  let tmp: string;
  let server: RunningServer | null = null;
  const open: Visitor[] = [];

  const start = async (overrides: Partial<Parameters<typeof startServer>[0]>) => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-limits-'));
    server = await startServer({
      port: 0,
      host: '127.0.0.1',
      savesDir: path.join(tmp, 'saves'),
      distDir: makeDist(tmp),
      openBrowser: false,
      log: () => {},
      invite: new InviteGate({ code: CODE }),
      ...overrides,
    });
    return `ws://127.0.0.1:${server.port}/ws`;
  };
  const visit = async (url: string, headers: Record<string, string> = {}) => {
    const v = await Visitor.open(url, headers);
    open.push(v);
    return v;
  };

  afterEach(async () => {
    for (const v of open.splice(0)) v.close();
    await server?.close();
    server = null;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('hangs up on a connection that never gets past hello', async () => {
    const url = await start({ helloTimeoutMs: 120 });
    const silent = await visit(url, from('203.0.113.50'));
    const wrong = await visit(url, from('203.0.113.51'));
    wrong.send({ type: 'hello', name: 'X' });
    const friend = await visit(url, from('203.0.113.52'));
    friend.send({ type: 'hello', name: 'Finn', inviteCode: CODE });
    await friend.waitFor('welcome');
    expect(await silent.waitForClose()).toBe(CLOSE_HELLO_TIMEOUT);
    expect(await wrong.waitForClose()).toBe(CLOSE_HELLO_TIMEOUT);
    await settle(150);
    expect(friend.closeCode).toBeNull();
  });

  it('limits how many connections one address may hold', async () => {
    const url = await start({ maxClientsPerAddress: 2 });
    await visit(url, from('203.0.113.60'));
    await visit(url, from('203.0.113.60'));
    await expect(visit(url, from('203.0.113.60'))).rejects.toThrow('HTTP 429');
    // Someone else still gets in, and so does the host's own browser on this computer.
    await visit(url, from('203.0.113.61'));
    for (let i = 0; i < 4; i++) await visit(url);
  });

  it('notes a guessing address in the server window once, not once per guess', async () => {
    const lines: string[] = [];
    const url = await start({ log: (m) => lines.push(m) });
    for (let s = 0; s < 3; s++) {
      const guesser = await visit(url, from('203.0.113.80'));
      for (let i = 0; i < 6; i++) guesser.send({ type: 'hello', name: 'G', inviteCode: `GUESS${s}${i}XY` });
    }
    const other = await visit(url, from('203.0.113.81'));
    other.send({ type: 'hello', name: 'O', inviteCode: 'NOTTHECODE' });
    await other.waitFor('denied');
    await settle(150);
    const refusals = lines.filter((l) => l.includes('Refused a visitor'));
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toContain('203.0.113.80');
    expect(refusals[1]).toContain('203.0.113.81');
  });

  it('listens on several addresses side by side, and only on those', async () => {
    const ipv6Loopback = await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.listen(0, '::1', () => probe.close(() => resolve(true)));
    });
    // 192.0.2.1 is reserved for documentation: no computer has it.
    await start({ host: ipv6Loopback ? ['127.0.0.1', '::1'] : ['127.0.0.1'], optionalHosts: ['192.0.2.1'] });
    const port = server!.port;
    expect((await fetch(`http://127.0.0.1:${port}/api/server-info`)).ok).toBe(true);
    if (ipv6Loopback) {
      expect((await fetch(`http://[::1]:${port}/api/server-info`)).ok).toBe(true);
      const v6 = await visit(`ws://[::1]:${port}/ws`);
      v6.send({ type: 'ping', t: 6 });
      expect(await v6.waitFor('pong')).toEqual({ type: 'pong', t: 6 });
    }
    // Not reachable on the computer's other addresses (its Wi-Fi address, for one).
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((a) => a && !a.internal && a.family === 'IPv4');
    if (lan) await expect(fetch(`http://${lan.address}:${port}/api/server-info`, { signal: AbortSignal.timeout(1500) })).rejects.toThrow();
  });

  it('says so when it is told to listen on an address this computer does not have', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-limits-'));
    await expect(
      startServer({
        port: 0,
        host: ['127.0.0.1', '192.0.2.1'],
        savesDir: path.join(tmp, 'saves'),
        distDir: makeDist(tmp),
        openBrowser: false,
        log: () => {},
      })
    ).rejects.toThrow(/no network address 192\.0\.2\.1/);
  });

  it('when full, makes room by dropping a connection that is not in the game', async () => {
    const url = await start({ maxClients: 3 });
    const waiting = await visit(url, from('203.0.113.70'));
    const a = await visit(url, from('203.0.113.71'));
    const b = await visit(url, from('203.0.113.72'));
    for (const v of [a, b]) {
      v.send({ type: 'hello', name: 'P', inviteCode: CODE });
      await v.waitFor('welcome');
    }
    // Full. A new visitor pushes out the one still at the invite prompt.
    const c = await visit(url, from('203.0.113.73'));
    await waiting.waitForClose();
    c.send({ type: 'hello', name: 'P', inviteCode: CODE });
    await c.waitFor('welcome');
    expect(a.closeCode).toBeNull();
    expect(b.closeCode).toBeNull();
    // Full of people who are in the game: nobody is pushed out.
    await expect(visit(url, from('203.0.113.74'))).rejects.toThrow('HTTP 503');
    expect([a, b, c].map((v) => v.closeCode)).toEqual([null, null, null]);
  });
});

describe('who a request comes from', () => {
  const req = (remoteAddress: string, headers: Record<string, string | string[]> = {}) =>
    ({ socket: { remoteAddress }, headers }) as unknown as http.IncomingMessage;

  it('believes X-Forwarded-For only from a tunnel on this computer, and only its last entry', () => {
    expect(clientAddress(req('127.0.0.1', { 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5');
    expect(clientAddress(req('::1', { 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5');
    expect(clientAddress(req('::ffff:127.0.0.1', { 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8:0:0::/64');
    // A visitor can put anything in front; the tunnel appends the address it really saw.
    expect(clientAddress(req('127.0.0.1', { 'x-forwarded-for': '10.0.0.1, 198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientAddress(req('127.0.0.1', { 'x-forwarded-for': ['10.0.0.1', '198.51.100.4'] }))).toBe('198.51.100.4');
    // Straight from the network: the header is the visitor's own claim and is ignored.
    expect(clientAddress(req('192.168.1.77', { 'x-forwarded-for': '203.0.113.5' }))).toBe('192.168.1.77');
    expect(clientAddress(req('::ffff:192.168.1.77'))).toBe('192.168.1.77');
    expect(clientAddress(req('127.0.0.1'))).toBe('127.0.0.1');
    // Something that is not an address is not believed either.
    expect(clientAddress(req('127.0.0.1', { 'x-forwarded-for': 'not-an-address' }))).toBe('127.0.0.1');
    expect(clientAddress(req('127.0.0.1', { 'x-forwarded-for': '' }))).toBe('127.0.0.1');
  });

  it('counts an IPv6 visitor by their /64, which is what one household owns', () => {
    expect(addressKey('203.0.113.5')).toBe('203.0.113.5');
    expect(addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:0DB8:0001:0002::1')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8:1:2::')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('fe80::1%en0')).toBe('fe80:0:0:0::/64');
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
    expect(addressKey('unknown')).toBe('unknown');
    // Changing the last half of the address does not make a new visitor...
    const one = clientAddress(req('127.0.0.1', { 'x-forwarded-for': '2001:db8:1:2:1111::1' }));
    const two = clientAddress(req('127.0.0.1', { 'x-forwarded-for': '2001:db8:1:2:9999:8888:7777:6666' }));
    expect(one).toBe(two);
    // ...but the neighbours are somebody else.
    expect(clientAddress(req('127.0.0.1', { 'x-forwarded-for': '2001:db8:1:3::1' }))).not.toBe(one);
  });

  it('knows a browser on this computer from a visitor through the tunnel', () => {
    expect(isLocalRequest(req('127.0.0.1'))).toBe(true);
    expect(isLocalRequest(req('::1'))).toBe(true);
    expect(isLocalRequest(req('127.0.0.1', { 'x-forwarded-for': '203.0.113.5' }))).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', { 'x-forwarded-host': 'pc.tail1.ts.net' }))).toBe(false);
    expect(isLocalRequest(req('192.168.1.77'))).toBe(false);
  });

  it('accepts a WebSocket only from the page the server itself served', () => {
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'localhost:3210' }))).toBe(true);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'localhost:3210', origin: 'http://localhost:3210' }))).toBe(true);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'LOCALHOST:3210', origin: 'http://localhost:3210' }))).toBe(true);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'pc.tail1.ts.net', origin: 'https://pc.tail1.ts.net' }))).toBe(true);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: '127.0.0.1:3210', 'x-forwarded-host': 'pc.tail1.ts.net', origin: 'https://pc.tail1.ts.net' }))).toBe(true);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'localhost:3210', origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'localhost:3210', origin: 'http://localhost:9999' }))).toBe(false);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'pc.tail1.ts.net', origin: 'https://pc.tail1.ts.net.evil.example' }))).toBe(false);
    expect(isSameOriginUpgrade(req('127.0.0.1', { host: 'localhost:3210', origin: 'null' }))).toBe(false);
  });

  it('puts the server info into the page without breaking it', () => {
    const info: ServerInfo = { app: SERVER_APP_ID, protocolVersion: 2, port: 3210, lanUrls: ['http://a&b"<x>'], started: false, inviteRequired: true, share: 'online' };
    const html = injectServerInfo('<!doctype html><html><head><title>T</title></head><body></body></html>', info);
    expect(html).toMatch(/<head>\s*<meta name="catan-game-server" content="[^"<]+" \/><title>T<\/title>/);
    const content = /content="([^"]+)"/.exec(html)![1]!;
    expect(JSON.parse(content.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&'))).toEqual(info);
    expect(injectServerInfo('<p>no head</p>', info)).toMatch(/^<meta name="catan-game-server"/);
  });
});
