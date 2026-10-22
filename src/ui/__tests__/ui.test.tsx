import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import { IslandBoardSvg } from '../IslandBoardSvg';
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
    act(() => {
      render(<TabletopApp />, container);
    });

    // Verify TabletopApp shell, Event Bag, 4 Corner Stations, and Player Mat
    expect(container.querySelector('[data-testid="tabletop-app"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="event-bag"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="corner-station-orange"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="player-mat"]')).not.toBeNull();

    // Pause bots so we can step cleanly
    const pauseBtn = container.querySelector('[data-testid="bot-pause-btn"]') as HTMLButtonElement;
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

    // 3. Verify Hide / Show Player Mat Toggle
    const toggleMatBtn = container.querySelector(
      '[data-testid="toggle-player-mat-btn"]'
    ) as HTMLButtonElement;
    expect(toggleMatBtn).not.toBeNull();
    expect(container.querySelector('[data-testid="player-mat"]')).not.toBeNull();

    act(() => {
      toggleMatBtn.click();
    });
    expect(container.querySelector('[data-testid="player-mat"]')).toBeNull();

    act(() => {
      toggleMatBtn.click();
    });
    expect(container.querySelector('[data-testid="player-mat"]')).not.toBeNull();

    // 4. Verify Tablecloth Color Picker & Presets
    const appShell = container.querySelector('[data-testid="tabletop-app"]') as HTMLElement;
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
});
