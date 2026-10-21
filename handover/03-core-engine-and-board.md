# Handover: 03 — Core Engine and Board (Milestone 1)

## Status
| Task | Status | Traceability / Evidence |
| :--- | :---: | :--- |
| **Task 1.1: Scaffold & Toolchain (`.nvmrc`, `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/engine/config.ts`)** | **done** | Pinned dependencies installed (`vite@6.2.0`, `preact@10.26.4`, `typescript@5.8.2`, `vitest@3.0.7`, `eslint@9.22.0`). Authoritative constants module configured and tested. (`config.test.ts`, 7 passed). |
| **Task 1.2: Hex Grid, 54 Nodes, 72 Paths, Cutouts & Harbors (`src/engine/types.ts`, `src/engine/board.ts`)** | **done** | Pointy-top axial grid (3-4-5-4-3 layout), canonical (u, v) discrete integer lattice with 54 intersections and 72 path edges, 114 cutout slots for power plants with Town (1) and City (3 distinct hexes) rules, 2-path distance validator, and 9 coastal harbors (4 generic 3:1, 5 specialized 2:1). (`board.test.ts`, `TOP-01`, `TOP-02`, 17 passed). |
| **Task 1.3: Game State, Setup Modes & Footprint Calculator (`src/engine/footprint.ts`, `src/engine/setup.ts`, `src/engine/prng.ts`)** | **done** | First Game fixed setup (omitting Blue in 3P, starting GF 12 in 4P and 9 in 3P), Standard variable snake draft (random hexes, A–R spiral number discs skipping Desert, 2-round draft queue), starting hands, component conservation (95 resource cards, 20 science cards, 20 energy, 10 hazards), Event Bag initialization (43 brown discs, 36/27 green discs dealt under renewable plant sockets), LF computation, and endpoint-clamped GF tracking (0..28 in 4P, 0..21 in 3P). (`setup.test.ts`, `SET-01`..`SET-04`, `GF-01`, `GF-02`, 10 passed). |
| **Task 1.4: Pure Deterministic Action Reducer, Pending Decisions & PRNG (`src/engine/actions.ts`, `src/engine/reducer.ts`)** | **done** | Pure `applyAction(state, action)` reducer with zero side effects, `legalActions(state, playerId)` generator, explicit `pendingDecisions` queue for 2-round snake draft and interrupts, deterministic PRNG roll integration, `IllegalActionError` validation, and JSON round-trip serialization. (`reducer.test.ts`, `RED-01`, 6 passed). |
| **Milestone 1 Remediation: O(1) PRNG State Restoration & Multi-Turn Stream Parity (`src/engine/prng.ts`, `src/engine/setup.ts`, `src/engine/reducer.ts`, `src/engine/__tests__/reducer.test.ts`)** | **done** | Eliminated constructor fast-forward loop and unmasked float accumulation; added static `fromState` factory; cleaned up dead ternary in `setup.ts` via `PLAYER_PIECE_RESERVES`; wired `fromState` into `ROLL_DICE`; added 12+ turn stream parity test and component conservation assertions. (`reducer.test.ts`, 8 passed; 42 total). |

---

## Verification Evidence

All 4 required verification commands succeeded with zero errors:

### 1. `npm run typecheck`
```text
> catan-new-energies@0.1.0 typecheck
> tsc --noEmit
```
Exited with code 0 (zero type errors across all modules and tests in strict mode with `noUncheckedIndexedAccess`).

### 2. `npm run lint`
```text
> catan-new-energies@0.1.0 lint
> eslint .
```
Exited with code 0 (zero errors and zero warnings).

### 3. `npm run build`
```text
> catan-new-energies@0.1.0 build
> vite build

vite v6.2.0 building for production...
transforming...
✓ 6 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                 0.71 kB │ gzip: 0.44 kB
dist/assets/index-z3aHBim6.js  11.62 kB │ gzip: 4.97 kB
✓ built in 96ms
```
Exited with code 0.

### 4. `npx vitest run`
```text
 RUN  v3.0.7 C:/Users/Jen/Documents/Strata/Workspace/catan-new-energies-argon

 ✓ src/engine/__tests__/config.test.ts (7 tests) 3ms
 ✓ src/engine/__tests__/board.test.ts (17 tests) 11ms
 ✓ src/engine/__tests__/setup.test.ts (10 tests) 8ms
 ✓ src/engine/__tests__/reducer.test.ts (8 tests) 49ms

 Test Files  4 passed (4)
      Tests  42 passed (42)
   Start at  15:12:47
   Duration  798ms (transform 507ms, setup 0ms, collect 713ms, tests 71ms, environment 1.09s, prepare 382ms)
```
Exited with code 0 (42 tests passed, 100% success rate).

---

