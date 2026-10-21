# Handover: 01 — Planning, Rules Analysis & Tabletop UI Design

## Status
| Task | Status | Evidence (Command Output) |
| :--- | :---: | :--- |
| **1. Read `rules.txt` (`rules_text.txt`) to understand board game objectives and constraints** | **done** | `Get-Item docs/rules-summary.md \| Select-Object Name, Length; (Get-Content docs/rules-summary.md).Count` $\rightarrow$ `rules-summary.md 14482`, `186` lines. |
| **2. Analyse `UI-design-style.png` for tabletop aesthetic & art style** | **done** | `Get-Item docs/ui-design-spec.md \| Select-Object Name, Length; (Get-Content docs/ui-design-spec.md).Count` $\rightarrow$ `ui-design-spec.md 12854`, `152` lines. |
| **3. Create an implementation plan with specific and achievable tasks** | **done** | `Get-Item docs/implementation-plan.md \| Select-Object Name, Length` $\rightarrow$ `implementation-plan.md 14055` (4 milestones, 10 verifiable tasks). |

### Verification Output (`Get-ChildItem docs/, handover/ | Select-Object Name, Length; git log -n 4 --oneline`)
```text
750dc9e docs: add phased implementation plan for Catan New Energies
6df7965 docs: add tabletop UI design specification and reference image
50ae894 docs: add complete Catan New Energies rules specification and progress log
1adaabe added rules.txt
Name                   Length
----                   ------
implementation-plan.md  14055
rules-summary.md        14482
ui-design-spec.md       12854
progress.md              1265
```

---

## State
- **Branch**: `goal/01-planning-and-design`
- **Last commit**: `750dc9e` (`docs: add phased implementation plan for Catan New Energies`) prior to committing this handover file.
- **How to run the project**: Currently in specification & architecture phase (no runtime dependencies installed yet). Milestone 1 (`goal/02-core-engine-and-board`) initializes the Vite + TypeScript + Vitest workspace (`npm install`, `npm run dev`, `npx vitest run`).
- **New dependencies**: None added in this goal.

---

## Decisions and Assumptions Made
1. **Rules File Path (`rules_text.txt` vs `rules.txt`)**:
   - The prompt referenced `rules.txt`, while the repository contained `rules_text.txt` (committed in `1adaabe` with message `added rules.txt`). Read `rules_text.txt` in full (1,153 lines).
2. **Building Costs & Global Footprint Track Thresholds**:
   - In the physical Catan: New Energies rulebook, building costs are printed as icons on the Player Boards rather than in the body text of `rules_text.txt`. Cross-referenced `UI-design-style.png` and official rules to document exact costs:
     - **Road**: `1 Lumber + 1 Brick`
     - **Town**: `1 Lumber + 1 Brick + 1 Natural Fiber + 1 Food` (`+1 LF`, `+1 VP`)
     - **City**: `2 Food + 3 Steel` (upgrades Town; `+1 net LF`, `+1 net VP`)
     - **Development Card**: `1 Food + 1 Natural Fiber + 1 Steel`
     - **Fossil Fuel Power Plant**: `1 Science` (`+1 LF`, max 1 power plant built per turn)
     - **Renewable Power Plant**: `3 Science` (`-1 LF`, uncovers 1 Green Event Disc into the bag, max 1 power plant built per turn)
     - **Warehouse**: `2 Energy` (increases hand limit on a roll of `7` from `7` to `10` cards)
   - Similarly read the Global Footprint track spaces directly from the sea frame in `UI-design-style.png`: 4P track runs `0–28` (starts at `12`, draws `2` discs at `0–5`, `1` disc at `6–17`, `2` discs at `18–23`, `3` discs at `24–28`); 3P track runs `0–21` (starts at `9`, draws `2` discs at `0–5`, `1` disc at `6–13`, `2` discs at `14–17`, `3` discs at `18–21`).
3. **Architecture & Multiplayer Strategy**:
   - Selected a pure TypeScript + Vite + Vitest architecture with a deterministic engine (`src/engine/`) decoupled from the SVG/HTML5 overhead tabletop renderer (`src/ui/`). This allows the same rules engine to power AI bot simulations, local pass-and-play, and WebRTC/PeerJS room-code multiplayer with friends.

---

## Blocked or Open Issues
- None. All tasks in this goal completed and verified.

---

## Files Changed
- `UI-design-style.png` (tracked existing untracked reference image)
- `docs/rules-summary.md` (created — complete rules & mechanics reference)
- `docs/ui-design-spec.md` (created — overhead tabletop visual specification)
- `docs/implementation-plan.md` (created — 4-milestone implementation roadmap)
- `handover/progress.md` (created — per-task progress log)
- `handover/01-planning-and-design.md` (created — this handover document)

---

## Next Goal

```markdown
/goal Catan New Energies — Milestone 1: Project Scaffold, Hex Graph Topology & Core State

## Outcome
Initialize the TypeScript + Vite + Vitest workspace and implement the complete Catan: New Energies board coordinate graph (19 hexes, 54 intersections, 72 path edges, 9 harbors, power plant cutouts), game state types, First Game & Standard Game setup modes (3-player and 4-player), and Local/Global Footprint calculators with full unit test coverage.

## Prior handover
- handover/01-planning-and-design.md
- Specs: docs/rules-summary.md, docs/ui-design-spec.md, docs/implementation-plan.md

## Environment
- Working directory: C:\Users\Jen\Documents\Strata\Workspace\catan-new-energies-argon
- Git repo: Y
  (If Y: work on branch `goal/02-core-engine-and-board`, commit after each task, never push, never force.)
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
1. Initialize Vite + TypeScript + Vitest project (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`).
   - Check: `npm run build` and `npx vitest run` exit with code 0.
2. Implement Hex Grid, Intersections, Paths & Harbors Graph (`src/engine/types.ts`, `src/engine/board.ts`) with 19 hexes, 54 intersections, 72 path edges, 3 hex cutouts per intersection for power plants, and 9 harbors matching `UI-design-style.png`.
   - Check: `npx vitest run src/engine/__tests__/board.test.ts` passes all topology assertions.
3. Implement Game State, Player Boards, Setup Modes (First Game fixed layout & Standard Game variable snake draft for 3P and 4P), and Local/Global Footprint calculators (`src/engine/setup.ts`, `src/engine/footprint.ts`).
   - Check: `npx vitest run src/engine/__tests__/setup.test.ts` passes all setup, starting hand, event bag (43 brown discs, green discs under renewable plants), and footprint assertions.

## Done when
- `npm run build` succeeds with 0 errors.
- `npx vitest run` passes all tests in `board.test.ts` and `setup.test.ts`.

## Finish
After the last task, re-run every item in "Done when". Then write handover/02-core-engine-and-board.md with:
- Status: each task as done / partial / blocked, with the evidence (command output)
- State: branch, last commit, how to run the project
- Decisions and assumptions made, and why
- Blocked or open issues
- Files changed
- Next goal: a ready-to-paste /goal block in this exact template, with "Prior handover" filled in

Only report what you verified. Mark anything unverified as "unverified".
```
