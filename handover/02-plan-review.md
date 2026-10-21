# Handover: 02 — Plan Review & Multi-Subagent Audit Improvements

## Status
| Task | Status | Evidence (Command Output) |
| :--- | :---: | :--- |
| **1. Audit & refine `docs/rules-summary.md` against `rules_text.txt` (Rules Accuracy Auditor)** | **done** | `rules-summary.md` (`26,660` bytes) updated with line citations (`R L...`), provenance tags, 4-space Environmental Pollution track (`R L352-355`), GF endpoint clamping (`R L611-614`), mandatory vs. optional event wording, and edge-case resolutions. |
| **2. Audit & refine `docs/ui-design-spec.md` against `UI-design-style.png` (UI Spec Visual Auditor)** | **done** | `ui-design-spec.md` (`11,905` bytes) updated with exact photo observations (First Game hex/number layout, Inspector on right-middle Forest hex, 3 visible player boards, `28px` gingham scale), `src/ui/theme.ts` tokens, `1366x768` responsive layout, and color-blind badges. |
| **3. Create Rules-to-Test Traceability Matrix (`docs/traceability.md`)** | **done** | `traceability.md` (`8,701` bytes) mapping all 33 rule IDs (`TOP-01`..`SEC-01`) to engine modules and Vitest files. |
| **4. Overhaul `docs/implementation-plan.md` based on Senior Engineer Gap Review** | **done** | `implementation-plan.md` (`23,171` bytes) expanded to 5 milestones / 17 tasks with Task 1.4 (`applyAction` + `pendingDecisions` reducer), `fast-check` 500-game fuzzing, Playwright E2E checks, and `redactForPlayer` multiplayer security. |

### Verification Output
```text
Name                      Length
----                      ------
implementation-plan.md     23171
rules-summary.md           26660
traceability.md             8701
ui-design-spec.md          11905
01-planning-and-design.md   7749
progress.md                 2054

### Milestone 1: Project Scaffold, Hex Graph, Setup & Core Action Reducer (`goal/02-core-engine-and-board`)
- **Task 1.1: Initialize Vite + Preact + TypeScript + Vitest + ESLint Project**
- **Task 1.2: Hex Grid, 54 Intersections, 72 Paths, Cutouts & 9 Harbors (`src/engine/types.ts`, `src/engine/board.ts`)**
- **Task 1.3: Game State, Player Boards, Setup Modes (First Game & Variable Draft) & Footprint Calculator (`src/engine/footprint.ts`, `src/engine/setup.ts`)**
- **Task 1.4: Pure Deterministic Action Reducer, PendingDecision Queue & Seeded PRNG (`src/engine/prng.ts`, `src/engine/actions.ts`, `src/engine/reducer.ts`)**
### Milestone 2: Complete Rules Engine & Property Fuzzing (`goal/03-rules-engine-complete`)
- **Task 2.1: Event Phase - Bag Draws, Track Triggers & Empty Bag Termination (`src/engine/events.ts`)**
- **Task 2.2: All 7 Event Resolvers & Universal Tie-Breaker Prompts (`src/engine/event-resolvers.ts`)**
- **Task 2.3: Production Phase, Hazard Auto-Clear & Roll of 7 (`src/engine/production.ts`)**
- **Task 2.4: Action Phase - Building, Power Plants, Energy Uses, Trading & Longest Trade Route (`src/engine/build.ts`, `src/engine/energy-trades.ts`, `src/engine/longest-road.ts`)**
- **Task 2.5: Development Cards, Cleanest Environment, Dual Victory & Engine Fuzz Suite (`src/engine/dev-cards.ts`, `src/engine/victory.ts`, `src/engine/__tests__/fuzz.test.ts`)**
### Milestone 3: Tabletop UI - Gingham Table, Circular Island Board & Playable Vertical Slice (`goal/04-tabletop-ui-board`)
- **Task 3.1: Theme Tokens, Gingham Viewport & Circular Sea Frame SVG (`src/ui/theme.ts`, `src/ui/TabletopLayout.tsx`, `src/ui/SeaFrameSvg.tsx`)**
- **Task 3.2: Terrain Hexes, Number Discs, 3D Wooden Pieces, Power Plants & Hazards (`src/ui/IslandBoardSvg.tsx`)**
### Milestone 4: Corner Player Boards, Supply Stacks, HUD Dock & Interactive Modals (`goal/05-tabletop-hud-and-modals`)
- **Task 4.1: 4 Corner Player Boards, Event Bag & Card Supply Margins (`src/ui/PlayerBoardView.tsx`, `src/ui/TableMargins.tsx`)**
- **Task 4.2: Active Player HUD Dock, Prompt Banners & Trade/Event Modals (`src/ui/ActivePlayerHud.tsx`, `src/ui/PromptModal.tsx`, `src/ui/TradeModal.tsx`)**
- **Task 4.3: Playwright E2E Full-Turn & Visual Verification (`e2e/tabletop.spec.ts`)**
### Milestone 5: Heuristic AI Bots, Multiplayer (Hotseat & Online Rooms) & Polish (`goal/06-bots-multiplayer-and-polish`)
- **Task 5.1: Heuristic AI Bot Engine - 3 Personalities & 3 Difficulty Tiers (`src/ai/bot.ts`)**
- **Task 5.2: Host-Authoritative Multiplayer, State Redaction & Lobby (`src/network/redact.ts`, `src/network/transport.ts`, `src/ui/LobbyModal.tsx`)**
- **Task 5.3: End-of-Game Summary Screen, Audio/Visual Polish & E2E Multiplayer Smoke Test (`src/ui/VictoryModal.tsx`, `e2e/game-flow.spec.ts`)**
```

