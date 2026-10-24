import { describe, expect, it } from 'vitest';
import { EVENT_TRACK_LENGTHS } from '../../engine/config';
import { applyAction } from '../../engine/reducer';
import { stepEventDraw } from '../../engine/events';
import { createInitialGameState } from '../../engine/setup';
import type { EventDiscType, GameState } from '../../engine/types';
import { eventTrackStandings } from '../gameView';

const NONE: Record<string, number> = {
  climateConference: 0,
  rainAndFlooding: 0,
  airPollution: 0,
  productionIncrease: 0,
  environmentalPollution: 0,
  sustainableProduction: 0,
  governmentFunding: 0,
};

function view(tracks: Partial<Record<EventDiscType, number>>, lines: string[] = []) {
  return {
    eventTracks: { ...NONE, ...tracks },
    log: lines.map((message, timestamp) => ({ timestamp, message })),
  };
}

const drew = (disc: EventDiscType, n = 1, of = 1) => `Orange drew a ${disc} event disc (${n}/${of}).`;
const order = (state: ReturnType<typeof view>) => eventTrackStandings(state).map((s) => s.type);

describe('event tracks, closest to triggering first', () => {
  it('lists all seven tracks with their fill, capacity and spaces left', () => {
    const standings = eventTrackStandings(view({ airPollution: 2, rainAndFlooding: 1 }));
    expect(standings).toHaveLength(7);
    expect(new Set(standings.map((s) => s.type)).size).toBe(7);
    const air = standings.find((s) => s.type === 'airPollution')!;
    expect(air).toMatchObject({ filled: 2, capacity: 3, remaining: 1 });
    const rain = standings.find((s) => s.type === 'rainAndFlooding')!;
    expect(rain).toMatchObject({ filled: 1, capacity: 4, remaining: 3 });
    for (const s of standings) {
      expect(s.capacity).toBe(EVENT_TRACK_LENGTHS[s.type]);
      expect(s.remaining).toBe(s.capacity - s.filled);
    }
  });

  it('puts the fewest empty spaces first', () => {
    const result = order(
      view({
        airPollution: 1, // 2 left
        environmentalPollution: 3, // 1 left
        governmentFunding: 2, // 1 left
        rainAndFlooding: 2, // 2 left
      })
    );
    // Both 1-left tracks come before both 2-left tracks, which come before the untouched ones
    expect(result.slice(0, 2).sort()).toEqual(['environmentalPollution', 'governmentFunding']);
    expect(result.slice(2, 4).sort()).toEqual(['airPollution', 'rainAndFlooding']);
    expect(result.slice(4).sort()).toEqual(['climateConference', 'productionIncrease', 'sustainableProduction']);
  });

  it('compares spaces left, not discs placed (a 4-space track needs more discs than a 3-space one)', () => {
    // 2 discs on a 4-space track (2 left) is further from firing than 2 discs on a 3-space track (1 left)
    expect(order(view({ environmentalPollution: 2, airPollution: 2 })).slice(0, 2)).toEqual([
      'airPollution',
      'environmentalPollution',
    ]);
  });

  it('breaks a tie with the track whose disc was drawn most recently', () => {
    const tracks = { airPollution: 2, climateConference: 2 } as const;
    const airLast = view(tracks, [
      drew('climateConference', 1),
      drew('airPollution', 1),
      drew('climateConference', 2),
      drew('airPollution', 2),
    ]);
    expect(order(airLast).slice(0, 2)).toEqual(['airPollution', 'climateConference']);
    expect(eventTrackStandings(airLast)[0]).toMatchObject({ type: 'airPollution', lastDrawnIndex: 3 });

    const climateLast = view(tracks, [
      drew('airPollution', 1),
      drew('climateConference', 1),
      drew('airPollution', 2),
      drew('climateConference', 2),
    ]);
    expect(order(climateLast).slice(0, 2)).toEqual(['climateConference', 'airPollution']);
  });

  it('only uses recency between equal tracks', () => {
    // Government Funding was drawn last but is further from triggering than air pollution
    const state = view({ airPollution: 2, governmentFunding: 1 }, [drew('airPollution', 1), drew('airPollution', 2), drew('governmentFunding', 1)]);
    expect(order(state).slice(0, 2)).toEqual(['airPollution', 'governmentFunding']);
  });

  it('reads draws in the form the activity log writes them, for any player name', () => {
    const state = view({ productionIncrease: 1, rainAndFlooding: 3, airPollution: 2 }, [
      'Blue drew an airPollution event disc (1/3).',
      'Ann-Marie drew a productionIncrease event disc (2/3).',
      'The airPollution track is full.',
      'Event draw count locked at 2 disc(s) (Clamped GF: 12).',
    ]);
    const standings = eventTrackStandings(state);
    expect(standings.find((s) => s.type === 'productionIncrease')!.lastDrawnIndex).toBe(1);
    // The air pollution disc was cleared by the track filling, so nothing is on it from the log's point of view
    expect(standings.find((s) => s.type === 'airPollution')!.lastDrawnIndex).toBe(-1);
  });

  it('keeps board order for tracks that were never drawn, and does not reshuffle between renders', () => {
    const first = eventTrackStandings(view({}));
    expect(first.every((s) => s.lastDrawnIndex === -1 && s.filled === 0)).toBe(true);
    // 3-space tracks before 4-space ones, each group in the order the board lists them
    expect(first.map((s) => s.type)).toEqual([
      'climateConference',
      'governmentFunding',
      'airPollution',
      'productionIncrease',
      'sustainableProduction',
      'environmentalPollution',
      'rainAndFlooding',
    ]);
    expect(order(view({}))).toEqual(first.map((s) => s.type));
  });

  it('puts discs with no log entry (a scenario) in the order of spaces left, behind logged draws on a tie', () => {
    const state = view({ airPollution: 2, climateConference: 2 }, [drew('climateConference', 1), 'Showcase scenario loaded.']);
    const standings = eventTrackStandings(state);
    expect(standings.slice(0, 2).map((s) => s.type)).toEqual(['climateConference', 'airPollution']);
    expect(standings[1]!.lastDrawnIndex).toBe(-1);
  });

  it('treats a track that just triggered and reset like an untouched one', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 103 });
    state.eventTracks.airPollution = 2;
    state.eventTracks.governmentFunding = 1;
    state.eventBag = ['airPollution', ...state.eventBag];
    expect(state.phase).toBe('EventPhase');
    const before = eventTrackStandings(state);
    expect(before[0]).toMatchObject({ type: 'airPollution', remaining: 1 });

    const next = applyAction(state, { type: 'DRAW_EVENT_DISC', playerId: state.activePlayerId });
    expect(next.log.some((e) => e.message === 'The airPollution track is full.')).toBe(true);
    const after = eventTrackStandings(next);
    const air = after.find((s) => s.type === 'airPollution')!;
    // It emptied: all its spaces are open again and the draw that filled it does not count as recent
    expect(air).toMatchObject({ filled: 0, capacity: 3, remaining: 3, lastDrawnIndex: -1 });
    // So Government Funding (1 of 3) is now the closest, and the reset track is back with the untouched ones
    expect(after[0]).toMatchObject({ type: 'governmentFunding', remaining: 2 });
    expect(after.indexOf(air)).toBeGreaterThan(0);
  });

  it('follows real draws: the most recent disc wins a tie against board order', () => {
    const state: GameState = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 107 });
    state.eventTracks.sustainableProduction = 1;
    state.eventTracks.environmentalPollution = 1;
    state.eventBag = ['sustainableProduction', 'environmentalPollution', 'sustainableProduction', ...state.eventBag];

    stepEventDraw(state);
    stepEventDraw(state);
    // Level at 2 of 4. Board order alone would list Sustainable Production first, but its disc is older
    expect(order(state).slice(0, 2)).toEqual(['environmentalPollution', 'sustainableProduction']);

    stepEventDraw(state);
    // 3 of 4 now: one space left puts it ahead whatever the history
    expect(order(state)[0]).toBe('sustainableProduction');
  });
});
