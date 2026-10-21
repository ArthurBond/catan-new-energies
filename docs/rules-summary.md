# Catan: New Energies — Rules & Game Mechanics Specification

This document synthesizes the complete game rules, component inventories, board topology, turn phases, and event mechanics from `rules_text.txt` (with line citations `R L...`) and `UI-design-style.png`, including explicit provenance tags (**CONFIRMED** in rulebook text, **BOARD/IMAGE-DERIVED**, or **CONFIGURABLE ASSUMPTION**) and unambiguous edge-case resolutions for deterministic engine implementation.

---

## 1. Components & Board Topology

### 1.1 Land Hexes (19 Total — CONFIRMED `R L48-49`, `L514-525`)
Arranged in a standard Catan 3-4-5-4-3 hexagonal grid inside 6 double-sided sea frame pieces (`R L34`):
- **4x Forest** $\rightarrow$ Produces **Lumber**
- **3x Hills** $\rightarrow$ Produces **Brick**
- **4x Pasture** $\rightarrow$ Produces **Natural Fiber**
- **4x Fields** $\rightarrow$ Produces **Food**
- **3x Mountains** $\rightarrow$ Produces **Steel**
- **1x Desert** $\rightarrow$ Produces nothing (starts with the **Environmental Inspector**, `R L173`, `L237`)

### 1.2 Number Discs (18 Total — CONFIRMED `R L34-36`, `L208-213`)
- Alphabetized `A` through `R` on the back for spiral placement during Standard Game Setup (`R L208-213`).
- Count distribution (`R L35-36`): `1x, 2x, 2x, 2x, 2x, 2x, 2x, 2x, 2x, 1x` corresponding to standard Catan dice sums (`1x 2`, `2x 3`, `2x 4`, `2x 5`, `2x 6`, `2x 8`, `2x 9`, `2x 10`, `2x 11`, `1x 12` — skipping `7`, `R L485`).

### 1.3 Sea Frame, Harbors, VP Track & Global Footprint Track
- **6 Double-Sided Sea Frame Pieces** (`R L34`, `L115-126`):
  - Assembled by matching puzzle-end numbers. Includes a 3-whale side (3-player game) and a 4-whale side (4-player game).
- **Harbors (9 Total — BOARD/IMAGE-DERIVED + `R L560-571`)**:
  - `R L560-571` confirms `3:1` generic harbors and `2:1` resource-specific harbors (including a lumber port example, `R L569`).
  - `UI-design-style.png` shows 9 coastal port labels around the sea frame:
    - **4x Generic Harbors (`3:1`)**: Trade 3 matching resource cards for 1 card of a **different** resource or 1 science card (`R L562-565`).
    - **5x Specialized Harbors (`2:1`)**: 1 each for Lumber, Brick, Natural Fiber, Food, and Steel. Trade 2 of that specific resource for 1 card of a **different** resource or 1 science card (`R L565-568`).
- **Victory Point (VP) Track (`R L145`, `L163`, `L833`)**:
  - Located on the top green island of the sea frame (`1` through `10`). Every player starts with their VP marker on **space 3** (`R L163`, `L236` — 1 Town + 1 City).
- **Global Footprint (GF) Track (`R L129-131`, `L314-315`, `L598-614`, `L741-747`)**:
  - Tracks the sum of all players' Local Footprints ($\text{GF} = \sum \text{LF}$, `R L599-602`).
  - **Clamping Rule (`R L611-614`)**: If total LF moves below `0` or above the track maximum (`28` for 4P, `21` for 3P), the marker remains clamped at the endpoint (`0` or `28`/`21`) until the true sum of all players' LF rises back above `0` or drops below `28` (`21` for 3P). Engine MUST track both `trueTotalLF` and `clampedGF = clamp(trueTotalLF, 0, maxGF)`.
  - **4-Player Side (4 Whales)**:
    - Starts at **12** ($4 \times 3\text{ LF}$), maximum **28** (`R L131`, `L608-614`).
    - Confirmed anchor points in `rules_text.txt`: decreasing **below 6** (`0–5`) draws additional discs (`R L741-742`); space **21** draws **2** event discs (`R L314-315`).
    - Combined with the color bands visible on the GF track in `UI-design-style.png` (defined as configurable constants in `src/engine/config.ts`):
      - `0–5` (Green band): Draw **2** event discs (`R L741-742`).
      - `6–17` (Lime / Olive band, includes start at `12`): Draw **1** event disc.
      - `18–23` (Brown band, includes `21` per `R L314`): Draw **2** event discs.
      - `24–28` (Dark smog band): Draw **3** event discs.
  - **3-Player Side (3 Whales — CONFIGURABLE ASSUMPTION scaled to max `21`)**:
    - Starts at **9** ($3 \times 3\text{ LF}$), maximum **21** (`R L130`, `L614`).
    - Thresholds in `src/engine/config.ts`:
      - `0–5`: Draw **2** event discs (`R L741-742`).
      - `6–13` (includes start at `9`): Draw **1** event disc.
      - `14–17`: Draw **2** event discs.
      - `18–21`: Draw **3** event discs.