---

## State
- **Branch**: `goal/02-plan-review`
- **Last commit**: See git log (all spec and plan revisions committed on `goal/02-plan-review`).
- **How to run the project**: Ready to begin Milestone 1 implementation.
- **New dependencies**: None installed yet (toolchain pinned in `docs/implementation-plan.md` §1.1: Node 20+, `vite`, `preact`, `typescript`, `vitest`, `happy-dom`, `fast-check`, `@playwright/test`, `peerjs`, `eslint`, `prettier`).

---

## Decisions and Assumptions Made (Key Audit Fixes)
1. **Rules Accuracy Corrections (`docs/rules-summary.md`)**:
   - **Environmental Pollution Track Length**: Fixed from `3` to `4` spaces per explicit confirmation in `rules_text.txt` `L352-355` (*"Since only two of four places are occupied, the event is not yet triggered"*).
   - **Global Footprint Clamping (`R L611-614`)**: Added explicit dual tracking of `trueTotalLF` and `clampedGF = clamp(trueTotalLF, 0, maxGF)` so that when total LF drops below `0` or rises above `28` (`21` in 3P), the marker stays at the endpoint until the true sum comes back in range.
   - **Green Event Disc Distribution (`R L94-106`, `L287-291`)**: Documented the PDF extraction discrepancy (`3 + 12 + 12 = 27` vs. `36` header and `1 + 4 + 4 = 9` `4P`-marked discs removed in 3P) and made the distribution configurable in `src/engine/config.ts`.
   - **Supply & Harbor Trade Wording (`R L555`, `L564`, `L567`)**: Enforced that `4:1`, `3:1`, and `2:1` resource trades must take a **different** resource (or Science card).
   - **Mandatory vs. Optional Event Actions (`R L859-895`)**: Distinguished `may` rewards (*Production Increase*, *Climate Conference* lowest-LF reward, *Government Funding*, *Sustainable Production*) from `must` penalties (*Air Pollution*, *Rain and Flooding*, *Climate Conference* highest-LF discard).
2. **UI Visual Audit Corrections (`docs/ui-design-spec.md`)**:
   - Corrected description of `UI-design-style.png`: recorded the exact First Game terrain and number layout visible in the photo, noted the Inspector pawn is on the right-middle Forest hex, only 3 player boards are in frame, gingham square scale is `~28px` ($\frac{1}{24}$ board diameter), and separated observed facts from curated `src/ui/theme.ts` hex tokens.
   - Added responsive `1366x768` support (compact opponent stations that expand on hover/click), color-blind player badges + high-contrast outlines, secondary icons on green/brown power plants, and pre-baked SVG shadows for 60fps performance.
3. **Architecture & Task Sizing (`docs/implementation-plan.md`)**:
   - Added **Task 1.4**: Pure deterministic `applyAction(state, action)` reducer with an explicit `pendingDecisions` queue for all 10 multi-player/mid-turn interrupt types and serializable `mulberry32` PRNG state.
   - Added **Host-Authoritative Multiplayer with `redactForPlayer(state, viewerId)`** so remote peers and hotseat privacy screens never leak hidden hands, dev cards, face-down green discs, or PRNG state.
   - Split oversized tasks into **5 milestones (17 tasks)** with concreteVitest, `fast-check` (500-game fuzz suite), and `@playwright/test` E2E checks.

---

## Blocked or Open Issues
- The 4th subagent (`External Rules Fact Checker`) hit a transient `RESOURCE_EXHAUSTED (429)` model quota limit when spawned; we ran the targeted external web searches directly in the main agent and cross-verified the player-board building costs (`Fossil Plant = 1 Science`, `Renewable Plant = 3 Science`, `Warehouse = 2 Energy`) and green/brown disc inventories. No tasks are blocked.

---

