#!/usr/bin/env node
/**
 * A stand-in for the `tailscale` program, for tests only (`TAILSCALE_CLI=e2e-online/fake-tailscale.mjs`).
 *
 * `status --json` answers like a signed-in, connected Tailscale. `funnel ... http://127.0.0.1:<port>`
 * prints what the real program prints and, when given a certificate, really does what Funnel does
 * for the game: an HTTPS address that forwards to the game server from 127.0.0.1 with the
 * visitor's address in `X-Forwarded-For`. So the browser tests go through TLS, `wss:` and a proxy
 * exactly as a friend on another network would.
 *
 * Extra addresses on the fake funnel let a test play network trouble:
 *   /__fake/drop           every open game connection is cut (Wi-Fi changed)
 *   /__fake/stall          every open game connection goes silent without closing (dead line)
 *   /__fake/visitor?ip=..  later visitors appear to come from this address
 *   /__fake/latency?ms=..  every message takes this long each way (a far-away or mobile link)
 *
 * Environment: FAKE_TS_PUBLIC_PORT, FAKE_TS_TLS_CERT, FAKE_TS_TLS_KEY (run the HTTPS forwarder),
 * FAKE_TS_STATE (BackendState, default Running), FAKE_TS_NO_CAPS=1 (HTTPS/Funnel not enabled),
 * FAKE_TS_APPROVAL_MS (ask for approval first, carry on after this long), FAKE_TS_FUNNEL_FAIL=1,
 * FAKE_TS_TAILNET_ONLY=1, FAKE_TS_DIE_ONCE_FILE + FAKE_TS_DIE_AFTER_MS (first run stops by itself),
 * FAKE_TS_SILENT=1 (announce nothing; `serve status --json` alone says that Funnel is on),
 * FAKE_TS_LATENCY_MS (delay each way from the start).
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const args = process.argv.slice(2);
const env = process.env;
const DNS_NAME = 'game-host.test-tailnet.ts.net';
const out = (text) => process.stdout.write(`${text}\n`);

if (args[0] === 'status') {
  const caps = env.FAKE_TS_NO_CAPS === '1' ? {} : { https: null, funnel: null };
  out(
    JSON.stringify({
      Version: '1.104.5-fake',
      BackendState: env.FAKE_TS_STATE ?? 'Running',
      CertDomains: env.FAKE_TS_NO_CAPS === '1' ? null : [DNS_NAME],
      Self: { DNSName: `${DNS_NAME}.`, TailscaleIPs: ['100.64.0.7', 'fd7a:115c:a1e0::7'], Online: true, CapMap: caps },
    })
  );
  process.exit(0);
}

if (args[0] === 'serve' && args[1] === 'status') {
  // What the real program reports while a foreground funnel is running.
  const live = env.FAKE_TS_SILENT === '1';
  out(
    JSON.stringify(
      live
        ? {
            Foreground: {
              'session-1': {
                TCP: { 443: { HTTPS: true } },
                Web: { [`${DNS_NAME}:443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:3210' } } } },
                AllowFunnel: { [`${DNS_NAME}:443`]: true },
              },
            },
          }
        : {}
    )
  );
  process.exit(0);
}

if (args[0] !== 'funnel') {
  process.stderr.write(`fake tailscale: unknown command ${args.join(' ')}\n`);
  process.exit(2);
}

const target = args.find((a) => a.startsWith('http://'));
const targetPort = Number(new URL(target).port);
const httpsFlag = args.find((a) => a.startsWith('--https='));
const publicPort = Number(env.FAKE_TS_PUBLIC_PORT ?? httpsFlag?.split('=')[1] ?? 443);
let visitorIp = '203.0.113.7';
/** One-way delay added to everything that passes through, like a far-away or mobile link. */
let latencyMs = Number(env.FAKE_TS_LATENCY_MS ?? 0);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

if (env.FAKE_TS_FUNNEL_FAIL === '1') {
  process.stderr.write('error: foreground listener already exists for port 443\n');
  process.exit(1);
}

if (env.FAKE_TS_APPROVAL_MS) {
  out('\nFunnel is not enabled on your tailnet.\nTo enable, visit:');
  out('\n         https://login.tailscale.com/f/funnel?node=nFAKE123CNTRL\n');
  await new Promise((r) => setTimeout(r, Number(env.FAKE_TS_APPROVAL_MS)));
  out('Success.');
}

