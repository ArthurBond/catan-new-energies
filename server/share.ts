/**
 * Sharing the game beyond the home network, with Tailscale doing the encryption.
 *
 * - `online`:  Tailscale Funnel gives the host's computer a public `https://<pc>.<tailnet>.ts.net`
 *              address. Friends only need the link: nothing to install, no router changes. The
 *              TLS certificate lives on the host's computer, so the traffic is encrypted all the
 *              way from the friend's browser to the host.
 * - `tailnet`: friends who run Tailscale themselves (on the host's tailnet, or with the computer
 *              shared to them) connect straight to the host over WireGuard. Nothing is public.
 *
 * This file finds the Tailscale program, reads its status and runs `tailscale funnel` next to the
 * game server. The funnel runs in the foreground, so it disappears when the game server stops and
 * leaves no configuration behind.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ShareMode } from '@/network/server-protocol';

export const SHARE_MODES: readonly ShareMode[] = ['lan', 'tailnet', 'online'];

/** Public ports Tailscale Funnel can listen on. */
export const FUNNEL_PORTS: readonly number[] = [443, 8443, 10000];

export function parseShareMode(raw: string | undefined): ShareMode | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'lan' || v === 'local' || v === 'wifi') return 'lan';
  if (v === 'tailnet' || v === 'tailscale' || v === 'private') return 'tailnet';
  if (v === 'online' || v === 'funnel' || v === 'public' || v === 'internet') return 'online';
  return null;
}

// ---------------------------------------------------------------------------
// Finding Tailscale and reading its status
// ---------------------------------------------------------------------------

export interface TailscaleStatus {
  /** `Running` when connected; `Stopped`, `NeedsLogin`, `NoState`... otherwise. */
  backendState: string;
  running: boolean;
  /** This computer's full Tailscale name, e.g. `arthurs-mac.tail1234.ts.net` (no trailing dot). */
  dnsName: string | null;
  ipv4: string | null;
  ipv6: string | null;
  /** The tailnet hands out HTTPS certificates (needed for Funnel). */
  httpsEnabled: boolean;
  /** This computer is allowed to use Funnel. */
  funnelEnabled: boolean;
  version: string | null;
}

/** Where the Tailscale program usually lives when it is not on the PATH. */
export function tailscaleCliCandidates(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'darwin') {
    return ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  }
  if (platform === 'win32') {
    return ['C:\\Program Files\\Tailscale\\tailscale.exe', 'C:\\Program Files (x86)\\Tailscale\\tailscale.exe'];
  }
  return ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/usr/sbin/tailscale', '/snap/bin/tailscale'];
}

/** The Tailscale program: `TAILSCALE_CLI` if set, else the first one found on the PATH or in the usual places. */
export function findTailscaleCli(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (file: string) => boolean = (file) => fs.existsSync(file)
): string | null {
  if (env.TAILSCALE_CLI) return exists(env.TAILSCALE_CLI) ? env.TAILSCALE_CLI : null;
  const exe = platform === 'win32' ? 'tailscale.exe' : 'tailscale';
  const sep = platform === 'win32' ? ';' : ':';
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  const onPath = (env.PATH ?? env.Path ?? '')
    .split(sep)
    .filter(Boolean)
    .map((dir) => join(dir, exe));
  for (const file of [...onPath, ...tailscaleCliCandidates(platform)]) {
    if (exists(file)) return file;
  }
  return null;
}

