# Catan: New Energies — Tabletop UI Design Style Specification

This specification analyzes `UI-design-style.png` in detail to guide the browser-playable tabletop implementation of **Catan: New Energies**, replicating its authentic physical overhead tabletop aesthetic, Ian O'Toole's clean modern graphic design, and tactile 3D wooden/cardboard game components.

---

## 1. Overall Tabletop Composition & Camera Perspective

- **Top-Down Overhead Tabletop View**:
  - The entire viewport represents a physical gaming table seen from directly overhead ($90^\circ$ top-down orthographic or slight perspective tilt with crisp drop shadows).
  - **Tablecloth Surface Background**:
    - Woven **black, white, and mid-grey gingham / buffalo plaid tablecloth** (`#1e2022` dark charcoal squares, `#e8eaed` warm off-white squares, and `#7c8288` cross-weave intersection squares, approx. `48px`–`64px` grid repeat with subtle fabric weave noise).
    - Provides high contrast that makes the bright cyan ocean frame, white hex borders, and colorful wooden tokens pop visually.
- **Spatial Layout Zones**:
  1. **Center Stage**: Circular 6-piece interlocking sea frame surrounding the 19-hex island of Catan.
  2. **Four Corner Player Stations**: Individual **Player Boards** anchored at the top-left, bottom-left, bottom-right, and top-right corners of the table, complete with seated wooden piece reserves, green event disc stacks, warehouse tiles, and player hands/played Cleanup cards.
  3. **Right Table Margin (Supply & Event Bag)**:
     - Fanned/stacked **Resource Cards** (5 types) and **Science Cards** (`lightbulb` icon), face-up.
     - Face-down **Development Card** deck (`sunrise over lake/hills` card back).
     - Tactile off-white canvas **Event Disc Bag** with drawstring (`#ecebe6`) for interactive disc drawing animations.
  4. **Left Table Margin (Token & Special Tile Reserve)**:
     - **Cleanest Environment** and **Longest Trade Route** special 2-VP tiles.
     - Pile of grey cog-shaped **Hazard Tokens**.
     - Pile of yellow lightning-bolt **Energy Tokens**.
     - Two wooden **Dice** (1 warm cream pipped die `#e6ccb2`, 1 bright green pipped die `#3cb043`).

---

## 2. Central Island Board & Hex Art Style (Ian O'Toole Aesthetic)

### 2.1 Hex Geometry & White Borders
- **Pointy-Top or Flat-Top Orientation**: In `UI-design-style.png`, the 19 hexes sit with **vertical left/right edges (pointy-top hexes)** and thick, crisp **white roads/path channels (`#f4f5f0`, `6px`–`8px` width)** separating every hex.
- Each intersection forms a clear circular junction node where Towns, Cities, and their adjoining Power Plant cutouts sit cleanly.

### 2.2 Terrain Hex Illustrations & Color Palette
Each terrain hex features stylized, modern flat-vector architectural/topographic illustration with subtle texture and diagonal roads/rivers:
| Terrain Type | Resource Produced | Primary Hex Palette | Visual Motifs in `UI-design-style.png` |
| :--- | :--- | :--- | :--- |
| **Forest** (4x) | Lumber | Deep pine green (`#264631`, `#345e40`) | Dense dark-green conifer/deciduous canopy with logging clearings and winding dirt tracks. |
| **Hills** (3x) | Brick | Terracotta / burnt sienna (`#b65c3b`, `#d07a57`) | Stepped concentric quarry terraces in warm reddish-brown clay. |
| **Pasture** (4x) | Natural Fiber | Fresh meadow green (`#789c44`, `#93b858`) | Patchwork fenced paddocks, winding country lanes, and grazing fields. |
| **Fields** (4x) | Food | Golden harvest yellow (`#dfb441`, `#caa032`) | Parallel plowed golden agricultural strips and circular pivot-irrigation crop circles. |
| **Mountains** (3x) | Steel | Slate blue-grey (`#5e6978`, `#8a95a5`, `#3b424c`) | Sharpfaceted geometric mountain ridges with snow-dusted peaks and dark industrial mine shafts. |
| **Desert** (1x) | Nothing | Warm sand beige (`#dcd0b4`, `#c5b492`) | Arid sweeping sand dunes with wind-rippled ridge lines (home to the grey **Environmental Inspector** pawn). |

