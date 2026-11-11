// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { NetworkAddress } from '../http-server';
import { buildBanner, buildShareInfo, listenPlan, parseLaunchOptions, type LaunchOptions } from '../launch';

const ok = (argv: string[], env: NodeJS.ProcessEnv = {}): LaunchOptions => {
  const parsed = parseLaunchOptions(argv, env);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
};
const problem = (argv: string[], env: NodeJS.ProcessEnv = {}): string => {
  const parsed = parseLaunchOptions(argv, env);
  if (!('error' in parsed)) throw new Error('expected a problem');
  return parsed.error;
};

const wifi: NetworkAddress = { url: 'http://192.168.1.20:3210', interfaceName: 'en0', address: '192.168.1.20', note: null, usable: true };
const vpn: NetworkAddress = {
  url: 'http://100.64.0.7:3210',
  interfaceName: 'utun4',
  address: '100.64.0.7',
  note: 'Tailscale/VPN, for friends on your tailnet',
  usable: true,
};
const virtual: NetworkAddress = { url: 'http://172.20.0.1:3210', interfaceName: 'vEthernet (WSL)', address: '172.20.0.1', note: 'virtual adapter', usable: false };

describe('what the host asked for', () => {
  it('defaults to the home network, no invite code', () => {
    expect(ok([])).toMatchObject({ share: 'lan', port: 3210, httpsPort: 443, requireInvite: false, newInvite: false, noOpen: false, help: false });
  });

  it('online always needs the invite code', () => {
    expect(ok(['--share', 'online'])).toMatchObject({ share: 'online', requireInvite: true });
    expect(ok(['--share=funnel'])).toMatchObject({ share: 'online', requireInvite: true });
    expect(ok(['--online'])).toMatchObject({ share: 'online', requireInvite: true });
    expect(ok([], { SHARE: 'online' })).toMatchObject({ share: 'online', requireInvite: true });
  });

  it('the private Tailscale network needs the code too; on the home Wi-Fi it is a choice', () => {
    expect(ok(['--share', 'tailnet'])).toMatchObject({ share: 'tailnet', requireInvite: true });
    expect(ok(['--tailnet'])).toMatchObject({ share: 'tailnet', requireInvite: true });
    expect(ok(['--lan', '--invite'])).toMatchObject({ share: 'lan', requireInvite: true });
    expect(ok([], { REQUIRE_INVITE: '1' })).toMatchObject({ share: 'lan', requireInvite: true });
    expect(ok([], { INVITE_CODE: 'play-2gether' })).toMatchObject({ requireInvite: true, inviteCode: 'PLAY2GETHER' });
  });

  it('reads ports, flags and environment', () => {
    expect(ok(['--port', '4000', '--https-port=8443', '--no-open', '--new-invite', '--also-lan'])).toMatchObject({
      port: 4000,
      httpsPort: 8443,
      noOpen: true,
      newInvite: true,
      alsoLan: true,
    });
    expect(ok([], { PORT: '3299', NO_OPEN: '1', BOT_DELAY_MS: '0', SAVES_DIR: '/tmp/x', FUNNEL_PORT: '10000' })).toMatchObject({
      port: 3299,
      noOpen: true,
      botDelayMs: 0,
      savesDir: '/tmp/x',
      httpsPort: 10000,
    });
    // The command line wins over the environment.
    expect(ok(['--share', 'lan', '--port', '5000'], { SHARE: 'online', PORT: '3299' })).toMatchObject({ share: 'lan', port: 5000 });
    expect(ok(['--help']).help).toBe(true);
  });

  it('explains mistakes in plain words', () => {
    expect(problem(['--share', 'smoke-signals'])).toMatch(/Use lan, tailnet or online/);
    expect(problem(['--share'])).toMatch(/needs a value/);
    expect(problem(['--port', '99999'])).toMatch(/between 1 and 65535/);
    expect(problem(['--https-port', '444'])).toMatch(/one of 443, 8443, 10000/);
    expect(problem(['--frobnicate'])).toMatch(/Unknown option --frobnicate/);
    expect(problem(['online'])).toMatch(/Did not understand "online"/);
    expect(problem([], { INVITE_CODE: 'ab' })).toMatch(/6 to 32/);
  });

  it('listens on as little as the way of sharing needs', () => {
    const ts = { ipv4: '100.64.0.7', ipv6: 'fd7a:115c:a1e0::7' };
    // Online: friends come in through the tunnel, so only this computer itself.
    expect(listenPlan({ share: 'online', alsoLan: false }, {}, ts)).toEqual({ hosts: ['127.0.0.1'], optionalHosts: [], reachableOnLan: false });
    // Private network: this computer and its Tailscale addresses. The café Wi-Fi cannot connect.
    expect(listenPlan({ share: 'tailnet', alsoLan: false }, {}, ts)).toEqual({
      hosts: ['127.0.0.1', '100.64.0.7'],
      optionalHosts: ['fd7a:115c:a1e0::7'],
      reachableOnLan: false,
    });
    expect(listenPlan({ share: 'tailnet', alsoLan: false }, {}, { ipv4: '100.64.0.7', ipv6: null }).optionalHosts).toEqual([]);
    // Home Wi-Fi, or when the host asks for it: every network.
    const everywhere = { hosts: ['0.0.0.0'], optionalHosts: [], reachableOnLan: true };
    expect(listenPlan({ share: 'lan', alsoLan: false }, {}, null)).toEqual(everywhere);
    expect(listenPlan({ share: 'online', alsoLan: true }, {}, ts)).toEqual(everywhere);
    expect(listenPlan({ share: 'tailnet', alsoLan: true }, {}, ts)).toEqual(everywhere);
    // HOST overrides everything.
    expect(listenPlan({ share: 'online', alsoLan: false }, { HOST: '192.168.1.20' }, ts)).toEqual({ hosts: ['192.168.1.20'], optionalHosts: [], reachableOnLan: true });
    expect(listenPlan({ share: 'lan', alsoLan: false }, { HOST: '127.0.0.1' }, null).reachableOnLan).toBe(false);
  });
});

