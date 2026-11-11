/**
 * What `npm run host`, `npm run host:online` and `npm run host:tailnet` were asked to do, and the
 * text the server window shows. Pure functions, so they can be tested without starting anything.
 */

import {
  formatInviteCode,
  inviteLink,
  normalizeInviteCode,
  SERVER_DEFAULT_PORT,
  type ShareInfo,
  type ShareLink,
  type ShareMode,
} from '@/network/server-protocol';
import { isUsableInviteCode } from './access';
import type { NetworkAddress } from './http-server';
import { FUNNEL_PORTS, parseShareMode, type TailscaleStatus } from './share';

export interface LaunchOptions {
  share: ShareMode;
  port: number;
  /** Public port for the online link: 443, 8443 or 10000. */
  httpsPort: number;
  noOpen: boolean;
  /** Friends must present the invite code. Always true for `online` and `tailnet`. */
  requireInvite: boolean;
  /** Make a new invite code (old invite links stop working). */
  newInvite: boolean;
  /** A fixed invite code (`INVITE_CODE`), mainly for tests. */
  inviteCode: string | null;
  /** `online` and `tailnet`: also listen on the home network, not just for Tailscale. */
  alsoLan: boolean;
  /** Skip asking the public link for the game after it comes up. */
  skipLinkCheck: boolean;
  savesDir: string | null;
  botDelayMs: number | undefined;
  help: boolean;
}

export const USAGE = `
  Usage: npm run host            play on your own Wi-Fi (friends in the same house)
         npm run host:online     one link that works from any network (Tailscale Funnel)
         npm run host:tailnet    private: friends who run Tailscale themselves

  Options (after "--", for example: npm run host:online -- --new-invite)
    --share lan|tailnet|online   how to share the game (default lan)
    --port <number>              port on this computer (default ${SERVER_DEFAULT_PORT})
    --https-port <number>        public port for the online link: 443 (default), 8443 or 10000
    --invite                     ask friends for the invite code on your own Wi-Fi too
    --new-invite                 make a new invite code; old invite links stop working
    --also-lan                   online and tailnet: also let people on your Wi-Fi connect directly
    --no-open                    do not open the host page in the browser
    --help                       show this text

  The same settings as environment variables: SHARE, PORT, FUNNEL_PORT, REQUIRE_INVITE=1,
  NO_OPEN=1, SAVES_DIR, TAILSCALE_CLI (path of the tailscale program).
  Full guide: MULTIPLAYER.md
`;

function parsePortValue(raw: string, name: string, allowed?: readonly number[]): number | string {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return `${name} must be a number between 1 and 65535 (got "${raw}").`;
  if (allowed && !allowed.includes(n)) return `${name} must be one of ${allowed.join(', ')} (got ${n}).`;
  return n;
}

/** Reads the command line and environment. Returns a plain-language problem as `{ error }`. */
export function parseLaunchOptions(argv: readonly string[], env: NodeJS.ProcessEnv): LaunchOptions | { error: string } {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) return { error: `Did not understand "${arg}". Run with --help to see the options.` };
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const takesValue = name === 'share' || name === 'port' || name === 'https-port';
    if (eq !== -1) flags.set(name, arg.slice(eq + 1));
    else if (takesValue) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: `--${name} needs a value.` };
      flags.set(name, value);
      i += 1;
    } else flags.set(name, true);
  }
  const known = ['share', 'port', 'https-port', 'invite', 'new-invite', 'also-lan', 'no-open', 'help', 'online', 'tailnet', 'lan', 'skip-link-check'];
  for (const name of flags.keys()) {
    if (!known.includes(name)) return { error: `Unknown option --${name}. Run with --help to see the options.` };
  }

  const shareRaw = flags.has('online')
    ? 'online'
    : flags.has('tailnet')
      ? 'tailnet'
      : flags.has('lan')
        ? 'lan'
        : typeof flags.get('share') === 'string'
          ? (flags.get('share') as string)
          : env.SHARE;
  const share = parseShareMode(shareRaw);
  if (!share) return { error: `Unknown way to share "${shareRaw}". Use lan, tailnet or online.` };

  const portRaw = typeof flags.get('port') === 'string' ? (flags.get('port') as string) : env.PORT;
  const port = portRaw ? parsePortValue(portRaw, 'PORT') : SERVER_DEFAULT_PORT;
  if (typeof port === 'string') return { error: port };

  const httpsRaw = typeof flags.get('https-port') === 'string' ? (flags.get('https-port') as string) : env.FUNNEL_PORT;
  const httpsPort = httpsRaw ? parsePortValue(httpsRaw, 'The public port', FUNNEL_PORTS) : 443;
  if (typeof httpsPort === 'string') return { error: httpsPort };

  let inviteCode: string | null = null;
  if (env.INVITE_CODE) {
    inviteCode = normalizeInviteCode(env.INVITE_CODE);
    if (!isUsableInviteCode(inviteCode)) return { error: 'INVITE_CODE must be 6 to 32 letters and digits.' };
  }

  const botDelay = env.BOT_DELAY_MS ? Number(env.BOT_DELAY_MS) : undefined;
  return {
    share,
    port,
    httpsPort,
    noOpen: flags.has('no-open') || env.NO_OPEN === '1',
    // Anything reachable from beyond the home network asks for the code.
    requireInvite: share !== 'lan' || flags.has('invite') || env.REQUIRE_INVITE === '1' || inviteCode !== null,
    newInvite: flags.has('new-invite'),
    inviteCode,
    alsoLan: flags.has('also-lan') || env.ALSO_LAN === '1',
    skipLinkCheck: flags.has('skip-link-check') || env.SKIP_LINK_CHECK === '1',
    savesDir: env.SAVES_DIR ?? null,
    botDelayMs: botDelay !== undefined && Number.isFinite(botDelay) && botDelay >= 0 ? botDelay : undefined,
    help: flags.has('help'),
  };
}