### 1.4 Event Disc Tracks on the Sea Frame (7 Event Tracks — `R L350-370`, `L378-397`)
When an event disc is drawn from the bag, it is placed on the matching event island track on the sea frame (`R L350-351`). When the **last available space** for that event is filled, the event immediately triggers, and **all tokens on that event track are removed from the board and returned to the box (out of the game)** (`R L357-360`).

Track space counts (stored in `src/engine/config.ts`, cross-checked against `R L352-370` and `UI-design-style.png`):
- **Green Event Islands** (left rim of sea frame):
  - **Sustainable Production**: `4` spaces (visible on the 9 o'clock green island in `UI-design-style.png`).
  - **Government Funding**: `3` spaces (visible on the 7–8 o'clock green island in `UI-design-style.png`).
- **Brown/Green Shared Event Island**:
  - **Climate Conference**: `3` spaces (10 o'clock green/brown island; accepts both brown and green Climate Conference discs, `R L394-397`).
- **Brown Event Islands** (bottom and right rim of sea frame):
  - **Rain and Flooding**: `4` spaces (`R L366-370` & 6 o'clock island in `UI-design-style.png`).
  - **Production Increase**: `3` spaces (bottom-right rocky island).
  - **Environmental Pollution**: `4` spaces (**CONFIRMED** `R L352-355`: *"Since only two of four places are occupied, the event is not yet triggered"*).
  - **Air Pollution**: `3` spaces (3 o'clock rocky island in `UI-design-style.png`).

### 1.5 Cards, Tokens & Supply Limits (`R L33-51`, `L55-82`)
- **Resource Cards (95 Total — `19x` each of 5 types, `R L37-42`)**:
  - `Lumber` (Forest), `Brick` (Hills), `Natural Fiber` (Pasture), `Food` (Fields), `Steel` (Mountains).
- **Science Cards (20 Total — `R L33`)**:
  - Produced by Cities alongside normal resources (`R L455-456`). Have the same card back as Resource cards (`R L42-43`), count toward hand size on a roll of `7` (`R L490-491`), can be traded (`R L535`), and can be stolen by the Inspector or Cleanup cards (`R L498`, `L825`).
- **Energy Tokens (20 Total — `R L68`, `L461-462`)**:
  - Yellow wooden lightning bolts. Produced by Power Plants (`R L457-460`).
  - **Hard Cap of 5 Energy per player (`R L461-462`, `L542-543`)**: A player may never hold more than 5 Energy; excess production is ignored, and a player at 5 Energy may not trade for Energy. Energy does **not** count toward hand size on a `7` and cannot be stolen.
- **Hazard Tokens (10 Total — `R L57`, `L409-417`)**:
  - Grey cog-shaped tokens placed on Hexes, Towns, or Cities.
  - **Max 1 Hazard token per location (`R L413`)**.
  - **Mutual Exclusion with Environmental Inspector (`R L414-417`, `L496-497`, `L868-870`)**: A hex with a Hazard token cannot receive the Environmental Inspector, and the hex with the Environmental Inspector cannot receive a Hazard token.
- **Special Victory Point Tiles (2 Total, worth `2 VP` each — `R L55-56`, `L690-696`, `L790-796`)**:
  - **Longest Trade Route (`2 VP`)**: Awarded to the first player to reach a continuous, unbroken path of $\ge 5$ roads (not interrupted by an opponent's town or city, `R L685-696`). Transfers only when another player builds a **strictly longer** continuous route (or if broken by an opponent's town/city, recomputed across all players; if tied for longest $\ge 5$ after a break or no player has $\ge 5$, returned to the supply until a single player holds the longest route $\ge 5$).
  - **Cleanest Environment (`2 VP`)**: Awarded to the first player to have $\ge 3$ face-up played Cleanup cards (`R L790-796`). Transfers only when another player has played **strictly more** Cleanup cards.

### 1.6 Development Cards (25 Total — CONFIRMED `R L46-51`, `L770-830`)
- **Rules (`R L771-786`)**:
  - Bought from the top of the shuffled face-down deck (`1 Food + 1 Natural Fiber + 1 Steel`). If the deck is empty, no more may be purchased (`R L773-774`).
  - Remain hidden until played; do **not** count toward hand limit on a `7`; cannot be traded, given away, or stolen (`R L775-779`).
  - **Play Timing & Limit (`R L780-786`)**: A player may play **at most 1 Development Card per turn** (and it may **not** be a card bought this turn), either:
    1. **Before drawing event disc(s)** in their Event Phase, **OR**
    2. **At any time** during their Action Phase.
- **Deck Breakdown (`25` Cards)**:
  - **14x Cleanup Cards (`R L47`, `L819-829`)**: When played, place face-up in front of you (counts toward *Cleanest Environment*) and choose one:
    1. **Move the Environmental Inspector** (follows normal Inspector rules on `R L496-503`: move to a new hex without a Hazard token and steal 1 random Resource/Science card from a player with a Town/City on that hex); **OR**
    2. **Remove 1 Hazard token** from any Hex, Town, or City **AND** steal 1 random Resource or Science card from a player who has the **same or higher Local Footprint ($\text{LF} \ge \text{yours}$)**. *(If no opponent has $\text{LF} \ge \text{yours}$ or the chosen opponent has 0 cards, the Hazard token is still removed).*
  - **6x Progress Cards (`R L47`, `L784-786`, `L805-818` — removed from game after play)**:
    - **2x Road Construction (`R L805-806`)**: Build up to 2 new roads for free (obeying normal road connection rules; if the player has only 1 road piece left in their reserve, they build 1).
    - **2x High Yield (`R L807-814`)**: Take `1` corresponding resource card from the supply for up to **3 different hexes** that contain at least one of your built **Renewable Power Plants** (ignores Hazard tokens and the Inspector on those hexes; max 1 resource per distinct hex even if you have multiple Renewable Plants on the same hex, `R L811-814`).
    - **2x Research Grant (`R L815-818`)**: Take any `2` cards of your choice from the supply (any combination of Resource and Science cards).
  - **5x Victory Point Cards (`R L50-51`, `L801-804`)**:
    - Kept hidden. Revealed (any number of them at once, free of the 1-card-per-turn play limit and runnable on the turn bought) if, with them, the player reaches $\ge 10$ VPs on their turn to win immediately (`R L801-804`).

### 1.7 Player Boards & Event Disc Bag (`R L54`, `L69-106`, `L274-311`)
Each of the 4 players (`Blue`, `Orange/Yellow`, `Pink`, `Purple`) has a Player Board holding:
- **5 Towns** (1 placed in setup, 4 on player board): Each uncovered town slot exposes `+1 LF` (`R L704-708`).
- **4 Cities** (1 placed in setup, 3 on player board): Each uncovered city slot exposes `+2 LF` (`R L588-589`). Because a City replaces a Town on the island and returns that Town to the player board (covering a `+1 LF` slot), upgrading Town $\rightarrow$ City increases LF by `+1` net and VP by `+1` net (`R L641-654`).
- **12 Roads** (2 placed in setup, 10 on player board): `0 LF`.
- **6 Fossil Fuel Power Plants** (brown tokens): Each uncovered slot exposes `+1 LF` (`R L713-717`).
- **9 Renewable Power Plants** (green tokens): Sit on top of 9 random face-down **Green Event Discs** (`R L281-286`). Building a Renewable Power Plant puts the uncovered Green Event Disc into the Event Bag and exposes `-1 LF` on the player board (`R L730-735`).
- **1 Warehouse Tile**: Starts cost-side up (`2 Energy`, hand limit `<= 7`). When built, flips face-up (`<= 10` hand limit on a `7`, `R L763-769`).
- **Starting Local Footprint (LF)**: `3` per player (`1 Town (+1) + 1 City (+2)`, `R L609-610`).

#### Event Disc Bag Distribution
- **Brown Event Discs (43 Total — CONFIRMED `R L83-93`, all start in the bag `R L140`)**:
  - `9x` Climate Conference
  - `8x` Rain and Flooding
  - `9x` Air Pollution
  - `9x` Production Increase
  - `8x` Environmental Pollution
- **Green Event Discs (36 Total — `R L94-106`, `L281-291`)**:
  - Dealt 9 per player face-down under their Renewable Power Plants (`4 x 9 = 36` in 4P; in 3P, the **9 discs marked with the `4P` indicator** are removed first, leaving `27 = 3 x 9` discs dealt to the 3 players, `R L287-291`).
  - *Note on `rules_text.txt` L94-106*: The PDF text extraction prints `3x Climate conference (1x with 4P) + 12x Sustainable production (4x with 4P) + 12x Government funding (4x with 4P)`, which sums to `27` (the 3-player count) while the header says `36 Green event discs` and the 4P-marked discs sum to `1 + 4 + 4 = 9`. To reconcile `36` total discs with `9` removed in 3P:
    - `12x` Sustainable Production (`4` marked `4P`, `8` base)
    - `12x` Government Funding (`4` marked `4P`, `8` base)
    - `3x` Climate Conference (`1` marked `4P`, `2` base)
    - `9x` Blank / Calm Sea green discs (no event track — or configurable as `12/12/12` in `src/engine/config.ts`; default config uses `12x Sustainable Production (4x 4P)`, `12x Government Funding (4x 4P)`, `12x Climate Conference (1x 4P)` so every drawn disc maps to one of the 3 green-compatible event tracks while removing exactly 9 `4P`-marked discs in 3P to leave 27).

---

## 2. Setup Modes (`R L110-299`)

1. **First Game Setup (Fixed Preset — `R L110-176` & `UI-design-style.png`)**:
   - Fixed 19-hex terrain layout, 18 number discs, and starting Town, City, and 2 Roads per player.
   - In a 3-player game, the Blue starting positions are omitted (`R L170-172`).
   - Each player collects starting Resources from the supply matching each land hex adjacent to their starting **City** (1 card per hex), plus **1 Science card** for their City (`R L167-169`).
2. **Standard Game Setup (Variable Snake Draft — `R L192-271`)**:
   - Random hex placement; number discs placed A–R in an inward spiral starting from a random corner, skipping the Desert (`R L207-213`).
   - Roll dice for first player (`R L239-240`).
   - **Round 1 (Clockwise `1 -> N`)**: Each player places `1 Town` + `1 adjacent Road` (must stay $\ge 2$ paths away from all other towns/cities, `R L241-247`).
   - **Round 2 (Counter-Clockwise `N -> 1`)**: Each player places `1 City` + `1 adjacent Road` (must stay $\ge 2$ paths away from all other towns/cities, `R L248-253`).
   - **Starting Hand**: 1 Resource card per non-desert hex adjacent to the player's **City**, plus **1 Science card** (`R L254-257`).

---

## 3. Turn Structure & Phases (`R L322-800`)

### Phase 1: Event Phase (`R L331-430`, `L855-895`)
1. *(Optional Pre-Draw Dev Card)*: Active player may play 1 Development Card before drawing event discs (`R L782-783`).
2. **Determine Draw Count (`R L342-349`)**: Look up the number of discs to draw from the **clamped Global Footprint marker** at the **beginning** of the Event Phase. Even if a triggered event changes LF/GF mid-phase, the number of discs to draw this turn does **not** change (`R L346-349`).
3. **Draw & Resolve One Disc at a Time (`R L345-374`)**:
   - **Empty Bag Check (`R L371-374`, `L836`)**: If you must draw an event disc and the bag is empty, the game **ends immediately** (proceed to Empty Bag Victory scoring).
   - Place the drawn disc on its matching Event Track on the sea frame.
   - If that track is now full:
     1. Remove all discs from that track from the game (`R L358-360`).
     2. Trigger and completely resolve the event before drawing the next disc:

#### Event Resolution & Tie-Breaker Rules (`R L398-403`, `L855-895`)
- **Universal Tie-Breaker (`R L398-403`, `L855-858`)**:
  - If **all** players have the exact same value for the compared metric (e.g., all players have `LF = 3`, or all have `0` Renewable Plants), **nothing happens** (`R L401-403`, `L858`). *(Note: for Climate Conference, since it compares lowest LF and highest LF, if all players have the same LF, neither the lowest-LF reward nor the highest-LF penalty occurs).*
  - If multiple players tie for highest or lowest (but not all players), **each** tied player takes the action in **clockwise order starting with the active player** (`R L855-858`).

| Event Name | Type | Track Spaces | Mandatory / Optional & Resolution Details (`R L859-895`) |
| :--- | :---: | :---: | :--- |
| **Air Pollution** | Brown | `3` | **Mandatory (`must`)**: Player(s) with **highest LF** must place `1 Hazard token` on one of their hazard-free **Cities**. If all of that player's Cities already have Hazard tokens (or they have no Cities), they must place it on one of their hazard-free **Towns** (`R L860-863`). *(If all their Cities and Towns already have Hazards or the 10-token supply is empty, skip).* |
| **Environmental Pollution** | Brown | `4` | **Mandatory**: Active player rolls the dice (re-rolling any `7` until a non-`7` is rolled) and places `1 Hazard token` on **all** land hexes with that number, **except** a hex containing the Environmental Inspector or already holding a Hazard (`R L864-870`). |
| **Production Increase** | Brown | `3` | **Optional (`may`)**: Player(s) with **highest LF** may build `1 Fossil Fuel Power Plant` for free (does **not** count toward the 1-plant-per-turn limit, `R L657-658`). If they do, they raise their LF by `+1` and take `1 corresponding Resource card` from the hex where they placed the plant (**even if that hex currently has a Hazard token**, `R L872-876`). If they have no valid cutout/hex or no Fossil Fuel Plant in reserve, nothing happens (`R L876-878`). |
| **Rain and Flooding** | Brown | `4` | **Mandatory (`must`)**: **All** players (in clockwise order from active player) must place `1 Hazard token` on one of their hazard-free Towns or Cities (`R L879-881`). |
| **Climate Conference** | Brown / Green | `3` | 1. **Optional Reward (`may`)**: Player(s) with **lowest LF** may take `1 Resource or Science card` of their choice from the supply (`R L883-885`).<br>2. **Mandatory Penalty (`must`)**: Player(s) with **highest LF** must discard `1 Resource or Science card` of their choice (`R L886-887`). |
| **Government Funding** | Green | `3` | **Optional (`may`)**: Player(s) with **lowest LF** may take `1 Development Card` from the supply (`R L888-890`, if deck is non-empty). |
| **Sustainable Production** | Green | `4` | **Optional (`may`)**: Player(s) with the **most built Renewable Power Plants on the board** (`R L404-406`, `L891-894`) may take `1 Resource or Science card` of their choice from the supply. |

---

### Phase 2: Production Phase (`R L447-526`)
1. Roll both dice (`2`–`12`).
2. **If roll is NOT `7` (`R L451-483`)**:
   - Every land hex with that number produces, **unless** it has a **Hazard token** or the **Environmental Inspector** (`R L463-465`, `L504-506`).
   - On producing hexes:
     - **Town** (without a Hazard): produces `1 matching Resource card` (`R L452-454`).
     - **City** (without a Hazard): produces `1 matching Resource card + 1 Science card` (`R L455-456`).
     - **Power Plant** (attached to a Town/City and facing this hex): produces `1 Energy` (up to player's 5-Energy cap) **if and only if** the hex has no Hazard/Inspector **AND** the attached Town/City has no Hazard (`R L457-462`).
   - **Supply Shortage Rule**: If the supply does not have enough of a given Resource, Science, or Energy token to fulfill all production, distribute available copies in clockwise order starting from the active player (or up to remaining supply).
   - **End-of-Production Hazard Auto-Clear (`R L434-439`, `L465-467`, `L474-483`, `L507-509`)**:
     - At the end of the Production Phase, remove **all** Hazard tokens from hexes, towns, and cities whose number was rolled this turn and that failed to produce **due to a Hazard token**.
     - **Crucial Inspector Exception (`R L436-439`, `L507-509`)**: If the **Environmental Inspector** is on the rolled hex, the Inspector blocks production on that hex, so Hazard tokens on towns/cities adjacent to that hex (for that roll) are **NOT** removed! Conversely, if a rolled hex has a **Hex Hazard token** (cannot have the Inspector) and an adjacent City on that hex also has a **City Hazard token**, **both** Hazard tokens are removed at the end of Production (`R L474-479`).
3. **If roll IS `7` (`R L484-509`)**:
   - **Step A — Discard (`R L489-494`, `L766-769`)**: Every player holding $> 7$ cards ($> 10$ cards if their **Warehouse** is active), counting **Resource + Science cards**, must choose and return $\lfloor \text{handSize} / 2 \rfloor$ cards to the supply.
   - **Step B — Move the Environmental Inspector (`R L495-503`)**: The active player **must** move the Inspector to a **new** hex that **does not have a Hazard token**.
   - **Step C — Steal (`R L498-503`)**: The active player chooses one opponent who has a Town or City on the Inspector's new hex and steals `1 random card` from their hand (drawn uniformly from their combined Resource + Science cards).

---

### Phase 3: Action Phase (`R L529-796`)
Actions (Trading, Building/Buying, Energy Uses, and playing up to 1 Dev Card if not already played in the Event Phase) may be taken in **any order** and as often as allowed/affordable (`R L530-531`).

#### A. Trading (`R L532-571`)
- **Domestic Trade (With Other Players — `R L538-550`)**:
  - Active player must be one of the two trading parties.
  - May trade any combination of **Resource cards, Science cards, and Energy** (`R L534-536`).
  - **Restrictions**:
    1. Cannot give cards/energy away for free (both sides of the trade must be non-empty, `R L544`).
    2. Cannot trade matching resources on both sides (e.g., `3 Steel` for `1 Steel`, or `Science` for `Science`, or `Energy` for `Energy`, `R L544-546`).
    3. Cannot receive Energy in a trade if it would exceed `5 Energy` (`R L542-543`).
- **Supply Trade (`R L551-559`)**:
  - `4:1 Resource`: Put `4` identical Resource cards into the supply $\rightarrow$ take `1` card of a **different** Resource or `1` Science card.
  - `3:1 Science`: Put `3` Science cards into the supply $\rightarrow$ take `1` Resource card of choice.
  - `2:1 Energy`: Put `2` Energy into the supply $\rightarrow$ take `1` Resource or `1` Science card of choice.
- **Harbor Trade (`R L560-571`, Resource cards only)**:
  - `3:1 Generic Harbor`: Put `3` identical Resource cards into the supply $\rightarrow$ take `1` card of a **different** Resource or `1` Science card.
  - `2:1 Specialized Harbor`: Put `2` Resource cards matching the harbor's icon into the supply $\rightarrow$ take `1` card of a **different** Resource or `1` Science card.

#### B. Building & Buying (`R L572-786`)
Building costs are printed on the physical Player Boards (`UI-design-style.png`, confirmed via `R L1025-1026` and BGA reference; stored in `src/engine/config.ts`):

| Item | Cost | LF Delta | VP Delta | Per-Turn Limit & Placement Rules |
| :--- | :--- | :---: | :---: | :--- |
| **Road** | `1 Lumber + 1 Brick` | `0` | `0` | Empty path connected to own road, town, or city. **Cannot build a road past an opponent's town or city** (`R L617-620`). Max 12 roads per player. |
| **Town** | `1 Lumber + 1 Brick + 1 Natural Fiber + 1 Food` | `+1` | `+1` | Empty intersection connected to own road, obeying **Distance Rule** ($\ge 2$ paths from all towns/cities, `R L637-639`, `L697-710`). Max 5 towns per player. |
| **City** | `2 Food + 3 Steel` | `+1` (net) | `+1` (net) | Replaces one of your existing Towns on the board (returned to your player board). Any attached Power Plant stays and attaches to the City (`R L641-654`). Max 4 cities per player. |
| **Fossil Fuel Plant** | `1 Science` | `+1` | `0` | Placed in cutout of own Town (max 1 plant) or City (max 3 plants, each facing a different hex) on a **numbered land hex** (never Desert or Sea, `R L655-671`, `L713-717`). **Combined limit: max 1 Power Plant built per turn** (`R L656`). |
| **Renewable Plant** | `3 Science` (`R L1026`) | `-1` | `0` | Same placement + **combined 1-plant-per-turn limit** (`R L656`). Uncovered **Green Event Disc** underneath is placed into the Event Bag (`R L730-735`). |
| **Warehouse** | `2 Energy` | `0` | `0` | Flips Warehouse tile face-up on player board (`R L763-769`). Raises hand limit on a `7` from `7` to `10`. Once per game per player. |
| **Development Card** | `1 Food + 1 Natural Fiber + 1 Steel` | `0` | `0` (or `1` if VP card) | Draw top card of Development deck (`R L771-774`). |

#### C. Energy Uses (`R L718-724`, `L748-762`)
1. **Buy Card (`2 Energy`)**: Return `2 Energy` to supply $\rightarrow$ take `1 Resource or Science card` of choice from supply (`R L752-754`, identical to `2:1` supply trade).
2. **Clean Up Hazard (`1 Energy`)**: Return `1 Energy` to supply $\rightarrow$ remove `1 Hazard token` from **any** Hex, Town, or City of your choice (`R L440-443`, `L755-758`). Unlimited times per turn (as long as you have Energy).
3. **Demolish Fossil Fuel Power Plant (`1 Energy`, Max 1x per Action Phase)**: Return `1 Energy` to supply and return `1` of your built Fossil Fuel Power Plants from the board to your player board (`R L718-724`, `L759-762`). Reduces your LF by `-1` and moves GF marker back `1` space.

---

### Phase 4: End of Turn (`R L797-800`)
- If the active player has not won and the game has not ended, pass the dice and event bag clockwise to the next player, who begins their turn with the Event Phase.

---

## 4. Winning the Game (`R L830-854`)

The game ends **immediately** when either condition occurs:

1. **Condition A — 10 Victory Points (`R L833-834`)**:
   - A player reaches **10 or more VPs** (Towns `1 VP`, Cities `2 VP`, Longest Trade Route `2 VP`, Cleanest Environment `2 VP`, plus any hidden VP Development Cards revealed on their turn) at **any point during their own turn**. That player wins immediately!
2. **Condition B — Empty Event Bag (`R L371-374`, `L836-854`)**:
   - Triggered immediately when a player needs to draw an event disc during the Event Phase and the Event Bag is empty:
     - **Eligibility Rule (`R L837-838`)**: Only players who have built **strictly more Renewable Power Plants than Fossil Fuel Power Plants on the board** ($\text{RenewableBuilt} > \text{FossilBuilt}$) are eligible to win.
     - **Primary Ranking (`R L838-841`)**: Among eligible players, the winner is the player with the **greatest positive difference** ($\text{RenewableBuilt} - \text{FossilBuilt}$).
     - **Tie-Breaker (`R L841-842`)**: If tied on $(\text{RenewableBuilt} - \text{FossilBuilt})$, the tied eligible player with the **most Victory Points** (including unrevealed VP Development Cards in hand) wins. If still tied on VPs, those players share the victory.
     - **Total Collapse (`R L842-844`)**: If **no** player has built more Renewable than Fossil Fuel Power Plants ($\forall p,\; \text{RenewableBuilt}_p \le \text{FossilBuilt}_p$), **all players lose**!