/** Picks what the game needs out of `tailscale status --json`. */
export function parseTailscaleStatus(raw: unknown): TailscaleStatus {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const self = (d.Self && typeof d.Self === 'object' ? d.Self : {}) as Record<string, unknown>;
  const backendState = typeof d.BackendState === 'string' ? d.BackendState : 'Unknown';
  const dns = typeof self.DNSName === 'string' ? self.DNSName.replace(/\.$/, '').toLowerCase() : '';
  const ips = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs.filter((ip): ip is string => typeof ip === 'string') : [];
  const caps = new Set<string>([
    ...Object.keys(self.CapMap && typeof self.CapMap === 'object' ? self.CapMap : {}),
    ...(Array.isArray(self.Capabilities) ? self.Capabilities.filter((c): c is string => typeof c === 'string') : []),
  ]);
  const certDomains = Array.isArray(d.CertDomains) ? d.CertDomains : [];
  return {
    backendState,
    running: backendState === 'Running',
    dnsName: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dns) ? dns : null,
    ipv4: ips.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) ?? null,
    ipv6: ips.find((ip) => /^[0-9a-f:]+$/i.test(ip) && ip.includes(':')) ?? null,
    httpsEnabled: caps.has('https') || certDomains.length > 0,
    funnelEnabled: caps.has('funnel'),
    version: typeof d.Version === 'string' ? d.Version : null,
  };
}

/**
 * The program and arguments to run. A `.mjs`/`.js` file given as `TAILSCALE_CLI` is run with
 * Node: that is how the tests put a stand-in for Tailscale in its place on every platform.
 */
export function tailscaleCommand(cli: string, args: string[]): [string, string[]] {
  return /\.(mjs|cjs|js)$/i.test(cli) ? [process.execPath, [cli, ...args]] : [cli, args];
}

export function readTailscaleStatus(cli: string, timeoutMs = 8000): Promise<TailscaleStatus> {
  return new Promise((resolve, reject) => {
    const [cmd, args] = tailscaleCommand(cli, ['status', '--json']);
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      // `status` exits non-zero while Tailscale is stopped but still prints the JSON.
      try {
        resolve(parseTailscaleStatus(JSON.parse(stdout)));
      } catch {
        reject(new Error(err ? `Tailscale did not answer (${err.message.split('\n')[0]}).` : 'Tailscale gave an answer the game could not read.'));
      }
    });
  });
}

/** Plain-language reason Tailscale cannot be used yet, or null when it is ready. */
export function tailscaleProblem(status: TailscaleStatus): string | null {
  if (status.backendState === 'NeedsLogin' || status.backendState === 'NoState') {
    return 'Tailscale is installed but not signed in. Open Tailscale, sign in, then start the game again.';
  }
  if (!status.running) {
    return `Tailscale is turned off (state: ${status.backendState}). Open Tailscale and connect, then start the game again.`;
  }
  if (!status.dnsName && !status.ipv4) {
    return 'Tailscale is connected but this computer has no Tailscale address yet. Wait a moment and try again.';
  }
  return null;
}

export const TAILSCALE_INSTALL_HELP =
  'Tailscale is not installed on this computer. Install it from https://tailscale.com/download, sign in, then start the game again.';

// ---------------------------------------------------------------------------
// Running `tailscale funnel` beside the game server
// ---------------------------------------------------------------------------

/** What Tailscale prints once the public address is live. */
const FUNNEL_AVAILABLE = /Available on the internet/i;
const TAILNET_ONLY_AVAILABLE = /Available within your tailnet/i;
const PUBLIC_URL_LINE = /^(https:\/\/[a-z0-9.-]+(?::\d+)?)\/?\s*$/i;
/** Links Tailscale prints when a feature must be switched on in the admin console first. */
const ADMIN_LINK = /https:\/\/login\.tailscale\.com\/\S+/i;

export interface FunnelEvents {
  /** The public address is live (called again if it changes after a restart). */
  onUrl(url: string): void;
  /** Tailscale needs the host to open this link once (to turn on HTTPS or Funnel). */
  onNeedsApproval(link: string): void;
  /** Funnel stopped. `willRetry` is false once the game has given up or is shutting down. */
  onDown(reason: string, willRetry: boolean): void;
  /** Every line Tailscale prints, for the log. */
  onLine?(line: string): void;
}

/**
 * True when Tailscale's own configuration (`tailscale serve status --json`) says that Funnel is
 * on for `host:port`. A foreground funnel is listed under `Foreground`, a background one at the
 * top, so the whole answer is searched.
 */
