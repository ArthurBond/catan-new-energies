import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_CONSTANTS,
  BUILDING_COSTS,
  DEV_CARD_COUNTS,
  LF_DELTAS,
  MAX_PLAYER_ENERGY,
  TOTAL_DEV_CARDS,
} from '../../engine/config';
import { applyBuildPowerPlant } from '../../engine/build';
import { getDevCardType } from '../../engine/dev-cards';
import { computePlayerLF } from '../../engine/footprint';
import { evaluateProduction } from '../../engine/production';
import { createInitialGameState } from '../../engine/setup';
import { GameState, HexId, NodeId, PlayerState } from '../../engine/types';
import {
  BUILD_COSTS,
  BUILD_DESCRIPTIONS,
  BuildKind,
  buildTooltip,
  costText,
  getBuildOptions,
  handLimitFor,
} from '../gameView';
import { PlayerMat } from '../PlayerMat';
import { TabletopApp } from '../TabletopApp';
import { DEV_CARD_METADATA } from '../theme';
import { DEFAULT_TABLECLOTH_COLOR, TABLECLOTH_COLOR_KEY, loadTableclothColor } from '../TopBar';

const KINDS: BuildKind[] = ['road', 'town', 'city', 'devCard', 'fossil', 'renewable', 'warehouse'];

/** Engine cost table key for each build kind. */
const ENGINE_COST_KEY = {
  road: 'road',
  town: 'town',
  city: 'city',
  devCard: 'devCard',
  fossil: 'fossilPlant',
  renewable: 'renewablePlant',
  warehouse: 'warehouse',
} as const;

/** "1 lumber, 1 brick" written straight from the engine's cost table, not from the UI helpers. */
function expectedCostText(kind: BuildKind): string {
  const cost: { resources?: Record<string, number>; science?: number; energy?: number } =
    BUILDING_COSTS[ENGINE_COST_KEY[kind]];
  const parts = Object.entries(cost.resources ?? {}).map(
    ([res, n]) => `${n} ${res === 'natural_fiber' ? 'fiber' : res}`
  );
  if (cost.science) parts.push(`${cost.science} science`);
  if (cost.energy) parts.push(`${cost.energy} energy`);
  return parts.join(', ');
}

/** A 4-player game in the action phase with every settlement but orange's first town removed. */
function lonelyTownState(buildingType: 'town' | 'city'): {
  state: GameState;
  nodeId: NodeId;
  hexId: HexId;
  roll: number;
} {
  const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
  state.phase = 'ActionPhase';
  state.activePlayerId = 'orange';
  state.pendingDecisions = [];
  const nodeId = state.board.intersections.find((n) => n.building?.playerId === 'orange')!.id;
  for (const node of state.board.intersections) {
    if (node.id !== nodeId) {
      node.building = null;
      node.powerPlants = [];
    }
  }
  const node = state.board.intersections[nodeId]!;
  node.building = { playerId: 'orange', type: buildingType };
  const hex = node.adjacentHexIds
    .map((id) => state.board.hexes[id]!)
    .find((h) => h.terrain !== 'desert' && h.numberDisc !== null)!;
  return { state, nodeId, hexId: hex.id, roll: hex.numberDisc! };
}

function payoutFor(state: GameState, roll: number) {
  const result = evaluateProduction(
    state.board,
    state.players,
    state.supply,
    [1, roll - 1],
    'orange',
    state.playerOrder
  );
  const p = result.payouts.orange!;
  const resources = Object.values(p.resources).reduce((a, b) => a + (b ?? 0), 0);
  return { resources, science: p.science, energy: p.energy };
}

function totalCards(p: PlayerState): number {
  return Object.values(p.resources).reduce((a, b) => a + b, 0) + p.science;
}

