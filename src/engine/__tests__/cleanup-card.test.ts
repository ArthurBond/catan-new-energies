import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialGameState } from '../setup';
import { applyAction } from '../reducer';
import { canPlayDevCard } from '../dev-cards';
import type { CleanupOption, GameState } from '../types';

/** The Cleanup card is "move the Inspector, OR remove 1 hazard and steal": never both. */
describe('Cleanup card is one option or the other', () => {
  let state: GameState;
  const hazardCount = (s: GameState) =>
    s.board.hexes.filter((h) => h.hasHazard).length + s.board.intersections.filter((n) => n.hasHazard).length;
  const inspectorHex = (s: GameState) => s.board.hexes.find((h) => h.hasInspector)!.id;

  const play = (s: GameState, option: CleanupOption) =>
    applyAction(s, {
      type: 'PLAY_DEV_CARD',
      playerId: 'orange',
      cardId: 'dev_cleanup_01',
      params: { cardType: 'cleanup', option },
    });

  beforeEach(() => {
    state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    state.phase = 'ActionPhase';
    state.players.orange!.devCards.unplayed = ['dev_cleanup_01'];
    // One hazard on a hex and one on a building, so removing one is detectable
    const hazardHex = state.board.hexes.find((h) => h.numberDisc === 8 && !h.hasInspector)!;
    hazardHex.hasHazard = true;
    const building = state.board.intersections.find((n) => n.building)!;
    building.hasHazard = true;
    state.supply.hazards -= 2;
  });

  it('moving the Inspector leaves every hazard on the board', () => {
    const from = inspectorHex(state);
    const to = state.board.hexes.find((h) => !h.hasHazard && !h.hasInspector && h.terrain !== 'desert')!;
    const next = play(state, { type: 'INSPECTOR_MOVE_STEAL', newHexId: to.id });
    expect(inspectorHex(next)).toBe(to.id);
    expect(inspectorHex(next)).not.toBe(from);
    expect(hazardCount(next)).toBe(2);
    expect(next.supply.hazards).toBe(state.supply.hazards);
  });

  it('removing a hazard removes exactly one and leaves the Inspector where it was', () => {
    const from = inspectorHex(state);
    const hazardHex = state.board.hexes.find((h) => h.hasHazard)!;
    const next = play(state, { type: 'REMOVE_HAZARD_STEAL', hazardTarget: { kind: 'hex', id: hazardHex.id } });
    expect(hazardCount(next)).toBe(1);
    expect(next.supply.hazards).toBe(state.supply.hazards + 1);
    expect(inspectorHex(next)).toBe(from);
  });

  it('an option that asks for both is refused', () => {
    const to = state.board.hexes.find((h) => !h.hasHazard && !h.hasInspector)!;
    const hazardHex = state.board.hexes.find((h) => h.hasHazard)!;
    const both = { type: 'INSPECTOR_MOVE_STEAL', newHexId: to.id, hazardTarget: { kind: 'hex', id: hazardHex.id } } as unknown as CleanupOption;
    const alsoBoth = { type: 'REMOVE_HAZARD_STEAL', hazardTarget: { kind: 'hex', id: hazardHex.id }, newHexId: to.id } as unknown as CleanupOption;
    for (const option of [both, alsoBoth]) {
      const check = canPlayDevCard(state, 'orange', 'dev_cleanup_01', { cardType: 'cleanup', option });
      expect(check.canPlay).toBe(false);
      expect(check.reason).toContain('OR');
      expect(() => play(state, option)).toThrow();
    }
    expect(hazardCount(state)).toBe(2);
  });
});

describe('hazards cleared by a roll are logged, so they are not mistaken for a Clean Up', () => {
  it('names the hex and the building the roll cleared', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    state.phase = 'ProductionPhase';
    state.pendingDecisions = [];
    state.lastDiceRoll = null;
    const hex = state.board.hexes.find((h) => h.numberDisc === 8 && !h.hasInspector)!;
    hex.hasHazard = true;
    const node = state.board.intersections.find((n) => n.building && n.adjacentHexIds.includes(hex.id));
    if (node) node.hasHazard = true;

    // Roll until the dice sum to 8 (the roll is deterministic for a given state, so scan seeds)
    let after: GameState | null = null;
    for (let seed = 1; seed < 400 && !after; seed++) {
      const s = structuredClone(state);
      s.prng = { seed, calls: 0 };
      const next = applyAction(s, { type: 'ROLL_DICE', playerId: s.activePlayerId });
      if (next.lastDiceRoll && next.lastDiceRoll[0] + next.lastDiceRoll[1] === 8) after = next;
    }
    expect(after).not.toBeNull();
    const lines = after!.log.map((e) => e.message).filter((m) => m.startsWith('The roll of 8 cleared'));
    expect(lines.some((m) => m.includes(`hex ${hex.id}`))).toBe(true);
    if (node) expect(lines.some((m) => m.includes("'s "))).toBe(true);
    expect(after!.board.hexes[hex.id]!.hasHazard).toBe(false);
  });
});