export function funnelIsOn(config: unknown, dnsName: string, httpsPort: number): boolean {
  const wanted = `${dnsName}:${httpsPort}`.toLowerCase();
  const search = (node: unknown, depth: number): boolean => {
    if (!node || typeof node !== 'object' || depth > 6) return false;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'AllowFunnel' && value && typeof value === 'object') {
        for (const [hostPort, on] of Object.entries(value as Record<string, unknown>)) {
          if (on === true && hostPort.toLowerCase() === wanted) return true;
        }
      } else if (search(value, depth + 1)) return true;
    }
    return false;
  };
  return search(config, 0);
}

export interface FunnelOptions extends FunnelEvents {
  cli: string;
  /** The game server's port on this computer. */
  localPort: number;
  /** Public port: 443 (default), 8443 or 10000. */
  httpsPort?: number;
  /** Restart delays after Funnel stops unexpectedly. Default: 2 s, 5 s, 15 s, 30 s, then every 60 s. */
  retryDelaysMs?: number[];
  spawnProcess?: typeof spawn;
  /**
   * This computer's Tailscale name. With it, the game also asks Tailscale's configuration whether
   * Funnel is on, in case a future Tailscale words its announcement differently.
   */
  dnsName?: string | null;
  /** How often to ask (default every 3 s, while the address is not known yet). */
  statusPollMs?: number;
}

export interface FunnelHandle {
  /** The current public address, or null while it is not up. */
  url(): string | null;
  stop(): Promise<void>;
}

export function funnelArgs(localPort: number, httpsPort: number): string[] {
  return ['funnel', '--yes', `--https=${httpsPort}`, `http://127.0.0.1:${localPort}`];
}

/**
 * Reads Tailscale's output line by line. Returns the public URL once Funnel announces it.
 * Exported for tests: the format is Tailscale's, not ours, so the parsing is kept in one place.
 */
export function createFunnelOutputReader(events: Pick<FunnelEvents, 'onUrl' | 'onNeedsApproval' | 'onLine'>) {
  let announced: 'internet' | 'tailnet' | null = null;
  let tailnetOnly = false;
  return {
    /** True when Tailscale shared the game inside the tailnet only (Funnel is not allowed here). */
    get tailnetOnly() {
      return tailnetOnly;
    },
    line(rawLine: string): void {
      const line = rawLine.replace(/\r$/, '');
      if (line.trim()) events.onLine?.(line);
      const admin = ADMIN_LINK.exec(line);
      if (admin) {
        events.onNeedsApproval(admin[0]);
        return;
      }
      if (FUNNEL_AVAILABLE.test(line)) {
        announced = 'internet';
        return;
      }
      if (TAILNET_ONLY_AVAILABLE.test(line)) {
        announced = 'tailnet';
        tailnetOnly = true;
        return;
      }
      const url = PUBLIC_URL_LINE.exec(line.trim());
      if (url && announced === 'internet') {
        announced = null;
        events.onUrl(url[1]!.toLowerCase());
      }
    },
  };
}

const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 15_000, 30_000, 60_000];

/**
 * Starts `tailscale funnel` and keeps it running until `stop()`. If Tailscale restarts or the
 * network drops, the funnel is started again by itself; the address stays the same.
 */
