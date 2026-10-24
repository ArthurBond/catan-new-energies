import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import { BUILD_DESCRIPTIONS } from '../gameView';
import { IslandBoardSvg } from '../IslandBoardSvg';
import { PendingDecisionBanner } from '../Modals';
import { PlayerMat } from '../PlayerMat';
import { TabletopApp } from '../TabletopApp';

describe('Tabletop UI & Showcase Player Mat (Milestones 3, 4 & 5 UI)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('renders IslandBoardSvg and SeaFrameSvg with all 19 hexes, 54 nodes, 72 edges, 9 harbors, 7 event islands, VP track, and GF track', () => {
    const state = createInitialGameState({
      setupMode: 'first',
      playerCount: 4,
      seed: 42,
    });

    act(() => {
      render(<IslandBoardSvg state={state} />, container);
    });

    // Verify 19 land hexes
    const hexes = container.querySelectorAll('[data-hex]');
    expect(hexes.length).toBe(19);

    // Verify 54 intersections
    const nodes = container.querySelectorAll('[data-node]');
    expect(nodes.length).toBe(54);

    // Verify 72 path edges
    const edges = container.querySelectorAll('[data-edge]');
    expect(edges.length).toBe(72);

    // Verify 9 coastal harbors
    for (let h = 0; h < 9; h++) {
      expect(container.querySelector(`[data-testid="harbor-${h}"]`)).not.toBeNull();
    }

    // Verify 7 coastal event tracks
    const tracks = [
      'climateConference',
      'sustainableProduction',
      'governmentFunding',
      'airPollution',
      'productionIncrease',
      'environmentalPollution',
      'rainAndFlooding',
    ];
    for (const t of tracks) {
      expect(container.querySelector(`[data-testid="event-track-${t}"]`)).not.toBeNull();
    }

    // Verify VP Track (1..10) & GF Track (0..28 in 4P) + GF marker + Inspector pawn
    expect(container.querySelector('[data-testid="vp-track"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="gf-track"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="gf-marker"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="inspector-pawn"]')).not.toBeNull();
  });

  it('renders Showcase PlayerMat and 6-compartment Resource & Science Card Organiser faithfully', () => {
    const state = createInitialGameState({
      setupMode: 'first',
      playerCount: 4,
      seed: 42,
    });
    const orange = state.players.orange;

    act(() => {
      render(
        <PlayerMat
          player={orange}
          isActiveTurn={true}
          isActionPhase={true}
          isPreEventWindow={false}
          turnStats={state.turnStats}
          devCardsBoughtThisTurn={state.devCardsBoughtThisTurn}
          devCardPlayedThisTurn={state.devCardPlayedThisTurn}
          activeBuildMode={null}
        />,
        container
      );
    });

    // Player Mat & Organiser containers
    expect(container.querySelector('[data-testid="player-mat"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resource-organiser"]')).not.toBeNull();

    // 5 Town reserve slots, 4 City reserve slots, 6 Fossil plant slots, 9 Renewable plant slots
    for (let i = 0; i < 5; i++) {
      expect(container.querySelector(`[data-testid="mat-town-slot-${i}"]`)).not.toBeNull();
    }
    for (let i = 0; i < 4; i++) {
      expect(container.querySelector(`[data-testid="mat-city-slot-${i}"]`)).not.toBeNull();
    }
    for (let i = 0; i < 6; i++) {
      expect(container.querySelector(`[data-testid="mat-fossil-slot-${i}"]`)).not.toBeNull();
    }
    for (let i = 0; i < 9; i++) {
      expect(container.querySelector(`[data-testid="mat-renewable-slot-${i}"]`)).not.toBeNull();
    }

    // Warehouse tile, 3 Energy Action Pylons, 5-bolt Energy Bar, and 6 Organiser compartments
    expect(container.querySelector('[data-testid="warehouse-tile"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="energy-action-buy-card"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="energy-action-clean-hazard"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="energy-action-demolish-plant"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="energy-bar"]')).not.toBeNull();

    for (const k of ['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science']) {
      expect(container.querySelector(`[data-testid="organiser-slot-${k}"]`)).not.toBeNull();
    }
  });

  it('renders TabletopApp and executes Event Draw -> Roll Dice -> Action Phase -> End Turn cleanly', () => {
    // Beginner positions skip the placement draft so the first turn starts immediately
    window.history.pushState({}, '', '/?placement=fixed');
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');

    // Verify TabletopApp shell, Event Bag, player boards and the hand dock
    expect(container.querySelector('[data-testid="tabletop-app"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="event-bag"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="corner-station-orange"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bottom-player-dock"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="organiser-slot-lumber"]')).not.toBeNull();

    // Pause bots so we can step cleanly
    const pauseBtn = container.querySelector('[data-testid="autoplay-toggle"]') as HTMLButtonElement;
    act(() => {
      pauseBtn?.click();
    });

    // Step 1: In EventPhase, click Draw Event Disc button (at GF=12 in 4P First Game, drawCount = 1)
    const drawBtn = container.querySelector(
      '[data-testid="action-draw-event-btn"]'
    ) as HTMLButtonElement;
    expect(drawBtn).not.toBeNull();

    act(() => {
      drawBtn.click();
    });

    // Step 2: Now in ProductionPhase, click Roll Production Dice button
    const rollBtn = container.querySelector(
      '[data-testid="action-roll-dice-btn"]'
    ) as HTMLButtonElement;
    expect(rollBtn).not.toBeNull();

    act(() => {
      rollBtn.click();
    });

    // Step 3: Depending on whether 7 was rolled on seed 42 turn 1 (seed 42 first roll is non-7),
    // verify we are in ActionPhase and can click End Turn
    const endTurnBtn = container.querySelector(
      '[data-testid="action-end-turn-btn"]'
    ) as HTMLButtonElement | null;
    if (endTurnBtn) {
      act(() => {
        endTurnBtn.click();
      });
      const turnPill = container.querySelector('[data-testid="active-turn-pill"]');
      expect(turnPill?.textContent).toContain('Purple');
    }
  });

  it('renders ocean whales, whale pod (3 in 3P, 4 in 4P), and correct GF track spaces', () => {
    // 1. Assert 4-player game rendering
    const state4P = createInitialGameState({
      setupMode: 'first',
      playerCount: 4,
      seed: 42,
    });

    act(() => {
      render(<IslandBoardSvg state={state4P} />, container);
    });

    // Assert [data-testid="ocean-whales"] exists and renders
    const oceanWhales4P = container.querySelector('[data-testid="ocean-whales"]');
    expect(oceanWhales4P).not.toBeNull();

    // Assert [data-testid="gf-whale-pod"] renders exactly 4 whales in a 4-player game
    const gfPod4P = container.querySelector('[data-testid="gf-whale-pod"]');
    expect(gfPod4P).not.toBeNull();
    const whales4P = gfPod4P!.querySelectorAll('.ocean-whale-animated');
    expect(whales4P.length).toBe(4);

    // Assert all GF track spaces render (0..28 in 4P game)
    for (let val = 0; val <= 28; val++) {
      expect(container.querySelector(`[data-testid="gf-space-${val}"]`)).not.toBeNull();
    }
    expect(container.querySelector('[data-testid="gf-space-29"]')).toBeNull();

    // 2. Assert 3-player game rendering
    const state3P = createInitialGameState({
      setupMode: 'first',
      playerCount: 3,
      seed: 42,
    });

    act(() => {
      render(<IslandBoardSvg state={state3P} />, container);
    });

    // Assert [data-testid="ocean-whales"] exists and renders
    const oceanWhales3P = container.querySelector('[data-testid="ocean-whales"]');
    expect(oceanWhales3P).not.toBeNull();

    // Assert [data-testid="gf-whale-pod"] renders exactly 3 whales in a 3-player game
    const gfPod3P = container.querySelector('[data-testid="gf-whale-pod"]');
    expect(gfPod3P).not.toBeNull();
    const whales3P = gfPod3P!.querySelectorAll('.ocean-whale-animated');
    expect(whales3P.length).toBe(3);

    // Assert all GF track spaces render (0..21 in 3P game)
    for (let val = 0; val <= 21; val++) {
      expect(container.querySelector(`[data-testid="gf-space-${val}"]`)).not.toBeNull();
    }
    expect(container.querySelector('[data-testid="gf-space-22"]')).toBeNull();
  });

  it('supports 5x board zoom, hide player mat toggle, tablecloth color picker, live action banner, tabletop dice tray, and Town/City 120-deg plant sockets', () => {
    act(() => {
      render(<TabletopApp />, container);
    });

    // 1. Verify BGG-style GF HUD widget, Live Action Banner & Tabletop Dice Roll Overlay
    expect(container.querySelector('[data-testid="gf-hud-widget"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="live-action-banner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="tabletop-dice-roll-overlay"]')).not.toBeNull();

    // 2. Verify Zoom In up to 500% (5.0x)
    const zoomInBtn = container.querySelector('[data-testid="zoom-in-btn"]') as HTMLButtonElement;
    const zoomReadout = container.querySelector('[data-testid="zoom-level-readout"]');
    expect(zoomInBtn).not.toBeNull();
    expect(zoomReadout?.textContent).toBe('100%');

    act(() => {
      for (let i = 0; i < 15; i++) {
        zoomInBtn.click();
      }
    });
    expect(zoomReadout?.textContent).toBe('500%');

    // 3. Verify the player board drawer opens and closes (closed by default so the board is the hero)
    const toggleMatBtn = container.querySelector(
      '[data-testid="toggle-player-mat-btn"]'
    ) as HTMLButtonElement;
    expect(toggleMatBtn).not.toBeNull();
    expect(container.querySelector('[data-testid="player-mat"]')).toBeNull();

    act(() => {
      toggleMatBtn.click();
    });
    expect(container.querySelector('[data-testid="player-mat"]')).not.toBeNull();

    act(() => {
      toggleMatBtn.click();
    });
    expect(container.querySelector('[data-testid="player-mat"]')).toBeNull();

    // 4. Verify Tablecloth Color Picker & Presets (inside the table settings popover)
    const appShell = container.querySelector('[data-testid="tabletop-app"]') as HTMLElement;
    expect(appShell.getAttribute('data-tablecloth-color')).toBe('#7a1c1c');

    act(() => {
      (container.querySelector('[data-testid="settings-btn"]') as HTMLButtonElement).click();
    });
    const picnicPreset = container.querySelector(
      '[data-testid="tablecloth-preset-7a1c1c"]'
    ) as HTMLButtonElement;
    expect(picnicPreset).not.toBeNull();
    expect(picnicPreset.getAttribute('data-active')).toBe('true');

    const oceanPreset = container.querySelector(
      '[data-testid="tablecloth-preset-133b63"]'
    ) as HTMLButtonElement;
    expect(oceanPreset).not.toBeNull();

    act(() => {
      oceanPreset.click();
    });
    expect(appShell.getAttribute('data-tablecloth-color')).toBe('#133b63');

    const colorInput = container.querySelector(
      '[data-testid="tablecloth-color-input"]'
    ) as HTMLInputElement;
    expect(colorInput).not.toBeNull();
    act(() => {
      colorInput.value = '#4a1d6e';
      colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(appShell.getAttribute('data-tablecloth-color')).toBe('#4a1d6e');
  });

  it('renders interactive SetupRoll overlay and roll dice button in standard setup mode', () => {
    // Set URL query params using pushState
    window.history.pushState({}, '', '/?setup=standard&autostart=1');

    try {
      act(() => {
        render(<TabletopApp />, container);
      });

      // In standard setup mode, starts in SetupRoll
      expect(container.querySelector('[data-testid="setup-roll-overlay"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="action-setup-roll-btn"]')).not.toBeNull();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('discarding half the hand on a 7 works from the dialog, in any order', () => {
    // Showcase hand: 2 lumber, 1 brick, 1 fiber, 2 food, 3 steel, 3 science = 12 cards -> discard 6
    window.history.pushState({}, '', '/?scenario=discard&bots=0');
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');

    const click = (testId: string) =>
      act(() => {
        (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
      });
    const confirm = () => container.querySelector('[data-testid="confirm-discard-btn"]') as HTMLButtonElement;

    expect(container.querySelector('[data-testid="pending-decision-modal"]')).not.toBeNull();
    // Pick in a scrambled order, change our mind once (leaves a zero entry behind)
    click('discard-card-steel');
    click('discard-card-lumber');
    click('discard-card-science');
    click('discard-card-steel');
    click('discard-card-science');
    expect(confirm().disabled).toBe(true);
    // undo the lumber, then finish with food
    act(() => {
      const minus = container.querySelectorAll('.md-stepper button')[0] as HTMLButtonElement;
      minus.click();
    });
    click('discard-card-food');
    click('discard-card-food');
    expect(confirm().disabled).toBe(false);
    click('confirm-discard-btn');

    // Dialog closes, cards left the hand, and the inspector must be moved next
    expect(container.querySelector('[data-testid="pending-decision-modal"]')).toBeNull();
    expect(container.querySelector('[data-testid="action-error-toast"]')).toBeNull();
    expect(container.querySelector('[data-testid="organiser-count-steel"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="organiser-count-science"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="organiser-count-food"]')?.textContent).toBe('0');
    expect(container.querySelector('[data-testid="organiser-count-lumber"]')?.textContent).toBe('2');
    expect(container.querySelector('[data-testid="pending-decision-banner"]')?.textContent).toContain(
      'move the inspector'
    );
  });

  it('restores an unfinished game after a page reload', () => {
    // Node's own (flag-gated) localStorage global shadows happy-dom's, so provide one
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    window.history.pushState({}, '', '/?placement=fixed');
    act(() => {
      render(<TabletopApp />, container);
    });
    act(() => {
      (container.querySelector('[data-testid="autoplay-toggle"]') as HTMLButtonElement).click();
    });
    act(() => {
      (container.querySelector('[data-testid="action-draw-event-btn"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="action-roll-dice-btn"]')).not.toBeNull();

    // "Reload": unmount and mount again on a plain URL
    act(() => {
      render(null, container);
    });
    window.history.pushState({}, '', '/');
    act(() => {
      render(<TabletopApp />, container);
    });
    expect(container.querySelector('[data-testid="action-roll-dice-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="live-action-banner"]')?.textContent).toContain('Welcome back');
    vi.unstubAllGlobals();
  });

  it('lets every hotseat player place a starting town, road, city and road on the beginner board', () => {
    window.history.pushState({}, '', '/?mode=hotseat');
    try {
      act(() => {
        render(<TabletopApp />, container);
      });

      // Roll-off: every seat rolls (ties reroll) until the placement draft begins
      for (let i = 0; i < 20 && container.querySelector('[data-testid="setup-roll-dialog-btn"]'); i++) {
        act(() => {
          (container.querySelector('[data-testid="setup-roll-dialog-btn"]') as HTMLButtonElement).click();
        });
      }
      expect(container.querySelector('[data-testid="setup-coach"]')).not.toBeNull();

      // 4 players x (settlement + road) x 2 rounds, all placed by clicking glowing board targets
      for (let step = 0; step < 16; step++) {
        const nodeTarget = container.querySelector('[data-testid^="node-target-"]');
        const edgeTarget = container.querySelector('[data-testid^="edge-target-"]');
        const target = (nodeTarget ?? edgeTarget)!.parentElement!;
        expect(target).not.toBeNull();
        act(() => {
          target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
      }

      expect(container.querySelector('[data-testid="setup-coach"]')).toBeNull();
      expect(container.querySelector('[data-testid="action-draw-event-btn"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-testid="island-layer"] [data-piece="town"]').length).toBe(4);
      expect(container.querySelectorAll('[data-testid="island-layer"] [data-piece="city"]').length).toBe(4);
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('displays tooltips explaining what each build item does (e.g. warehouse increases hand size to 10, dev card gives a dev card)', () => {
    expect(BUILD_DESCRIPTIONS.warehouse).toContain('Increases hand size to 10');
    expect(BUILD_DESCRIPTIONS.devCard).toContain('Gives you a development card');

    window.history.pushState({}, '', '/?placement=fixed');
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');

    // Bottom dock build options
    const warehouseBtn = container.querySelector('[data-testid="build-warehouse"]') as HTMLButtonElement;
    expect(warehouseBtn).not.toBeNull();
    const warehouseTitle = warehouseBtn.getAttribute('title') ?? '';
    expect(warehouseTitle.toLowerCase()).toContain('2 energy');
    expect(warehouseTitle.toLowerCase()).toContain('increases hand size to 10');

    const devCardBtn = container.querySelector('[data-testid="build-devCard"]') as HTMLButtonElement;
    expect(devCardBtn).not.toBeNull();
    const devCardTitle = devCardBtn.getAttribute('title') ?? '';
    expect(devCardTitle.toLowerCase()).toContain('costs');
    expect(devCardTitle.toLowerCase()).toContain('gives you a development card');

    // Open the player board drawer to inspect PlayerMat elements
    const toggleMatBtn = container.querySelector('[data-testid="toggle-player-mat-btn"]') as HTMLButtonElement;
    expect(toggleMatBtn).not.toBeNull();
    act(() => {
      toggleMatBtn.click();
    });

    // Player mat warehouse tile
    const warehouseTile = container.querySelector('[data-testid="warehouse-tile"]');
    expect(warehouseTile).not.toBeNull();
    const warehouseTileTitle = warehouseTile?.getAttribute('title') ?? '';
    expect(warehouseTileTitle.toLowerCase()).toContain('increases hand size to 10');

    // Standalone PlayerMat with showOrganiser for quick recipe buttons
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    act(() => {
      render(
        <PlayerMat
          player={state.players.orange}
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

    const quickBuyDev = container.querySelector('[data-testid="quick-buy-dev"]');
    expect(quickBuyDev).not.toBeNull();
    const quickBuyDevTitle = quickBuyDev?.getAttribute('title') ?? '';
    expect(quickBuyDevTitle.toLowerCase()).toContain('gives you a development card');
  });

  it('allows passing production increase event from either the top banner or the dock yellow action button', () => {
    window.history.pushState({}, '', '/?scenario=productionincrease&bots=0');
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');

    // Both pass buttons exist: the top banner button and the primary yellow dock button
    const topPassBtn = container.querySelector('[data-testid="pass-production-increase-btn"]') as HTMLButtonElement;
    expect(topPassBtn).not.toBeNull();

    const dockPassBtn = container.querySelector('[data-testid="action-pass-production-increase-btn"]') as HTMLButtonElement;
    expect(dockPassBtn).not.toBeNull();
    expect(dockPassBtn.disabled).toBe(false);
    expect(dockPassBtn.classList.contains('is-ready')).toBe(true);
    expect(dockPassBtn.textContent).toBe('Pass');

    // Clicking the yellow dock button resolves the decision
    act(() => {
      dockPassBtn.click();
    });

    // Once passed, the decision is resolved and no longer pending
    expect(container.querySelector('[data-testid="action-pass-production-increase-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="pass-production-increase-btn"]')).toBeNull();
  });

  it('renders natural hazard on building with proper SVG transform coordinates immediately', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    state.board.intersections[10]!.hasHazard = true;
    act(() => {
      render(<IslandBoardSvg state={state} />, container);
    });
    const hazardGroup = container.querySelector('[data-testid="node-hazard-10"]');
    expect(hazardGroup).not.toBeNull();
    const transform = hazardGroup?.getAttribute('transform');
    expect(transform).toMatch(/^translate\(-?\d+(\.\d+)?, -?\d+(\.\d+)?\)$/);
    expect(transform).not.toBe('translate(0, 0)');
  });

  it('highlights producing hexes on dice roll even when inspector is present with rich burnt orange flash', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    const hexWithInspector = state.board.hexes.find((h) => h.hasInspector)!;
    act(() => {
      render(
        <IslandBoardSvg
          state={state}
          producingHexIds={new Set([hexWithInspector.id])}
        />,
        container
      );
    });
    const producingEl = container.querySelector(`[data-testid="hex-producing-${hexWithInspector.id}"]`);
    expect(producingEl).not.toBeNull();
    // Check that rich burnt orange styling is applied
    const burntOrangePolygon = producingEl?.querySelector('polygon[stroke="#d94e10"]');
    expect(burntOrangePolygon).not.toBeNull();
  });

  it('renders cancel button on STEAL_TARGET pending decision to allow undoing inspector move', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    const onUndo = vi.fn();
    const onDispatch = vi.fn();
    act(() => {
      render(
        <PendingDecisionBanner
          state={state}
          decision={{
            id: 'steal-1',
            type: 'STEAL_TARGET',
            playerId: 'orange',
            candidatePlayerIds: ['purple', 'blue'],
            hexId: 5,
          }}
          onDispatch={onDispatch}
          onUndo={onUndo}
        />,
        container
      );
    });

    const cancelBtn = container.querySelector('[data-testid="cancel-steal-target-btn"]') as HTMLButtonElement;
    expect(cancelBtn).not.toBeNull();
    act(() => {
      cancelBtn.click();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('renders ClimateConferenceReward modal with in-hand badges and peek at board button', () => {
    const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 42 });
    state.players.orange.resources.lumber = 3;
    state.players.orange.resources.steel = 2;
    state.players.orange.science = 1;
    const onPeek = vi.fn();
    const onDispatch = vi.fn();

    act(() => {
      render(
        <PendingDecisionBanner
          state={state}
          decision={{
            id: 'cc-1',
            type: 'EVENT_CARD_CHOICE',
            playerId: 'orange',
            event: 'ClimateConferenceReward',
            cardCount: 1,
            isOptional: false,
          }}
          onDispatch={onDispatch}
          onPeek={onPeek}
        />,
        container
      );
    });

    // Check in-hand indicators
    expect(container.querySelector('[data-testid="in-hand-lumber"]')?.textContent).toContain('3 in hand');
    expect(container.querySelector('[data-testid="in-hand-steel"]')?.textContent).toContain('2 in hand');
    expect(container.querySelector('[data-testid="in-hand-science"]')?.textContent).toContain('1 in hand');

    // Check peek button
    const peekBtn = container.querySelector('[data-testid="peek-board-btn"]') as HTMLButtonElement;
    expect(peekBtn).not.toBeNull();
    act(() => {
      peekBtn.click();
    });
    expect(onPeek).toHaveBeenCalledTimes(1);
  });

  it('allows peeking at board during ClimateConferenceReward and unhiding via blue dock action button', () => {
    window.history.pushState({}, '', '/?scenario=cardchoice&bots=0');
    act(() => {
      render(<TabletopApp />, container);
    });
    window.history.pushState({}, '', '/');

    // Modal is initially visible
    expect(container.querySelector('[data-testid="pending-decision-modal"]')).not.toBeNull();

    // Click peek button
    const peekBtn = container.querySelector('[data-testid="peek-board-btn"]') as HTMLButtonElement;
    expect(peekBtn).not.toBeNull();
    act(() => {
      peekBtn.click();
    });

    // Modal is hidden
    expect(container.querySelector('[data-testid="pending-decision-modal"]')).toBeNull();

    // Banner and bottom dock button "Unhide card selection" are visible with blue styling
    expect(container.querySelector('[data-testid="peeking-card-choice-banner"]')).not.toBeNull();
    const unhideBtn = container.querySelector('[data-testid="unhide-card-choice-btn"]') as HTMLButtonElement;
    expect(unhideBtn).not.toBeNull();
    expect(unhideBtn.textContent).toBe('Unhide card selection');
    expect(unhideBtn.classList.contains('is-blue')).toBe(true);

    // Click Unhide button
    act(() => {
      unhideBtn.click();
    });

    // Modal is restored
    expect(container.querySelector('[data-testid="pending-decision-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="peeking-card-choice-banner"]')).toBeNull();
  });
});

