# Catan: New Energies — Tabletop UI Design Style Specification

This specification analyzes `UI-design-style.png` (an overhead photograph of the physical board game at `1203x677`) to guide our browser-playable tabletop implementation of **Catan: New Energies**. It distinguishes between **directly observed visual elements in the reference image**, **design assumptions/color tokens (`src/ui/theme.ts`)**, and **practical browser UX/accessibility adaptations**.

---

## 1. Reference Image Analysis (`UI-design-style.png`)

### 1.1 Directly Observed Tabletop Composition
- **Overhead Perspective & Lighting**:
  - Photographed from directly overhead with a very slight natural camera perspective and warm indoor lighting casting soft, short drop shadows to the bottom-right of every piece and card pile.
- **Buffalo-Plaid / Gingham Tablecloth**:
  - Woven black/charcoal, warm white, and mid-grey intersecting plaid squares.
  - **Scale**: Each square is approximately $\frac{1}{24}$ of the circular board's diameter (roughly `25px`–`30px` per square when the board renders at `650px`–`720px` diameter).
- **Central Circular Board**:
  - 19 pointy-top land hexes in a `3-4-5-4-3` layout seated inside a continuous **white base lattice / road channel tray** (`~6px–8px` path width), surrounded by an interlocking blue ocean jigsaw frame.
  - **First Game Setup Layout Visible in Image**:
    - **Row 1 (top, 3 hexes)**: Hills (`2`), Pasture (`3`), Forest (`10`).
    - **Row 2 (4 hexes)**: Fields (`4`), Mountains (`6`), Fields (`5`), Hills (`8`).
    - **Row 3 (middle, 5 hexes)**: Desert (leftmost, empty), Pasture (`9`), Hills (`11`), Pasture (`4`), Forest (rightmost, with the grey **Environmental Inspector** pawn standing on its number disc).
    - **Row 4 (4 hexes)**: Pasture (`6`), Mountains (`3`), Mountains (`9`), Fields (`10`).
    - **Row 5 (bottom, 3 hexes)**: Forest (`5`), Fields (`8`), Forest (`11`).
- **Sea Frame Tracks & Islands**:
  - **12 o'clock Green Island (VP Track)**: Numbered stone circles holding the 4 colored wooden cylinder VP markers (Blue, Purple, Yellow/Orange at `10`).
  - **1–2 o'clock Diagonal Track (Global Footprint Track)**: Segmented curved strip transitioning from bright green at the top-left (`0`) through lime/olive to brown/grey at the bottom-right, with a small **black cube marker** near the lower-right end.
  - **Coastal Event Disc Islands**:
    - **Left Rim (Green Islands)**: Three lush green islands at roughly `10 o'clock` (3 circular slots), `9 o'clock` (4 circular slots), and `7–8 o'clock` (3 circular slots).
    - **Right & Bottom Rim (Brown Rocky Islands)**: Four barren brown islands at roughly `3 o'clock` (3 slots), `4:30` (4 slots), and two islands around `5:30–6:30` (3 slots and 4 slots), several holding drawn brown event discs.
  - **Harbors on the Sea**: Ratio labels (`3:1` and `2:1` with resource icons) printed directly on the blue sea water outside the coastal intersections.