/** Open game connections: [browser side, game-server side]. */
const tunnels = new Set();

function forwardedHeaders(req) {
  return {
    ...req.headers,
    'x-forwarded-for': visitorIp,
    'x-forwarded-host': req.headers.host ?? '',
    'x-forwarded-proto': 'https',
    'tailscale-funnel-request': '?1',
  };
}

function handleControl(req, res) {
  const url = new URL(req.url, 'https://localhost');
  if (!url.pathname.startsWith('/__fake/')) return false;
  let done = 0;
  if (url.pathname === '/__fake/drop') {
    for (const pair of tunnels) {
      for (const s of pair) s.destroy();
      done += 1;
    }
    tunnels.clear();
  } else if (url.pathname === '/__fake/stall') {
    for (const pair of tunnels) {
      pair.stalled = true;
      done += 1;
    }
  } else if (url.pathname === '/__fake/visitor') {
    visitorIp = url.searchParams.get('ip') ?? visitorIp;
  } else if (url.pathname === '/__fake/latency') {
    latencyMs = Number(url.searchParams.get('ms') ?? 0);
    done = latencyMs;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(String(done));
  return true;
}

if (env.FAKE_TS_TLS_CERT && env.FAKE_TS_TLS_KEY) {
  const server = https.createServer(
    { cert: fs.readFileSync(env.FAKE_TS_TLS_CERT), key: fs.readFileSync(env.FAKE_TS_TLS_KEY) },
    (req, res) => {
      if (handleControl(req, res)) return;
      const headers = forwardedHeaders(req);
      // The request travels there, the answer travels back.
      setTimeout(() => {
        const upstream = http.request(
          { host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers },
          (answer) => {
            setTimeout(() => {
              res.writeHead(answer.statusCode ?? 502, answer.headers);
              answer.pipe(res);
            }, latencyMs);
          }
        );
        upstream.on('error', () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        req.pipe(upstream);
      }, latencyMs);
    }
  );
  server.on('upgrade', (req, client, head) => {
    const upstream = net.connect(targetPort, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [name, value] of Object.entries(forwardedHeaders(req))) {
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      // Bytes are passed on in order, each after the link's delay. A stalled line swallows
      // them without closing, which is what a dead mobile connection looks like.
      const carry = (from, to) =>
        from.on('data', (chunk) => {
          if (pair.stalled) return;
          const deliver = () => {
            if (!pair.stalled && !to.destroyed) to.write(chunk);
          };
          if (latencyMs > 0) setTimeout(deliver, latencyMs);
          else deliver();
        });
      carry(client, upstream);
      carry(upstream, client);
    });
    const pair = [client, upstream];
    pair.stalled = false;
    tunnels.add(pair);
    const end = () => {
      tunnels.delete(pair);
      client.destroy();
      upstream.destroy();
    };
    client.on('error', end);
    upstream.on('error', end);
    client.on('close', end);
    upstream.on('close', end);
  });
  await new Promise((resolve) => server.listen(publicPort, '127.0.0.1', resolve));
}

const publicHost = env.FAKE_TS_TLS_CERT ? 'localhost' : DNS_NAME;
const portPart = publicPort === 443 ? '' : `:${publicPort}`;
if (env.FAKE_TS_SILENT !== '1') {
  out(env.FAKE_TS_TAILNET_ONLY === '1' ? 'Available within your tailnet:' : 'Available on the internet:');
  out(`\nhttps://${publicHost}${portPart}/`);
  out(`|-- proxy ${target}\n`);
  out('Press Ctrl+C to exit.');
}

if (env.FAKE_TS_DIE_ONCE_FILE && !fs.existsSync(env.FAKE_TS_DIE_ONCE_FILE)) {
  fs.writeFileSync(env.FAKE_TS_DIE_ONCE_FILE, 'died');
  setTimeout(() => process.exit(1), Number(env.FAKE_TS_DIE_AFTER_MS ?? 100));
}

// Stay up until Ctrl+C, like the real foreground funnel.
setInterval(() => {}, 1 << 30);