describe('links for the host to pass on', () => {
  it('online: one public link with the code in it, once Funnel is up', () => {
    const waiting = buildShareInfo({
      mode: 'online',
      port: 3210,
      inviteCode: 'ABCDEFGH',
      addresses: [],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: '100.64.0.7' },
      publicUrl: null,
      status: 'Setting up the online link…',
    });
    expect(waiting).toEqual({ mode: 'online', links: [], inviteCode: 'ABCD-EFGH', status: 'Setting up the online link…' });

    const up = buildShareInfo({
      mode: 'online',
      port: 3210,
      inviteCode: 'ABCDEFGH',
      addresses: [],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: '100.64.0.7' },
      publicUrl: 'https://pc.tail1.ts.net',
      status: null,
    });
    expect(up.links).toEqual([{ url: 'https://pc.tail1.ts.net/?join=ABCD-EFGH', kind: 'online', label: 'Works from any network' }]);
  });

  it('online with --also-lan lists the home addresses after the public link', () => {
    const info = buildShareInfo({
      mode: 'online',
      port: 3210,
      inviteCode: 'ABCDEFGH',
      addresses: [wifi, vpn, virtual],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: '100.64.0.7' },
      publicUrl: 'https://pc.tail1.ts.net',
      status: null,
    });
    expect(info.links.map((l) => [l.kind, l.url])).toEqual([
      ['online', 'https://pc.tail1.ts.net/?join=ABCD-EFGH'],
      ['lan', 'http://192.168.1.20:3210/?join=ABCD-EFGH'],
    ]);
  });

  it('tailnet: the Tailscale name first, then the number, then the home network', () => {
    const info = buildShareInfo({
      mode: 'tailnet',
      port: 3210,
      inviteCode: null,
      addresses: [wifi, vpn, virtual],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: '100.64.0.7' },
      publicUrl: null,
      status: null,
    });
    expect(info.links.map((l) => [l.kind, l.url])).toEqual([
      ['tailnet', 'http://pc.tail1.ts.net:3210'],
      ['tailnet', 'http://100.64.0.7:3210'],
      ['lan', 'http://192.168.1.20:3210'],
    ]);
    expect(info.inviteCode).toBeNull();
  });

  it('lan: home addresses, with a Tailscale adapter marked as such; unusable adapters left out', () => {
    const info = buildShareInfo({ mode: 'lan', port: 3210, inviteCode: null, addresses: [wifi, vpn, virtual], tailscale: null, publicUrl: null, status: null });
    expect(info.links.map((l) => [l.kind, l.url])).toEqual([
      ['lan', 'http://192.168.1.20:3210'],
      ['tailnet', 'http://100.64.0.7:3210'],
    ]);
  });
});

