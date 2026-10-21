import { describe, it, expect } from 'vitest';
import {
  BUILDING_COSTS,
  EVENT_TRACK_LENGTHS,
  BROWN_EVENT_DISC_COUNTS,
  TOTAL_BROWN_DISCS,
  TOTAL_GREEN_DISCS_4P,
  TOTAL_GREEN_DISCS_3P,
  GF_CONFIG_4P,
  GF_CONFIG_3P,
  getEventDiscDrawCount,
  DEV_CARD_COUNTS,
  TOTAL_DEV_CARDS,
  BOARD_CONSTANTS,
  LF_DELTAS,
} from '@/engine/config';

describe('Game Configuration & Constants', () => {
  it('verifies building costs match official rules', () => {
    expect(BUILDING_COSTS.road.resources).toEqual({ lumber: 1, brick: 1 });
    expect(BUILDING_COSTS.town.resources).toEqual({ lumber: 1, brick: 1, fiber: 1, food: 1 });
    expect(BUILDING_COSTS.city.resources).toEqual({ food: 2, steel: 3 });
    expect(BUILDING_COSTS.fossilPlant.science).toBe(1);
    expect(BUILDING_COSTS.renewablePlant.science).toBe(3);
    expect(BUILDING_COSTS.warehouse.energy).toBe(2);
    expect(BUILDING_COSTS.devCard.resources).toEqual({ fiber: 1, food: 1, steel: 1 });
  });

  it('verifies 7 event track lengths', () => {
    expect(EVENT_TRACK_LENGTHS.environmentalPollution).toBe(4);
    expect(EVENT_TRACK_LENGTHS.rainAndFlooding).toBe(4);
    expect(EVENT_TRACK_LENGTHS.sustainableProduction).toBe(4);
    expect(EVENT_TRACK_LENGTHS.airPollution).toBe(3);
    expect(EVENT_TRACK_LENGTHS.productionIncrease).toBe(3);
    expect(EVENT_TRACK_LENGTHS.climateConference).toBe(3);
    expect(EVENT_TRACK_LENGTHS.governmentFunding).toBe(3);
  });

  it('verifies event disc counts', () => {
    const brownSum = Object.values(BROWN_EVENT_DISC_COUNTS).reduce((a, b) => a + b, 0);
    expect(brownSum).toBe(TOTAL_BROWN_DISCS);
    expect(TOTAL_BROWN_DISCS).toBe(43);
    expect(TOTAL_GREEN_DISCS_4P).toBe(36);
    expect(TOTAL_GREEN_DISCS_3P).toBe(27);
  });

  it('verifies global footprint draw bands', () => {
    // Config bounds
    expect(GF_CONFIG_4P.min).toBe(0);
    expect(GF_CONFIG_4P.max).toBe(28);
    expect(GF_CONFIG_4P.startingGf).toBe(12);
    expect(GF_CONFIG_3P.min).toBe(0);
    expect(GF_CONFIG_3P.max).toBe(21);
    expect(GF_CONFIG_3P.startingGf).toBe(9);

    // 4P draw bands
    expect(getEventDiscDrawCount(0, 4)).toBe(2);
    expect(getEventDiscDrawCount(5, 4)).toBe(2);
    expect(getEventDiscDrawCount(12, 4)).toBe(1); // starting
    expect(getEventDiscDrawCount(21, 4)).toBe(2); // confirmed R L314
    expect(getEventDiscDrawCount(25, 4)).toBe(3);

    // 3P draw bands
    expect(getEventDiscDrawCount(0, 3)).toBe(2);
    expect(getEventDiscDrawCount(9, 3)).toBe(1);  // starting
    expect(getEventDiscDrawCount(15, 3)).toBe(2);
    expect(getEventDiscDrawCount(20, 3)).toBe(3);
  });

  it('verifies dev card distribution totals 25', () => {
    const devSum = Object.values(DEV_CARD_COUNTS).reduce((a, b) => a + b, 0);
    expect(devSum).toBe(TOTAL_DEV_CARDS);
    expect(TOTAL_DEV_CARDS).toBe(25);
    expect(DEV_CARD_COUNTS.cleanup).toBe(14);
  });

  it('verifies board topology limits', () => {
    expect(BOARD_CONSTANTS.totalHexes).toBe(19);
    expect(BOARD_CONSTANTS.totalIntersections).toBe(54);
    expect(BOARD_CONSTANTS.totalPathEdges).toBe(72);
    expect(BOARD_CONSTANTS.totalHarbors).toBe(9);
    expect(BOARD_CONSTANTS.startingVp).toBe(3);
    expect(BOARD_CONSTANTS.winningVp).toBe(10);
  });

  it('verifies footprint math deltas', () => {
    expect(LF_DELTAS.town).toBe(1);
    expect(LF_DELTAS.cityNetUpgrade).toBe(1);
    expect(LF_DELTAS.fossilPlant).toBe(1);
    expect(LF_DELTAS.renewablePlant).toBe(-1);
    expect(LF_DELTAS.demolishFossilPlant).toBe(-1);
  });
});
