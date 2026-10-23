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

### Wire protocol (final, Phase A) — JSON text frames over `/ws`
Types live in `src/network/server-protocol.ts` (browser-safe; import it from the UI).
`SERVER_PROTOCOL_VERSION = 1`. Every frame is one JSON object with a `type`.

**Online mode detection.** `fetch('/api/server-info', { cache: 'no-store' })`; online only if the
response is ok, `content-type` is JSON and `body.app === SERVER_APP_ID` (`'catan-new-energies'`).
The Vite dev server answers unknown paths with `index.html`, so JSON parsing fails there and the
app stays offline. `ServerInfo = { app, protocolVersion, port, lanUrls: string[], started }`
(`lanUrls` already excludes WSL/Hyper-V/VM adapters). WebSocket URL: `serverWebSocketUrl(location)`
(`wss:` on https, same host, path `/ws`).

**Client → server** (`ClientMessage`)
| Message | Who | Effect |
| :--- | :--- | :--- |
| `hello {name, seatToken?, hostKey?}` | everyone, first | Must be the first message. A valid `hostKey` makes the socket host and binds it to `config.hostPlayerId`. A valid `seatToken` re-binds a friend seat (never the host seat). Empty `name` keeps the seat's stored name. |
| `claimSeat {playerId, name?}` | friend/host | Friend: take an open human seat (not the host seat); in the lobby a friend may switch seats, mid-game only an unclaimed seat. Host: in the lobby moves the host seat to another open human seat. |
| `leaveSeat` | friend | Frees the seat and its token. |
| `configure {config: OnlineLobbyConfig}` | host, lobby only | Validated; seats that become bots / leave the game lose their players. |
| `start` | host, lobby only | Creates the game like the UI's `createGameFromConfig`; claimed seats use the claimant's name. Unclaimed friend seats may be claimed later. |
| `action {action: GameAction, requestId?}` | seated | Accepted only if `action.playerId` is the sender's seat and `applyAction` accepts it. |
| `newGame` | host | Back to the lobby (game discarded, seats kept, new random seed). |

**Server → client** (`ServerMessage`)
- `welcome {protocolVersion, clientId, isHost, playerId: PlayerId|null, seatToken: string|null}`:
  sent after `hello` and again whenever this socket's seat changes. Store `seatToken`; if it is
  `null` while you hold one, the token is no longer valid: remove it.
- `lobby {config: OnlineLobbyConfig, seats: SeatInfo[], started}` to everyone on any lobby,
  seat or connection change. `SeatInfo = {playerId, role: 'host'|'friend'|'bot', name, claimed,
  connected}` for the seats in the game, in turn order. `started: false` means show the lobby.
- `state {state: RedactedGameState, version, lastAction: GameAction|null, drawnEventDisc:
  EventDiscType|null, yourPlayerId}`: sent per socket with its own redaction (spectators get
  `redactForSpectator`: no private hands at all). `version` +1 per applied action, 0 for a fresh
  game. `lastAction: null` means a resync (connect, seat change, name change): replace the state,
  no toasts or animations. `drawnEventDisc` is the disc `lastAction` took out of the bag.