export function startFunnel(options: FunnelOptions): FunnelHandle {
  const httpsPort = options.httpsPort ?? 443;
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const spawnProcess = options.spawnProcess ?? spawn;
  let child: ChildProcess | null = null;
  let currentUrl: string | null = null;
  let stopping = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const announce = (url: string) => {
    if (currentUrl === url) return;
    attempt = 0;
    currentUrl = url;
    options.onUrl(url);
  };

  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };

  /** Asks Tailscale itself whether the funnel is on, until the address is known. */
  const startPolling = (proc: ChildProcess) => {
    const dnsName = options.dnsName;
    if (!dnsName) return;
    stopPolling();
    pollTimer = setInterval(() => {
      if (stopping || child !== proc || currentUrl) return stopPolling();
      const [cmd, args] = tailscaleCommand(options.cli, ['serve', 'status', '--json']);
      execFile(cmd, args, { timeout: 5000, windowsHide: true }, (_err, stdout) => {
        if (stopping || child !== proc || currentUrl) return;
        try {
          if (funnelIsOn(JSON.parse(stdout), dnsName, httpsPort)) announce(expectedFunnelUrl(dnsName, httpsPort));
        } catch {
          /* no answer this time: ask again */
        }
      });
    }, options.statusPollMs ?? 3000);
    pollTimer.unref?.();
  };

  const launch = () => {
    if (stopping) return;
    let tail = '';
    const reader = createFunnelOutputReader({
      onLine: (line) => {
        tail = `${tail}\n${line}`.slice(-600);
        options.onLine?.(line);
      },
      onNeedsApproval: options.onNeedsApproval,
      onUrl: announce,
    });
    const feed = (stream: NodeJS.ReadableStream | null) => {
      let buffer = '';
      stream?.setEncoding('utf8');
      stream?.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const l of lines) reader.line(l);
      });
      stream?.on('end', () => {
        if (buffer) reader.line(buffer);
      });
    };

    let proc: ChildProcess;
    try {
      const [cmd, args] = tailscaleCommand(options.cli, funnelArgs(options.localPort, httpsPort));
      proc = spawnProcess(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      options.onDown(`Could not start Tailscale (${e instanceof Error ? e.message : String(e)}).`, false);
      return;
    }
    child = proc;
    feed(proc.stdout);
    feed(proc.stderr);
    startPolling(proc);

    let finished = false;
    const finish = (detail: string) => {
      if (finished) return;
      finished = true;
      if (child === proc) {
        child = null;
        stopPolling();
      }
      currentUrl = null;
      if (stopping) return;
      const hint = reader.tailnetOnly
        ? 'Tailscale shared the game inside your tailnet only: Funnel is not allowed for this computer yet.'
        : (tail.trim().split('\n').pop() ?? '');
      const delay = delays[Math.min(attempt, delays.length - 1)]!;
      attempt += 1;
      options.onDown([detail, hint].filter(Boolean).join(' '), true);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        launch();
      }, delay);
      retryTimer.unref?.();
    };
    proc.once('error', (err) => finish(`Could not run Tailscale (${err.message}).`));
    proc.once('exit', (code, signal) => finish(`Tailscale Funnel stopped (${signal ?? `exit code ${code}`}).`));
  };

  // If the game server dies for any reason, the public address must not outlive it.
  const killWithGame = () => {
    try {
      child?.kill();
    } catch {
      /* already gone */
    }
  };
  process.once('exit', killWithGame);

  launch();

  return {
    url: () => currentUrl,
    stop() {
      stopping = true;
      process.off('exit', killWithGame);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      stopPolling();
      const proc = child;
      child = null;
      currentUrl = null;
      if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const force = setTimeout(() => proc.kill('SIGKILL'), 2500);
        proc.once('exit', () => {
          clearTimeout(force);
          resolve();
        });
        // Ctrl+C is how Tailscale expects a foreground funnel to end: it removes its own config.
        proc.kill(process.platform === 'win32' ? undefined : 'SIGINT');
      });
    },
  };
}

/** The address Funnel will use, known before it starts: `https://<name>` plus the port unless 443. */
export function expectedFunnelUrl(dnsName: string, httpsPort: number): string {
  return `https://${dnsName}${httpsPort === 443 ? '' : `:${httpsPort}`}`;
}

/**
 * Asks the public address for the game from this computer. The first request also makes Tailscale
 * fetch the HTTPS certificate, so friends do not wait for it. Returns true when the game answered.
 */
export async function probePublicUrl(url: string, appId: string, attempts = 4, timeoutMs = 20_000): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${url}/api/server-info`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
      if (res.ok) {
        const body = (await res.json()) as { app?: unknown };
        if (body.app === appId) return true;
      }
    } catch {
      /* certificate still being issued, or the name is not known here yet */
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}
