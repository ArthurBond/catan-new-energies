# Catan: New Energies — Rules & Game Mechanics Specification

This document synthesizes the complete game rules, component inventories, board topology, turn phases, and event mechanics from `rules_text.txt` and `UI-design-style.png`.

---

## 1. Components & Board Topology

### 1.1 Land Hexes (19 Total)
Arranged in a standard Catan 3-4-5-4-3 hexagonal grid inside 6 double-sided sea frame pieces:
- **4x Forest** $\rightarrow$ Produces **Lumber**
- **3x Hills** $\rightarrow$ Produces **Brick**
- **4x Pasture** $\rightarrow$ Produces **Natural Fiber**
- **4x Fields** $\rightarrow$ Produces **Food**
- **3x Mountains** $\rightarrow$ Produces **Steel**
- **1x Desert** $\rightarrow$ Produces nothing (starts with the **Environmental Inspector**)

### 1.2 Number Discs (18 Total)
- Alphabetized `A` through `R` on the back for spiral placement during Variable Setup.
- Distribution: `1x 2`, `2x 3`, `2x 4`, `2x 5`, `2x 6`, `2x 8`, `2x 9`, `2x 10`, `2x 11`, `1x 12`.

### 1.3 Sea Frame & Harbors (6 Frame Pieces)
- **Harbors (9 Total)**:
  - **4x Generic Harbors (`3:1`)**: Trade 3 matching resource cards for 1 resource or science card.
  - **5x Specialized Harbors (`2:1`)**: 1 each for Lumber, Brick, Natural Fiber, Food, and Steel. Trade 2 of that specific resource for 1 resource or science card.
- **Victory Point (VP) Track**: Spaces `1` through `10` on the top frame piece. Players start at **3 VP** (1 Town + 1 City).
- **Global Footprint (GF) Track**:
  - **4-Player Side (4 Whales)**: Starts at **12**, max **28**:
    - `0–5`: Draw **2** green-tinted spaces (high renewable investment bonus draws).
    - `6–9`: Draw **1** event disc.
    - `10–17`: Draw **1** event disc.
    - `18–23`: Draw **2** event discs.
    - `24–28`: Draw **3** event discs.
  - **3-Player Side (3 Whales)**: Starts at **9**, max **21**:
    - `0–5`: Draw **2** event discs.
    - `6–13`: Draw **1** event disc.
    - `14–17`: Draw **2** event discs.
    - `18–21`: Draw **3** event discs.
- **Event Disc Spaces on Frame (7 Event Tracks)**:
  - **Green Events** (3 spaces each to trigger):
    - **Sustainable Production** (3 spaces)
    - **Government Funding** (3 spaces)
  - **Brown/Green Event**:
    - **Climate Conference** (3 spaces)
  - **Brown Events**:
    - **Air Pollution** (3 spaces)
    - **Environmental Pollution** (3 spaces)
    - **Production Increase** (3 spaces)
    - **Rain and Flooding** (4 spaces)

