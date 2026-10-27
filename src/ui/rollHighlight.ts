/**
 * Which hexes light up after a production roll, and how many of them really paid out.
 */

import type { GameState, HexId } from '../engine/types';

export interface RollHighlight {
  /** Every hex carrying the rolled number, including ones that produced nothing */
  rolledHexIds: Set<HexId>;
  /** Rolled hexes that actually produced */
  producedCount: number;
  /** Rolled hexes that did not: the inspector's hex, or a hex whose hazard this roll cleared */
  blockedCount: number;
}

const NONE: RollHighlight = { rolledHexIds: new Set(), producedCount: 0, blockedCount: 0 };

const ROLL_LOG = / rolled \d+ \(\d+, \d+\)\.$/;
const CLEARED_HEX_LOG = /^The roll of \d+ cleared the hazard on hex (\d+) \(/;

/** The roll clears a rolled hex's hazard in the same step, so the board no longer shows it: the log does */
function hexesClearedByLastRoll(log: GameState['log']): Set<HexId> {
  const cleared = new Set<HexId>();
  for (let i = log.length - 1; i >= 0; i--) {
    const message = log[i]!.message;
    if (ROLL_LOG.test(message)) break;
    const match = CLEARED_HEX_LOG.exec(message);
    if (match) cleared.add(Number(match[1]));
  }
  return cleared;
}

export function getRollHighlight(state: Pick<GameState, 'lastDiceRoll' | 'phase' | 'board' | 'log'>): RollHighlight {
  if (!state.lastDiceRoll || state.phase !== 'ActionPhase') return NONE;
  const sum = state.lastDiceRoll[0] + state.lastDiceRoll[1];
  if (sum === 7) return NONE;

  const rolled = state.board.hexes.filter((h) => h.numberDisc === sum);
  if (rolled.length === 0) return NONE;

  const cleared = hexesClearedByLastRoll(state.log);
  const blockedCount = rolled.filter((h) => h.hasInspector || cleared.has(h.id)).length;
  return {
    rolledHexIds: new Set(rolled.map((h) => h.id)),
    producedCount: rolled.length - blockedCount,
    blockedCount,
  };
}