- **Surrounding Tabletop Zones in the Photo**:
  - **Player Boards**: Three player boards are visible in `UI-design-style.png`—top-left (Yellow/Orange, partially cropped), bottom-left (Blue), and bottom-right (Pink)—and a dedicated high-resolution close-up is provided in `player-mat-reference.png` (showing the Pink Player Mat in full detail):
    - **Top Bar (Towns & Cities Reserve)**:
      - **Top-Left**: `5` Town slots in a row (`4` holding pink wooden Towns with a single circular power-plant cutout, `1` uncovered slot revealing a grey `+` pollution cloud icon) flanked on the far left by the vertical Town cost column (`1 Lumber`, `1 Brick`, `1 Food`, `1 Natural Fiber`).
      - **Top-Right**: `4` City slots in a row (`3` holding pink wooden Cities with 3 circular power-plant cutouts around their perimeter, `1` uncovered slot revealing **two stacked `+` pollution cloud icons**) flanked on the far right by the vertical City cost column (`2 Food`, `3 Steel`).
    - **Upper-Middle Landscape & Cost Illustrations**:
      - **Upper-Left**: Development Card illustration (sunrise over lake) with its 3 resource cost icons (`1 Food`, `1 Natural Fiber`, `1 Steel`).
      - **Center**: Wide twilight highway overpass / bridge illustration with the Road cost icons (`1 Lumber`, `1 Brick`) at its top-left corner.
    - **Bottom-Left Zone (Fossil Fuel Power Plants)**:
      - Industrial factory with two tall striped smokestacks emitting white smoke plumes.
      - `6` circular slots arranged in `2 rows x 3 columns` holding dark-brown wooden Fossil Fuel Power Plant cylinders (with yellow lightning bolts). Uncovered slots reveal a `+` pollution cloud icon.
      - Far bottom-left corner shows the cost badge: `1 Science` (single lightbulb icon).
    - **Bottom-Center Zone (Warehouse Tile, Energy Actions & 5-Bolt Energy Bar)**:
      - **Warehouse Tile Slot** (middle-left): Square tile showing `2 Energy` lightning bolts + flip-tile arrow icon (`Cost: 2 Energy`; flips to `<= 10` hand limit when built).
      - **Energy Action Reference Icons** (middle-right, along the power line pylons):
        1. `2 Energy` bolts $\rightarrow$ Take `1` Resource/Science card from supply.
        2. `1 Energy` bolt $\rightarrow$ Remove `1` grey cog Hazard token.
        3. `1 Energy` bolt $\rightarrow$ Demolish `1` black/brown Fossil Fuel Power Plant (`x1` per turn badge).
      - **5-Slot Energy Storage Bar**: Yellow rectangular strip with `5` recessed white lightning-bolt silhouettes (`max 5 Energy`).
      - **Bottom-Center Limit Badge**: `[Brown Plant] (x1) [Green Plant]` reminder that at most `1` Power Plant (Fossil OR Renewable) may be built per turn.
    - **Bottom-Right Zone (Renewable Power Plants & Green Event Discs)**:
      - Lush green hills with tall white wind turbines extending up the right side of the board.
      - `9` circular slots arranged in `2 columns of 3` (left/middle) + `1 column of 4` (rightmost column, with the 9th slot at the top-right) holding face-down **Green Event Discs** topped by dark-green wooden **Renewable Power Plant** cylinders (with yellow lightning bolts). Removing a plant + disc reveals a green `-` footprint icon.
      - Far bottom-right corner shows the cost badge: `3 Science` (three stacked lightbulb icons).
  - **Left Margin**: *Cleanest Environment* card, two face-up played *Clean Up* cards and one *Road Construction* card, a pile of grey cog-shaped **Hazard tokens**, a cluster of yellow 3D lightning-bolt **Energy tokens**, and a cream pipped die (the second green pipped die rests near `11 o'clock` by the VP island).
  - **Right Margin**: Five fanned face-up **Resource card** piles (Lumber, Brick, Natural Fiber, Food, Steel), one face-up **Science card** pile (dark green with white lightbulb), a face-down **Development card** stack (sunrise-over-lake back), and the off-white cloth **Event Disc Bag** with drawstring.
  - **Natural Tabletop Jitter**: Card piles and loose tokens sit at slight organic angles ($\pm 2^\circ\text{–}6^\circ$) with soft shadows, giving the scene an authentic "friends around a real table" feel.

---

## 2. Theme Token Palette (`src/ui/theme.ts`)

Because exact hex codes cannot be extracted lossless from a camera photo under warm indoor lighting, the following curated color tokens (`src/ui/theme.ts`) are standardized as our design palette to faithfully evoke Ian O'Toole's clean vector illustration style while maintaining WCAG contrast:

### 2.1 Tablecloth & Board Surfaces
- **Gingham Tablecloth**: Dark weave `#1e2022`, light weave `#e8eaed`, mid-intersection `#7c8288`, square size `28px` (1/24th of board width).
- **White Road Lattice**: `#f4f5f0` with subtle inner bevel `#dcdfd6`.
- **Ocean Frame**: Inner coastal turquoise `#66b3e6` to outer azure `#3982c4`, accented with subtle white wave contour lines (`rgba(255,255,255,0.28)`).

### 2.2 Terrain Hex Vector Styles (Original Procedural SVG Artwork)
All hex artwork is rendered as **original clean vector SVG illustrations** (no copyrighted image scans) inspired by modern topographic/architectural board game design:
| Terrain | Resource | Primary Fill | Secondary / Accent | Vector Motif |
| :--- | :--- | :---: | :---: | :--- |
| **Forest** | Lumber | `#264631` | `#345e40`, `#1b3323` | Layered conifer canopy clusters + winding logging trail |
| **Hills** | Brick | `#b65c3b` | `#d07a57`, `#8f4226` | Stepped concentric quarry terraces |
| **Pasture** | Natural Fiber | `#789c44` | `#93b858`, `#5c7a30` | Patchwork fenced paddocks & meadow lanes |
| **Fields** | Food | `#dfb441` | `#caa032`, `#f0ca62` | Parallel golden harvest strips & circular crop rings |
| **Mountains** | Steel | `#5e6978` | `#8a95a5`, `#3b424c` | Faceted geometric peaks with snow caps & mine portal |
| **Desert** | None | `#dcd0b4` | `#c5b492`, `#ebe2cc` | Sweeping wind-rippled sand dunes |

### 2.3 Player Colors & Color-Blind Accessibility Badges
In `UI-design-style.png`, the 4 player colors are **Yellow/Amber**, **Blue**, **Pink/Magenta**, and **Purple/Plum**. Because Pink vs. Purple and Yellow/Orange vs. Pink can be difficult to distinguish for players with protanopia/deuteranopia (and dark Purple can blend into dark Forest/Mountain hexes), every player piece and board includes:
1. **High-contrast light/dark border stroke** so dark pieces pop against dark hexes.
2. **Distinct geometric emblem/badge** (optional always-on or toggleable Color-Blind Mode):
   - **Yellow / Amber** (`#f0b418`, stroke `#6e4f00`): **Sun / Circle** badge
   - **Blue** (`#3676c8`, stroke `#0f2e59`): **Wave / Diamond** badge
   - **Pink / Magenta** (`#d84b8a`, stroke `#5e1435`): **Triangle / Star** badge
   - **Purple / Plum** (`#6b3578`, outer halo `#f4f5f0`, inner stroke `#2d1236`): **Hexagon / Crown** badge

### 2.4 Power Plants, Number Discs & Tokens
- **Number Discs**: Cream circle (`#f3efe2`, min `28px` diameter on screen), bold numeral (`#c93b2b` red + double outer ring for high-probability `6` and `8`; `#22252a` charcoal for others), probability pips below.
- **Fossil Fuel Power Plant**: Dark brown disc (`#3d2b1f`, border `#8c6239`) with yellow lightning bolt **and** small smokestack sub-icon (secondary cue for color-blind safety).
- **Renewable Power Plant**: Bright green disc (`#2e8540`, border `#8ce09a`) with yellow lightning bolt **and** small leaf/wind sub-icon.
- **Hazard Token**: Grey jagged 8-tooth cog ring (`#8c8f94`, border `#494c52`) with a translucent center opening so the underlying hex or building remains identifiable.
- **Environmental Inspector**: Grey wooden pawn silhouette (`#7a7d82`, highlight `#b0b4ba`, dark base `#3a3d42`).

---

## 3. Practical Browser UX, Viewport Responsiveness & Performance