describe('build tooltips match the engine rules', () => {
  it('names the same costs as the engine cost table', () => {
    for (const kind of KINDS) {
      expect(costText(BUILD_COSTS[kind]), kind).toBe(expectedCostText(kind));
      expect(buildTooltip(kind, 'X'), kind).toContain(`costs ${expectedCostText(kind)}.`);
    }
  });

  it('builds the dock options from the same costs', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    for (const option of getBuildOptions(state, 'orange', [], true)) {
      expect(costText(option.cost), option.kind).toBe(expectedCostText(option.kind));
    }
  });

  it('says a town gives 1 resource, matching what a town produces', () => {
    const { state, roll } = lonelyTownState('town');
    expect(payoutFor(state, roll)).toEqual({ resources: 1, science: 0, energy: 0 });
    expect(BUILD_DESCRIPTIONS.town).toContain('1 resource');
    expect(BUILD_DESCRIPTIONS.town).not.toContain('science');
  });

  it('says a city gives 1 resource and 1 science, matching what a city produces', () => {
    const { state, roll } = lonelyTownState('city');
    expect(payoutFor(state, roll)).toEqual({ resources: 1, science: 1, energy: 0 });
    expect(BUILD_DESCRIPTIONS.city).toContain('1 resource and 1 science');
    expect(BUILD_DESCRIPTIONS.city).not.toMatch(/2 resources/);
  });

  it.each(['fossil', 'renewable'] as const)(
    'says a %s plant gives 1 energy (capped, blockable) and no resource',
    (type) => {
      const { state, nodeId, hexId, roll } = lonelyTownState('town');
      state.board.intersections[nodeId]!.powerPlants.push({ playerId: 'orange', type, hexId });
      const text = BUILD_DESCRIPTIONS[type];

      // 1 energy on the plant's roll; the town itself still gives its usual resource
      expect(payoutFor(state, roll).energy).toBe(1);
      expect(text).toContain('1 energy');

      // At the energy cap nothing more is gained
      state.players.orange!.energy = MAX_PLAYER_ENERGY;
      expect(payoutFor(state, roll).energy).toBe(0);
      expect(text).toContain(`at most ${MAX_PLAYER_ENERGY}`);
      state.players.orange!.energy = 0;

      // A hazard or the inspector on the hex blocks it, and so does a hazard on the building
      state.board.hexes[hexId]!.hasHazard = true;
      expect(payoutFor(state, roll).energy).toBe(0);
      state.board.hexes[hexId]!.hasHazard = false;
      state.board.intersections[nodeId]!.hasHazard = true;
      expect(payoutFor(state, roll).energy).toBe(0);
      expect(text).toMatch(/hazard or the inspector blocks it/);

      // Building a plant hands out no resources, so the tooltip does not claim any
      expect(text).not.toMatch(/resource/);
    }
  );

  it.each(['fossil', 'renewable'] as const)(
    'matches what building a %s plant does to footprint, cards and the event bag',
    (type) => {
      const { state, nodeId, hexId } = lonelyTownState('town');
      const orange = state.players.orange!;
      orange.science = 5;
      const cardsBefore = totalCards(orange) - orange.science;
      const bagBefore = state.eventBag.length;
      const footprintBefore = computePlayerLF(orange);

      applyBuildPowerPlant(state, 'orange', nodeId, hexId, type);

      const delta = type === 'fossil' ? LF_DELTAS.fossilPlant : LF_DELTAS.renewablePlant;
      expect(orange.localFootprint - footprintBefore).toBe(delta);
      expect(BUILD_DESCRIPTIONS[type]).toContain(`Footprint ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
      // Only science was spent; no resource card came back
      expect(totalCards(orange) - orange.science).toBe(cardsBefore);
      // Only the renewable plant puts a disc in the bag
      expect(state.eventBag.length - bagBefore).toBe(type === 'renewable' ? 1 : 0);
      expect(/event bag/.test(BUILD_DESCRIPTIONS[type])).toBe(type === 'renewable');
      // One power plant per turn
      expect(state.turnStats.powerPlantsBuiltThisTurn).toBe(1);
      expect(BUILD_DESCRIPTIONS[type]).toContain('One power plant per turn');
    }
  );

  it('mentions how many plants a town and a city can hold', () => {
    expect(BOARD_CONSTANTS.maxPlantsOnTown).toBe(1);
    expect(BOARD_CONSTANTS.maxPlantsOnCity).toBe(3);
    expect(BUILD_DESCRIPTIONS.fossil).toContain('town (holds 1)');
    expect(BUILD_DESCRIPTIONS.fossil).toContain('city (holds up to 3)');
  });

  it('names exactly the cards in the real dev deck', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    expect(state.supply.devDeck).toHaveLength(TOTAL_DEV_CARDS);
    const inDeck = new Set(state.supply.devDeck.map(getDevCardType));
    expect([...inDeck].sort()).toEqual(Object.keys(DEV_CARD_COUNTS).sort());

    const text = BUILD_DESCRIPTIONS.devCard;
    const listed = /Draws a hidden card: (.*?)\. /.exec(text)![1]!.split(', ');
    expect(listed.sort()).toEqual([...inDeck].map((type) => DEV_CARD_METADATA[type].title).sort());
    expect(text).not.toContain('Progress');
  });

  it('gives the warehouse hand limits from the engine config', () => {
    expect(handLimitFor(false)).toBe(BOARD_CONSTANTS.handLimitStandard);
    expect(handLimitFor(true)).toBe(BOARD_CONSTANTS.handLimitWarehouse);
    expect(BUILD_DESCRIPTIONS.warehouse).toContain(
      `from ${BOARD_CONSTANTS.handLimitStandard} to ${BOARD_CONSTANTS.handLimitWarehouse} cards`
    );
  });

  it('adds a trailing note once, with one full stop', () => {
    expect(buildTooltip('road', 'Road', 'Needs 1 brick.')).toMatch(/ Needs 1 brick\.$/);
    expect(buildTooltip('road', 'Road')).toBe(
      `Road — costs ${expectedCostText('road')}. ${BUILD_DESCRIPTIONS.road}`
    );
  });
});

describe('build tooltips on screen', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  function renderMat(player: PlayerState, state: GameState) {
    act(() => {
      render(
        <PlayerMat
          player={player}
          isActiveTurn={true}
          isActionPhase={true}
          isPreEventWindow={false}
          turnStats={state.turnStats}
          devCardsBoughtThisTurn={[]}
          devCardPlayedThisTurn={false}
          activeBuildMode={null}
          showOrganiser={true}
        />,
        container
      );
    });
  }

  it('gives each quick-build button one tooltip, the same for hover and screen readers', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    renderMat(state.players.orange!, state);

    const buttons: [string, BuildKind, string][] = [
      ['quick-build-road', 'road', 'Road'],
      ['quick-build-town', 'town', 'Town'],
      ['quick-build-city', 'city', 'City'],
      ['quick-build-fossil', 'fossil', 'Fossil plant'],
      ['quick-build-renewable', 'renewable', 'Renewable plant'],
      ['quick-buy-dev', 'devCard', 'Dev card'],
    ];
    for (const [testId, kind, label] of buttons) {
      const el = container.querySelector(`[data-testid="${testId}"]`)!;
      expect(el, testId).not.toBeNull();
      const title = el.getAttribute('title')!;
      expect(title, testId).toContain(`${label} — costs ${expectedCostText(kind)}.`);
      expect(title, testId).toContain(BUILD_DESCRIPTIONS[kind]);
      expect(el.getAttribute('aria-label'), testId).toBe(title);
    }
  });

  it('puts the warehouse tooltip in an SVG title element, not a title attribute', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    renderMat(state.players.orange!, state);

    const tile = container.querySelector('[data-testid="warehouse-tile"]')!;
    expect(tile.hasAttribute('title')).toBe(false);
    const text = tile.querySelector('title')!.textContent!;
    expect(text).toContain(`Warehouse — costs ${expectedCostText('warehouse')}.`);
    expect(text).toContain(BUILD_DESCRIPTIONS.warehouse);
    expect(tile.getAttribute('aria-label')).toBe(text);
  });

  it('says what the built warehouse does', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    const player = { ...state.players.orange!, hasWarehouse: true };
    renderMat(player, state);

    const text = container.querySelector('[data-testid="warehouse-tile"] title')!.textContent!;
    expect(text).toBe(`Warehouse built: on a roll of 7 you keep up to ${BOARD_CONSTANTS.handLimitWarehouse} cards.`);
  });

  it('shows the same tooltips on the dock build buttons', () => {
    window.history.pushState({}, '', '/?placement=fixed');
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');

    for (const kind of KINDS) {
      const btn = container.querySelector(`[data-testid="build-${kind}"]`)!;
      expect(btn, kind).not.toBeNull();
      const title = btn.getAttribute('title')!;
      expect(title, kind).toContain(`costs ${expectedCostText(kind)}.`);
      expect(title, kind).toContain(BUILD_DESCRIPTIONS[kind]);
      expect(btn.getAttribute('aria-label'), kind).toBe(title);
    }
  });
});

describe('tablecloth colour storage', () => {
  const V1_KEY = 'catan_new_energies_tablecloth_color_v1';
  let store: Map<string, string>;

  beforeEach(() => {
    // Node's own (flag-gated) localStorage global shadows happy-dom's, so provide one
    store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the default when nothing is stored', () => {
    expect(loadTableclothColor()).toBe(DEFAULT_TABLECLOTH_COLOR);
  });

  it('keeps a colour stored under the current key', () => {
    store.set(TABLECLOTH_COLOR_KEY, '#133b63');
    store.set(V1_KEY, '#174f2c');
    expect(loadTableclothColor()).toBe('#133b63');
  });

  it('keeps a colour the player picked under v1', () => {
    store.set(V1_KEY, '#174f2c');
    expect(loadTableclothColor()).toBe('#174f2c');
  });

  it('drops the old v1 default in favour of the new default', () => {
    store.set(V1_KEY, '#181a1d');
    expect(loadTableclothColor()).toBe(DEFAULT_TABLECLOTH_COLOR);
  });

  it('falls back to the default when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked');
      },
    });
    expect(loadTableclothColor()).toBe(DEFAULT_TABLECLOTH_COLOR);
  });
});

