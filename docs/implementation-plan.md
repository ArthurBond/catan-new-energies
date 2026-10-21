# Catan: New Energies — Implementation Plan

This document breaks down the end-to-end development of a browser-playable **Catan: New Energies** tabletop game (supporting solo play vs. AI bots, local pass-and-play, and online multiplayer with friends) into specific, self-contained, and verifiable milestones.

---

## 1. Architecture & Technical Stack

- **Runtime & Bundler**: Node.js + **TypeScript** + **Vite** (`vite`, `typescript`, `vitest`) for instant dev startup, strict typing of complex board state, and fast unit/integration tests.
- **Pure Deterministic Game Engine (`src/engine/`)**:
  - Zero DOM dependencies so the exact same rules engine runs in browser UI, AI bot lookahead simulations, unit tests (`vitest`), and WebSocket/WebRTC multiplayer hosts.
  - Seeded PRNG (`mulberry32`) for deterministic dice rolls, event bag draws, and development card shuffles during tests and networked sessions.
- **Tabletop UI Renderer (`src/ui/`)**:
  - **SVG + HTML5/CSS3 Overhead Tabletop**:
    - Woven gingham/buffalo-plaid tablecloth background matching `UI-design-style.png`.
    - Custom SVG circular sea frame (with VP track `1–10`, 3P/4P Global Footprint track `0–21` / `0–28`, 9 harbors, and 7 coastal Event Disc island tracks).
    - 19 pointy-top hexes in Ian O'Toole's clean vector illustration style, thick white road channels, 54 intersection nodes, 72 path edges, and hex-corner Power Plant cutouts.
    - 4 corner Player Boards with live wooden piece slots (`+1`/`-1` LF icons), Warehouse tile (`<= 7` / `<= 10`), 5-bolt Energy meter, and 9 Renewable Plant stacks over Green Event Discs.
    - Interactive Event Disc Bag, Resource/Science/Dev card supply stacks, Hazard & Energy token piles, and active player HUD dock.
- **Multiplayer & Bots (`src/ai/`, `src/network/`)**:
  - **AI Bots**: Heuristic/utility-driven bots supporting 3 personalities (*Balanced*, *Green Innovator*, *Industrial Expansionist*) capable of handling every prompt (initial draft, event hazard choices, inspector movement, trading, building, and energy usage).
  - **Play with Friends**:
    - **Local Hotseat / Pass-and-Play** (with optional hidden-hand privacy shield).
    - **Online Room Codes (PeerJS / WebRTC or lightweight WebSocket relay)** so friends can join a host's room URL in their browser without complex server setup.

---

## 2. Phased Implementation Milestones & Tasks

### Milestone 1: Project Scaffold, Hex Graph Topology & Core State (`goal/02-core-engine-and-board`)
Establish the TypeScript + Vite + Vitest project and implement the board coordinate system, setup modes, and footprint calculations.

