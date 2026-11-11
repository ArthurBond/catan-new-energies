/**
 * Entry point: `node dist-server/main.js [options]` (built by `npm run build:server`).
 *
 *   npm run host            home Wi-Fi
 *   npm run host:online     a link that works from any network (Tailscale Funnel + invite code)
 *   npm run host:tailnet    private Tailscale network
 *
 * Options and environment variables: see `USAGE` in `launch.ts`, or run with `--help`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_APP_ID, type ShareInfo } from '@/network/server-protocol';
import { InviteGate } from './access';
import { listNetworkAddresses, openInBrowser, startServer, type NetworkAddress } from './http-server';
import { buildBanner, buildOnlineInviteBlock, buildShareInfo, listenPlan, parseLaunchOptions, USAGE } from './launch';
import { createFileStore } from './persistence';
import {
  expectedFunnelUrl,
  findTailscaleCli,
  probePublicUrl,
  readTailscaleStatus,
  startFunnel,
  TAILSCALE_INSTALL_HELP,
  tailscaleProblem,
  type FunnelHandle,
  type TailscaleStatus,
} from './share';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const options = parseLaunchOptions(process.argv.slice(2), process.env);
  if ('error' in options) fail(options.error);
  if (options.help) {
    console.log(USAGE);
    return;
  }

  // Tailscale first: better to say "turn Tailscale on" now than after the game is running.
  let tailscaleCli: string | null = null;
  let tailscale: TailscaleStatus | null = null;
  if (options.share !== 'lan') {
    tailscaleCli = findTailscaleCli();
    if (!tailscaleCli) fail(TAILSCALE_INSTALL_HELP);
    try {
      tailscale = await readTailscaleStatus(tailscaleCli);
    } catch (e) {
      fail(`${e instanceof Error ? e.message : String(e)} Is Tailscale running?`);
    }
    const problem = tailscaleProblem(tailscale);
    if (problem) fail(problem);
    if (options.share === 'online' && !tailscale.dnsName) {
      fail('Tailscale has no name for this computer (MagicDNS is off). Turn on MagicDNS in the Tailscale admin console under DNS, then start the game again.');
    }
    if (options.share === 'tailnet' && !tailscale.ipv4) {
      fail('Tailscale gave this computer no IPv4 address to share the game on. Check the Tailscale app, then start the game again.');
    }
  }

  const savesDir = path.resolve(options.savesDir ?? path.join(repoRoot, 'saves'));
  const store = createFileStore(savesDir);
  const inviteCode = options.requireInvite ? (options.inviteCode ?? store.inviteCode(options.newInvite)) : null;
  const invite = inviteCode ? new InviteGate({ code: inviteCode }) : null;

  const plan = listenPlan(options, process.env, tailscale);
  const reachableOnLan = plan.reachableOnLan;
  let port = options.port;
  let publicUrl: string | null = null;
  let onlineStatus: string | null = options.share === 'online' ? 'Setting up the online link…' : null;
  const lanAddresses = (): NetworkAddress[] => (reachableOnLan ? listNetworkAddresses(port) : []);
  const shareInfo = (): ShareInfo =>
    buildShareInfo({
      mode: options.share,
      port,
      inviteCode,
      addresses: lanAddresses(),
      tailscale,
      publicUrl,
      status: onlineStatus,
    });

  const server = await startServer({
    port: options.port,
    host: plan.hosts,
    optionalHosts: plan.optionalHosts,
    savesDir,
    distDir: path.join(repoRoot, 'dist'),
    openBrowser: !options.noOpen,
    botDelayMs: options.botDelayMs,
    share: options.share,
    invite,
    shareInfo,
  });
  port = server.port;

  const printBanner = () =>
    console.log(
      buildBanner({ share: shareInfo(), hostUrl: server.hostUrl, port, noOpen: options.noOpen, addresses: lanAddresses() })
    );
  printBanner();

  let funnel: FunnelHandle | null = null;
  if (options.share === 'online' && tailscaleCli && tailscale) {
    const expected = expectedFunnelUrl(tailscale.dnsName!, options.httpsPort);
    if (!tailscale.httpsEnabled || !tailscale.funnelEnabled) {
      console.log(
        [
          '  First time: Tailscale has to be told that this computer may share a public link.',
          '  Tailscale will show a web page for that in a moment. Sign in, press the button to turn',
          '  on HTTPS and Funnel, and come back here. The game carries on by itself.',
          '',
        ].join('\n')
      );
    }
    let approvalShown: string | null = null;
    let lastOutage: string | null = null;
    funnel = startFunnel({
      cli: tailscaleCli,
      localPort: port,
      httpsPort: options.httpsPort,
      dnsName: tailscale.dnsName,
      onNeedsApproval: (link) => {
        onlineStatus = 'Waiting for you to turn on Tailscale Funnel (see the server window).';
        server.room.shareChanged();
        if (approvalShown === link) return;
        approvalShown = link;
        console.log(`\n  Open this page to turn on the online link (one time only):\n\n      ${link}\n`);
        if (!options.noOpen) openInBrowser(link);
      },
      onUrl: (url) => {
        publicUrl = url;
        onlineStatus = null;
        lastOutage = null;
        // Funnel is switched on now: a later outage is an outage, not a wait for approval.
        approvalShown = null;
        server.room.shareChanged();
        if (url !== expected) console.log(`  (Tailscale gave the address ${url}.)`);
        console.log(`\n${buildOnlineInviteBlock(shareInfo())}\n`);
        if (options.skipLinkCheck) return;
        void probePublicUrl(url, SERVER_APP_ID).then((ok) => {
          if (publicUrl !== url) return;
          console.log(
            ok
              ? '  Checked: the invite link answers.\n'
              : '  Could not reach the invite link from this computer yet. A brand-new link can take a few\n' +
                  '  minutes (up to ten) before it works everywhere; friends can simply try again.\n'
          );
        });
      },
      onDown: (reason, willRetry) => {
        publicUrl = null;
        onlineStatus = approvalShown
          ? 'Waiting for you to turn on Tailscale Funnel (see the server window).'
          : willRetry
            ? 'The online link dropped. Reconnecting…'
            : 'The online link is not available.';
        server.room.shareChanged();
        // The same trouble on every retry is said once, not once a minute.
        if (reason === lastOutage) return;
        lastOutage = reason;
        console.log(`\n  The online link is down: ${reason}${willRetry ? '\n  Trying again by itself…' : ''}\n`);
      },
    });
  }

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping the server (the game is saved).');
    void Promise.all([server.close(), funnel?.stop()]).then(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (process.platform !== 'win32') process.on('SIGHUP', stop);
}

main().catch((err: unknown) => {
  console.error(`\n  Could not start the server: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