## State & Git Workflow
- **Active Branch**: `goal/02-core-engine-and-board` (checked out from `goal/02-plan-review`).
- **Workspace**: `c:\Users\Jen\Documents\Strata\Workspace\catan-new-energies-argon` (strictly isolated; never touched `catan-new-energies-web`).
- **Commits**:
  - `109f275` — `chore(scaffold): initialize vite, preact, typescript, vitest, and engine config`
  - `9a8c4fb` — `feat(board): implement 19 axial hexes, 54 nodes, 72 edges, cutouts, and 9 harbors (TOP-01, TOP-02)`
  - `5feddd4` — `feat(setup): implement First Game & Standard Game setup, LF/GF tracking, and event bag (SET-01..SET-04, GF-01, GF-02)`
  - `994628d` — `feat(reducer): implement pure applyAction reducer, pending decisions, and legalActions (RED-01)`
  - `fix(engine): O(1) PRNG state restoration and multi-turn stream parity` (Milestone 1 Remediation)

---

## Rules Traceability Implementation (`docs/traceability.md`)
| Rule ID | Engine Implementation | Automated Test Assertions |
| :--- | :--- | :--- |
| **TOP-01** | `src/engine/board.ts`: 19 axial hexes in 3-4-5-4-3 pointy-top grid, 18 number discs with frequency pips, Desert inspector placement. | `src/engine/__tests__/board.test.ts`: Layout, frequencies, inspector placement. |
| **TOP-02** | `src/engine/board.ts`: 54 intersections, 72 path edges, 114 cutout slots, 2-path distance rule graph validator, 9 coastal harbors with trade ratios. | `src/engine/__tests__/board.test.ts`: Graph degrees, planar connectivity, cutouts, distance rule, harbor ratios. |
| **SET-01** | `src/engine/setup.ts`: First Game fixed starting pieces (1 Town, 1 City, 2 Roads per player; Blue omitted in 3P). | `src/engine/__tests__/setup.test.ts`: Starting pieces, 3P blue omission, starting GF 12/9. |
| **SET-02** | `src/engine/setup.ts`, `reducer.ts`: Standard Variable Draft mode with random hexes, A–R spiral number discs skipping Desert, 2-round snake draft. | `src/engine/__tests__/setup.test.ts`: Standard setup initialization; `reducer.test.ts`: Full snake draft replay. |
| **SET-03** | `src/engine/setup.ts`, `reducer.ts`: Starting City grants 1 Resource per non-desert adjacent hex + 1 Science card; Towns grant 0. Conservation invariant holds. | `src/engine/__tests__/setup.test.ts`: Initial hands, card sum conservation (95 resource cards, 20 science cards). |
| **SET-04** | `src/engine/setup.ts`: Event Bag starts with 43 brown discs, 0 green discs. 36 green discs in 4P, 27 in 3P (9 removed) dealt 9 per player under renewable plant sockets. | `src/engine/__tests__/setup.test.ts`: Brown bag distribution, dealt green discs per player. |
| **GF-01** | `src/engine/footprint.ts`: Local Footprint formula: `LF = 1*Town + 2*City + 1*Fossil - 1*Renewable`. | `src/engine/__tests__/setup.test.ts`: LF math and deltas on builds/upgrades/demolitions. |
| **GF-02** | `src/engine/footprint.ts`: Global Footprint endpoint clamping: `0..28` (4P) / `0..21` (3P) with `trueTotalLF` tracking and draw band lookups. | `src/engine/__tests__/setup.test.ts`: Clamping upper/lower endpoints, 4 draw bands. |
| **RED-01 / PRNG-01** | `src/engine/actions.ts`, `src/engine/reducer.ts`, `src/engine/prng.ts`: Pure functional state reducer `applyAction`, `legalActions` generator, JSON round-trip equality, deterministic replay, `IllegalActionError`, and O(1) `Mulberry32PRNG.fromState` state restoration. | `src/engine/__tests__/reducer.test.ts`: JSON serialization, multi-turn deterministic replay with 100% component conservation (95 resources, 20 science, pieces), illegal action rejection, PRNG calls tracking, and 12+ turn bit-for-bit stream parity against continuous reference generator. |

---

## Instructions for Milestone 2 (`goal/03-rules-engine-complete`)
The core geometric, topological, state, and reducer foundations are complete and verified. Milestone 2 can now build upon these contracts:
1. **Event Phase Resolution (`src/engine/events.ts`, `src/engine/event-resolvers.ts`)**: Implement drawing locked count of event discs from bag, track advancement, trigger resolution for all 7 event tracks, and the universal tie-breaker prompt queue.
2. **Production Phase (`src/engine/production.ts`)**: Implement dice rolls (2-12), Town/City/Plant payouts (Town: 1, City: 1+1 science, Plant: 1 energy up to 5 cap), Hazard auto-clearing preserving hazards on buildings under Inspector, and roll of 7 (discard half hand if >7 cards or >10 with warehouse, move inspector, steal card).
3. **Action Phase (`src/engine/build.ts`, `src/engine/energy-trades.ts`, `src/engine/longest-road.ts`)**: Implement road, town, city, fossil plant, renewable plant, warehouse, dev card buying/playing, energy spending, trading (domestic, supply, harbor), and continuous longest trade route solver.
4. **Victory & Fuzzing (`src/engine/victory.ts`, `src/engine/__tests__/fuzz.test.ts`)**: Dual victory conditions (10 VP on own turn vs Empty Bag Renewable Balance) and 500-game `fast-check` fuzzing suite.