- `rejected {requestId: string|null, message}`: plain-language refusal (`requestId` echoes the
  action's). `error {message}`: problems not tied to a request (bad host link, seat taken over).
- A socket whose seat is opened elsewhere gets `error "This seat was opened in another window."`
  and is closed with WebSocket close code **4000**. The client must NOT auto-reconnect after
  code 4000 (two tabs would steal the seat from each other forever).

**Lobby config** (`OnlineLobbyConfig`, plain JSON, a subset of the UI's `LobbyConfig`):
```ts
{ playerCount: 3 | 4; setupMode: 'first' | 'standard'; placement: 'fixed' | 'draft'; seed: number;
  botSpeed: 'normal' | 'fast' | 'instant'; hostPlayerId: PlayerId;
  seats: Record<PlayerId, { playerId; name; controller: 'human' | 'bot';
    botStrategy: 'Balanced' | 'GreenInnovator' | 'IndustrialExpansionist';
    botDifficulty: 'easy' | 'normal' | 'hard' }> }
```
All four seats are always present (as in the UI); with 3 players `blue` is ignored. The host seat
must be `human`. `createDefaultOnlineLobbyConfig(seed)` gives host = orange + three bots, Standard
board, draft. Placement is forced to `draft` on the Standard board. Bot delays follow `botSpeed`
exactly like the in-browser bots (normal 950/600 ms, fast 420/150 ms, instant 10 ms).

**Browser storage (suggested):** seat token in `localStorage['catan-ne-online-seat-token']`
(`SEAT_TOKEN_STORAGE_KEY`). Host key: read `?host=` from the URL, send it in `hello`.

**Saves:** `saves/current-game.json` (`SavedRoom`: config, started, game, version, lastAction,
seat tokens and names) after every change; `saves/host-key.txt` holds the host key (stable across
restarts, so the host link keeps working). Delete `saves/` to reset everything.

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
| A | subagent | Server, protocol, room logic, persistence, bots on the server, Windows scripts, server tests | done |
| B | subagent | Online mode in the UI (lobby, join, seat, reconnect, status), two-browser Playwright test | done |
| C | lead | Host guide `docs/hosting-on-windows.md`, LAN check, full verification, progress log | partly done: whole-game soak, game-end reveal, online dialog tests, verification and log are done; the real second-laptop LAN test and the firewall rule are for the host |

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

### Phase A — game server (done)
**What changed**
- New `server/` (TypeScript, bundled by Vite SSR into `dist-server/main.js`):
  - `server/room.ts`: `GameRoom`, transport-agnostic (clients are `{id, send, close?}`; timers,
    token/seed randomness and persistence are injectable). Seats, host key, lobby config
    validation, start/newGame, action validation via `applyAction`, per-socket redaction, bot
    scheduling (one timer at most, re-checks the acting player when it fires, falls back to
    `chooseRandomLegalAction`, stops on `shutdown()`), persistence after every change.
  - `server/persistence.ts`: `createFileStore(savesDir)` (atomic-ish save of
    `current-game.json`, unreadable saves are moved aside, host key file).
  - `server/http-server.ts`: `startServer({port, host?, savesDir, distDir, openBrowser?,
    botDelayMs?, log?})` → `{port, hostKey, hostUrl, addresses, room, close()}`. Static files from
    `dist/` (MIME types, `/assets/*` cached immutable, SPA fallback to `index.html` for
    extensionless paths, 404 for missing files, 400 for paths escaping `dist/`), `GET
    /api/server-info`, WebSocket at `/ws` (1 MB max frame, 30 s ping/terminate heartbeat).
  - `server/main.ts`: CLI. Env `PORT` (3210), `NO_OPEN=1` or `--no-open`, `SAVES_DIR`,
    `BOT_DELAY_MS`. Prints host link, localhost and LAN URLs (virtual adapters labelled), opens the
    host link in the default browser, Ctrl+C stops cleanly.
- `src/network/server-protocol.ts`: the protocol above (types + tiny pure helpers).
- `src/network/redact.ts`: **leak fixed**: `devCardsBoughtThisTurn` (top level and in
  `turnStats`) carried the ids of cards bought this turn to every player; non-owners now see
  `'hidden'`. `redactForPlayer` accepts `null`; new `redactForSpectator`.
- `scripts/windows/host-game.cmd` (double-click: repo root, `npm install` on first run,
  `npm run host`, pauses on error) and `scripts/windows/allow-firewall.ps1` (admin check with
  rerun hint; creates/updates inbound TCP rule "Catan New Energies (port 3210)", Private only;
  `-Port`, `-Remove`; warns about Public networks and node.exe block rules). Parse-checked only;
  NOT run (needs elevation).
- Build: `ws@8.18.3`, `@types/ws@8.18.1`; scripts `build:server`, `server`, `host`;
  `vite.server.config.ts`; tsconfig/eslint/vitest cover `server/`; `.gitignore` adds `saves/`,
  `dist-server/`.
- Tests: `server/__tests__/room.test.ts` (15) and `server/__tests__/server.integration.test.ts`
  (2: HTTP checks; real server with host + friend + 2 bots through the roll-off and all opening
  placements, humans driven with `legalActions`, bots move by themselves).

**How to run:** `npm run host` (build client + server, start) or `npm run server` (existing
build). Double-click `scripts\windows\host-game.cmd` on the host PC.

**Results**
- `npm run typecheck`: OK. `npm run lint`: OK. `npm run build`: `✓ built in 599ms`.
- `npm run build:server`: `dist-server/main.js 220.07 kB │ map: 451.15 kB`, `✓ built in 255ms`.
- `npx vitest run`: `Test Files 19 passed (19)`, `Tests 207 passed (207)` (190 before + 17).
- Playwright not run (no UI changes; `playwright.config.ts` untouched).
- Smoke check (`NO_OPEN=1 node dist-server/main.js`, then stopped): banner listed
  `http://192.168.1.105:3210 Ethernet` and `http://172.29.128.1:3210 vEthernet (WSL (Hyper-V
  firewall)) - virtual adapter ... friends cannot use this`; `netstat` showed `0.0.0.0:3210
  LISTENING`. `GET /` 200 text/html; `/api/server-info` 200
  `{"app":"catan-new-energies","protocolVersion":1,"port":3210,"lanUrls":["http://192.168.1.105:3210"],"started":false}`;
  the same two over `http://192.168.1.105:3210` 200; hashed JS asset 200 text/javascript;
  `/lobby` 200 (SPA); `/..%5c..%5cpackage.json` 400; missing PNG 404; a `ws` hello over the LAN
  IP got `welcome` + `lobby`. (The PC's own LAN IP works without the firewall rule; other
  laptops still need `allow-firewall.ps1`, checked in Phase C.)

**Known issues / decisions**
- Opponent resource breakdowns stay visible (`hideOpponentResources` off), as in the hotseat UI.
  Flip `redactOptions` in `startServer`/`GameRoom` if hidden hands are wanted
  (`hiddenResourcesCount` keeps the total).
- No Origin check on `/ws` (keeps tunnels simple). The host key and seat tokens are the only
  secrets; anyone who can reach the port can watch or take an open friend seat.
- A friend who leaves mid-game frees the seat; the game then waits for someone to claim it
  (no "replace with bot" yet). Unclaimed friend seats at `start` behave the same.
- The smoke check created `saves/host-key.txt` and a lobby-only `saves/current-game.json` in the
  repo (gitignored).

**Notes for Phase B**
- Connect: detect online mode (above), open `serverWebSocketUrl(location)`, send `hello` with the
  name, stored seat token and `?host=` key. Expect `welcome`, `lobby`, then `state` if started.
  Reconnect with backoff on close (except code 4000) and resend `hello` with the token.
- Host lobby: edit an `OnlineLobbyConfig` and send `configure` (send the whole config), then
  `start`. Seat list from `lobby.seats`. Join link: `lanUrls` from server-info.
- Actions: send `{type:'action', action, requestId}`; do not apply locally; wait for `state`.
  Show `rejected.message` as a toast. Toasts/dice/event reveal: run the existing
  `describeAction(lastAction, prevState, nextState)` path when `lastAction` is non-null; use
  `drawnEventDisc` instead of diffing `eventBag`.
- `RedactedGameState` vs `GameState` (`src/network/redact.ts`): `players[pid].devCards` is
  `{unplayedCount, unplayed?, played}` (`unplayed` only for me); `hiddenGreenDiscs` only for me,
  plus `hiddenGreenDiscsCount` and `hiddenResourcesCount` for everyone; `supply.devDeck` →
  `supply.devDeckCount`; `eventBag` → `eventBagCount`; `prng` is undefined;
  `devCardsBoughtThisTurn` / `turnStats.devCardsBoughtThisTurn` hold `'hidden'` for others' cards;
  in 3-player games `players.blue` is absent. The UI reads `state.eventBag.length`
  (TableRail, Modals), `state.supply.devDeck.length` (TableRail, gameView),
  `p.devCards.unplayed` (PlayerMat, ActionDock) and calls `legalActions`. Simplest route: a
  `hydrateRedactedState(r): GameState` adapter that fills `devDeck`/`eventBag`/opponent
  `unplayed`/`hiddenGreenDiscs` with placeholder arrays of the right length and a dummy `prng`,
  and render that; never send anything derived from placeholders to the server (the server
  re-validates anyway). Use `legalActions` on it only for highlighting own options.
- Online mode must not run browser bots, undo, local save or the hotseat curtain.

### Phase B — online mode in the browser (done)
**What changed**
- `src/main.tsx`: `App` probes `GET /api/server-info` (`detectGameServer`, 1.5 s timeout, needs
  JSON and `app === 'catan-new-energies'`). Server answers: `OnlineApp`. Otherwise `TabletopApp`
  exactly as before. **The Vite dev server never probes** (`import.meta.env.DEV`): the probe left
  a blank first frame that made `e2e/setup-flow.spec.ts` flaky (it uses non-waiting `isVisible`).
  Built clients still probe, so test online mode against `npm run server`, not `npm run dev`.
- `src/ui/online/useOnlineGame.ts`: connection hook. `hello` with the stored name, seat token and
  host key; `?host=` is read once, kept in `localStorage['catan-ne-online-host-key']` and removed
  from the address bar with `history.replaceState` (a stale key is dropped when the server says
  the socket is not host). Auto-reconnect with backoff 0.4/1/2/4/8 s (immediately on the browser's
  `online` event); status `connecting|connected|reconnecting|offline|replaced`. Close code 4000
  sets `replaced` and does not reconnect; `reconnect()` backs the "Use this window" button.
  `state` frames go through `hydrateRedactedState`; `lastAction`/`prev` are only set when
  `version === previous + 1` (a resync or gap replaces the state silently, no toast).
- `src/ui/online/OnlineLobby.tsx`: `ConnectionBadge`, host lobby (seat rows with Host/Friend/Bot,
  bot style and level, 3/4 players, island, starting pieces, bot speed, invite card with
  `joinUrlFor(lanUrls)` + Copy link, who claimed which seat and who is connected, Start is
  disabled until every Friend seat is claimed), friend lobby (name, `SeatPicker`, waiting panel),
  `SeatPicker` also used mid-game.
- `src/ui/online/OnlineApp.tsx` + `onlineTypes.ts` (`OnlineTable`): connection and replaced
  screens, lobby, table, mid-game overlay for seatless visitors ("Take this seat" or "Just watch").
  `New game` asks with `window.confirm` and sends `newGame`.
- `src/ui/TabletopApp.tsx` takes an optional `online` prop. Online: `gameState` is the hydrated
  server state, `waitingOnOthers` = acting player is not me (replaces `isActingPlayerBot`, which
  blocks all clicks, highlights and primary buttons), the dock/player board always show my seat
  (`ActionDock fixedViewer` hides the colour switches), `dispatchAction` only sends
  `{type:'action', action, requestId}`, toast/dice/event reveal come from an effect on
  `lastAction` + `drawnEventDisc` (`describeAction` got a `drawn` override), `rejected`/`error`
  show as the error toast, `legalActions` is wrapped in try/catch. No bots, undo, local save,
  curtain, BroadcastChannel or lobby modal online. Root div has `data-phase`,
  `data-acting-player`, `data-my-seat` (`none` when watching) for tests.
- Hidden hands: server default `DEFAULT_ROOM_REDACT_OPTIONS = {hideOpponentResources: true}`
  (`118f34d`). `src/network/hydrate.ts` marks other players' hands (`handHidden`) and
  `playerHandCount` reads `hiddenResourcesCount`; `gameView.handCount` uses it, so the players
  rail, the steal chooser and Clean Up victims (`stealVictimsOnHex`, `footprintVictims`) work with
  hidden hands. `TopBar` shows the badge instead of Undo and the host-only New game
  (`online-new-game-btn`); `PlayersRail` takes `roleLabels` and has `corner-cards-<pid>`;
  `VictoryModal.onOpenLobby` is optional (friends get no New game button).
- Tests: `src/network/__tests__/hydrate.test.ts` (3), new case in `server/__tests__/room.test.ts`
  (a socket never gets another player's resource breakdown, `hiddenResourcesCount` kept),
  `e2e-online/two-laptops.spec.ts` with `playwright.online.config.ts` (port 3299,
  `NO_OPEN=1`, `BOT_DELAY_MS=0`, `SAVES_DIR=<tmp>/catan-ne-online-e2e-saves` wiped by
  `e2e-online/start-server.mjs`). Steps: host link key leaves the URL; host seats; friend claims;
  start; same board; roll-off and all opening placements, each only on its own turn; friend
  reload keeps the seat; wire check that every `state` frame hides the other player's resources
  and the rail count equals their real hand; a watcher sees every seat taken; a second window
  takes the seat (code 4000) and "Use this window" takes it back; a freed seat is claimed
  mid-game by a late joiner.
- Docs: `docs/hosting-on-windows.md` now names the real buttons (Copy link, Take this seat, Start
  game, New game in the top bar, Use this window, host key stays in the browser).

**Commands and results** (all on this branch, after the last code commit `1f32b62`)
- `npm run typecheck` OK; `npm run lint` OK.
- `npm run build`: `✓ built in 639ms`; `npm run build:server`: `dist-server/main.js 220.23 kB`,
  `✓ built in 257ms`.
- `npx vitest run`: `Test Files 20 passed (20)`, `Tests 211 passed (211)` (207 + 3 hydrate + 1 room).
- `npx playwright test`: `36 passed` (26 original + 10 `gf-marker`), three runs in a row. It
  rewrites `docs/ui-after-*.png`: `git checkout -- docs/ui-after-*.png` before committing.
- `npm run test:e2e:online`: `1 passed (9.4s)`; three more direct runs `1 passed` each.

**Screenshots** (1366x768, real server, two browser contexts): `docs/online-host-lobby.png`,
`docs/online-friend-lobby.png`, `docs/online-ingame-friend.png`, `docs/online-ingame-host.png`.

**Known issues / decisions**
- Final standings in `VictoryModal` are computed on the client from the hydrated state, so other
  players' unrevealed VP cards count as 0 there (`state.winner` itself comes from the server and
  is right). A server fix would be to reveal every hand once `phase === 'GameEnd'`.
  (Fixed in Phase C, see below.)
- The browser test covers the opening (roll-off, towns, cities, roads). Discard on 7, stealing,
  domestic trades and dev cards were checked by reading the code (decision UIs only read the
  viewer's own hand and `hiddenResourcesCount`; the server validates) and by the hydrate tests
  (`legalActions` does not throw on placeholders), not by an online browser test.
- A friend cannot give up a seat mid-game from the UI (the server supports `leaveSeat`); freed
  seats come from the server, and the e2e test sends `leaveSeat` over a raw socket.
- The UI only lets the host start when every Friend seat is claimed (the server also allows
  starting with open seats). Host rights are per origin: opening the LAN address instead of
  `localhost` needs the `?host=` link once.
- Online: no pause/resume bots, no bot speed change in game, no inspecting other players' boards
  (rail clicks do nothing), `window.confirm` for New game.
- The dev server never probes (see above). Offline mode and all 36 original tests are unchanged.

**Notes for Phase C (manual LAN test, host PC + one other laptop/phone on the same Wi-Fi)**
1. `scripts\windows\allow-firewall.ps1` once as admin; Wi-Fi profile Private; `npm run host`.
2. Host page opens at `http://localhost:3210/?host=...`; check the address bar loses the key and
   the Invite card shows the `192.168.x.x` address (not a WSL/Hyper-V one).
3. Make seat 2 a Friend (Instant or Fast bots), open the invite link on the laptop, type a name,
   Take this seat; the host sees it Connected; Start game.
4. Roll-off and placements from both screens. Turn the laptop's Wi-Fi off for 10 s: badge goes
   Reconnecting then Offline, and Connected again with the seat kept.
5. Reload the laptop page, then open the link in a second tab: the first shows "Open in another
   window" and "Use this window" takes it back.
6. Check the laptop's rail shows the host's hand only as a number, and play a 7 and a steal.
7. Host presses New game (confirm), seats are kept; stop the server with Ctrl+C, start it again
   and confirm the game resumes with the same seats.

### Phase C — playability gaps closed (subagent part done; LAN test and firewall are for the host)
**What was found and fixed** (all by playing whole games through the real server, see the tests below)
1. `legalActions` on a browser's hydrated state could not offer **Accept** on a domestic trade
   (it checked the offerer's cards, which are hidden) and never listed the **players to steal from**
   with Clean Up (their hands looked empty). Fix (`ad3f071`): `PlayerState` gets two optional
   fields only a hydrated view carries (`hiddenResourcesCount`, `handHidden`, `src/engine/types.ts`);
   `getHandSizeForSeven` reads the known size (`src/engine/production.ts`), the Accept check skips
   the offerer's holdings when they are hidden (`src/engine/actions.ts`; the server checked them
   when it took the offer), `src/network/hydrate.ts` delegates `playerHandCount` / `isHandHidden` to
   the engine helpers. Server states never carry the fields, so the server's rules are unchanged.
2. **Final standings** (`bf8e89d`): once `phase === 'GameEnd'` or a winner exists, `redactForPlayer`
   reveals every player's dev cards, face-down green discs, resource breakdown and the dev cards
   bought this turn to every socket (seated or watching); dev deck, event bag and PRNG stay hidden
   (`isGameOver` in `src/network/redact.ts`; hydrate marks no hand hidden then). The victory dialog
   now shows the same, correct standings on every laptop (Phase B's known issue is gone). The
   PeerJS transport test now expects the reveal at GameEnd.
3. Nothing else was wrong: zero rejected moves across all soak games, and every state frame equalled
   an independent replay.

**Tests added**
- `server/__tests__/full-game.integration.test.ts` (7): real server on an ephemeral port, host
  (orange, Normal bot brain) + friend (purple, Easy) as WebSocket clients that only use `state`
  frames, `hydrateRedactedState`, `legalActions` and `chooseBotAction` (random legal move as
  fallback), plus two server bots (`botDelayMs: 0`). Steered moves: buy up to 2 dev cards, play up
  to 2, offer up to 3 domestic trades (alternating to the friend alone / to the table; the harness
  reads the friend's real hand from the server to ask for a card they hold, like a person who heard
  it in chat; the offer is still checked by `canOfferTrade` on the browser's own view).
  Checks per game: winner and nobody left waiting; no `rejected`; the hydrated `legalActions` list
  equals the list from the true state at every human decision; every state frame of both clients
  equals `redactForPlayer(replay of the broadcast actions)` (replay starts from the seed);
  final board, scores and dev cards equal the server's. Games: 4 seats seeds 11, 12 and the pinned
  1, 2, 3; 3 seats seed 7; First Game board (fixed placement) seed 21; the friend's socket dropped
  at version 90 and resumed with its seat token, once off and once on their own move.
  The pinned seeds 1+2+3 give each browser (summed over the three games) a discard on a 7, a steal
  (inspector or Clean Up), a domestic trade offered and one accepted, a bank/harbor trade, a dev
  card bought and one played. Games last 11-17 turns (empty event bag or 10 VP) and take ~1.5 s.
  If the bot brain changes, a pinned seed may stop covering a flow: the test prints a per-game
  tally line (discard, steal, stealByCleanup, tradeOffer/Accept/Decline, supply/harbor trade,
  devBuy/devPlay, build, eventChoice) to re-pick seeds.
- `src/network/__tests__/hydrate.test.ts` (+3): Accept offered with a hidden offerer and accepted by
  the engine; Cleanup lists the victim by hidden hand size; finished game fully revealed.
  `server/__tests__/room.test.ts` (+1): secrets stay hidden during play and every socket (host,
  friend, watcher) sees everything after the closing draw. `src/ui/__tests__/victory-online.test.tsx`
  (2): the VictoryModal rendered from each seat's (and a spectator's) hydrated view equals the true
  standings for a 10 VP end and an empty-bag end.
- `e2e-online/dialogs.spec.ts` (4 tests, real Chrome, two browser contexts, one server per
  describe on a free port, resuming a prepared game written by `e2e-online/make-fixture.ts` through
  `vite-node`; helpers in `fixture-server.ts`). Host link and a seat token in localStorage put each
  context on its seat. (1) Roll of 7: host and friend each discard in their own dialog (the other
  sees none), host moves the inspector and picks the victim in the steal dialog, then offers a
  domestic trade that the friend accepts in the dialog, buys a dev card (the friend sees none of
  its identity) and plays Road Construction by clicking two roads (both boards get them). (2)
  Friend plays Clean Up: the victim chooser lists "5 cards" / "4 cards" from hidden counts and the
  server accepts the choice. (3) Empty-bag draw ends a game: identical standings on both laptops
  including Finn's two unseen VP cards (8 VP), wire frames show no other seat's card before the
  end and the cards after it, only the host has New game and it returns both to the lobby with the
  seats kept. (4) Bank trade, Research Grant, then Reveal VP cards wins on 10 points with equal
  standings on both laptops.

**Commands and results** (after the last code commit)
- `npm run typecheck` OK; `npm run lint` OK; `npm run build`: `✓ built in 687ms`;
  `npm run build:server`: `dist-server/main.js 220.60 kB`, `✓ built in 280ms`.
- `npx vitest run`: `Test Files 22 passed (22)`, `Tests 224 passed (224)` (211 + 13).
- `npm run test:e2e:online`: `5 passed (26.3s)` (4 dialogs + the opening).
- `npx playwright test`: `36 passed (57.8s)` (it rewrites `docs/ui-after-*.png`; restored with
  `git checkout -- docs/ui-after-*.png`).
- Sanity: with the game-end reveal switched off the standings e2e and the room test fail.

**Still untested / known issues**
- Not run in a browser online: the High Yield dialog, the Clean Up "remove a hazard" option, energy
  actions (clean hazard, demolish plant, buy card), harbor trades, the event prompts (hazard choice,
  Climate Conference / Government Funding card choice, production increase), "Look at the board"
  after a win, a spectator watching a running game's dialogs, a 3-seat game in the browser, and the
  normal/fast bot pacing. The protocol side of the event prompts, harbor trades and 3 seats IS
  covered by the soak (browsers answered 6-11 event prompts per game; `legalActions` lists equal).
  Code review: no dialog reads another seat's cards (only names, counts and the offer in the
  pending decision).
- The soak test's trade offers use the friend's real hand (read from the server) to choose the card
  asked for; a human would have to guess or ask.
- Real second-laptop test on the same Wi-Fi and the Windows Firewall rule
  (`scripts\windows\allow-firewall.ps1`, needs admin) are for the host: follow "Notes for Phase C"
  above. Nothing was run against a LAN address in this phase.
- Games here end quickly (11-17 turns: the event bag runs out or someone reaches 10 VP), so
  long-game effects (pace, save size, many reconnects) are not exercised.