- **Task 1.1: Initialize Vite + TypeScript + Vitest Project**
  - **Deliverables**: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`.
  - **Check**: `npm run build` and `npx vitest run` exit with code `0`.
- **Task 1.2: Hex Grid, Intersections, Paths & Harbors Graph (`src/engine/board.ts`)**
  - **Deliverables**:
    - Axial hex coordinates for the 19 land hexes (3-4-5-4-3 layout).
    - Exact adjacency graph of all 54 intersections, 72 path edges, hex-to-intersection mappings (including the 3 hex cutouts per intersection for power plants), and 9 harbor locations (`4x 3:1`, `5x 2:1`).
  - **Check**: Unit tests in `src/engine/__tests__/board.test.ts` verifying 19 hexes, 54 intersections, 72 edges, distance-rule adjacency, and harbor vertex bindings.
- **Task 1.3: Game State, Player Boards, Setup Modes & Footprint Calculator (`src/engine/setup.ts`, `src/engine/footprint.ts`)**
  - **Deliverables**:
    - Full `GameState` and `PlayerState` types (resources, science, energy `0–5`, dev cards, towns, cities, roads, fossil/renewable plants, green disc stacks, warehouse state).
    - **First Game Setup** (exact preset from `rules_text.txt` pp. 4–5 / `UI-design-style.png`) and **Standard Game Setup** (random hexes, spiral A–R number tokens, snake draft Round 1 Town+Road / Round 2 City+Road, starting hand from City hexes + 1 Science card).
    - **3-Player vs. 4-Player configuration**: Removes the 9 `4P`-marked Green Event Discs in 3-player mode; initializes Global Footprint at `9` (max `21`) for 3P or `12` (max `28`) for 4P; computes Event Disc draw count (`1`, `2`, or `3`) from current GF position.
  - **Check**: Unit tests in `src/engine/__tests__/setup.test.ts` verifying 3P and 4P starting LF (`3` per player), GF (`9` for 3P, `12` for 4P), event bag (`43` brown discs), and starting hands.

---

### Milestone 2: Complete Rules Engine — Events, Production, Actions & Victory (`goal/03-rules-engine-complete`)
Implement all 4 turn phases, all 7 events, building/trading/energy actions, development cards, Longest Trade Route, Cleanest Environment, and dual victory conditions.

- **Task 2.1: Event Phase & All 7 Event Resolutions (`src/engine/events.ts`)**
  - **Deliverables**:
    - Draw $N$ discs from the Event Bag based on start-of-turn GF level; place on frame tracks; trigger events when tracks fill (3 spaces, or 4 for Rain & Flooding) and clear track tokens.
    - Full resolution + interactive prompt states for all 7 events (*Air Pollution*, *Environmental Pollution*, *Production Increase*, *Rain and Flooding*, *Climate Conference*, *Government Funding*, *Sustainable Production*), respecting tie-breaker rules (multiple tied players act clockwise; if all players tie, nothing happens).
    - Immediate game-over trigger if the Event Bag is empty when a draw is required.
  - **Check**: Unit tests in `src/engine/__tests__/events.test.ts` covering all 7 events, tie-breakers, Inspector protection during Environmental Pollution, and Empty Bag termination.
- **Task 2.2: Production Phase, Hazard Auto-Clear & Rolling a 7 (`src/engine/production.ts`)**
  - **Deliverables**:
    - Resource, Science (from Cities), and Energy (from attached Power Plants, capped at 5) distribution for rolled hexes.
    - Blocking rules: Hex Hazard blocks everything on that hex; Town/City Hazard blocks that building and its attached Power Plants; Environmental Inspector blocks everything on that hex.
    - **End-of-Production Hazard Removal**: Automatically remove Hazard tokens from any hex, town, or city whose number was rolled and was blocked by a Hazard (not by the Inspector).
    - **Roll of 7**: Hand limit check (`> 7` default, `> 10` with active Warehouse $\rightarrow$ discard $\lfloor \text{hand}/2 \rfloor$), move Environmental Inspector to a hazard-free hex, and steal 1 random Resource/Science card.
  - **Check**: Unit tests in `src/engine/__tests__/production.test.ts` verifying production yields, 5-energy cap, hazard blocking + auto-removal vs. Inspector blocking, and Warehouse discard thresholds.
- **Task 2.3: Action Phase — Building, Power Plants, Energy Uses & Trading (`src/engine/actions.ts`, `src/engine/longest-road.ts`)**
  - **Deliverables**:
    - Build **Road** (`1 Lumber + 1 Brick`), **Town** (`1 Lumber + 1 Brick + 1 Natural Fiber + 1 Food`, `+1 LF`, `+1 VP`), **City** (`2 Food + 3 Steel`, replaces Town, `+1 net LF`, `+1 net VP`), **Fossil Fuel Plant** (`1 Science`, `+1 LF`), **Renewable Plant** (`3 Science`, `-1 LF`, adds uncovered Green Event Disc to bag), **Warehouse** (`2 Energy`), and **Buy Dev Card** (`1 Food + 1 Natural Fiber + 1 Steel`).
    - Enforce 1 Power Plant built per turn limit, Town (max 1 plant) / City (max 3 plants on distinct hexes) cutout rules, and non-desert/non-sea hex restriction.
    - Energy actions: `2 Energy` $\rightarrow$ 1 Resource/Science; `1 Energy` $\rightarrow$ remove any 1 Hazard; `1 Energy` $\rightarrow$ demolish 1 built Fossil Fuel Plant (`-1 LF`, limit 1/turn).
    - Supply trade (`4:1` resource, `3:1` science, `2:1` energy), Harbor trade (`3:1` generic, `2:1` specialized), and Player-to-Player trade offers (including Science and Energy).
    - Continuous **Longest Trade Route** graph solver ($\ge 5$ roads, broken by opponent buildings).
  - **Check**: Unit tests in `src/engine/__tests__/actions.test.ts` testing all build costs, LF/GF deltas, power plant placement limits, energy uses, trades, and Longest Trade Route transfers.
- **Task 2.4: Development Cards, Cleanest Environment & Dual Victory Conditions (`src/engine/dev-cards.ts`, `src/engine/victory.ts`)**
  - **Deliverables**:
    - Play 1 Dev Card per turn (before Event Phase draw or during Action Phase; cannot play card bought this turn): *Cleanup* (14x, move Inspector OR remove 1 Hazard + steal 1 card from player with $\ge$ LF), *Road Construction* (2x), *High Yield* (2x, up to 3 distinct hexes with own Renewable Plants), *Research Grant* (2x).
    - **Cleanest Environment** tracking ($\ge 3$ face-up Cleanup cards, 2 VP).
    - **Victory Evaluator**: Immediate win at $\ge 10$ VP on active player's turn (including hidden VP cards), OR Empty Bag evaluation ($\text{Renewable} > \text{Fossil}$ eligibility, highest $(\text{Renewable} - \text{Fossil})$ wins, VP tie-breaker, or all players lose if none eligible).
  - **Check**: Full simulated game tests in `src/engine/__tests__/victory.test.ts` verifying both 10-VP wins and Empty Bag wins/total collapse.

---

### Milestone 3: Tabletop UI — Gingham Table, Circular Island Board & Player Boards (`goal/04-tabletop-ui-board`)
Build the overhead tabletop interface matching `UI-design-style.png`.

- **Task 3.1: Tabletop Viewport, Gingham Tablecloth & Circular Sea Frame (`src/ui/TabletopView.ts`, `src/ui/SeaFrameSvg.ts`)**
  - **Deliverables**:
    - Full-viewport overhead table with buffalo-plaid gingham CSS pattern, pan/zoom/fit-to-screen support, and responsive 4-corner layout.
    - Circular 6-piece ocean frame SVG with interlocking puzzle seams, 9 harbor badges, top VP track (`1–10`), curved Global Footprint track (`0–28` / `0–21`), and 7 coastal Event Disc islands.
  - **Check**: `npm run build` succeeds and headless/component render test confirms all frame tracks, 9 harbors, and 7 event islands render with accurate data bindings.
- **Task 3.2: Terrain Hexes, Number Discs, 3D Wooden Pieces, Power Plants & Hazards (`src/ui/IslandBoardSvg.ts`)**
  - **Deliverables**:
    -Ian O'Toole-inspired SVG artwork for Forest, Hills, Pasture, Fields, Mountains, and Desert hexes with crisp white road channels and cream number discs (with pips and red `6`/`8`).
    - Beveled 3D-styled wooden Roads, Towns, Cities, brown Fossil Fuel and green Renewable Power Plant discs (nested in hex corner cutouts), grey cog Hazard tokens, and the Environmental Inspector pawn.
    - Interactive valid-placement highlights on intersections, paths, hexes, and power plant slots.
  - **Check**: `npm run build` + UI state test verifying interactive click targets for towns, cities, roads, power plant cutouts, and hazards.
- **Task 3.3: Corner Player Boards, Supply Stacks, Event Bag & Active Player HUD (`src/ui/PlayerBoardView.ts`, `src/ui/SupplyAndHud.ts`)**
  - **Deliverables**:
    - 4 corner Player Boards displaying remaining Towns/Cities/Roads, Fossil & Renewable Power Plant slots with visible `+1`/`-1` pollution icons, Warehouse tile (`<= 7` / `<= 10`), and 5 yellow lightning-bolt Energy slots.
    - Right margin Resource/Science/Dev card supply stacks and clickable canvas **Event Disc Bag**; left margin Special VP tiles, dice, and Hazard/Energy reserves.
    - Bottom-center Active Player HUD dock showing full hand cards, playable Dev Cards, one-click action toolbar, and a live collapsible Game Log.
  - **Check**: `npm run build` and end-to-end UI interaction test completing a full human turn (Draw Event Disc $\rightarrow$ Roll Dice $\rightarrow$ Build/Trade $\rightarrow$ End Turn).

---

### Milestone 4: AI Bots, Multiplayer Modes & Polish (`goal/05-bots-multiplayer-and-polish`)
Add intelligent AI bots, friend play modes (Local Pass-and-Play + Online Room Code), interactive modals for events/trading, and visual polish.

- **Task 4.1: Heuristic AI Bot Engine (`src/ai/bot.ts`)**
  - **Deliverables**:
    - AI decision engine supporting all game phases and interrupts (draft placement scoring, discard on `7`, hazard placement/removal, Inspector targeting, building priority, power plant transition from early fossil to renewable as GF rises or bag shrinks, and domestic trade evaluation).
    - 3 selectable bot profiles: *Balanced*, *Green Guardian* (prioritizes Science, Renewable Plants, and low LF), and *Industrial Tycoon* (prioritizes rapid Cities and Fossil Plants).
  - **Check**: Automated bot-vs-bot simulation test (`src/ai/__tests__/bot-simulation.test.ts`) running 20 complete 3-player and 4-player games to completion without stalls or rule violations.
- **Task 4.2: Lobby, Local Pass-and-Play & Online Multiplayer with Friends (`src/network/multiplayer.ts`, `src/ui/LobbyModal.ts`)**
  - **Deliverables**:
    - Main Menu / Setup Lobby: Choose `3` or `4` players, assign each seat (`Human`, `Bot - Balanced/Green/Industrial`, or `Remote Friend`), and select `First Game (Fixed Setup)` or `Standard Game (Variable Draft)`.
    - **Pass-and-Play privacy screen** option between human turns on a shared screen.
    - **Online P2P Room Code (PeerJS / WebRTC)** so the host can copy a join code/link and friends can connect from their browsers with synchronized `GameState`.
  - **Check**: `npm run build` and unit/integration tests for state serialization, action dispatch over mock transport, and lobby configuration.
- **Task 4.3: Event Popups, Trade Negotiation Modal, Victory Screen & Audio/Visual Polish (`src/ui/Modals.ts`, `src/ui/Animations.ts`)**
  - **Deliverables**:
    - Animated Event Disc draw from the canvas bag and Event Triggered banner showing rulebook text and affected players.
    - Interactive Trade Modal (Supply, Harbor, and Player-to-Player counteroffers including Science & Energy).
    - End-of-Game Summary Screen detailing why the game ended (`10 VP Reached` vs. `Event Bag Empty — Renewable Balance` vs. `Environmental Collapse — All Players Lose`) with full player statistics.
  - **Check**: Full `npm run build` and `npx vitest run` passing 100% of unit and simulation suites.