### 2.3 Number Discs (18 Circular Chits)
- **Appearance**: Cream/ivory cardboard circles (`#f3efe2`) with a subtle drop shadow, centered on each non-desert hex.
- **Typography & Pip Dots**:
  - **Number Value**: Clean geometric sans-serif numeral in dark charcoal (`#22252a`), or crimson red (`#c93b2b`) for high-probability `6` and `8`.
  - **Probability Pips**: Small dots directly below the number (`1` dot for 2/12 up to `5` dots for 6/8).
  - **Subtle Center Hole / Ring**: Matches the physical token punch-out aesthetic so the hex remains recognizable even when a grey cog Hazard Token sits over the disc.

---

## 3. Sea Frame, Tracks & Harbors

- **Ocean Frame**:
  - Vibrant coastal gradient from bright turquoise-blue (`#66b3e6`) near the white shoreline to deeper azure (`#3982c4`) at the outer rim, accented with subtle white contour wave lines, tiny sailboats, and compass rose markings.
  - Interlocking **jigsaw puzzle tabs** visible between the 6 frame segments.
- **Harbors (9 Ports)**:
  - Printed along the white coastline with dashed ferry lines connecting to the two coastal intersections:
    - `3:1` Generic ports and `2:1` Resource-specific ports (displaying the resource icon: Lumber logs, Brick clay, Natural Fiber spool, Food crate, Steel I-beams).
- **Victory Point (VP) Track (Top Frame Arc)**:
  - Green coastal island strip at the `12 o'clock` frame edge containing circular stone spaces numbered `1` through `10`.
  - Holds the 4 players' cylindrical wooden **VP Markers** (Blue, Yellow/Orange, Purple, Pink).
- **Global Footprint (GF) Track (Top-Right Frame Arc)**:
  - Segmented curved meter running from `0` to `28` (4-player side) or `0` to `21` (3-player side), color-coded by environmental severity:
    - **Spaces `0–5`**: Bright green (`#4ea845`) with a `2-disc` green draw indicator.
    - **Spaces `6–9`**: Light lime green (`#84bd47`) with a `1-disc` draw indicator.
    - **Spaces `10–17`**: Olive / yellow-brown (`#9e9a43` to `#8d7546`) with a `1-disc` draw indicator.
    - **Spaces `18–23`**: Dusty brown (`#7d674e`) with a `2-disc` draw indicator.
    - **Spaces `24–28`**: Dark smog brown-grey (`#5e4f42`) with a `3-disc` draw indicator.
  - Tracked by a small **black cube/cylinder Global Footprint Marker**.
- **Event Disc Islands on the Frame Perimeter**:
  - **Left Rim (Green / Lush Islands)**:
    - **Climate Conference** (3 circular slots, mixed green/brown island at `10 o'clock`).
    - **Sustainable Production** (3 circular slots, lush green island at `9 o'clock`).
    - **Government Funding** (3 circular slots, lush green island at `7–8 o'clock`).
  - **Bottom & Right Rim (Brown / Barren Rocky Islands)**:
    - **Rain and Flooding** (4 circular slots, muddy brown island at `6 o'clock`).
    - **Production Increase** (3 circular slots, rocky brown island at `5 o'clock`).
    - **Environmental Pollution** (3 circular slots, rocky brown island at `4 o'clock`).
    - **Air Pollution** (3 circular slots, rocky brown island at `3 o'clock`).

---

## 4. Wooden Pieces, Power Plants & Tokens

All pieces on the board use a **3D bevel/extrusion + tabletop drop-shadow** treatment so they look like painted wooden/cardboard pieces resting on the board:

1. **Player Colors**:
   - **Yellow / Amber** (`#f0b418`, border `#b88406`)
   - **Blue** (`#3676c8`, border `#1f4b85`)
   - **Pink / Magenta** (`#d84b8a`, border `#982a5b`)
   - **Purple / Plum** (`#602f6b`, border `#3d1b45`)
2. **Roads**: Rectangular wooden bars (`#f0b418`, etc.) aligned along the white hex edges.
3. **Towns**: Smaller hexagonal/pentagonal wooden buildings sitting on intersections.
4. **Cities**: Larger hexagonal/clustered wooden buildings sitting on intersections.
5. **Power Plants (Attached to Towns/Cities inside Hex Cutouts)**:
   - **Fossil Fuel Power Plant**: Dark brown circular token (`#3d2b1f`) with a **yellow lightning bolt** in the center, tucked right against the Town/City inside the adjacent land hex corner.
   - **Renewable Power Plant**: Bright green circular token (`#2e8540`) with a **yellow lightning bolt** in the center, similarly tucked into the hex corner next to the Town/City.
6. **Environmental Inspector**: Grey wooden pawn/meeple silhouette (`#7a7d82`) standing on a hex number disc (starts on Desert; shown on the `10` Forest hex on the right of `UI-design-style.png`).
7. **Hazard Tokens**: Grey jagged cog/cloud cardboard rings (`#8c8f94` with darker grey pollution speckling and a center hole).
8. **Energy Tokens**: Bright yellow 3D wooden lightning bolts (`#f5d016`).

