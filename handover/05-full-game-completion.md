# Handover: 05 — Full Game Completion: Engine, Showcase Player Mat, Bots & Multiplayer

## Status
| Milestone / Deliverable | Status | Evidence (Command Output) |
| :--- | :---: | :--- |
| **Milestone 1: Project Scaffold, Board Topology & Core Setup** | **done** | `board.test.ts` (17 tests), `setup.test.ts` (10 tests), `config.test.ts` (7 tests), `reducer.test.ts` (8 tests), `challenger_m1_iter2.test.ts` (18 tests). |
| **Milestone 2: Complete Rules Engine & 500-Game Fuzzing** | **done** | `production.test.ts` (10 tests), `events.test.ts` (15 tests), `dev-cards-victory.test.ts` (15 tests), `build-trade.test.ts` (16 tests), `rules-traceability.test.ts` (all 33 rules passed), `fuzz.test.ts` (500 complete games passed with 0 invariant violations). |
| **Milestone 3 & 4: Overhead Tabletop UI & Showcase Player Mat** | **done** | `src/ui/` (`theme.ts`, `SeaFrameSvg.tsx`, `IslandBoardSvg.tsx`, `WoodenPiecesSvg.tsx`, `PlayerMat.tsx`, `Modals.tsx`, `TabletopApp.tsx`), `ui.test.tsx` (3 tests passed). Renders full gingham table, circular sea frame, 19 hexes, 3D wooden pieces, and the signature **Resource Organiser Player Mat** modeled directly on `player-mat-reference.png`. |
| **Milestone 5: AI Bots & Multiplayer Transport** | **done** | `bot-simulation.test.ts` (8 tests passed, 30 full games simulated with both 10 VP and Empty Bag endings; Normal/Hard beats Easy/random >70%), `multiplayer.test.ts` (5 tests passed, complete 4P game over MockTransport with reconnection; multi-tab `BroadcastChannelTransport`; serverless `PeerJSTransport`). |

### Full Test Suite Output (`npm run typecheck; npm run lint; npm run build; npx vitest run`)
```text
> catan-new-energies@0.1.0 typecheck
> tsc --noEmit

> catan-new-energies@0.1.0 lint
> eslint .

> catan-new-energies@0.1.0 build
> vite build
✓ 65 modules transformed.
dist/index.html                  0.71 kB │ gzip:  0.44 kB
dist/assets/index-KAB6c6Mn.js  233.51 kB │ gzip: 60.90 kB
✓ built in 467ms

Test Files  14 passed (14)
     Tests  166 passed (166)
  Duration  52.20s
```

---

## State
- **Branch**: `goal/04-full-game-ui-bots-multiplayer`
- **How to play locally**:
  ```bash
  npm run dev
  ```
  Navigate to `http://localhost:5173/` (or `http://localhost:5173/?seed=42&setup=first&players=4&autostart=1` for immediate 4-player test setup).
- **Features verified**:
  - Full Catan: New Energies rules implementation (First Game fixed & Standard variable snake draft, turn-locked Event Phase draws, all 7 event tracks, non-7 production & hazard auto-clear with Inspector exception, Roll of 7 discard thresholds, 1-plant-per-turn limit, Energy uses, supply/harbor/domestic trading, 25 dev cards, Longest Road, Cleanest Environment, and dual victory conditions).
  - Showcase **Player Board & Resource Organiser Mat** matching `player-mat-reference.png` with recessed piece slots, `+1`/`+2` LF cloud icons, warehouse flip tile (`2 Energy`), yellow 5-bolt energy storage bar, factory fossil plants (`1 Science`), wind turbine renewable plants (`3 Science`) stacked over face-down green event discs, and sorted card compartments.
  - Heuristic AI Bots (`Balanced`, `GreenInnovator`, `IndustrialExpansionist` across `Easy`, `Normal`, `Hard` tiers) with customizable bot speeds (`Normal`, `Fast`, `Instant`).
  - Multiplayer via Local Hotseat (with privacy curtain) and multi-tab/room-code sync (`BroadcastChannel` & `PeerJS`).