## Files Changed
- `docs/rules-summary.md` (updated with line citations, provenance tags, and edge-case rules)
- `docs/ui-design-spec.md` (updated with accurate photo audit, `theme.ts` tokens, `1366x768` layout, and accessibility)
- `docs/traceability.md` (created — 33-row rules-to-test traceability matrix)
- `docs/implementation-plan.md` (updated — 5 milestones, 17 tasks, reducer/prompt architecture, fuzzing & E2E checks)
- `handover/progress.md` (updated with Task 4 entry)
- `handover/02-plan-review.md` (created — this handover document)

---

## Next Goal

```markdown
/goal Catan New Energies — Milestone 1: Project Scaffold, Hex Graph, Setup & Core Action Reducer

## Outcome
Initialize the Node 20+ / Vite / Preact / TypeScript / Vitest workspace and implement the complete Catan: New Energies board coordinate graph (19 hexes, 54 intersections, 72 path edges, 3 hex cutouts per intersection, 9 harbors), First Game & Standard Game setup modes (3P and 4P), Local/Global Footprint calculators (with endpoint clamping), and the pure deterministic `applyAction` reducer + `pendingDecisions` queue + seeded `mulberry32` PRNG with full unit test coverage.

## Prior handover
- handover/02-plan-review.md
- handover/01-planning-and-design.md
- Specs: docs/rules-summary.md, docs/ui-design-spec.md, docs/traceability.md, docs/implementation-plan.md

## Environment
- Working directory: C:\Users\Jen\Documents\Strata\Workspace\catan-new-energies-argon
- Git repo: Y
  (If Y: work on branch `goal/03-core-engine-and-board`, commit after each task, never push, never force.)
- Do NOT touch: C:\Users\Jen\Documents\Strata\Workspace\catan-new-energies-web

## Rules
1. Read a file before editing it. Never guess paths, function names or APIs; confirm with ls or grep.
2. Use grep or ranged reads instead of dumping large files into context.
3. After every task, run its Check and quote the real output. Never say "done" without it.
4. If the same command fails the same way twice, change approach. If it fails a third time,
   stop that task, log it under "Blocked" in the handover, and move to the next independent task.
5. Keep changes minimal. No unrelated refactors. No new dependencies without listing them in the handover.
6. Do not ask me questions mid-run. Make the most reasonable assumption and record it in the handover.
7. After each task, append 2-3 lines to handover/progress.md (task, result, anything surprising).

## Tasks
1. Task 1.1: Initialize Vite + Preact + TypeScript + Vitest + ESLint Project (`.nvmrc`, `package.json`, `tsconfig.json` with `strict` and `noUncheckedIndexedAccess`, `vite.config.ts`, `index.html`, `src/main.tsx`, and `src/engine/config.ts` containing configurable game constants).
   - Check: `npm run typecheck && npm run lint && npm run build && npx vitest run` exits with code 0.
2. Task 1.2: Implement Hex Grid, 54 Intersections, 72 Paths, Cutouts & 9 Harbors (`src/engine/types.ts`, `src/engine/board.ts`).
   - Check: `npx vitest run src/engine/__tests__/board.test.ts` passes all topology assertions (`TOP-01`, `TOP-02`).
3. Task 1.3: Implement Game State, Player Boards, Setup Modes (First Game fixed layout from `UI-design-style.png` & Standard Game variable snake draft for 3P and 4P), and Local/Global Footprint calculators with endpoint clamping (`src/engine/footprint.ts`, `src/engine/setup.ts`).
   - Check: `npx vitest run src/engine/__tests__/setup.test.ts` passes (`SET-01`..`SET-04`, `GF-01`, `GF-02`).
4. Task 1.4: Implement Pure Deterministic Action Reducer, `PendingDecision` Queue & Seeded `mulberry32` PRNG (`src/engine/prng.ts`, `src/engine/actions.ts`, `src/engine/reducer.ts`).
   - Check: `npx vitest run src/engine/__tests__/reducer.test.ts` passes (`RED-01`: JSON round-trip equality, deterministic replay from seed + actions, and rejection of illegal moves).

## Done when
- `npm run typecheck && npm run lint && npm run build && npx vitest run` all succeed with 0 errors.
- All tests in `board.test.ts`, `setup.test.ts`, and `reducer.test.ts` pass.

## Finish
After the last task, re-run every item in "Done when". Then write handover/03-core-engine-and-board.md with:
- Status: each task as done / partial / blocked, with the evidence (command output)
- State: branch, last commit, how to run the project
- Decisions and assumptions made, and why
- Blocked or open issues
- Files changed
- Next goal: a ready-to-paste /goal block in this exact template, with "Prior handover" filled in

Only report what you verified. Mark anything unverified as "unverified".
```