---

## 5. Player Boards & Card Design

### 5.1 Player Board Layout (4 Corners of the Viewport)
Each Player Board is a landscape rectangular dashboard illustrating a coastal valley transitioning from industrial smokestacks on the left to clean wind turbines and solar arrays on the right:
- **Top Bar (Towns, Cities & Roads Reserve)**:
  - Left side: **4 Town slots** (each revealing a `+1` pollution cloud icon when built) and **3 City slots** (each revealing two `+1` pollution cloud icons when built).
  - Top edge: **Road sticks** lined up above the board.
  - Right edge: Building cost reminders (`Road`, `Town`, `City`, `Development Card`).
- **Bottom-Left Zone (Fossil Fuel Power Plants)**:
  - Industrial factory illustration with **6 circular slots** holding brown Fossil Fuel Power Plant tokens (`Cost: 1 Science`). Each uncovered slot reveals a `+1` pollution icon.
- **Bottom-Center Zone (Warehouse & Energy Storage)**:
  - Square **Warehouse Tile** slot (`Cost: 2 Energy`, displays `<= 7` cards default or `<= 10` cards when flipped/upgraded).
  - **5 yellow lightning bolt spaces** along the bottom middle to hold the player's current Energy (visually enforcing the 5-Energy cap).
- **Bottom-Right Zone (Renewable Power Plants & Green Event Discs)**:
  - Wind turbine / green hills illustration with **9 circular slots** (`Cost: 3 Science`) arranged in a $3 \times 3$ grid.
  - Each slot holds a face-down **Green Event Disc** topped by a green **Renewable Power Plant** token. Removing both exposes a green `-1` footprint icon.

### 5.2 Card Styling
- **Resource & Science Cards**: White-bordered mini/standard cards with central diamond/rounded-square framed illustrations and corner resource icons:
  - **Lumber**: Yellow-gold background with stacked timber logs.
  - **Brick**: Terracotta-orange background with stacked clay bricks.
  - **Natural Fiber**: Fresh green background with white cotton/fiber spools.
  - **Food**: Olive-gold background with harvest crates/produce.
  - **Steel**: Cool grey-blue background with steel I-beams.
  - **Science**: Dark slate-green background with a glowing white lightbulb icon.
- **Development Cards**:
  - Back: Serene sunrise over coastal mountains and water.
  - Front: Top illustration banner, bold title (`CLEAN UP`, `ROAD CONSTRUCTION`, etc.), and crisp rules text box on a white card body.

---

## 6. UI/UX Implementation Guidelines for Browser Playability

1. **Authentic Tabletop Viewport + HUD Convenience**:
   - Render the **full tabletop view** (gingham tablecloth, circular island board in center, 4 corner player boards, supply stacks on right, token piles on left) using crisp SVG/Canvas + HTML/CSS layers.
   - Allow smooth zoom/pan or responsive scaling so the entire table fits comfortably on 1080p/1440p screens while keeping every number disc, power plant icon, and card legible.
   - Provide an unobtrusive **Active Player Dock / Action Bar** at the bottom center (or expandable overlay) so the human player can inspect their cards, see exact Local Footprint (`LF`), Energy (`0–5`), Victory Points (`VP`), and click one-tap actions (`Roll Dice`, `Draw Event Disc`, `Build Road/Town/City/Plant/Warehouse`, `Buy/Play Dev Card`, `Spend Energy`, `Trade`, `End Turn`).
2. **Interactive Highlighting on the Tabletop**:
   - When placing a Road, Town, City, Power Plant, Hazard Token, or moving the Environmental Inspector, highlight valid intersections, paths, or hex cutouts directly on the board with pulsing rings (matching the rulebook's green valid circle indicators).
3. **Tactile Event Bag & Dice Animations**:
   - Clicking the canvas **Event Disc Bag** on the right margin animates pulling a brown or green disc out of the bag and sliding it onto the matching coastal island track on the sea frame.
   - Triggering an event (filling the 3rd or 4th slot) pops a clean tabletop card/modal announcing the event rule and highlighting affected players.
4. **Bot & Multiplayer Clarity**:
   - Each of the 4 corner Player Boards updates in real time as human or Bot players build pieces, exposing `+1`/`-1` LF icons and moving the black Global Footprint marker and colored VP cylinders along the frame tracks.
   - Include a collapsible **Game Log / Turn Ticker** so fast bot actions (event draws, dice rolls, trades, builds) are easy to follow.
