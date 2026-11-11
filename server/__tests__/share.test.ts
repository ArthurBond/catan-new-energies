// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFunnelOutputReader,
  expectedFunnelUrl,
  findTailscaleCli,
  funnelArgs,
  funnelIsOn,
  parseShareMode,
  parseTailscaleStatus,
  readTailscaleStatus,
  startFunnel,
  tailscaleCommand,
  tailscaleProblem,
  type FunnelHandle,
} from '../share';

const FAKE_CLI = path.resolve(__dirname, '../../e2e-online/fake-tailscale.mjs');

async function until(check: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('share modes', () => {
  it('understands the names people use', () => {
    expect(parseShareMode(undefined)).toBe('lan');
    expect(parseShareMode('LAN')).toBe('lan');
    expect(parseShareMode('online')).toBe('online');
    expect(parseShareMode('funnel')).toBe('online');
    expect(parseShareMode('tailscale')).toBe('tailnet');
    expect(parseShareMode('tailnet')).toBe('tailnet');
    expect(parseShareMode('carrier-pigeon')).toBeNull();
  });
});

describe('reading Tailscale status', () => {
  const running = {
    Version: '1.104.5',
    BackendState: 'Running',
    CertDomains: null,
    Self: {
      DNSName: 'Arthurs-Mac.tail1a2b3c.ts.net.',
      TailscaleIPs: ['fd7a:115c:a1e0::1', '100.101.102.103'],
      CapMap: { 'https://tailscale.com/cap/ssh': null },
    },
  };

  it('picks out the name, address and what is switched on', () => {
    expect(parseTailscaleStatus(running)).toEqual({
      backendState: 'Running',
      running: true,
      dnsName: 'arthurs-mac.tail1a2b3c.ts.net',
      ipv4: '100.101.102.103',
      ipv6: 'fd7a:115c:a1e0::1',
      httpsEnabled: false,
      funnelEnabled: false,
      version: '1.104.5',
    });
    const enabled = parseTailscaleStatus({ ...running, Self: { ...running.Self, CapMap: { https: null, funnel: null } } });
    expect(enabled.httpsEnabled).toBe(true);
    expect(enabled.funnelEnabled).toBe(true);
    // Older clients list capabilities as an array, and certificates show up as CertDomains.
    const older = parseTailscaleStatus({ ...running, CertDomains: ['x.ts.net'], Self: { ...running.Self, CapMap: null, Capabilities: ['funnel'] } });
    expect(older.httpsEnabled).toBe(true);
    expect(older.funnelEnabled).toBe(true);
  });

  it('survives junk', () => {
    for (const junk of [null, 'nope', 42, {}, { Self: 3 }, { Self: { DNSName: '<script>', TailscaleIPs: 'x' } }]) {
      const s = parseTailscaleStatus(junk);
      expect(s.running).toBe(false);
      expect(s.dnsName).toBeNull();
      expect(s.ipv4).toBeNull();
      expect(s.ipv6).toBeNull();
    }
  });

  it('says in plain words why Tailscale cannot be used yet', () => {
    expect(tailscaleProblem(parseTailscaleStatus(running))).toBeNull();
    expect(tailscaleProblem(parseTailscaleStatus({ ...running, BackendState: 'Stopped' }))).toMatch(/turned off/);
    expect(tailscaleProblem(parseTailscaleStatus({ ...running, BackendState: 'NeedsLogin' }))).toMatch(/not signed in/);
    expect(tailscaleProblem(parseTailscaleStatus({ BackendState: 'Running', Self: {} }))).toMatch(/no Tailscale address/);
  });

  it('finds the program on the PATH, in the usual places, or where TAILSCALE_CLI says', () => {
    const has = (...files: string[]) => (f: string) => files.includes(f);
    expect(findTailscaleCli({ PATH: '/a:/b' }, 'linux', has('/b/tailscale'))).toBe('/b/tailscale');
    expect(findTailscaleCli({ PATH: '/a' }, 'darwin', has('/Applications/Tailscale.app/Contents/MacOS/Tailscale'))).toBe(
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
    );
    expect(findTailscaleCli({ Path: 'C:\\x;C:\\y' }, 'win32', has('C:\\y\\tailscale.exe'))).toBe('C:\\y\\tailscale.exe');
    expect(findTailscaleCli({ PATH: '' }, 'win32', has('C:\\Program Files\\Tailscale\\tailscale.exe'))).toBe(
      'C:\\Program Files\\Tailscale\\tailscale.exe'
    );
    expect(findTailscaleCli({ PATH: '/a' }, 'linux', has())).toBeNull();
    expect(findTailscaleCli({ TAILSCALE_CLI: '/opt/ts', PATH: '/a' }, 'linux', has('/opt/ts', '/a/tailscale'))).toBe('/opt/ts');
    expect(findTailscaleCli({ TAILSCALE_CLI: '/missing', PATH: '/a' }, 'linux', has('/a/tailscale'))).toBeNull();
  });

  it('runs a script stand-in with Node and the real program directly', () => {
    expect(tailscaleCommand('/usr/local/bin/tailscale', ['status'])).toEqual(['/usr/local/bin/tailscale', ['status']]);
    expect(tailscaleCommand('/x/fake.mjs', ['status'])).toEqual([process.execPath, ['/x/fake.mjs', 'status']]);
  });

  it('reads the status from the program', async () => {
    const status = await readTailscaleStatus(FAKE_CLI);
    expect(status).toMatchObject({ running: true, dnsName: 'game-host.test-tailnet.ts.net', ipv4: '100.64.0.7', funnelEnabled: true });
    await expect(readTailscaleStatus(path.join(os.tmpdir(), 'no-such-tailscale-program'))).rejects.toThrow(/did not answer/);
  });
});

describe('Tailscale Funnel output', () => {
  it('asks for the right thing', () => {
    expect(funnelArgs(3210, 443)).toEqual(['funnel', '--yes', '--https=443', 'http://127.0.0.1:3210']);
    expect(expectedFunnelUrl('pc.tail1.ts.net', 443)).toBe('https://pc.tail1.ts.net');
    expect(expectedFunnelUrl('pc.tail1.ts.net', 8443)).toBe('https://pc.tail1.ts.net:8443');
  });

  const read = (text: string) => {
    const urls: string[] = [];
    const approvals: string[] = [];
    const reader = createFunnelOutputReader({ onUrl: (u) => urls.push(u), onNeedsApproval: (l) => approvals.push(l) });
    for (const line of text.split('\n')) reader.line(line);
    return { urls, approvals, tailnetOnly: reader.tailnetOnly };
  };

  it('finds the public address in what Tailscale prints', () => {
    const { urls, approvals } = read(
      'Available on the internet:\n\nhttps://Arthurs-Mac.tail1a2b3c.ts.net/\n|-- proxy http://127.0.0.1:3210\n\nPress Ctrl+C to exit.'
    );
    expect(urls).toEqual(['https://arthurs-mac.tail1a2b3c.ts.net']);
    expect(approvals).toEqual([]);
    expect(read('Available on the internet:\r\n\r\nhttps://pc.tail1.ts.net:8443/\r\n').urls).toEqual(['https://pc.tail1.ts.net:8443']);
  });

  it('passes on the link that turns Funnel on, and is not fooled by it', () => {
    const { urls, approvals } = read(
      '\nFunnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=nABC123CNTRL\n\nSuccess.\nAvailable on the internet:\n\nhttps://pc.tail1.ts.net/\n'
    );
    expect(approvals).toEqual(['https://login.tailscale.com/f/funnel?node=nABC123CNTRL']);
    expect(urls).toEqual(['https://pc.tail1.ts.net']);
  });

  it('does not call a tailnet-only address public', () => {
    const { urls, tailnetOnly } = read('Available within your tailnet:\n\nhttps://pc.tail1.ts.net/\n|-- proxy http://127.0.0.1:3210\n');
    expect(urls).toEqual([]);
    expect(tailnetOnly).toBe(true);
  });

  it('can also tell from Tailscale’s configuration that Funnel is on', () => {
    const web = { 'pc.tail1.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3210' } } } };
    const foreground = { Foreground: { abc123: { TCP: { 443: { HTTPS: true } }, Web: web, AllowFunnel: { 'pc.tail1.ts.net:443': true } } } };
    const background = { TCP: { 443: { HTTPS: true } }, Web: web, AllowFunnel: { 'pc.tail1.ts.net:443': true } };
    expect(funnelIsOn(foreground, 'pc.tail1.ts.net', 443)).toBe(true);
    expect(funnelIsOn(background, 'PC.tail1.ts.net', 443)).toBe(true);
    // Shared inside the tailnet only, another port, another machine, switched off, or nothing at all.
    expect(funnelIsOn({ TCP: { 443: { HTTPS: true } }, Web: web }, 'pc.tail1.ts.net', 443)).toBe(false);
    expect(funnelIsOn(foreground, 'pc.tail1.ts.net', 8443)).toBe(false);
    expect(funnelIsOn(foreground, 'other.tail1.ts.net', 443)).toBe(false);
    expect(funnelIsOn({ AllowFunnel: { 'pc.tail1.ts.net:443': false } }, 'pc.tail1.ts.net', 443)).toBe(false);
    for (const junk of [{}, null, 'x', [], { AllowFunnel: 'yes' }]) expect(funnelIsOn(junk, 'pc.tail1.ts.net', 443)).toBe(false);
  });

  it('ignores addresses that are not announced as the public one', () => {
    expect(read('https://pc.tail1.ts.net/\nsee https://tailscale.com/kb/1223/funnel\n').urls).toEqual([]);
  });
});

