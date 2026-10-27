import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import type { GameState } from '../../engine/types';
import { getRollHighlight } from '../rollHighlight';

/** A table where the given dice have just been rolled and the turn has moved on to the action phase */
function afterRoll(dice: [number, number]): GameState {
  const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
  state.phase = 'ActionPhase';
  state.lastDiceRoll = dice;
  state.log.push({ timestamp: state.log.length, message: `Orange rolled ${dice[0] + dice[1]} (${dice[0]}, ${dice[1]}).` });
  for (const h of state.board.hexes) {
    h.hasInspector = false;
    h.hasHazard = false;
  }
  return state;
}

const hexesWith = (state: GameState, n: number) => state.board.hexes.filter((h) => h.numberDisc === n);

describe('getRollHighlight', () => {
  it('lights every hex carrying the rolled number and counts them as produced', () => {
    const state = afterRoll([4, 4]);
    const rolled = hexesWith(state, 8).map((h) => h.id);
    expect(rolled.length).toBeGreaterThan(0);
    const result = getRollHighlight(state);
    expect([...result.rolledHexIds].sort()).toEqual([...rolled].sort());
    expect(result.producedCount).toBe(rolled.length);
    expect(result.blockedCount).toBe(0);
  });

  it('lights nothing after a 7', () => {
    const result = getRollHighlight(afterRoll([3, 4]));
    expect(result.rolledHexIds.size).toBe(0);
    expect(result.producedCount).toBe(0);
  });

  it('lights nothing outside the action phase or before any roll', () => {
    const next = afterRoll([4, 4]);
    next.phase = 'EventPhase';
    expect(getRollHighlight(next).rolledHexIds.size).toBe(0);

    const fresh = afterRoll([4, 4]);
    fresh.lastDiceRoll = null;
    expect(getRollHighlight(fresh).rolledHexIds.size).toBe(0);
  });

  it('still lights the inspector hex but does not count it as produced', () => {
    const state = afterRoll([4, 4]);
    const inspectorHex = hexesWith(state, 8)[0]!;
    inspectorHex.hasInspector = true;
    const result = getRollHighlight(state);
    expect(result.rolledHexIds.has(inspectorHex.id)).toBe(true);
    expect(result.blockedCount).toBe(1);
    expect(result.producedCount).toBe(hexesWith(state, 8).length - 1);
  });

  it('does not count a hex whose hazard this roll cleared', () => {
    const state = afterRoll([4, 4]);
    const clearedHex = hexesWith(state, 8)[0]!;
    state.log.push({
      timestamp: state.log.length,
      message: `The roll of 8 cleared the hazard on hex ${clearedHex.id} (${clearedHex.terrain} #8).`,
    });
    const result = getRollHighlight(state);
    expect(result.rolledHexIds.has(clearedHex.id)).toBe(true);
    expect(result.blockedCount).toBe(1);
    expect(result.producedCount).toBe(hexesWith(state, 8).length - 1);
  });

  it('ignores hazards cleared by an earlier roll', () => {
    const state = afterRoll([4, 4]);
    const earlier = hexesWith(state, 8)[0]!;
    state.log.splice(state.log.length - 1, 0, {
      timestamp: 0,
      message: `The roll of 8 cleared the hazard on hex ${earlier.id} (${earlier.terrain} #8).`,
    });
    expect(getRollHighlight(state).blockedCount).toBe(0);
  });
});
