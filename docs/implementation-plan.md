# Catan: New Energies — Implementation Plan

This document specifies the complete architecture, toolchain, rules-to-test traceability, and 5-milestone (`17-task`) implementation roadmap for a browser-playable **Catan: New Energies** tabletop game supporting solo play vs. AI bots, local pass-and-play (hotseat), and online multiplayer with friends.

---

## 1. Architecture, Toolchain & Core Design Decisions

### 1.1 Runtime & Toolchain (Pinned Dependencies)
- **Node.js**: Node 20 LTS+ (`.nvmrc` set to `20`).
- **Build & UI**: `vite`, `typescript` (`strict: true`, `noUncheckedIndexedAccess: true`), **Preact** (`preact`) for lightweight reactive HUD/Modals/Corner Boards paired with modular SVG components for the overhead tabletop.
- **Testing & Quality**:
  - `vitest` + `happy-dom` for fast unit and component tests.
  - `fast-check` for property-based / fuzz testing of the rules engine (500+ random seeds playing random legal actions to termination).
  - `@playwright/test` for headless browser E2E verification and visual screenshot assertions (`[data-testid]` DOM queries).
  - `eslint`, `typescript-eslint`, `prettier` for static analysis (`npm run typecheck` and `npm run lint` run in every Milestone's *Done when*).
- **Networking**: `peerjs` behind an abstract `Transport` interface (`MockTransport` for deterministic tests, `BroadcastChannelTransport` for multi-tab local testing, and `PeerJSTransport` with configurable STUN/TURN & PeerServer URLs for online rooms).

### 1.2 Pure Deterministic Action Reducer & Prompt Queue (`src/engine/`)
All game logic resides in `src/engine/` with **zero DOM or network dependencies**:
- **State & Seeded PRNG**: `GameState` embeds the `mulberry32` PRNG state (`seed`, `calls`) and an append-only `log: GameEvent[]`. Given the same initial seed and sequence of `GameAction`s, `applyAction(state, action)` is 100% deterministic and JSON-serializable.
- **Pending Decisions Queue (`pendingDecisions: PendingDecision[]`)**:
  - Many rules in *Catan: New Energies* require out-of-turn or multi-step player choices mid-phase. Rather than blocking on UI callbacks, `applyAction` pushes explicit `PendingDecision` objects onto `state.pendingDecisions` and `legalActions(state, playerId)` enumerates all valid responses for that player:
    1. `SETUP_PLACE_SETTLEMENT` / `SETUP_PLACE_ROAD` (Standard Game snake draft: Round 1 Town+Road clockwise, Round 2 City+Road counter-clockwise).
    2. `PRE_EVENT_WINDOW` (Active player may play 1 Dev Card before drawing event discs, or proceed to draw).
    3. `EVENT_HAZARD_CHOICE` (*Air Pollution* highest-LF player(s) choosing a City/Town; *Rain and Flooding* all players clockwise choosing a Town/City).
    4. `EVENT_CARD_CHOICE` (*Climate Conference* lowest-LF player(s) optionally choosing 1 Resource/Science card from supply, and highest-LF player(s) choosing 1 card from hand to discard; *Government Funding* optional Dev Card draw; *Sustainable Production* optional 1 Resource/Science card choice).
    5. `EVENT_PRODUCTION_INCREASE` (Highest-LF player(s) optionally choosing a valid cutout/hex to build 1 free Fossil Fuel Power Plant and receive 1 resource from that hex even if hazarded).
    6. `DISCARD_ON_SEVEN` (All players with `> 7` Resource+Science cards, or `> 10` with active Warehouse, choosing `floor(hand / 2)` cards to discard).
    7. `MOVE_INSPECTOR` & `STEAL_TARGET` (Active player choosing a new hazard-free hex for the Environmental Inspector and choosing which adjacent player to steal 1 random Resource/Science card from — used on a `7` and on *Cleanup* Option 1).
    8. `CLEANUP_CHOICE` (*Cleanup* Dev Card: choose Inspector Move+Steal OR choose 1 Hazard token to remove + 1 opponent with `LF >= yours` to steal from).
    9. `PROGRESS_CARD_CHOICE` (*Road Construction* up to 2 free roads; *High Yield* up to 3 distinct hexes with own Renewable Plants; *Research Grant* any 2 Resource/Science cards).
    10. `DOMESTIC_TRADE_RESPONSE` (Target player(s) accepting, rejecting, or countering an active player's trade proposal).
- **Undo & Save/Resume Policy**:
  - Full `seed + actionHistory[]` is persisted to `localStorage` so any local/host session can be resumed or exported/imported as JSON.
  - In solo/hotseat games, `undo` is permitted for deterministic build/trade actions back to the last randomness/hidden-information boundary (dice roll, event bag draw, dev card buy, or card steal).

### 1.3 Host-Authoritative Multiplayer & Redaction (`src/network/`)
- **Host-Authoritative Model**: The host browser holds the canonical `GameState` (including PRNG state, deck order, and face-down green discs) and runs AI bots.
- **Per-Player State Redaction (`redactForPlayer(state, viewerId)`)**:
  - Before broadcasting state to a remote peer (or rendering while the Hotseat Privacy Curtain is active), `redactForPlayer` strips:
    - Other players' Resource and Science card identities (replaced by total card count).
    - Other players' unplayed Development card identities (replaced by count; face-up played *Cleanup* cards remain visible).
    - Face-down Green Event Disc identities under all players' unbuilt Renewable Power Plants.
    - Remaining Event Bag and Development Deck ordering (replaced by public remaining counts).
    - Internal PRNG state.
- **Reconnection**: Each player seat receives a session token stored in `sessionStorage`/`localStorage`; reconnecting with a room code (`/#room=XXXX`) restores the player's seat and pushes a fresh redacted snapshot.

### 1.4 Consistent Bot Personalities & Difficulty Levels (`src/ai/`)
To keep naming consistent across engine, UI, and documentation:
- **3 Bot Personalities**:
  1. `Balanced` (*Balanced Builder*): Weighs VP expansion, energy production, and footprint safety equally.
  2. `GreenInnovator` (*Green Innovator*): Prioritizes Cities, Science cards, Renewable Power Plants (`-1 LF`), Cleanup cards, and keeping LF low to win via either 10 VP or Empty Bag Renewable Balance.
  3. `IndustrialExpansionist` (*Industrial Expansionist*): Prioritizes rapid Fossil Fuel Power Plants (`1 Science`), early Energy generation, and fast Town/City expansion toward 10 VP before the event bag runs out.
- **3 Bot Difficulty Tiers**: `Easy` (adds random noise to utility scores, never initiates complex trades), `Normal` (full heuristic evaluation), and `Hard` (1-ply lookahead on build sequences + proactive hazard/footprint defense).

---

## 2. Phased Milestones & Tasks (5 Milestones, 17 Tasks)

Every task has a concrete, command-runnable **Check**. Every milestone has a **Done when** gate. All 33 rules in `docs/traceability.md` (`TOP-01` through `SEC-01`) are verified by automated tests.

---

### Milestone 1: Project Scaffold, Hex Graph, Setup & Core Action Reducer (`goal/02-core-engine-and-board`)

- **Task 1.1: Initialize Vite + Preact + TypeScript + Vitest + ESLint Project**
  - **Deliverables**: `.nvmrc` (`20`), `package.json` (`vite`, `preact`, `typescript`, `vitest`, `happy-dom`, `fast-check`, `eslint`, `prettier`), `tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess: true`), `vite.config.ts`, `index.html`, `src/main.tsx`, and `src/engine/config.ts` (all configurable game constants: building costs, GF draw tables for 3P/4P, event track lengths, disc counts).
  - **Check**: `npm run typecheck && npm run lint && npm run build && npx vitest run` exits with code `0`.

- **Task 1.2: Hex Grid, 54 Intersections, 72 Paths, Cutouts & 9 Harbors (`src/engine/types.ts`, `src/engine/board.ts`)**
  - **Deliverables**:
    - Axial hex coordinates for the 19 pointy-top hexes (`3-4-5-4-3` layout).
    - Canonical graph of 54 intersections, 72 path edges, hex-to-intersection adjacency, the 3 hex cutouts per intersection for power plants, 2-path Distance Rule helper, and 9 harbor bindings (`4x 3:1`, `5x 2:1`).
  - **Check**: `npx vitest run src/engine/__tests__/board.test.ts` passes (`TOP-01`, `TOP-02`).

- **Task 1.3: Game State, Player Boards, Setup Modes (First Game & Variable Draft) & Footprint Calculator (`src/engine/footprint.ts`, `src/engine/setup.ts`)**
  - **Deliverables**:
    - Complete `GameState`, `PlayerState`, and `PlayerBoardState` models.
    - **First Game Setup** (exact preset from `rules_text.txt` pp. 4–5 / `UI-design-style.png`, omitting Blue in 3P) and **Standard Game Setup** (random hexes, spiral A–R number discs skipping Desert, snake draft Round 1 Town+Road / Round 2 City+Road, starting hand of 1 Resource per City-adjacent non-desert hex + 1 Science card).
    - Event Bag initialization (`43` brown discs; `36` green discs in 4P or `27` in 3P after removing the 9 `4P`-marked discs, dealt 9 per player under Renewable Power Plants).
    - Local Footprint (`LF`) calculator and Global Footprint (`GF`) tracker with endpoint clamping (`0..28` in 4P, `0..21` in 3P while tracking `trueTotalLF`).
  - **Check**: `npx vitest run src/engine/__tests__/setup.test.ts` passes (`SET-01`..`SET-04`, `GF-01`, `GF-02`).

- **Task 1.4: Pure Deterministic Action Reducer, PendingDecision Queue & Seeded PRNG (`src/engine/prng.ts`, `src/engine/actions.ts`, `src/engine/reducer.ts`)**
  - **Deliverables**:
    - `mulberry32` serializable PRNG (`nextInt`, `shuffle`, `pickRandom`).
    - Discriminated union `GameAction` and `PendingDecision` types covering all turn phases and multi-player interrupts.
    - Pure `applyAction(state, action)` dispatcher, `legalActions(state, playerId)` generator (handling setup draft actions and turn phase transitions), and JSON serialization/replay helpers.
  - **Check**: `npx vitest run src/engine/__tests__/reducer.test.ts` passes (`RED-01`: JSON round-trip equality, deterministic replay from seed + actions, and rejection of illegal actions).

- **Milestone 1 Done When**:
  - `npm run typecheck && npm run lint && npm run build && npx vitest run` all pass with 0 errors.

---

### Milestone 2: Complete Rules Engine & Property Fuzzing (`goal/03-rules-engine-complete`)

- **Task 2.1: Event Phase — Bag Draws, Track Triggers & Empty Bag Termination (`src/engine/events.ts`)**
  - **Deliverables**:
    - Start-of-turn draw count lock based on clamped GF (`EVT-01`).
    - Sequential disc draw from bag $\rightarrow$ placement on matching frame track $\rightarrow$ track full check (`3` or `4` spaces) $\rightarrow$ remove track tokens from game (`EVT-02`).
    - Immediate game end if the Event Bag is empty when a draw is required (`VIC-01`).
  - **Check**: `npx vitest run src/engine/__tests__/events-bag.test.ts` passes (`EVT-01`, `EVT-02`, empty-bag trigger).

- **Task 2.2: All 7 Event Resolvers & Universal Tie-Breaker Prompts (`src/engine/event-resolvers.ts`)**
  - **Deliverables**:
    - Universal tie-breaker helper (all players tied $\rightarrow$ no-op; subset tied $\rightarrow$ clockwise `PendingDecision` queue starting from active player, `EVT-03`).
    - Resolvers and decision handlers for *Air Pollution* (`EVT-04`), *Environmental Pollution* (`EVT-05`, re-rolling `7`s, Inspector protection), *Production Increase* (`EVT-06`, optional free Fossil Plant ignoring 1/turn limit + 1 resource even on hazarded hex), *Rain and Flooding* (`EVT-07`), *Climate Conference* (`EVT-08`, optional lowest-LF reward + mandatory highest-LF discard), *Government Funding* & *Sustainable Production* (`EVT-09`).
  - **Check**: `npx vitest run src/engine/__tests__/events.test.ts` passes (`EVT-03`..`EVT-09`).

- **Task 2.3: Production Phase, Hazard Auto-Clear & Roll of 7 (`src/engine/production.ts`)**
  - **Deliverables**:
    - Dice roll (`2–12`), Town (`1 Resource`), City (`1 Resource + 1 Science`), and Power Plant (`1 Energy`, capped at `5`) distribution with Hex/Building Hazard and Inspector blocking (`PRD-01`).
    - End-of-Production Hazard auto-removal from rolled hexes/buildings blocked by Hazards, strictly preserving Hazards on buildings whose hex has the Environmental Inspector (`PRD-02`).
    - Roll of `7` workflow: `DISCARD_ON_SEVEN` (`> 7` default, `> 10` with Warehouse, `PRD-03`) $\rightarrow$ `MOVE_INSPECTOR` (to new hazard-free hex) $\rightarrow$ `STEAL_TARGET` (1 random Resource/Science card, `PRD-04`).
  - **Check**: `npx vitest run src/engine/__tests__/production.test.ts` passes (`PRD-01`..`PRD-04`).

- **Task 2.4: Action Phase — Building, Power Plants, Energy Uses, Trading & Longest Trade Route (`src/engine/build.ts`, `src/engine/energy-trades.ts`, `src/engine/longest-road.ts`)**
  - **Deliverables**:
    - Build Road, Town, City, Warehouse, Fossil Fuel Plant (`1 Science`, `+1 LF`), Renewable Plant (`3 Science`, `-1 LF`, uncovers Green Event Disc into bag), and Buy Dev Card (`ACT-01`, `ACT-02`). Enforces 1 Power Plant built per turn limit, Town (1) / City (3 distinct hexes) cutouts, and no Desert/Sea plants.
    - Energy actions: `2 Energy` $\rightarrow$ 1 Resource/Science; `1 Energy` $\rightarrow$ remove any 1 Hazard; `1 Energy` $\rightarrow$ demolish 1 built Fossil Plant (`-1 LF`, max 1/turn) (`ACT-03`).
    - Supply trades (`4:1` resource for different resource/science, `3:1` science for resource, `2:1` energy), Harbor trades (`3:1`, `2:1`), and Domestic Trade offers/responses (`ACT-04`, `ACT-05`).
    - DFS graph solver for continuous **Longest Trade Route** ($\ge 5$ roads, broken by opponent town/city, `ACT-06`).
  - **Check**: `npx vitest run src/engine/__tests__/build.test.ts src/engine/__tests__/energy-trades.test.ts src/engine/__tests__/longest-road.test.ts` passes (`ACT-01`..`ACT-06`).

- **Task 2.5: Development Cards, Cleanest Environment, Dual Victory & Engine Fuzz Suite (`src/engine/dev-cards.ts`, `src/engine/victory.ts`, `src/engine/__tests__/fuzz.test.ts`)**
  - **Deliverables**:
    - Dev Card timing & play rules (`DEV-01`), *Cleanup* (`14x`) + *Cleanest Environment* (`2 VP`, `DEV-02`), *Road Construction*, *High Yield*, *Research Grant*, and free *VP Card* reveal on win (`DEV-03`).
    - Dual Victory evaluator: immediate `>= 10 VP` on own turn OR Empty Bag evaluation ($\text{RenewableBuilt} > \text{FossilBuilt}$ eligibility, highest difference, VP tie-break, or all players lose, `VIC-01`).
    - `fast-check` fuzz suite (`fuzz.test.ts`) + random-legal bot helper (`pickRandomLegalAction`) running **500 complete random games** (3P and 4P, First Game and Standard Setup) verifying invariants on every step: card conservation (`95` resources, `20` science), `0 <= energy <= 5`, `hazardsOnBoard <= 10`, `GF == clamp(sum(LF))`, recomputable VP, and zero unhandled exceptions or deadlocks.
  - **Check**: `npx vitest run` passes 100% of unit tests and the 500-game fuzz suite.

- **Milestone 2 Done When**:
  - `npm run typecheck && npm run lint && npx vitest run` pass, and every rule ID (`TOP-01`..`VIC-01`) in `docs/traceability.md` has a passing test.

---

### Milestone 3: Tabletop UI — Gingham Table, Circular Island Board & Playable Vertical Slice (`goal/04-tabletop-ui-board`)

- **Task 3.1: Theme Tokens, Gingham Viewport & Circular Sea Frame SVG (`src/ui/theme.ts`, `src/ui/TabletopLayout.tsx`, `src/ui/SeaFrameSvg.tsx`)**
  - **Deliverables**:
    - Curated `theme.ts` palette and color-blind emblem definitions from `docs/ui-design-spec.md`.
    - Overhead buffalo-plaid gingham tablecloth (`28px` square scale) with responsive pan/zoom/reset container (`1366x768` to `1920x1080+`).
    - 6-piece circular sea frame SVG with interlocking puzzle seams, 9 sea harbor badges (`[data-testid="harbor-*"]`), 12 o'clock VP track (`1–10`), 1–2 o'clock diagonal Global Footprint track (`0–28` / `0–21` with draw count indicators), and 7 coastal Event Disc islands (`[data-testid="event-track-*"]`) showing filled/empty disc slots.
  - **Check**: `npx vitest run src/ui/__tests__/SeaFrameSvg.test.tsx` verifies all 9 harbors, 7 event tracks, VP track, and 3P/4P GF track render with accurate state bindings.

- **Task 3.2: Terrain Hexes, Number Discs, 3D Wooden Pieces, Power Plants & Hazards (`src/ui/IslandBoardSvg.tsx`)**
  - **Deliverables**:
    - Cached static SVG layer for the continuous white road lattice and original procedural vector artwork for the 19 pointy-top hexes (`Forest`, `Hills`, `Pasture`, `Fields`, `Mountains`, `Desert`) plus cream Number Discs (`min 28px`, red double-ringed `6` and `8`, probability pips).
    - Dynamic SVG overlay for beveled 3D wooden Roads, hexagonal-prism Towns, Cities (with high-contrast strokes and color-blind badges), brown Fossil Fuel & green Renewable Power Plant discs (with bolt + smokestack/leaf sub-icons) inside hex cutouts, grey 8-tooth cog Hazard rings, and the grey Environmental Inspector pawn.
    - Interactive pulsing highlight rings (`[data-node]`, `[data-edge]`, `[data-hex]`, `[data-plant-slot]`) with keyboard `tabindex="0"` and `aria-label` accessibility, wired directly to `legalActions(state, viewerId)` so a human can already click through a playable vertical slice against the random-legal bot!
  - **Check**: `npx vitest run src/ui/__tests__/IslandBoardSvg.test.tsx` verifies 19 hexes, 54 nodes, 72 edges, piece rendering, and interactive click dispatch.

- **Milestone 3 Done When**:
  - `npm run typecheck && npm run lint && npm run build && npx vitest run` pass with 0 errors.

---

### Milestone 4: Corner Player Boards, Supply Stacks, HUD Dock & Interactive Modals (`goal/05-tabletop-hud-and-modals`)

- **Task 4.1: 4 Corner Player Boards, Event Bag & Card Supply Margins (`src/ui/PlayerBoardView.tsx`, `src/ui/TableMargins.tsx`)**
  - **Deliverables**:
    - 4 corner Player Stations that display full graphic Player Boards on `>= 1600px` screens and expandable compact stations on `1366x768` screens: Town (`+1 LF`) & City (`+2 LF`) slots, Fossil Plant (`+1 LF`) & Renewable Plant (`-1 LF`, stacked on Green Event Discs) slots, Warehouse tile (`<= 7` / `<= 10`), 5 yellow Energy bolts, and face-up played Cleanup cards.
    - Right margin with organic-angled Resource & Science supply piles, face-down Development deck, and interactive **SVG Event Disc Bag**; left margin with *Longest Trade Route* & *Cleanest Environment* tiles, 2 pipped dice, and Hazard/Energy token reserves.
  - **Check**: `npx vitest run src/ui/__tests__/PlayerBoardView.test.tsx` passes all slot, LF icon, Warehouse, and Energy cap assertions.

- **Task 4.2: Active Player HUD Dock, Prompt Banners & Trade/Event Modals (`src/ui/ActivePlayerHud.tsx`, `src/ui/PromptModal.tsx`, `src/ui/TradeModal.tsx`)**
  - **Deliverables**:
    - Bottom-center Active Player Dock: fanned hand of Resource & Science cards, playable Development cards, Status Pill (`VP | LF | GF | Energy | Bag`), action buttons (`Draw Event`, `Roll Dice`, `Build`, `Trade`, `Spend Energy`, `Play Dev Card`, `Undo`, `End Turn`), and collapsible Turn & Event Log.
    - Interactive Modals for every `PendingDecision`: Discard on `7` card picker, Event Triggered banner & choice prompts (*Climate Conference*, *Production Increase*, *Air Pollution*, *Rain & Flooding*), Cleanup / Progress card prompts, and the **Trade Negotiation Modal** (Supply `4:1`/`3:1`/`2:1`, Harbor `3:1`/`2:1`, and Domestic Player-to-Player trade builder with Science & Energy).
  - **Check**: `npx vitest run src/ui/__tests__/HudAndModals.test.tsx` passes full turn and prompt interaction tests.

- **Task 4.3: Playwright E2E Full-Turn & Visual Verification (`e2e/tabletop.spec.ts`)**
  - **Deliverables**:
    - Configure `@playwright/test` (`playwright.config.ts`) running against `vite preview`.
    - Deterministic E2E test (`/?seed=42&setup=first`) driving a complete human turn (Pre-event check $\rightarrow$ Draw Event Discs $\rightarrow$ Roll Dice $\rightarrow$ Trade & Build $\rightarrow$ End Turn) and asserting DOM state at `1366x768` and `1920x1080`.
  - **Check**: `npx playwright test e2e/tabletop.spec.ts` exits with code `0`.

- **Milestone 4 Done When**:
  - `npm run typecheck && npm run lint && npm run build && npx vitest run && npx playwright test` all pass.

---

### Milestone 5: Heuristic AI Bots, Multiplayer (Hotseat & Online Rooms) & Polish (`goal/06-bots-multiplayer-and-polish`)

- **Task 5.1: Heuristic AI Bot Engine — 3 Personalities & 3 Difficulty Tiers (`src/ai/bot.ts`)**
  - **Deliverables**:
    - Utility-scoring AI engine handling all turn phases and `PendingDecision` prompts (draft vertex evaluation, optimal discard on `7`, hazard placement on leading opponents, Inspector targeting, build sequencing, power plant transition from fossil to renewable as GF rises or bag shrinks, and domestic trade accept/reject evaluation with a cap of 1 bot trade offer per turn).
    - 3 personalities (`Balanced`, `GreenInnovator`, `IndustrialExpansionist`) $\times$ 3 difficulties (`Easy`, `Normal`, `Hard`) + configurable UI bot pacing (`600ms` / `150ms` / `Instant`).
  - **Check**: `npx vitest run src/ai/__tests__/bot-simulation.test.ts` runs 30 complete 3P and 4P bot games (under a 2,000-action safety cap per game), verifying that 100% finish cleanly, both 10-VP and Empty Bag endings occur across personality matchups, and `Normal` bots beat the random-legal baseline $> 80\%$ of the time.

- **Task 5.2: Host-Authoritative Multiplayer, State Redaction & Lobby (`src/network/redact.ts`, `src/network/transport.ts`, `src/ui/LobbyModal.tsx`)**
  - **Deliverables**:
    - `redactForPlayer(state, viewerId)` with deep-scan security test ensuring zero leakage of opponent hand cards, unplayed dev cards, green discs, or PRNG state (`SEC-01`).
    - `Transport` implementations: `MockTransport`, `BroadcastChannelTransport` (instant multi-tab play/testing), and `PeerJSTransport` (WebRTC P2P room codes `/#room=XXXX` with configurable PeerServer/TURN and seat-token reconnection).
    - **Setup Lobby & Hotseat Privacy Curtain**: Configure 3 or 4 players (`Human`, `Bot` with Personality/Difficulty, or `Remote Friend`), setup mode (`First Game` vs `Standard Variable Draft`), Save/Resume from `localStorage`, and Pass-and-Play privacy screen between human turns.
  - **Check**: `npx vitest run src/network/__tests__/multiplayer.test.ts` passes redaction security audit (`SEC-01`) and runs a complete 4-player game over `MockTransport` with host + 3 clients + reconnection.

- **Task 5.3: End-of-Game Summary Screen, Audio/Visual Polish & E2E Multiplayer Smoke Test (`src/ui/VictoryModal.tsx`, `e2e/game-flow.spec.ts`)**
  - **Deliverables**:
    - End-of-Game Summary Modal clearly explaining the outcome (`10 VP Victory`, `Empty Event Bag — Renewable Balance Victory`, or `Environmental Collapse — All Players Lose`) with full per-player breakdown (VP, Built Renewable vs. Fossil Plants, Final LF, Cleanups played).
    - Smooth transform/opacity animations for dice rolls and event disc bag draws (honoring `prefers-reduced-motion`).
    - Playwright E2E test verifying Lobby $\rightarrow$ Bot game completion $\rightarrow$ Victory Modal, plus 2-context multi-tab room sync via `BroadcastChannelTransport`.
  - **Check**: `npm run typecheck && npm run lint && npm run build && npx vitest run && npx playwright test` passes all unit, fuzz, simulation, and E2E suites.

- **Milestone 5 Done When**:
  - All unit tests, 500-game fuzz suite, 30-game bot simulation suite, multiplayer redaction/transport tests, and Playwright E2E suites pass with 0 errors.
