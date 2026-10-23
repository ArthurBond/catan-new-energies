# Handover: 07 — Play With Friends From a Server on the Host's Windows PC

Branch: `goal/05-local-server-multiplayer` (from `goal/04-full-game-ui-bots-multiplayer` @ 645de45). Never push or force.

## Goal
Friends open the game in a browser on their own laptops and play one shared game. The game runs
on a small server on the host's Windows 11 PC, so it is only available while the host has it
running (and the host takes a seat). Nothing depends on a third-party service at runtime (the
PeerJS cloud broker is not used for this mode).

## Starting point (what already exists)
- Pure engine: `applyAction`, `legalActions` (`src/engine/reducer.ts`), `redactForPlayer`
  (`src/network/redact.ts`), bots `chooseBotAction` / `getActingPlayerId` (`src/ai/bot.ts`).
- `src/network/transport.ts`: `MultiplayerHostSession` / `MultiplayerClientSession` over an
  abstract `MultiplayerTransport` (tested with `MockTransport`). Not wired into the UI.
- `src/ui/TabletopApp.tsx` (1.4k lines) holds game state locally, runs bots in the browser, and
  only syncs between tabs of one browser via `BroadcastChannelTransport` (`?room=`).
- Baseline: typecheck, lint, build clean; 190 unit tests; 26 Playwright tests.

## Design
- **One table per server.** `npm run host` builds the client and server and starts
  `node dist-server/main.js` on port **3210** (`PORT` env overrides), bound to all interfaces.
  It serves `dist/` (no path traversal) plus a WebSocket at `/ws` and `GET /api/server-info`.
- **Server is authoritative.** It holds the `GameState`, validates every action against the
  sender's seat and `applyAction`, runs bot turns (with a short delay so humans can follow), and
  sends each socket only its own `redactForPlayer` view. Hidden info never goes to other sockets.
- **Host control.** At start the server creates a host key (kept in `saves/`), prints
  `http://localhost:3210/?host=<key>` and opens it in the browser. Only a connection with the key
  can configure seats, start, or restart a game. This works the same behind a tunnel.
- **Seats and reconnects.** Friends pick a name and an open seat; the server returns a seat token
  that the browser keeps in `localStorage`. Reloading or a dropped Wi-Fi reconnects to the same
  seat. Seats can be Host, Friend (open) or Bot.
- **Persistence.** The game is saved to `saves/current-game.json` (gitignored) after every action,
  so restarting the server resumes the game and seat tokens.
- **Client.** If `GET /api/server-info` answers, the app runs in online mode: online lobby, my seat
  is fixed, actions go to the server, state comes from the server, no browser bots, no undo, no
  hotseat curtain, no local save. Otherwise (e.g. `npm run dev`) it behaves exactly as today.
  WebSocket URL is derived from `location` (`wss:` on https) so tunnels work.

### Wire protocol (JSON over `/ws`) — Phase A owns the final version and documents it here
Client → server: `hello {name, seatToken?, hostKey?}`, `claimSeat {playerId}`,
`configure {config}` (host), `start` (host), `action {action, requestId}`, `newGame` (host).
Server → client: `welcome {clientId, isHost, playerId?, seatToken?}`,
`lobby {config, seats[{playerId, controller, name, claimed, connected}], started}`,
`state {state: RedactedGameState, version, lastAction?, yourPlayerId}`,
`rejected {requestId, message}`, `error {message}`.

### Reaching the server
- **Same Wi-Fi (primary):** friends open `http://<host LAN IP>:3210` (the server prints it).
  Windows Firewall needs an inbound rule: `scripts/windows/allow-firewall.ps1` (run once as admin;
  Private profile only). The Wi-Fi network must be set to Private in Windows.
- **Friends elsewhere:** Tailscale (recommended: private, free, no router changes), or a
  Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:3210`, public https URL).
  Router port forwarding is documented as a last resort.

## Phases
| Phase | Owner | Scope | Status |
| :--- | :--- | :--- | :---: |
| A | subagent | Server, protocol, room logic, persistence, bots on the server, Windows scripts, server tests | todo |
| B | subagent | Online mode in the UI (lobby, join, seat, reconnect, status), two-browser Playwright test | todo |
| C | lead | Host guide `docs/hosting-on-windows.md`, LAN check, full verification, progress log | todo |

### Phase A — acceptance
- `npm run host` builds and serves the game; `npm run server` serves an existing build.
- Room logic unit tests: seat claim, token reconnect, actions for another seat rejected,
  non-host configure/start rejected, a socket never receives another player's hidden cards,
  persistence round-trip.
- Integration test (real server on an ephemeral port, `ws` clients): host + friend + bots play
  through the setup roll-off and opening placements; bots move by themselves.
- Server prints localhost and LAN URLs; `scripts/windows/allow-firewall.ps1` and
  `scripts/windows/host-game.cmd` exist.

### Phase B — acceptance
- Served by the server: online lobby for host (seat setup, join link + LAN URLs, start) and for
  friends (name, pick seat, wait). In game, each laptop sees its own hand only and can act only
  on its turns; event reveals, dice and toasts still play from `lastAction`.
- Connection badge; auto-reconnect; reload keeps the seat.
- Playwright: host and friend in two browser contexts against the built server; both see the
  same board; the friend acts on their turn; friend reload keeps the seat.
- Offline modes (`npm run dev`: bots, hotseat) unchanged; all existing tests still pass.

## Rules for every phase
- Commit in small conventional commits (`feat(server): …`, `test(server): …`, `docs(handover): …`)
  ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or force.
- Before handing over run: `npm run typecheck`, `npm run lint`, `npm run build`, `npx vitest run`,
  and the relevant Playwright tests; paste the result lines in the phase log below.
- Update this file's phase table and add a phase log entry: what changed, files, final protocol,
  commands and results, known issues, next steps.

## Phase log