describe('running Tailscale Funnel beside the game', () => {
  let funnel: FunnelHandle | null = null;
  let tmp: string | null = null;
  const saved = { ...process.env };

  afterEach(async () => {
    await funnel?.stop();
    funnel = null;
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = null;
    for (const key of Object.keys(process.env)) if (key.startsWith('FAKE_TS_')) delete process.env[key];
    Object.assign(process.env, saved);
  });

  const start = (retryDelaysMs = [50], extra: { dnsName?: string; statusPollMs?: number } = {}) => {
    const seen = { urls: [] as string[], approvals: [] as string[], downs: [] as { reason: string; willRetry: boolean }[] };
    funnel = startFunnel({
      cli: FAKE_CLI,
      localPort: 3210,
      retryDelaysMs,
      ...extra,
      onUrl: (u) => seen.urls.push(u),
      onNeedsApproval: (l) => seen.approvals.push(l),
      onDown: (reason, willRetry) => seen.downs.push({ reason, willRetry }),
    });
    return seen;
  };

  it('reports the address and stops the program when the game stops', async () => {
    const seen = start();
    await until(() => seen.urls.length === 1);
    expect(seen.urls).toEqual(['https://game-host.test-tailnet.ts.net']);
    expect(funnel!.url()).toBe('https://game-host.test-tailnet.ts.net');
    await funnel!.stop();
    expect(funnel!.url()).toBeNull();
    // A deliberate stop is not reported as an outage and is not retried.
    await new Promise((r) => setTimeout(r, 150));
    expect(seen.downs).toEqual([]);
    expect(seen.urls).toHaveLength(1);
  });

  it('waits while the host turns Funnel on, then carries on', async () => {
    process.env.FAKE_TS_APPROVAL_MS = '150';
    const seen = start();
    await until(() => seen.approvals.length === 1);
    expect(seen.approvals[0]).toMatch(/^https:\/\/login\.tailscale\.com\/f\/funnel/);
    expect(seen.urls).toEqual([]);
    await until(() => seen.urls.length === 1);
  });

  it('starts Funnel again by itself when it stops unexpectedly', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-funnel-'));
    process.env.FAKE_TS_DIE_ONCE_FILE = path.join(tmp, 'died');
    process.env.FAKE_TS_DIE_AFTER_MS = '50';
    const seen = start();
    await until(() => seen.downs.length === 1);
    expect(seen.downs[0]).toMatchObject({ willRetry: true });
    expect(seen.downs[0]!.reason).toMatch(/stopped/);
    await until(() => seen.urls.length === 2);
    expect(funnel!.url()).toBe('https://game-host.test-tailnet.ts.net');
  });

  it('keeps trying, and says why, when Funnel cannot start', async () => {
    process.env.FAKE_TS_FUNNEL_FAIL = '1';
    const seen = start([30]);
    await until(() => seen.downs.length >= 2);
    expect(seen.downs[0]!.reason).toMatch(/already exists for port 443/);
    expect(seen.urls).toEqual([]);
  });

  it('finds the address from Tailscale’s configuration when the announcement is not understood', async () => {
    process.env.FAKE_TS_SILENT = '1';
    const seen = start([50], { dnsName: 'game-host.test-tailnet.ts.net', statusPollMs: 40 });
    await until(() => seen.urls.length === 1);
    expect(seen.urls).toEqual(['https://game-host.test-tailnet.ts.net']);
    // Asked once it is known, never announced twice.
    await new Promise((r) => setTimeout(r, 200));
    expect(seen.urls).toHaveLength(1);
  });

  it('does not invent an address while Funnel is not on', async () => {
    process.env.FAKE_TS_APPROVAL_MS = '400';
    const seen = start([50], { dnsName: 'game-host.test-tailnet.ts.net', statusPollMs: 40 });
    await until(() => seen.approvals.length === 1);
    await new Promise((r) => setTimeout(r, 200));
    expect(seen.urls).toEqual([]);
    await until(() => seen.urls.length === 1);
  });

  it('explains when Tailscale only shares inside the tailnet', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catan-funnel-'));
    process.env.FAKE_TS_TAILNET_ONLY = '1';
    process.env.FAKE_TS_DIE_ONCE_FILE = path.join(tmp, 'died');
    process.env.FAKE_TS_DIE_AFTER_MS = '50';
    const seen = start([60_000]);
    await until(() => seen.downs.length === 1);
    expect(seen.downs[0]!.reason).toMatch(/inside your tailnet only/);
    expect(seen.urls).toEqual([]);
  });
});