export interface ListenPlan {
  /** Addresses the server must be able to listen on. */
  hosts: string[];
  /** Addresses it also listens on if the computer has them. */
  optionalHosts: string[];
  /** People on the home network can connect directly. */
  reachableOnLan: boolean;
}

/**
 * Where the server listens. As little as the way of sharing needs:
 * - `online`: this computer only; friends come in through the tunnel.
 * - `tailnet`: this computer and its Tailscale addresses; the Wi-Fi it happens to be on cannot connect.
 * - `lan`, or `--also-lan`: every network the computer is on.
 */
export function listenPlan(
  options: Pick<LaunchOptions, 'share' | 'alsoLan'>,
  env: NodeJS.ProcessEnv,
  tailscale: Pick<TailscaleStatus, 'ipv4' | 'ipv6'> | null
): ListenPlan {
  const everywhere: ListenPlan = { hosts: ['0.0.0.0'], optionalHosts: [], reachableOnLan: true };
  if (env.HOST) {
    const local = env.HOST === '127.0.0.1' || env.HOST === 'localhost' || env.HOST === '::1';
    return { hosts: [env.HOST], optionalHosts: [], reachableOnLan: !local };
  }
  if (options.share === 'lan' || options.alsoLan) return everywhere;
  if (options.share === 'online') return { hosts: ['127.0.0.1'], optionalHosts: [], reachableOnLan: false };
  // Without a Tailscale IPv4 address there is nothing private to listen on; main.ts stops earlier.
  if (!tailscale?.ipv4) return everywhere;
  return {
    hosts: ['127.0.0.1', tailscale.ipv4],
    optionalHosts: tailscale.ipv6 ? [tailscale.ipv6] : [],
    reachableOnLan: false,
  };
}

export interface ShareSituation {
  mode: ShareMode;
  port: number;
  inviteCode: string | null;
  /** This computer's addresses on the home network (empty when it only listens for the tunnel). */
  addresses: readonly NetworkAddress[];
  tailscale: Pick<TailscaleStatus, 'dnsName' | 'ipv4'> | null;
  /** The public address once Tailscale Funnel is up. */
  publicUrl: string | null;
  /** Why the online link is not up (yet), in plain language. */
  status: string | null;
}

/** The links for the host's lobby, best first, each already carrying the invite code. */
export function buildShareInfo(s: ShareSituation): ShareInfo {
  const link = (base: string, kind: ShareMode, label: string): ShareLink => ({ url: inviteLink(base, s.inviteCode), kind, label });
  const links: ShareLink[] = [];
  if (s.mode === 'online' && s.publicUrl) links.push(link(s.publicUrl, 'online', 'Works from any network'));
  if (s.mode === 'tailnet' && s.tailscale) {
    if (s.tailscale.dnsName) links.push(link(`http://${s.tailscale.dnsName}:${s.port}`, 'tailnet', 'For friends on your Tailscale network'));
    if (s.tailscale.ipv4) links.push(link(`http://${s.tailscale.ipv4}:${s.port}`, 'tailnet', 'The same, by number'));
  }
  const tailscaleIp = s.tailscale?.ipv4 ?? null;
  for (const a of s.addresses) {
    if (!a.usable || a.address === tailscaleIp) continue;
    // In the other modes a Tailscale address shows up here as just another adapter.
    const viaVpn = a.note !== null;
    if (viaVpn && s.mode === 'tailnet') continue;
    links.push(link(a.url, viaVpn ? 'tailnet' : 'lan', viaVpn ? 'For friends on your Tailscale network' : 'Same Wi-Fi only'));
  }
  return {
    mode: s.mode,
    links,
    inviteCode: s.inviteCode ? formatInviteCode(s.inviteCode) : null,
    status: s.status,
  };
}