### 3.1 Responsive Layout (`1366x768` Laptop to `1920x1080+` Desktop)
Fitting a circular board plus 4 full-size player boards simultaneously on a `1366x768` laptop screen would shrink number discs and player board slots below legible sizes. Our layout solves this with a **Hybrid Tabletop + Expandable Corner Station** design:
- **Center Viewport**: The circular island board occupies `75%–85%` of viewport height (`min 600px` diameter), ensuring number discs (`>= 28px`), settlements, power plant cutouts, and harbors are always crisp and clickable. Supports smooth mouse-wheel/pinch zoom and drag-to-pan (with a `Reset View` button).
- **4 Corner Player Stations**:
  - On `>= 1600px` wide viewports, all 4 corner Player Boards render in full miniature tabletop detail.
  - On `1366x768`–`1599px` viewports, opponent corners display **Compact Tabletop Boards** (showing player color/badge, VP, Local Footprint `LF`, Energy bolts `0–5`, hand card-back count, Dev card count, Cleanup count, and built piece counts) that **expand to the full graphic Player Board on hover or click**.
- **Bottom-Center Active Player Dock (HUD)**:
  - Displays the active human player's fanned hand of Resource & Science cards, face-down/playable Development cards, an always-legible **Status Pill (`VP | LF | Global Footprint | Energy | Bag Count`)**, and context-sensitive action buttons (`Draw Event Disc`, `Roll Dice`, `Build`, `Trade`, `Spend Energy`, `Play Dev Card`, `End Turn`).
- **Left & Right Tabletop Margins**:
  - **Right Margin**: Clickable **SVG Event Disc Bag** (with remaining disc counter badge and draw animation), face-up Resource & Science supply stacks, and face-down Development deck.
  - **Left Margin**: *Longest Trade Route* & *Cleanest Environment* tiles, 2 3D-styled dice, Hazard cog pile, Energy bolt pile, and collapsible **Turn & Event Log**.

### 3.2 Hidden Information & Privacy (Hotseat vs. Online vs. Bots)
- **Bot & Online Opponents**: Opponent Resource/Science cards and unplayed Development cards are **never** shown face-up; corners display fanned card backs with numeric badges (backed by engine-level `redactForPlayer(state, viewerId)`). Face-up played *Cleanup* cards remain publicly visible next to each player's station.
- **Local Pass-and-Play (Hotseat)**:
  - Includes a **"Pass Device to [Player Name]" Privacy Curtain** modal between human turns (with an optional toggle for casual open-hand tabletop play). While the curtain is up, the active hand dock is hidden.

### 3.3 Rendering Architecture & Performance
- **Layered SVG + HTML HUD**:
  - **Static Board Layer**: Sea frame, harbors, coastal event island backgrounds, white road lattice, and 19 terrain hex illustrations render into a cached base SVG group (using `<defs>`/`<use>` patterns) so they never re-render during piece hover/animations.
  - **Dynamic Piece Layer**: Roads, Towns, Cities, Power Plants, Hazard cogs, Inspector pawn, Event Discs on tracks, and interactive placement highlight rings render in a lightweight overlay SVG group.
  - **Pre-baked Vector Shadows**: Instead of expensive CSS `drop-shadow()` filters on 100+ DOM nodes, wooden pieces and cards use fast inline SVG offset shadow shapes (`fill="rgba(0,0,0,0.28)"`).
  - **Motion & Bot Pacing Controls**: All animations use GPU-accelerated `transform`/`opacity`, honor `prefers-reduced-motion`, and include a user-adjustable **Bot Speed toggle (`Normal 600ms` / `Fast 150ms` / `Instant`)**.
- **Keyboard & Screen-Reader Accessibility**:
  - Every interactive board target (`[data-hex]`, `[data-node]`, `[data-edge]`, `[data-plant-slot]`) carries `tabindex="0"`, `role="button"`, and descriptive `aria-label` (e.g., `"Intersection 14, adjacent to Forest 10 and Pasture 4 — Click to build Town"`).