### 1.4 Cards & Supply
- **Resource Cards (95 Total, 19 each)**: Lumber, Brick, Natural Fiber, Food, Steel.
- **Science Cards (20 Total)**: Produced by Cities alongside normal resources; can be traded and count toward hand size on a roll of `7`.
- **Energy Tokens (20 Total)**: Yellow lightning bolts. Produced by Power Plants. Maximum **5 Energy** per player at any time (excess is ignored; cannot trade for energy if at 5). Does **not** count toward hand limit on a `7`.
- **Hazard Tokens (10 Total)**: Grey cog/smog tokens placed on Hexes, Towns, or Cities (max 1 per location).
- **Environmental Inspector (1 Pawn)**: Starts on the Desert. Cannot be moved onto a hex that has a Hazard token, and a hex with the Inspector cannot receive a Hazard token.
- **Special Victory Point Tiles (2 Total, 2 VP each)**:
  - **Longest Trade Route**: First player to reach a continuous road path of $\ge 5$ roads (not broken by an opponent's town/city). Stolen only when strictly exceeded.
  - **Cleanest Environment**: First player to play $\ge 3$ Cleanup cards face-up. Stolen only when strictly exceeded.

### 1.5 Development Cards (25 Total)
- **14x Cleanup Cards**: Choose one when played:
  1. Move the Environmental Inspector to a hex without a Hazard token and steal 1 random Resource/Science card from a player with a Town/City on that hex; **OR**
  2. Remove 1 Hazard token from any Hex, Town, or City **AND** steal 1 random Resource/Science card from a player with the **same or higher Local Footprint (LF)** than you.
  - Placed face-up in front of the player after use (counts toward Cleanest Environment).
- **6x Progress Cards** (removed from game after use):
  - **2x Road Construction**: Build 2 new roads for free.
  - **2x High Yield**: Take 1 resource card from up to **3 different hexes** containing your **renewable power plants**.
  - **2x Research Grant**: Take any 2 cards (any combination of Resource and Science cards) from the supply.
- **5x Victory Point Cards**: Kept hidden; revealed all at once on your turn when they bring your total to $\ge 10$ VP to win immediately.

### 1.6 Player Boards & Event Discs
Each of the 4 players (Blue, Orange/Yellow, Pink, Purple) has a Player Board containing:
- **5 Towns** (1 placed in setup, 4 on board): Each uncovered space exposes `+1 LF`.
- **4 Cities** (1 placed in setup, 3 on board): Each uncovered space exposes `+2 LF` (replacing a Town covers one `+1 LF`, so upgrading Town $\rightarrow$ City nets `+1 LF` and `+1 VP`).
- **12 Roads** (2 placed in setup, 10 on board): No LF impact.
- **6 Fossil Fuel Power Plants** (brown): Each uncovered space exposes `+1 LF`.
- **9 Renewable Power Plants** (green): Sit on top of 9 random face-down **Green Event Discs**. Building a Renewable Power Plant puts the uncovered Green Event Disc into the Event Bag and exposes `-1 LF` on the player board.
- **1 Warehouse Tile**: Starts cost-side up (`2 Energy`, shows `<= 7` hand limit). When built, flips to active (`<= 10` hand limit on a `7`).
- **Starting Local Footprint (LF)**: `3` per player (1 Town `+1` + 1 City `+2`).

### 1.7 Event Disc Bag
- **Brown Event Discs (43 Total, all start in the bag)**:
  - `9x` Climate Conference
  - `8x` Rain and Flooding
  - `9x` Air Pollution
  - `9x` Production Increase
  - `8x` Environmental Pollution
- **Green Event Discs (36 Total, dealt 9 per player under Renewable Power Plants)**:
  - `12x` Sustainable Production (4 marked `4P`, removed in 3-player games)
  - `12x` Government Funding (4 marked `4P`, removed in 3-player games)
  - `3x` Climate Conference (1 marked `4P`, removed in 3-player games)
  - `9x` Blank/No-event or remaining distribution: Note that in rules page 3, Green Event Discs are listed as 36 total (`3x Climate Conference`, `12x Sustainable Production`, `12x Government Funding`, plus 9 additional green discs or distribution across the 36 discs—specifically `12x Climate Conference, 12x Sustainable Production, 12x Government Funding` where 3/4/4 have 4-player icons, totaling 9 removed in 3P so 27 remain = $3 \times 9$).

---

## 2. Setup Modes

1. **First Game Setup (Fixed Preset)**:
   - Fixed hex layout, number disc layout, and starting Town/City/Road placements matching `UI-design-style.png` and Page 4–5 of the rulebook.
2. **Standard Game Setup (Variable Snake Draft)**:
   - Random hex placement, spiral alphabetical (`A`–`R`) number disc placement skipping the Desert.
   - **Round 1 (Clockwise)**: Each player places 1 Town + 1 adjacent Road (obeying the Distance Rule: $\ge 2$ paths away from all other towns/cities).
   - **Round 2 (Counter-Clockwise / Reverse)**: Each player places 1 City + 1 adjacent Road.
   - **Starting Hand**: Each player receives 1 Resource card for each terrain hex adjacent to their starting **City**, plus **1 Science card**.

---

## 3. Turn Structure & Phases

Each player's turn proceeds strictly through 4 phases:
*(Note: A player may play at most **1 Development Card** per turn, not bought that turn, either **before drawing event discs in the Event Phase** OR **at any time during the Action Phase**).*

### Phase 1: Event Phase
1. Determine the number of Event Discs to draw based on the **Global Footprint Marker** position at the **start** of the Event Phase (even if an event shifts GF mid-phase, the draw count for this turn does not change).
2. Draw discs **one at a time** from the bag:
   - **Empty Bag Check**: If you need to draw a disc and the bag is empty, the game **ends immediately** via the Secondary End Condition!
   - Place the drawn disc on its matching Event Track on the sea frame.
   - **Trigger Check**: If the final space on that Event Track is filled:
     1. Remove all discs from that track (return to box/out of play).
     2. Resolve the Event immediately before drawing the next disc:
        - **Tie-breaker rule for all events**: If multiple players tie for highest/lowest value, **each** tied player takes the action in clockwise order starting from the active player. If **all** players tie, **nothing happens**.
        - **Air Pollution**: Player(s) with highest LF place 1 Hazard token on one of their Cities (or Towns if all their Cities already have Hazards).
        - **Environmental Pollution**: Active player rolls dice (re-rolling `7`s) and places 1 Hazard token on all hexes with that number, **except** a hex containing the Environmental Inspector or already holding a Hazard.
        - **Production Increase**: Player(s) with highest LF may build 1 Fossil Fuel Power Plant for free (does not count toward the 1-plant-per-turn limit) and take 1 resource from the hex it faces (even if that hex has a Hazard).
        - **Rain and Flooding**: **All** players must place 1 Hazard token on one of their Towns or Cities.
        - **Climate Conference**: Player(s) with lowest LF take 1 Resource or Science card of choice from supply; player(s) with highest LF discard 1 Resource or Science card of choice.
        - **Government Funding**: Player(s) with lowest LF draw 1 Development card from the supply.
        - **Sustainable Production**: Player(s) with the most built Renewable Power Plants take 1 Resource or Science card of choice from supply.

### Phase 2: Production Phase
1. Roll both dice (`2`–`12`).
2. **If roll is NOT `7`**:
   - Every land hex matching the dice sum produces, **unless** blocked by the **Environmental Inspector** or a **Hex Hazard Token**.
   - On producing hexes:
     - Each **Town** without a Hazard produces `1 Resource`.
     - Each **City** without a Hazard produces `1 Resource + 1 Science`.
     - Each **Power Plant** facing that hex produces `1 Energy` (up to player cap of 5) **if and only if** both the hex and the attached Town/City are free of Hazards.
   - **End-of-Production Hazard Auto-Clear**: Any Hex, Town, or City whose number was rolled this turn, and which failed to produce **because of a Hazard token** (NOT because of the Environmental Inspector!), **removes its Hazard token** at the end of the Production phase. (If both hex and building on that rolled number had Hazards, both Hazard tokens are removed! If the Inspector is on the rolled hex, no Hazards on towns/cities on that hex are removed.)
3. **If roll IS `7`**:
   - **Discard**: Any player holding $> 7$ Resource+Science cards ($> 10$ if their Warehouse is active) must discard $\lfloor \text{hand} / 2 \rfloor$ cards of their choice.
   - **Move Environmental Inspector**: Active player must move the Inspector to a new hex that **does not have a Hazard token**, and steal 1 random Resource/Science card from one player with a Town/City on that hex.

### Phase 3: Action Phase
The active player may perform any number of trades, builds, and energy actions in any order (subject to per-turn limits):

#### A. Trading
- **Domestic Trade (Player-to-Player)**: Trade any combination of Resource cards, Science cards, and Energy (cannot give cards for free, cannot trade identical resources, cannot receive Energy if at 5).
- **Maritime / Supply Trade**:
  - `4:1` identical Resource cards $\rightarrow$ `1` Resource or Science card.
  - `3:1` Science cards $\rightarrow$ `1` Resource card.
  - `2:1` Energy $\rightarrow$ `1` Resource or Science card.
  - `3:1` Harbor $\rightarrow$ 3 identical Resource cards for `1` Resource or Science card.
  - `2:1` Specialized Harbor $\rightarrow$ 2 matching Resource cards for `1` Resource or Science card.

#### B. Building & Buying
| Item | Cost | LF Change | VP Change | Placement / Rules |
| :--- | :--- | :---: | :---: | :--- |
| **Road** | 1 Lumber + 1 Brick | `0` | `0` (2 VP for Longest Route $\ge 5$) | Empty path connected to own road/town/city; cannot pass through opponent town/city. |
| **Town** | 1 Lumber + 1 Brick + 1 Natural Fiber + 1 Food | `+1` | `+1` | Empty intersection connected to own road, $\ge 2$ paths from any town/city. |
| **City** | 2 Food + 3 Steel | `+1` (net) | `+1` (net) | Upgrades own existing Town. Attached power plant remains. |
| **Fossil Fuel Plant** | 1 Science | `+1` | `0` | Placed in cutout of own Town (max 1) or City (max 3, distinct hexes) facing a numbered land hex. **Max 1 power plant built per turn** (combined with Renewable). |
| **Renewable Plant** | 3 Science | `-1` | `0` | Same placement rules + **Max 1 power plant per turn**. Uncovered Green Event Disc goes into the Event Bag! |
| **Warehouse** | 2 Energy | `0` | `0` | Flips Warehouse tile on player board (`7` $\rightarrow$ `10` card limit on `7`). |
| **Development Card** | 1 Food + 1 Natural Fiber + 1 Steel | `0` | `?` | Draw top card of Development deck. Cannot play on the turn bought (except VP cards to win). |

#### C. Energy Uses
- **2 Energy**: Take `1` Resource or Science card of choice from the supply.
- **1 Energy**: Remove `1` Hazard token from any Hex, Town, or City on the board.
- **1 Energy**: **Demolish 1 Fossil Fuel Power Plant** (return one of your built Fossil Fuel plants from the board to your player board; reduces LF by `-1` and GF by `-1`). **Limit once per Action phase**.

### Phase 4: End of Turn
- Pass dice and event bag to the next player clockwise.

---

## 4. Winning the Game (Dual Victory Conditions)

1. **Standard Victory (10 Victory Points)**:
   - If a player reaches **10 or more VPs** (including hidden VP Development Cards) at any point during their turn, the game ends immediately and that player wins!
2. **Bag Exhaustion Victory / Collapse (Empty Event Bag)**:
   - If the Event Bag is empty when a player needs to draw an Event Disc:
     - **Eligibility**: Only players who have built **strictly more Renewable Power Plants than Fossil Fuel Power Plants** ($\text{Renewable} > \text{Fossil}$) are eligible to win.
     - **Winner**: Among eligible players, the player with the **greatest positive difference** ($\text{Renewable} - \text{Fossil}$) wins!
     - **Tie-breaker**: Most Victory Points (including VP cards). (If still tied, shared victory).
     - **Total Collapse**: If **no** player has built more Renewable than Fossil Fuel plants, **all players lose** to environmental collapse!