const RULE = `  ${'-'.repeat(74)}`;

/** The framed invite link for `online`, printed when Tailscale Funnel is up; null until then. */
export function buildOnlineInviteBlock(share: ShareInfo): string | null {
  const online = share.links.find((l) => l.kind === 'online');
  if (!online) return null;
  return [
    RULE,
    '  INVITE LINK. Send this to your friends:',
    '',
    `      ${online.url}`,
    '',
    '  It works from any network: home Wi-Fi, mobile data, another country.',
    '  The connection is encrypted (HTTPS through Tailscale Funnel).',
    `  Invite code, if someone opens the address without it:  ${share.inviteCode}`,
    RULE,
  ].join('\n');
}

/** The block the server window prints at start. */
export function buildBanner(args: {
  share: ShareInfo;
  hostUrl: string;
  port: number;
  noOpen: boolean;
  addresses: readonly NetworkAddress[];
  platform?: NodeJS.Platform;
}): string {
  const { share, hostUrl, port, noOpen, addresses } = args;
  const platform = args.platform ?? process.platform;
  const lines = [
    '',
    '  CATAN: New Energies server is running.',
    '',
    `  You (host, keep this link private):  ${hostUrl}`,
    `  On this computer:                    http://localhost:${port}`,
    '',
  ];
  const code = share.inviteCode;

  if (share.mode === 'online') {
    lines.push(buildOnlineInviteBlock(share) ?? `  Online link: ${share.status ?? 'being set up…'}`);
  } else if (share.mode === 'tailnet') {
    const tailnet = share.links.filter((l) => l.kind === 'tailnet');
    lines.push(RULE, '  INVITE LINK for friends who run Tailscale (encrypted, not public):', '');
    for (const l of tailnet) lines.push(`      ${l.url}`);
    if (tailnet.length === 0) lines.push('      (no Tailscale address found)');
    lines.push(
      '',
      '  Friends need Tailscale on their device, and this computer shared with them',
      '  (Tailscale admin console > Machines > ... > Share). See MULTIPLAYER.md.',
      '  Only Tailscale can reach the game: the Wi-Fi this computer is on cannot.'
    );
    if (code) lines.push(`  Invite code, if someone opens the address without it:  ${code}`);
    lines.push(RULE);
  }

  const lan = share.links.filter((l) => l.kind === 'lan');
  if (share.mode === 'lan') {
    lines.push('  Friends on the same Wi-Fi open one of these:');
    if (addresses.filter((a) => a.usable).length === 0) lines.push('    (no network address found; is Wi-Fi connected?)');
    for (const a of addresses) {
      const url = a.usable ? inviteLink(a.url, code ? code : null) : a.url;
      lines.push(`    ${url.padEnd(34)} ${a.interfaceName}${a.note ? `  - ${a.note}` : ''}`);
    }
    if (code) lines.push('', `  Invite code:  ${code}`);
    lines.push('', '  Friends somewhere else? Stop this (Ctrl+C) and run:  npm run host:online');
  } else if (lan.length > 0) {
    lines.push('', '  People on your own Wi-Fi can also use:');
    for (const l of lan) lines.push(`    ${l.url}`);
  }

  if (share.mode !== 'online' || lan.length > 0) {
    lines.push(
      '',
      platform === 'win32'
        ? '  If friends cannot connect: run scripts\\windows\\allow-firewall.ps1 once as administrator,\n  and make sure the Wi-Fi network is set to Private in Windows settings.'
        : platform === 'darwin'
          ? '  If macOS asks whether "node" may accept incoming connections, choose Allow.'
          : '  If friends cannot connect, allow this port in your firewall.'
    );
  }
  lines.push(`  ${noOpen ? '' : 'Opening the host link in your browser. '}Press Ctrl+C to stop the server.`, '');
  return lines.join('\n');
}
