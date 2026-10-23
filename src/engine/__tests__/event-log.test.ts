import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../setup';
import { applyAction } from '../reducer';
import {
  resolveAirPollution,
  resolveClimateConference,
  resolveEnvironmentalPollution,
  resolveGovernmentFunding,
  resolveRainAndFlooding,
} from '../event-resolvers';
import type { GameState } from '../types';
import { humanizeLog } from '../../ui/gameView';

/** The log as the activity feed shows it, from `from` on. */
function feed(state: GameState, from = 0): string[] {
  return state.log.slice(from).map((e) => humanizeLog(e.message));
}

function resolve(state: GameState, response: unknown) {
  const decision = state.pendingDecisions[0]!;
  return applyAction(state, {
    type: 'RESOLVE_PENDING_DECISION',
    playerId: decision.playerId,
    decisionId: decision.id,
    response,
  });
}

describe('activity log describes what an event did', () => {
  it('the track filling does not say "the event happens" or "takes effect"', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 103 });
    state.eventTracks.airPollution = 2;
    state.eventBag = ['airPollution', ...state.eventBag];
    state.players.purple.localFootprint = 6;
    const from = state.log.length;
    const next = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: state.activePlayerId });
    const lines = feed(next, from);
    expect(lines.join('\n')).toContain('The Air Pollution track is full.');
    expect(lines.join('\n')).not.toMatch(/event happens|takes effect|Triggering|capacity|returned to box/i);
  });

  it('Air Pollution names the highest-footprint player and what they placed', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 107 });
    state.players.purple.localFootprint = 6;
    resolveAirPollution(state);
    const from = state.log.length;
    const next = resolve(state, { nodeId: 23 });
    expect(feed(next, from)).toEqual([
      'Air Pollution: Highest local footprint (Purple) placed a hazard token on one of their cities.',
    ]);
  });

  it('Rain & Flooding says who placed the token on which kind of building', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 108 });
    resolveRainAndFlooding(state);
    const decision = state.pendingDecisions[0]!;
    const node = state.board.intersections.find((n) => n.building?.playerId === decision.playerId && !n.hasHazard)!;
    const name = state.players[decision.playerId]!.name;
    const from = state.log.length;
    const next = resolve(state, { nodeId: node.id });
    expect(feed(next, from)).toEqual([
      `Rain & Flooding: ${name} placed a hazard token on one of their ${node.building!.type === 'city' ? 'cities' : 'towns'}.`,
    ]);
  });

  it('Environmental Pollution says who rolled and where the hazard landed', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 109 });
    const from = state.log.length;
    resolveEnvironmentalPollution(state);
    const lines = feed(state, from);
    const active = state.players[state.activePlayerId]!.name;
    expect(lines[0]).toMatch(new RegExp(`^Environmental Pollution: ${active} rolled \\d+ \\(\\d \\+ \\d\\)\\.$`));
    const placed = lines.filter((l) => /hazard token was placed/.test(l));
    for (const l of placed) expect(l).toMatch(/placed on the \w+ \d+\.$/);
  });

  it('Climate Conference names the lowest and highest footprint players', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 112 });
    state.players.orange.localFootprint = 1;
    state.players.blue.localFootprint = 5;
    state.players.blue.resources.lumber = 1;
    resolveClimateConference(state);
    const from = state.log.length;
    let next = resolve(state, { cardType: 'steel' });
    next = resolve(next, { cardType: 'lumber' });
    expect(feed(next, from)).toEqual([
      'Climate Conference: Lowest local footprint (Orange) took 1 steel card from the supply.',
      'Climate Conference: Highest local footprint (Blue) discarded 1 lumber card.',
    ]);
  });

  it('passing is described without leaking engine ids', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 113 });
    state.players.pink.localFootprint = 1;
    resolveGovernmentFunding(state);
    const from = state.log.length;
    const next = resolve(state, { pass: true });
    expect(feed(next, from)).toEqual(['Government Funding: Lowest local footprint (Pink) passed on a free development card.']);
  });
});