describe('the server window', () => {
  const base = { hostUrl: 'http://localhost:3210/?host=KEY', port: 3210, noOpen: true, platform: 'darwin' as const };

  it('online: shows the invite link and the code, and nothing about the home network', () => {
    const share = buildShareInfo({
      mode: 'online',
      port: 3210,
      inviteCode: 'ABCDEFGH',
      addresses: [],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: '100.64.0.7' },
      publicUrl: 'https://pc.tail1.ts.net',
      status: null,
    });
    const text = buildBanner({ ...base, share, addresses: [] });
    expect(text).toContain('https://pc.tail1.ts.net/?join=ABCD-EFGH');
    expect(text).toContain('works from any network');
    expect(text).toContain('encrypted');
    expect(text).toMatch(/Invite code.*ABCD-EFGH/);
    expect(text).not.toContain('192.168.');
    expect(text).not.toContain('incoming connections');
  });

  it('online, before the link is up: says what it is waiting for', () => {
    const share = buildShareInfo({
      mode: 'online',
      port: 3210,
      inviteCode: 'ABCDEFGH',
      addresses: [],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: null },
      publicUrl: null,
      status: 'Setting up the online link…',
    });
    const text = buildBanner({ ...base, share, addresses: [] });
    expect(text).toContain('Online link: Setting up the online link…');
    expect(text).not.toContain('INVITE LINK');
  });

  it('tailnet: shows the Tailscale link with the code and how friends get access', () => {
    const share = buildShareInfo({
      mode: 'tailnet',
      port: 3210,
      inviteCode: 'ABCDEFGH',
      addresses: [],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: '100.64.0.7' },
      publicUrl: null,
      status: null,
    });
    const text = buildBanner({ ...base, share, addresses: [] });
    expect(text).toContain('http://pc.tail1.ts.net:3210/?join=ABCD-EFGH');
    expect(text).toContain('http://100.64.0.7:3210/?join=ABCD-EFGH');
    expect(text).toMatch(/Friends need Tailscale/);
    expect(text).toMatch(/Only Tailscale can reach the game/);
    expect(text).not.toContain('192.168.');
  });

  it('tailnet with --also-lan lists the home addresses as well', () => {
    const share = buildShareInfo({
      mode: 'tailnet',
      port: 3210,
      inviteCode: 'ABCDEFGH',
      addresses: [wifi, vpn],
      tailscale: { dnsName: 'pc.tail1.ts.net', ipv4: '100.64.0.7' },
      publicUrl: null,
      status: null,
    });
    const text = buildBanner({ ...base, share, addresses: [wifi, vpn] });
    expect(text).toContain('People on your own Wi-Fi can also use:');
    expect(text).toContain('http://192.168.1.20:3210/?join=ABCD-EFGH');
    expect(text).toContain('Allow');
  });

  it('lan: lists every adapter with its hint, and points to online play', () => {
    const share = buildShareInfo({ mode: 'lan', port: 3210, inviteCode: null, addresses: [wifi, virtual], tailscale: null, publicUrl: null, status: null });
    const text = buildBanner({ ...base, share, addresses: [wifi, virtual], platform: 'win32' });
    expect(text).toContain('Friends on the same Wi-Fi open one of these:');
    expect(text).toContain('http://192.168.1.20:3210');
    expect(text).toContain('virtual adapter');
    expect(text).toContain('npm run host:online');
    expect(text).toContain('allow-firewall.ps1');
    const none = buildBanner({ ...base, share: { ...share, links: [] }, addresses: [] });
    expect(none).toContain('no network address found');
  });

  it('lan with an invite code puts the code in the links', () => {
    const share = buildShareInfo({ mode: 'lan', port: 3210, inviteCode: 'ABCDEFGH', addresses: [wifi], tailscale: null, publicUrl: null, status: null });
    const text = buildBanner({ ...base, share, addresses: [wifi] });
    expect(text).toContain('http://192.168.1.20:3210/?join=ABCD-EFGH');
    expect(text).toMatch(/Invite code:\s+ABCD-EFGH/);
  });
});
