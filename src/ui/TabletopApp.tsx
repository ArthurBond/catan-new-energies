/**
 * CATAN: New Energies — Complete Tabletop Application (`src/ui/TabletopApp.tsx`)
 *
 * Integrates:
 * 1. Buffalo-Plaid Gingham Tablecloth & Responsive Pan/Zoom Viewport (`1366x768` to `1920x1080+`)
 * 2. Central Circular Island Board (`IslandBoardSvg` + `SeaFrameSvg`)
 * 3. 4 Corner Player Stations (click to inspect any player's full graphic Player Mat)
 * 4. Left Margin: Longest Trade Route & Cleanest Environment tiles, 3D Cream + Green Dice,
 *    Hazard Cog & Energy Bolt supply piles, and Turn Log
 * 5. Right Margin: Interactive Canvas Event Disc Bag (`[data-testid="event-bag"]`),
 *    5 Resource + 1 Science face-up supply stacks, and Development Card deck
 * 6. Bottom Showcase Dock: Action Phase Bar + `PlayerMat` + `ResourceOrganiser`
 * 7. AI Bot Turn Scheduler (`chooseBotAction`), Hotseat Privacy Curtain, Multi-Tab BroadcastChannel Sync,
 *    Undo Stack, and URL Query Parameter Autostart (`/?seed=42&setup=first&players=4&autostart=1`).
 */

import 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  BotDifficulty,
  chooseBotAction,
  getActingPlayerId,
} from '../ai/bot';
import { legalActions } from '../engine/actions';
import { getEventDiscDrawCount } from '../engine/config';
import { getHandSizeForSeven } from '../engine/production';
import { applyAction } from '../engine/reducer';
import { createInitialGameState } from '../engine/setup';
import {
  DevelopmentCardType,
  EdgeId,
  EventDiscType,
  GameAction,
  GameState,
  HexId,
  NodeId,
  PlayerId,
  ResourceType,
} from '../engine/types';
import { BroadcastChannelTransport } from '../network/transport';
import { IslandBoardSvg } from './IslandBoardSvg';
import {
  DevCardPlayModal,
  EnergyBuyCardModal,
  LobbyConfig,
  LobbyModal,
  PendingDecisionBanner,
  PrivacyCurtainModal,
  SeatConfig,
  TradeModal,
  VictoryModal,
} from './Modals';
import { ActiveBuildMode, PlayerMat } from './PlayerMat';
import {
  CARD_METADATA,
  EVENT_TRACK_METADATA,
  PLAYER_THEMES,
} from './theme';
import {
  EnergyBoltSvg,
  HazardCogSvg,
  PlayerEmblemSvg,
  ResourceIconSvg,
} from './WoodenPiecesSvg';

const STORAGE_KEY = 'catan_new_energies_saved_state_v1';
const TABLECLOTH_COLOR_KEY = 'catan_new_energies_tablecloth_color_v1';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 24;
  const g = parseInt(full.slice(2, 4), 16) || 26;
  const b = parseInt(full.slice(4, 6), 16) || 29;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToLightBase(hex: string): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 24;
  const g = parseInt(full.slice(2, 4), 16) || 26;
  const b = parseInt(full.slice(4, 6), 16) || 29;
  const mix = (channel: number) => Math.round(channel * 0.25 + 235 * 0.75);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function parseUrlParams(): {
  seed: number;
  setupMode: 'first' | 'standard';
  playerCount: 3 | 4;
  autostart: boolean;
  allHuman: boolean;
  allBots: boolean;
  roomCode: string;
} {
  if (typeof window === 'undefined') {
    return {
      seed: 42,
      setupMode: 'first',
      playerCount: 4,
      autostart: true,
      allHuman: false,
      allBots: false,
      roomCode: '',
    };
  }
  const params = new URLSearchParams(window.location.search);
  const seed = parseInt(params.get('seed') ?? '42', 10) || 42;
  const setupMode = params.get('setup') === 'standard' ? 'standard' : 'first';
  const playerCount = params.get('players') === '3' ? 3 : 4;
  const autostart = params.get('lobby') !== '1';
  const allHuman = params.get('bots') === '0' || params.get('mode') === 'hotseat';
  const allBots = params.get('bots') === 'all';
  const roomCode = (params.get('room') ?? '').toUpperCase();

  return { seed, setupMode, playerCount, autostart, allHuman, allBots, roomCode };
}

function createDefaultLobbyConfig(): LobbyConfig {
  const url = parseUrlParams();
  const seats: Record<PlayerId, SeatConfig> = {
    orange: {
      playerId: 'orange',
      name: 'Orange',
      controller: url.allBots ? 'bot' : 'human',
      botStrategy: 'Balanced',
      botDifficulty: 'normal',
    },
    purple: {
      playerId: 'purple',
      name: 'Purple',
      controller: url.allHuman ? 'human' : 'bot',
      botStrategy: 'GreenInnovator',
      botDifficulty: 'normal',
    },
    pink: {
      playerId: 'pink',
      name: 'Pink',
      controller: url.allHuman ? 'human' : 'bot',
      botStrategy: 'IndustrialExpansionist',
      botDifficulty: 'normal',
    },
    blue: {
      playerId: 'blue',
      name: 'Blue',
      controller: url.allHuman ? 'human' : 'bot',
      botStrategy: 'Balanced',
      botDifficulty: 'hard',
    },
  };

  return {
    playerCount: url.playerCount,
    setupMode: url.setupMode,
    seed: url.seed,
    botSpeed: 'normal',
    privacyCurtain: false,
    roomCode: url.roomCode,
    seats,
  };
}

function mapDifficulty(d: 'easy' | 'normal' | 'hard'): BotDifficulty {
  if (d === 'easy') return 'Easy';
  if (d === 'hard') return 'Hard';
  return 'Normal';
}

/**
 * Renders a 3D pipped tabletop die (cream or green)
 */
function DieFaceSvg({
  value,
  bgColor,
  pipColor,
  strokeColor,
}: {
  value: number;
  bgColor: string;
  pipColor: string;
  strokeColor: string;
}) {
  const pipCoords: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [
      [-6, -6],
      [6, 6],
    ],
    3: [
      [-6, -6],
      [0, 0],
      [6, 6],
    ],
    4: [
      [-6, -6],
      [6, -6],
      [-6, 6],
      [6, 6],
    ],
    5: [
      [-6, -6],
      [6, -6],
      [0, 0],
      [-6, 6],
      [6, 6],
    ],
    6: [
      [-6, -6],
      [6, -6],
      [-6, 0],
      [6, 0],
      [-6, 6],
      [6, 6],
    ],
  };

  const coords = pipCoords[value] ?? pipCoords[1]!;

  return (
    <svg width="36" height="36" viewBox="-18 -18 36 36">
      <rect x="-14" y="-12" width="29" height="29" rx="6" fill="rgba(0,0,0,0.4)" />
      <rect
        x="-15"
        y="-15"
        width="29"
        height="29"
        rx="6"
        fill={bgColor}
        stroke={strokeColor}
        strokeWidth="1.8"
      />
      {coords.map(([px, py], idx) => (
        <circle key={idx} cx={px} cy={py} r={2.4} fill={pipColor} />
      ))}
    </svg>
  );
}

export function TabletopApp() {
  const initialUrl = useMemo(() => parseUrlParams(), []);
  const [lobbyConfig, setLobbyConfig] = useState<LobbyConfig>(() => createDefaultLobbyConfig());
  const [showLobby, setShowLobby] = useState<boolean>(!initialUrl.autostart);

  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState({
      setupMode: lobbyConfig.setupMode,
      playerCount: lobbyConfig.playerCount,
      seed: lobbyConfig.seed,
      setupRoll: lobbyConfig.setupMode === 'standard',
      playerNames: {
        orange: lobbyConfig.seats.orange.name,
        purple: lobbyConfig.seats.purple.name,
        pink: lobbyConfig.seats.pink.name,
        blue: lobbyConfig.seats.blue.name,
      },
    })
  );

  const [history, setHistory] = useState<GameState[]>([]);
  const [activeBuildMode, setActiveBuildMode] = useState<ActiveBuildMode>(null);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showEnergyCardModal, setShowEnergyCardModal] = useState(false);
  const [devCardPrompt, setDevCardPrompt] = useState<{
    cardId: string;
    cardType: DevelopmentCardType;
  } | null>(null);
  const [dismissedVictoryModal, setDismissedVictoryModal] = useState(false);
  const [selectedEventInfo, setSelectedEventInfo] = useState<EventDiscType | null>(null);
  const [privacyCurtainForPlayer, setPrivacyCurtainForPlayer] = useState<PlayerId | null>(null);
  const [botPaused, setBotPaused] = useState(false);
  const [isPlayerMatHidden, setIsPlayerMatHidden] = useState(false);

  // Tablecloth color state (changeable to any color via color picker or presets)
  const [tableclothColor, setTableclothColor] = useState<string>(() => {
    try {
      return localStorage.getItem(TABLECLOTH_COLOR_KEY) || '#181a1d';
    } catch {
      return '#181a1d';
    }
  });

  const handleTableclothColorChange = (newColor: string) => {
    setTableclothColor(newColor);
    try {
      localStorage.setItem(TABLECLOTH_COLOR_KEY, newColor);
    } catch {
      // Ignore storage errors
    }
  };

  // Animated Tabletop Dice Roll overlay state (tumbles onto the table & stays on the side)
  const [diceRollOverlay, setDiceRollOverlay] = useState<{
    rollId: number;
    die1: number;
    die2: number;
    playerId: PlayerId;
  } | null>(null);

  // Animated Live Action Banner state (displays latest action & gamestate clearly on tabletop)
  const [liveActionBanner, setLiveActionBanner] = useState<{
    actionId: number;
    playerId: PlayerId;
    title: string;
    detail: string;
    category: 'event' | 'dice' | 'build' | 'trade' | 'energy' | 'turn';
  } | null>(null);

  // Pan & Zoom state for the central circular board (supports zooming up to 5.0x)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Multi-tab BroadcastChannel sync when roomCode is active
  const transportRef = useRef<BroadcastChannelTransport | null>(null);

  useEffect(() => {
    if (!lobbyConfig.roomCode) {
      transportRef.current?.close();
      transportRef.current = null;
      return;
    }
    const transport = new BroadcastChannelTransport(lobbyConfig.roomCode);
    transportRef.current = transport;
    const unsub = transport.onMessage((msg) => {
      if (msg.type === 'ACTION_REQUEST') {
        setGameState((prev) => {
          try {
            return applyAction(prev, msg.action);
          } catch {
            return prev;
          }
        });
      }
    });
    return () => {
      unsub();
      transport.close();
    };
  }, [lobbyConfig.roomCode]);

  const actingPlayerId = getActingPlayerId(gameState) ?? gameState.activePlayerId;
  const actingSeat = lobbyConfig.seats[actingPlayerId];
  const isActingPlayerBot = actingSeat?.controller === 'bot';

  // Displayed player on the bottom showcase mat: either user-inspected player or active/human player
  const displayedMatPlayerId: PlayerId =
    inspectedPlayerId && gameState.players[inspectedPlayerId]
      ? inspectedPlayerId
      : gameState.players[actingPlayerId] && lobbyConfig.seats[actingPlayerId]?.controller === 'human'
        ? actingPlayerId
        : gameState.playerOrder.find((pid) => lobbyConfig.seats[pid]?.controller === 'human') ??
          gameState.activePlayerId;

  const displayedPlayer = gameState.players[displayedMatPlayerId]!;

  // Dispatch game action with history + persistence + multi-tab broadcast + live visual animations
  const dispatchAction = (action: GameAction) => {
    try {
      const prevActing = getActingPlayerId(gameState);
      const next = applyAction(gameState, action);
      const nextActing = getActingPlayerId(next);

      setHistory((prev) => [...prev.slice(-24), gameState]);
      setGameState(next);
      setActiveBuildMode(null);

      const latestLogMsg =
        next.log[next.log.length - 1]?.message ?? `${action.playerId}: ${action.type}`;
      const actorName = next.players[action.playerId]?.name ?? action.playerId;

      if (action.type === 'ROLL_DICE' && next.lastDiceRoll) {
        const [d1, d2] = next.lastDiceRoll;
        setDiceRollOverlay({
          rollId: Date.now(),
          die1: d1,
          die2: d2,
          playerId: action.playerId,
        });
        setLiveActionBanner({
          actionId: Date.now(),
          playerId: action.playerId,
          title: `🎲 ${actorName} Rolled ${d1 + d2} (${d1} + ${d2})`,
          detail: latestLogMsg,
          category: 'dice',
        });
      } else if (action.type === 'DRAW_EVENT_DISC') {
        setLiveActionBanner({
          actionId: Date.now(),
          playerId: action.playerId,
          title: `⚡ ${actorName} Drew an Event Disc`,
          detail: latestLogMsg,
          category: 'event',
        });
      } else if (
        action.type === 'BUILD_ROAD' ||
        action.type === 'BUILD_TOWN' ||
        action.type === 'BUILD_CITY' ||
        action.type === 'BUILD_FOSSIL_PLANT' ||
        action.type === 'BUILD_RENEWABLE_PLANT' ||
        action.type === 'BUILD_WAREHOUSE' ||
        action.type === 'BUY_DEV_CARD'
      ) {
        setLiveActionBanner({
          actionId: Date.now(),
          playerId: action.playerId,
          title: `🏗️ ${actorName}: ${action.type.replace(/_/g, ' ')}`,
          detail: latestLogMsg,
          category: 'build',
        });
      } else if (action.type === 'SPEND_ENERGY') {
        setLiveActionBanner({
          actionId: Date.now(),
          playerId: action.playerId,
          title: `⚡ ${actorName}: Energy (${action.usage.replace(/_/g, ' ')})`,
          detail: latestLogMsg,
          category: 'energy',
        });
      } else if (
        action.type === 'TRADE_SUPPLY' ||
        action.type === 'TRADE_HARBOR' ||
        action.type === 'OFFER_TRADE'
      ) {
        setLiveActionBanner({
          actionId: Date.now(),
          playerId: action.playerId,
          title: `🤝 ${actorName}: ${action.type.replace(/_/g, ' ')}`,
          detail: latestLogMsg,
          category: 'trade',
        });
      } else if (action.type === 'END_TURN') {
        const nextPlayerName = next.players[next.activePlayerId]?.name ?? next.activePlayerId;
        setLiveActionBanner({
          actionId: Date.now(),
          playerId: next.activePlayerId,
          title: `➡️ Turn ${next.currentTurn}: ${nextPlayerName}'s Turn`,
          detail: latestLogMsg,
          category: 'turn',
        });
      } else {
        setLiveActionBanner({
          actionId: Date.now(),
          playerId: action.playerId,
          title: `${actorName}: ${action.type.replace(/_/g, ' ')}`,
          detail: latestLogMsg,
          category: 'turn',
        });
      }

      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }

      // Broadcast to other tabs if roomCode is set
      if (transportRef.current) {
        transportRef.current.send({
          type: 'ACTION_REQUEST',
          roomId: lobbyConfig.roomCode,
          playerId: action.playerId,
          seatToken: 'local',
          action,
        });
      }

      // Trigger hotseat privacy curtain if switching between two distinct human seats
      if (
        lobbyConfig.privacyCurtain &&
        nextActing &&
        prevActing !== nextActing &&
        lobbyConfig.seats[nextActing]?.controller === 'human' &&
        lobbyConfig.seats[prevActing ?? 'orange']?.controller === 'human'
      ) {
        setPrivacyCurtainForPlayer(nextActing);
      }
    } catch (err) {
      console.warn('Action rejected:', err);
    }
  };

  // Start a new game from Lobby
  const handleStartNewGame = (cfg: LobbyConfig) => {
    setLobbyConfig(cfg);
    const fresh = createInitialGameState({
      setupMode: cfg.setupMode,
      playerCount: cfg.playerCount,
      seed: cfg.seed,
      setupRoll: cfg.setupMode === 'standard',
      playerNames: {
        orange: cfg.seats.orange.name,
        purple: cfg.seats.purple.name,
        pink: cfg.seats.pink.name,
        blue: cfg.seats.blue.name,
      },
    });
    setGameState(fresh);
    setHistory([]);
    setActiveBuildMode(null);
    setInspectedPlayerId(null);
    setDismissedVictoryModal(false);
    setShowLobby(false);
  };

  // Undo last action
  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setGameState(prev);
    setActiveBuildMode(null);
  };

  // Automated Bot Turn Scheduler
  useEffect(() => {
    if (showLobby || botPaused || privacyCurtainForPlayer !== null) return;
    if (gameState.phase === 'GameEnd' || gameState.winner !== null) return;

    const currentActor = getActingPlayerId(gameState);
    if (!currentActor) return;
    const seat = lobbyConfig.seats[currentActor];
    if (!seat || seat.controller !== 'bot') return;

    const delayMs =
      lobbyConfig.botSpeed === 'instant'
        ? 10
        : lobbyConfig.botSpeed === 'fast'
          ? 140
          : 520;

    const timer = setTimeout(() => {
      try {
        const botAction = chooseBotAction(gameState, currentActor, {
          personality: seat.botStrategy,
          difficulty: mapDifficulty(seat.botDifficulty),
        });
        dispatchAction(botAction);
      } catch (e) {
        console.warn('Bot failed to choose action:', e);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [gameState, showLobby, botPaused, privacyCurtainForPlayer, lobbyConfig]);

  // Compute legal actions for the currently acting human player to drive interactive board highlights
  const currentLegalActions = useMemo(() => {
    if (isActingPlayerBot) return [];
    return legalActions(gameState, actingPlayerId);
  }, [gameState, actingPlayerId, isActingPlayerBot]);

  const headDecision = gameState.pendingDecisions[0] ?? null;

  // Compute Highlighted Board Targets (Hexes, Intersections, Edges, Power Plant Cutouts)
  const {
    highlightedHexIds,
    highlightedNodeIds,
    highlightedEdgeIds,
    highlightedCutoutSlots,
  } = useMemo(() => {
    const hexes = new Set<HexId>();
    const nodes = new Set<NodeId>();
    const edges = new Set<EdgeId>();
    const cutouts = new Set<string>();

    if (isActingPlayerBot) {
      return {
        highlightedHexIds: hexes,
        highlightedNodeIds: nodes,
        highlightedEdgeIds: edges,
        highlightedCutoutSlots: cutouts,
      };
    }

    // 1. Pending Decision Highlights
    if (headDecision && headDecision.playerId === actingPlayerId) {
      if (headDecision.type === 'SETUP_PLACE_SETTLEMENT') {
        for (const a of currentLegalActions) {
          if (a.type === 'SETUP_BUILD_TOWN' || a.type === 'SETUP_BUILD_CITY') {
            nodes.add(a.nodeId);
          }
        }
      } else if (headDecision.type === 'SETUP_PLACE_ROAD') {
        for (const a of currentLegalActions) {
          if (a.type === 'SETUP_BUILD_ROAD') {
            edges.add(a.edgeId);
          }
        }
      } else if (headDecision.type === 'MOVE_INSPECTOR') {
        for (const h of gameState.board.hexes) {
          if (!h.hasHazard && !h.hasInspector) hexes.add(h.id);
        }
      } else if (headDecision.type === 'EVENT_HAZARD_CHOICE') {
        for (const a of currentLegalActions) {
          if (a.type === 'RESOLVE_PENDING_DECISION') {
            const resp = a.response as { nodeId?: NodeId };
            if (resp.nodeId !== undefined) nodes.add(resp.nodeId);
          }
        }
      } else if (headDecision.type === 'EVENT_PRODUCTION_INCREASE') {
        for (const a of currentLegalActions) {
          if (a.type === 'RESOLVE_PENDING_DECISION') {
            const resp = a.response as { build?: boolean; nodeId?: NodeId; hexId?: HexId };
            if (resp.build && resp.nodeId !== undefined && resp.hexId !== undefined) {
              cutouts.add(`${resp.nodeId}-${resp.hexId}`);
            }
          }
        }
      }
      return {
        highlightedHexIds: hexes,
        highlightedNodeIds: nodes,
        highlightedEdgeIds: edges,
        highlightedCutoutSlots: cutouts,
      };
    }

    // 2. Action Phase Active Build Mode Highlights
    if (activeBuildMode === 'BUILD_ROAD') {
      for (const a of currentLegalActions) {
        if (a.type === 'BUILD_ROAD') edges.add(a.edgeId);
      }
    } else if (activeBuildMode === 'BUILD_TOWN') {
      for (const a of currentLegalActions) {
        if (a.type === 'BUILD_TOWN') nodes.add(a.nodeId);
      }
    } else if (activeBuildMode === 'BUILD_CITY') {
      for (const a of currentLegalActions) {
        if (a.type === 'BUILD_CITY') nodes.add(a.nodeId);
      }
    } else if (activeBuildMode === 'BUILD_FOSSIL_PLANT') {
      for (const a of currentLegalActions) {
        if (a.type === 'BUILD_FOSSIL_PLANT') {
          cutouts.add(`${a.nodeId}-${a.hexId}`);
        }
      }
    } else if (activeBuildMode === 'BUILD_RENEWABLE_PLANT') {
      for (const a of currentLegalActions) {
        if (a.type === 'BUILD_RENEWABLE_PLANT') {
          cutouts.add(`${a.nodeId}-${a.hexId}`);
        }
      }
    } else if (activeBuildMode === 'CLEAN_HAZARD') {
      for (const h of gameState.board.hexes) {
        if (h.hasHazard) hexes.add(h.id);
      }
      for (const n of gameState.board.intersections) {
        if (n.hasHazard) nodes.add(n.id);
      }
    } else if (activeBuildMode === 'DEMOLISH_PLANT') {
      for (const n of gameState.board.intersections) {
        for (const p of n.powerPlants) {
          if (p.playerId === actingPlayerId && p.type === 'fossil') {
            cutouts.add(`${n.id}-${p.hexId}`);
          }
        }
      }
    }

    return {
      highlightedHexIds: hexes,
      highlightedNodeIds: nodes,
      highlightedEdgeIds: edges,
      highlightedCutoutSlots: cutouts,
    };
  }, [
    isActingPlayerBot,
    headDecision,
    actingPlayerId,
    currentLegalActions,
    activeBuildMode,
    gameState.board,
  ]);

  // Board Click Handlers
  const handleHexClick = (hexId: HexId) => {
    if (isActingPlayerBot) return;
    if (headDecision?.type === 'MOVE_INSPECTOR' && highlightedHexIds.has(hexId)) {
      dispatchAction({
        type: 'RESOLVE_PENDING_DECISION',
        playerId: actingPlayerId,
        decisionId: headDecision.id,
        response: { hexId },
      });
      return;
    }
    if (activeBuildMode === 'CLEAN_HAZARD' && highlightedHexIds.has(hexId)) {
      dispatchAction({
        type: 'SPEND_ENERGY',
        playerId: actingPlayerId,
        usage: 'CLEAN_HAZARD',
        params: { hazardTarget: { kind: 'hex', id: hexId } },
      });
    }
  };

  const handleNodeClick = (nodeId: NodeId) => {
    if (isActingPlayerBot) return;
    if (headDecision?.type === 'SETUP_PLACE_SETTLEMENT' && highlightedNodeIds.has(nodeId)) {
      dispatchAction({
        type: headDecision.round === 1 ? 'SETUP_BUILD_TOWN' : 'SETUP_BUILD_CITY',
        playerId: actingPlayerId,
        nodeId,
      });
      return;
    }
    if (headDecision?.type === 'EVENT_HAZARD_CHOICE' && highlightedNodeIds.has(nodeId)) {
      dispatchAction({
        type: 'RESOLVE_PENDING_DECISION',
        playerId: actingPlayerId,
        decisionId: headDecision.id,
        response: { nodeId },
      });
      return;
    }
    if (activeBuildMode === 'BUILD_TOWN' && highlightedNodeIds.has(nodeId)) {
      dispatchAction({ type: 'BUILD_TOWN', playerId: actingPlayerId, nodeId });
      return;
    }
    if (activeBuildMode === 'BUILD_CITY' && highlightedNodeIds.has(nodeId)) {
      dispatchAction({ type: 'BUILD_CITY', playerId: actingPlayerId, nodeId });
      return;
    }
    if (activeBuildMode === 'CLEAN_HAZARD' && highlightedNodeIds.has(nodeId)) {
      dispatchAction({
        type: 'SPEND_ENERGY',
        playerId: actingPlayerId,
        usage: 'CLEAN_HAZARD',
        params: { hazardTarget: { kind: 'node', id: nodeId } },
      });
    }
  };

  const handleEdgeClick = (edgeId: EdgeId) => {
    if (isActingPlayerBot) return;
    if (headDecision?.type === 'SETUP_PLACE_ROAD' && highlightedEdgeIds.has(edgeId)) {
      dispatchAction({
        type: 'SETUP_BUILD_ROAD',
        playerId: actingPlayerId,
        edgeId,
      });
      return;
    }
    if (activeBuildMode === 'BUILD_ROAD' && highlightedEdgeIds.has(edgeId)) {
      dispatchAction({ type: 'BUILD_ROAD', playerId: actingPlayerId, edgeId });
    }
  };

  const handleCutoutClick = (nodeId: NodeId, hexId: HexId) => {
    if (isActingPlayerBot) return;
    const key = `${nodeId}-${hexId}`;
    if (!highlightedCutoutSlots.has(key)) return;

    if (headDecision?.type === 'EVENT_PRODUCTION_INCREASE') {
      dispatchAction({
        type: 'RESOLVE_PENDING_DECISION',
        playerId: actingPlayerId,
        decisionId: headDecision.id,
        response: { build: true, nodeId, hexId },
      });
      return;
    }
    if (activeBuildMode === 'BUILD_FOSSIL_PLANT') {
      dispatchAction({ type: 'BUILD_FOSSIL_PLANT', playerId: actingPlayerId, nodeId, hexId });
      return;
    }
    if (activeBuildMode === 'BUILD_RENEWABLE_PLANT') {
      dispatchAction({ type: 'BUILD_RENEWABLE_PLANT', playerId: actingPlayerId, nodeId, hexId });
      return;
    }
    if (activeBuildMode === 'DEMOLISH_PLANT') {
      dispatchAction({
        type: 'SPEND_ENERGY',
        playerId: actingPlayerId,
        usage: 'DEMOLISH_PLANT',
        params: { plantTarget: { nodeId, hexId } },
      });
    }
  };

  const drawCountThisTurn =
    gameState.lockedDrawCount ??
    getEventDiscDrawCount(gameState.clampedGF, gameState.playerCount);

  const canDrawEventDisc =
    !isActingPlayerBot &&
    gameState.phase === 'EventPhase' &&
    gameState.pendingDecisions.length === 0;

  const canRollDice =
    !isActingPlayerBot &&
    gameState.phase === 'ProductionPhase' &&
    gameState.pendingDecisions.length === 0;

  const canEndTurn =
    !isActingPlayerBot &&
    gameState.phase === 'ActionPhase' &&
    gameState.pendingDecisions.length === 0;

  const canRollSetupDice =
    !isActingPlayerBot &&
    gameState.phase === 'SetupRoll' &&
    (gameState.activePlayerId === displayedMatPlayerId || !gameState.setupRolls?.[displayedMatPlayerId]);

  const activePlayerTheme = PLAYER_THEMES[gameState.activePlayerId];

  // Compute producing hexes on the latest dice roll
  const producingHexIds = useMemo(() => {
    const prod = new Set<HexId>();
    if (!gameState.lastDiceRoll) return prod;
    const sum = gameState.lastDiceRoll[0] + gameState.lastDiceRoll[1];
    if (sum === 7) return prod;
    for (const h of gameState.board.hexes) {
      if (h.numberDisc === sum && !h.hasHazard && !h.hasInspector) {
        prod.add(h.id);
      }
    }
    return prod;
  }, [gameState.lastDiceRoll, gameState.board.hexes]);

  // Redact private cards on the bottom mat if viewing an AI bot's mat or if privacy curtain is up
  const shouldRedactDisplayedMat =
    privacyCurtainForPlayer !== null ||
    lobbyConfig.seats[displayedMatPlayerId]?.controller === 'bot';

  const ginghamRgba = hexToRgba(tableclothColor, 0.58);
  const ginghamBase = hexToLightBase(tableclothColor);

  return (
    <div
      data-testid="tabletop-app"
      data-tablecloth-color={tableclothColor}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        // Customizable buffalo-plaid gingham tablecloth (default #181a1d, changeable to any color)
        backgroundColor: ginghamBase,
        backgroundImage: `
          linear-gradient(90deg, ${ginghamRgba} 50%, transparent 50%),
          linear-gradient(${ginghamRgba} 50%, transparent 50%)
        `,
        backgroundSize: '56px 56px',
        color: '#f0f4f8',
      }}
    >
      {/* =================================================================== */}
      {/* 1. TOP STATUS PILL & TABLETOP CONTROLS BAR                          */}
      {/* =================================================================== */}
      <header
        data-testid="status-hud-bar"
        style={{
          height: '46px',
          background: 'rgba(18, 22, 28, 0.94)',
          borderBottom: '2px solid #363d49',
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 90,
          boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
        }}
      >
        {/* Left: Game Brand & Active Turn Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontWeight: 900,
              fontSize: '14.5px',
              color: '#f5d11d',
              letterSpacing: '0.5px',
            }}
          >
            CATAN: NEW ENERGIES
          </span>

          <div
            data-testid="active-turn-pill"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: activePlayerTheme.fill,
              color: activePlayerTheme.textOnFill,
              fontWeight: 900,
              fontSize: '12px',
            }}
          >
            <svg width="16" height="16" viewBox="-8 -8 16 16">
              <PlayerEmblemSvg playerId={gameState.activePlayerId} cx={0} cy={0} r={5} />
            </svg>
            <span>
              Turn {gameState.currentTurn}: {gameState.players[gameState.activePlayerId]?.name} (
              {gameState.phase})
            </span>
          </div>
        </div>

        {/* Center: Global Metrics Summary Pill */}
        <div
          data-testid="global-metrics-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '4px 12px',
            borderRadius: '18px',
            background: '#232830',
            border: '1px solid #454d5c',
            fontSize: '11.5px',
            fontWeight: 800,
          }}
        >
          <span title="Clamped Global Footprint (True Total LF)">
            Global Footprint:{' '}
            <strong style={{ color: '#8ce09a' }}>
              {gameState.clampedGF} / {gameState.playerCount === 4 ? 28 : 21}
            </strong>{' '}
            (Draws: {drawCountThisTurn})
          </span>
          <span>|</span>
          <span data-testid="hud-bag-count">
            Event Bag: <strong style={{ color: '#f5d11d' }}>{gameState.eventBag.length}</strong> discs
          </span>
          <span>|</span>
          <span>
            Hazards Left: <strong>{gameState.supply.hazards}</strong>
          </span>
        </div>

        {/* Right: Tablecloth Color Picker, Zoom Controls, Hide Mat & Utility Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Custom Tablecloth Color Picker + Presets */}
          <div
            data-testid="tablecloth-color-picker"
            title="Change tablecloth color to any color"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: '#232830',
              border: '1px solid #4a5260',
              borderRadius: '7px',
              padding: '3px 7px',
            }}
          >
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#cbd5e0' }}>Cloth:</span>
            <input
              type="color"
              data-testid="tablecloth-color-input"
              aria-label="Tablecloth color picker"
              value={tableclothColor}
              onInput={(e) => handleTableclothColorChange((e.target as HTMLInputElement).value)}
              onChange={(e) => handleTableclothColorChange((e.target as HTMLInputElement).value)}
              style={{
                width: '20px',
                height: '20px',
                padding: 0,
                border: '1px solid #ffffff',
                borderRadius: '4px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            {[
              { color: '#181a1d', label: 'Classic Black' },
              { color: '#133b63', label: 'Ocean Blue' },
              { color: '#174f2c', label: 'Forest Green' },
              { color: '#7a1c1c', label: 'Picnic Red' },
            ].map((preset) => (
              <button
                key={preset.color}
                type="button"
                data-testid={`tablecloth-preset-${preset.color.slice(1)}`}
                title={`Tablecloth: ${preset.label}`}
                onClick={() => handleTableclothColorChange(preset.color)}
                style={{
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  background: preset.color,
                  border:
                    tableclothColor.toLowerCase() === preset.color
                      ? '2px solid #f5d11d'
                      : '1px solid #a0aec0',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Extended Zoom Controls (0.6x up to 5.0x — >2x more zoom) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              background: '#232830',
              border: '1px solid #4a5260',
              borderRadius: '7px',
              padding: '2px 5px',
            }}
          >
            <button
              type="button"
              data-testid="zoom-out-btn"
              title="Zoom Out"
              onClick={() =>
                setZoom((z) => Math.max(0.6, Number((z - 0.35).toFixed(2))))
              }
              style={{
                padding: '2px 7px',
                borderRadius: '5px',
                background: '#2d333d',
                color: '#ffffff',
                border: 'none',
                fontSize: '12px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              &minus;
            </button>
            <span
              data-testid="zoom-level-readout"
              style={{
                fontSize: '10.5px',
                fontWeight: 800,
                minWidth: '38px',
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              data-testid="zoom-in-btn"
              title="Zoom In (up to 500%)"
              onClick={() =>
                setZoom((z) => Math.min(5.0, Number((z + 0.35).toFixed(2))))
              }
              style={{
                padding: '2px 7px',
                borderRadius: '5px',
                background: '#2d333d',
                color: '#ffffff',
                border: 'none',
                fontSize: '12px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>

          {/* Hide / Show Player Mat Toggle */}
          <button
            type="button"
            data-testid="toggle-player-mat-btn"
            onClick={() => setIsPlayerMatHidden((h) => !h)}
            style={{
              padding: '5px 9px',
              borderRadius: '7px',
              background: isPlayerMatHidden ? '#276749' : '#2d333d',
              color: '#ffffff',
              border: '1px solid #4a5260',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {isPlayerMatHidden ? 'Show Mat' : 'Hide Mat'}
          </button>

          <button
            type="button"
            data-testid="undo-btn"
            disabled={history.length === 0}
            onClick={handleUndo}
            style={{
              padding: '5px 9px',
              borderRadius: '7px',
              background: history.length > 0 ? '#2d333d' : '#1e2228',
              color: history.length > 0 ? '#ffffff' : '#636b78',
              border: '1px solid #4a5260',
              fontSize: '11px',
              fontWeight: 800,
              cursor: history.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            Undo
          </button>

          <button
            type="button"
            data-testid="bot-pause-btn"
            onClick={() => setBotPaused((p) => !p)}
            style={{
              padding: '5px 9px',
              borderRadius: '7px',
              background: botPaused ? '#c93b2b' : '#2d333d',
              color: '#ffffff',
              border: '1px solid #4a5260',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {botPaused ? 'Resume Bots' : 'Pause Bots'}
          </button>

          <button
            type="button"
            data-testid="reset-view-btn"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            style={{
              padding: '5px 9px',
              borderRadius: '7px',
              background: '#2d333d',
              color: '#ffffff',
              border: '1px solid #4a5260',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Reset View
          </button>

          <button
            type="button"
            data-testid="open-lobby-btn"
            onClick={() => setShowLobby(true)}
            style={{
              padding: '5px 11px',
              borderRadius: '7px',
              background: '#3676c8',
              color: '#ffffff',
              border: '1px solid #90cdf4',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Game Setup
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. MIDDLE TABLETOP WORKSPACE (LEFT MARGIN + BOARD + RIGHT MARGIN)   */}
      {/* =================================================================== */}
      <div
        style={{
          flex: '1 1 auto',
          display: 'grid',
          gridTemplateColumns: '214px minmax(0, 1fr) 214px',
          minHeight: 0,
          position: 'relative',
          padding: '6px 10px',
          gap: '8px',
        }}
      >
        {/* ----------------------------------------------------------------- */}
        {/* LEFT TABLETOP MARGIN: Special Awards, 3D Dice, Tokens & Game Log  */}
        {/* ----------------------------------------------------------------- */}
        <aside
          data-testid="left-table-margin"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 30,
            minHeight: 0,
          }}
        >
          {/* Special Award 1: Cleanest Environment (2 VP) */}
          <div
            data-testid="award-cleanest-environment"
            style={{
              background: 'linear-gradient(135deg, #274f34 0%, #193622 100%)',
              border: '2px solid #8ce09a',
              borderRadius: '10px',
              padding: '8px 10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#8ce09a' }}>
                CLEANEST ENVIRONMENT
              </span>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#f5d11d' }}>+2 VP</span>
            </div>
            <div style={{ fontSize: '11.5px', marginTop: '4px', fontWeight: 800 }}>
              {gameState.cleanestEnvironmentHolder ? (
                <span style={{ color: PLAYER_THEMES[gameState.cleanestEnvironmentHolder].fill }}>
                  Holder: {gameState.players[gameState.cleanestEnvironmentHolder]?.name} (
                  {gameState.specialAwards.cleanestEnvironment.cleanupCount} Cleanups)
                </span>
              ) : (
                <span style={{ color: '#cbd5e0' }}>Unclaimed (Requires &ge; 3 Cleanups)</span>
              )}
            </div>
          </div>

          {/* Special Award 2: Longest Trade Route (2 VP) */}
          <div
            data-testid="award-longest-road"
            style={{
              background: 'linear-gradient(135deg, #4f3524 0%, #332014 100%)',
              border: '2px solid #f0b418',
              borderRadius: '10px',
              padding: '8px 10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#f5d11d' }}>
                LONGEST TRADE ROUTE
              </span>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#f5d11d' }}>+2 VP</span>
            </div>
            <div style={{ fontSize: '11.5px', marginTop: '4px', fontWeight: 800 }}>
              {gameState.longestRoadHolder ? (
                <span style={{ color: PLAYER_THEMES[gameState.longestRoadHolder].fill }}>
                  Holder: {gameState.players[gameState.longestRoadHolder]?.name} (
                  {gameState.specialAwards.longestRoad.length} Roads)
                </span>
              ) : (
                <span style={{ color: '#cbd5e0' }}>Unclaimed (Requires &ge; 5 Roads)</span>
              )}
            </div>
          </div>

          {/* 2 3D Pipped Dice (1 Cream Die, 1 Green Die matching UI-design-style.png) */}
          <div
            data-testid="table-dice"
            onClick={() => {
              if (canRollDice) {
                dispatchAction({ type: 'ROLL_DICE', playerId: actingPlayerId });
              } else if (canRollSetupDice) {
                dispatchAction({ type: 'SETUP_ROLL_DICE', playerId: actingPlayerId });
              }
            }}
            style={{
              background: 'rgba(20, 24, 30, 0.9)',
              border: canRollDice || canRollSetupDice ? '2px solid #f5d11d' : '1.5px solid #3c424d',
              borderRadius: '10px',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: canRollDice || canRollSetupDice ? 'pointer' : 'default',
              boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <DieFaceSvg
                value={gameState.lastDiceRoll?.[0] ?? 4}
                bgColor="#f3efe2"
                pipColor="#22252a"
                strokeColor="#b8ad93"
              />
              <DieFaceSvg
                value={gameState.lastDiceRoll?.[1] ?? 3}
                bgColor="#439639"
                pipColor="#ffffff"
                strokeColor="#255c1e"
              />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10.5px', color: '#a0aec0', fontWeight: 800 }}>
                {canRollDice || canRollSetupDice ? 'CLICK TO ROLL!' : 'LAST ROLL'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#f5d11d' }}>
                {gameState.lastDiceRoll
                  ? `${gameState.lastDiceRoll[0] + gameState.lastDiceRoll[1]}`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Loose Token Piles: Grey Cog Hazards & Yellow Energy Bolts */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
            }}
          >
            <div
              data-testid="supply-hazards"
              style={{
                background: 'rgba(20, 24, 30, 0.88)',
                border: '1px solid #3c424d',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="28" height="28" viewBox="-16 -16 32 32">
                <HazardCogSvg cx={0} cy={0} r={12} />
              </svg>
              <div>
                <div style={{ fontSize: '9.5px', color: '#a0aec0', fontWeight: 700 }}>HAZARDS</div>
                <div style={{ fontSize: '13px', fontWeight: 900 }}>{gameState.supply.hazards}</div>
              </div>
            </div>

            <div
              data-testid="supply-energy"
              style={{
                background: 'rgba(20, 24, 30, 0.88)',
                border: '1px solid #3c424d',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="24" height="28" viewBox="-12 -16 24 32">
                <EnergyBoltSvg cx={0} cy={0} scale={0.95} />
              </svg>
              <div>
                <div style={{ fontSize: '9.5px', color: '#a0aec0', fontWeight: 700 }}>ENERGY</div>
                <div style={{ fontSize: '13px', fontWeight: 900 }}>{gameState.supply.energy}</div>
              </div>
            </div>
          </div>

          {/* Scrollable Game Event Log */}
          <div
            data-testid="game-log"
            style={{
              flex: '1 1 auto',
              minHeight: '80px',
              background: 'rgba(18, 22, 28, 0.92)',
              border: '1.5px solid #363d49',
              borderRadius: '10px',
              padding: '8px',
              overflowY: 'auto',
              fontSize: '11px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontWeight: 900, color: '#a0aec0', fontSize: '10px', marginBottom: '2px' }}>
              TABLETOP LOG ({gameState.log.length})
            </div>
            {gameState.log
              .slice(-14)
              .reverse()
              .map((entry) => (
                <div
                  key={entry.timestamp}
                  style={{
                    color: '#e2e8f0',
                    lineHeight: 1.35,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    paddingBottom: '3px',
                  }}
                >
                  {entry.message}
                </div>
              ))}
          </div>
        </aside>

        {/* ----------------------------------------------------------------- */}
        {/* CENTER VIEWPORT: Circular Island Board + 4 Corner Player Stations */}
        {/* ----------------------------------------------------------------- */}
        <main
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.2 : -0.2;
            setZoom((z) => Math.max(0.6, Math.min(5.0, Number((z + delta).toFixed(2)))));
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            isDraggingRef.current = true;
            dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          }}
          onMouseMove={(e) => {
            if (!isDraggingRef.current) return;
            setPan({
              x: e.clientX - dragStartRef.current.x,
              y: e.clientY - dragStartRef.current.y,
            });
          }}
          onMouseUp={() => {
            isDraggingRef.current = false;
          }}
          onMouseLeave={() => {
            isDraggingRef.current = false;
          }}
        >
          {/* 4 Corner Player Summary Stations (Click to inspect any player's full Mat!) */}
          {gameState.playerOrder.map((pid, idx) => {
            const p = gameState.players[pid]!;
            const pTheme = PLAYER_THEMES[pid];
            const isTurn = gameState.activePlayerId === pid;
            const isInspected = displayedMatPlayerId === pid;
            const seat = lobbyConfig.seats[pid];

            const cornerStyles: Record<number, Record<string, string>> = {
              0: { top: '4px', left: '4px' },
              1: { top: '4px', right: '4px' },
              2: { bottom: '4px', right: '4px' },
              3: { bottom: '4px', left: '4px' },
            };

            return (
              <div
                key={pid}
                data-testid={`corner-station-${pid}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setInspectedPlayerId(pid);
                }}
                role="button"
                tabIndex={0}
                title={`Click to view ${p.name}'s full Player Mat & Organiser`}
                style={{
                  position: 'absolute',
                  ...cornerStyles[idx],
                  zIndex: 40,
                  width: '166px',
                  background: 'rgba(18, 22, 28, 0.92)',
                  backdropFilter: 'blur(4px)',
                  border: `2px solid ${isTurn || isInspected ? pTheme.fill : '#3c424d'}`,
                  borderRadius: '10px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums',
                  boxShadow: isTurn
                    ? `0 0 12px ${pTheme.fill}`
                    : '0 4px 12px rgba(0,0,0,0.55)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="16" height="16" viewBox="-8 -8 16 16">
                      <circle r="7" fill={pTheme.fill} stroke={pTheme.outerHalo} strokeWidth="1.2" />
                      <PlayerEmblemSvg playerId={pid} cx={0} cy={0} r={3.5} />
                    </svg>
                    <span style={{ fontWeight: 900, fontSize: '12px', color: '#ffffff' }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: '9.5px', color: '#a0aec0' }}>
                      ({seat?.controller === 'bot' ? seat.botStrategy.slice(0, 5) : 'You'})
                    </span>
                  </div>
                  <span
                    data-testid={`corner-vp-${pid}`}
                    style={{
                      fontWeight: 900,
                      fontSize: '12px',
                      color: '#f5d11d',
                    }}
                  >
                    {p.victoryPoints} VP
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    color: '#cbd5e0',
                    marginTop: '4px',
                    fontWeight: 700,
                  }}
                >
                  <span>LF: {p.localFootprint}</span>
                  <span>⚡: {p.energy}/5</span>
                  <span>Cards: {getHandSizeForSeven(p)}</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: '#8ce09a',
                    marginTop: '2px',
                    fontWeight: 700,
                  }}
                >
                  <span>🌱 {p.renewablePlantsBuilt}</span>
                  <span style={{ color: '#d09b72' }}>🏭 {p.fossilPlantsBuilt}</span>
                  <span style={{ color: '#90cdf4' }}>Dev: {p.devCards.unplayed.length}</span>
                </div>
              </div>
            );
          })}

          {/* Live Gamestate Phase Stepper & Action Animation Callout (Left Tabletop Overlay) */}
          <div
            data-testid="live-action-banner"
            key={liveActionBanner?.actionId ?? 'initial-banner'}
            className="live-action-banner-anim"
            style={{
              position: 'absolute',
              top: '80px',
              left: '4px',
              width: '166px',
              zIndex: 42,
              background: 'rgba(16, 20, 26, 0.94)',
              backdropFilter: 'blur(6px)',
              border: `2px solid ${
                liveActionBanner
                  ? PLAYER_THEMES[liveActionBanner.playerId].fill
                  : activePlayerTheme.fill
              }`,
              borderRadius: '10px',
              padding: '6px 8px',
              boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
            }}
          >
            {/* 4-Step Turn Phase Progress Stepper */}
            <div
              data-testid="phase-stepper"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '3px',
                marginBottom: '5px',
              }}
            >
              {(
                [
                  { key: 'EventPhase', label: '1.Event' },
                  { key: 'ProductionPhase', label: '2.Roll' },
                  { key: 'ActionPhase', label: '3.Build' },
                  { key: 'EndTurn', label: '4.End' },
                ] as const
              ).map((step) => {
                const isCurrent = gameState.phase === step.key;
                return (
                  <div
                    key={step.key}
                    style={{
                      textAlign: 'center',
                      fontSize: '8.5px',
                      fontWeight: 900,
                      padding: '2px 1px',
                      borderRadius: '4px',
                      background: isCurrent ? '#f5d11d' : '#262b33',
                      color: isCurrent ? '#14171a' : '#8a94a6',
                    }}
                  >
                    {step.label}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                fontSize: '10.5px',
                fontWeight: 900,
                color: '#f5d11d',
                lineHeight: 1.25,
                marginBottom: '2px',
              }}
            >
              {liveActionBanner
                ? liveActionBanner.title
                : `Turn ${gameState.currentTurn}: ${gameState.players[gameState.activePlayerId]?.name}`}
            </div>
            <div
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                color: '#cbd5e0',
                lineHeight: 1.25,
              }}
            >
              {liveActionBanner
                ? liveActionBanner.detail
                : gameState.log[gameState.log.length - 1]?.message ?? 'Ready for next action'}
            </div>
          </div>

          {/* Animated Tabletop Dice Roll Tray (Rolls directly on the table & stays on the side) */}
          <div
            data-testid="tabletop-dice-roll-overlay"
            onClick={(e) => {
              e.stopPropagation();
              if (canRollDice) {
                dispatchAction({ type: 'ROLL_DICE', playerId: actingPlayerId });
              } else if (canRollSetupDice) {
                dispatchAction({ type: 'SETUP_ROLL_DICE', playerId: actingPlayerId });
              }
            }}
            style={{
              position: 'absolute',
              top: '80px',
              right: '4px',
              width: '166px',
              zIndex: 42,
              background: 'rgba(16, 20, 26, 0.94)',
              backdropFilter: 'blur(6px)',
              border: canRollDice || canRollSetupDice ? '2px solid #f5d11d' : '1.5px solid #3c424d',
              borderRadius: '10px',
              padding: '6px 8px',
              cursor: canRollDice || canRollSetupDice ? 'pointer' : 'default',
              boxShadow: canRollDice || canRollSetupDice
                ? '0 0 14px rgba(245, 209, 29, 0.55)'
                : '0 6px 16px rgba(0,0,0,0.55)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontSize: '9.5px', fontWeight: 900, color: '#90cdf4' }}>
                TABLETOP DICE TRAY
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 900,
                  color: '#f5d11d',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {gameState.lastDiceRoll
                  ? `Sum: ${gameState.lastDiceRoll[0] + gameState.lastDiceRoll[1]}`
                  : canRollDice || canRollSetupDice
                    ? 'Roll!'
                    : 'Ready'}
              </span>
            </div>

            <div
              key={diceRollOverlay?.rollId ?? 'static-dice'}
              className={diceRollOverlay ? 'dice-tumble-anim' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '4px 6px',
                borderRadius: '8px',
                background: 'radial-gradient(circle, #1e4628 0%, #122b18 100%)',
                border: '1.5px solid #5c3a1e',
              }}
            >
              <DieFaceSvg
                value={diceRollOverlay?.die1 ?? gameState.lastDiceRoll?.[0] ?? 4}
                bgColor="#f3efe2"
                pipColor="#22252a"
                strokeColor="#b8ad93"
              />
              <DieFaceSvg
                value={diceRollOverlay?.die2 ?? gameState.lastDiceRoll?.[1] ?? 3}
                bgColor="#439639"
                pipColor="#ffffff"
                strokeColor="#255c1e"
              />
            </div>

            <div
              style={{
                fontSize: '9px',
                fontWeight: 800,
                color: '#a0aec0',
                textAlign: 'center',
                marginTop: '3px',
              }}
            >
              {gameState.lastDiceRoll
                ? gameState.lastDiceRoll[0] + gameState.lastDiceRoll[1] === 7
                  ? '⚠️ Rolled 7 — Inspector Active!'
                  : `Producing on #${gameState.lastDiceRoll[0] + gameState.lastDiceRoll[1]} (${producingHexIds.size} hexes)`
                : canRollDice
                  ? 'Click tray to roll on table'
                  : 'Waiting for Production Phase'}
            </div>
          </div>

          {/* Setup Roll Modal Overlay */}
          {gameState.phase === 'SetupRoll' && (
            <div
              data-testid="setup-roll-overlay"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 55,
                background: 'rgba(16, 20, 28, 0.95)',
                backdropFilter: 'blur(8px)',
                border: '2px solid #f5d11d',
                borderRadius: '16px',
                padding: '20px 24px',
                boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
                color: '#ffffff',
                width: 'min(90%, 460px)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#f5d11d', marginBottom: '4px' }}>
                🎲 Roll to Determine Turn Order
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.4 }}>
                Each player rolls 2 dice. The highest roll places their first Town &amp; Road first.
                Round 2 snakes in reverse order with City &amp; Road.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gameState.playerCount}, 1fr)`,
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                {gameState.playerOrder.map((pid) => {
                  const roll = gameState.setupRolls?.[pid];
                  const p = gameState.players[pid]!;
                  const isCur = gameState.activePlayerId === pid;
                  return (
                    <div
                      key={pid}
                      style={{
                        background: isCur ? 'rgba(245, 209, 29, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        border: isCur ? '2px solid #f5d11d' : '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '10px',
                        padding: '10px 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <svg width="24" height="24" viewBox="-12 -12 24 24">
                        <PlayerEmblemSvg playerId={pid} cx={0} cy={0} r={9} />
                      </svg>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: PLAYER_THEMES[pid].fill }}>
                        {p.name}
                      </div>
                      {roll ? (
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#f5d11d', fontVariantNumeric: 'tabular-nums' }}>
                          {roll[0] + roll[1]} <span style={{ fontSize: '11px', color: '#94a3b8' }}>({roll[0]}+{roll[1]})</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                          {isCur ? 'Rolling...' : 'Waiting'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {canRollSetupDice && (
                <button
                  type="button"
                  data-testid="setup-roll-dialog-btn"
                  onClick={() => dispatchAction({ type: 'SETUP_ROLL_DICE', playerId: actingPlayerId })}
                  style={{
                    background: 'linear-gradient(135deg, #f5d11d, #e08b1a)',
                    color: '#1a202c',
                    fontWeight: 900,
                    fontSize: '14px',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(245, 209, 29, 0.5)',
                  }}
                >
                  🎲 Roll Dice ({gameState.players[actingPlayerId]?.name})
                </button>
              )}
            </div>
          )}

          {/* Pan & Zoom Circular Board Container */}
          <div
            data-testid="tabletop-board"
            style={{
              height: '100%',
              maxHeight: '100%',
              maxWidth: '100%',
              aspectRatio: '1 / 1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDraggingRef.current
                ? 'none'
                : 'transform 0.14s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <IslandBoardSvg
              state={gameState}
              highlightedHexIds={highlightedHexIds}
              highlightedNodeIds={highlightedNodeIds}
              highlightedEdgeIds={highlightedEdgeIds}
              highlightedCutoutSlots={highlightedCutoutSlots}
              producingHexIds={producingHexIds}
              onHexClick={handleHexClick}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onCutoutClick={handleCutoutClick}
              onSelectEventTrackInfo={(track) => setSelectedEventInfo(track)}
            />
          </div>

          {/* Optional Event Island Info Popover */}
          {selectedEventInfo && (
            <div
              data-testid="event-info-popover"
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 60,
                background: 'rgba(18, 22, 28, 0.96)',
                border: '2px solid #f5d11d',
                borderRadius: '10px',
                padding: '8px 14px',
                maxWidth: '420px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: '#f5d11d' }}>
                  {EVENT_TRACK_METADATA[selectedEventInfo].title} (
                  {gameState.eventTracks[selectedEventInfo] ?? 0}/
                  {EVENT_TRACK_METADATA[selectedEventInfo].capacity})
                </strong>
                <button
                  type="button"
                  onClick={() => setSelectedEventInfo(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#a0aec0',
                    cursor: 'pointer',
                    fontWeight: 900,
                  }}
                >
                  ✕
                </button>
              </div>
              <p style={{ color: '#e2e8f0' }}>
                {EVENT_TRACK_METADATA[selectedEventInfo].ruleSummary}
              </p>
            </div>
          )}
        </main>

        {/* ----------------------------------------------------------------- */}
        {/* RIGHT TABLETOP MARGIN: Canvas Event Bag & Supply Card Stacks      */}
        {/* ----------------------------------------------------------------- */}
        <aside
          data-testid="right-table-margin"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 30,
          }}
        >
          {/* Interactive Cloth Event Disc Bag (`[data-testid="event-bag"]`) */}
          <div
            data-testid="event-bag"
            onClick={() => {
              if (canDrawEventDisc) {
                dispatchAction({ type: 'DRAW_EVENT_DISC', playerId: actingPlayerId });
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Event Disc Bag: ${gameState.eventBag.length} discs remaining. ${canDrawEventDisc ? 'Click to draw an Event Disc!' : ''}`}
            style={{
              background: 'linear-gradient(180deg, #ede9de 0%, #d5cfc0 100%)',
              border: canDrawEventDisc ? '3px solid #f5d11d' : '2px solid #9c9484',
              borderRadius: '14px',
              padding: '10px 12px',
              color: '#1e2022',
              cursor: canDrawEventDisc ? 'pointer' : 'default',
              boxShadow: canDrawEventDisc
                ? '0 0 18px rgba(245, 209, 29, 0.75)'
                : '0 6px 16px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 900, color: '#5c5549' }}>
                CLOTH EVENT BAG
              </div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#1e2022' }}>
                {gameState.eventBag.length} Discs
              </div>
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: canDrawEventDisc ? '#b85d00' : '#4a5260',
                }}
              >
                {canDrawEventDisc
                  ? `Click to Draw (${gameState.eventDiscsDrawnThisTurn}/${drawCountThisTurn})`
                  : `Draws ${drawCountThisTurn}/turn`}
              </div>
            </div>

            {/* Drawstring Cloth Bag Vector Illustration */}
            <svg width="46" height="52" viewBox="-24 -26 48 52">
              <path
                d="M -12 -18 L 12 -18 L 8 -10 L 18 14 Q 20 22, 0 22 Q -20 22, -18 14 L -8 -10 Z"
                fill="#f5f2e9"
                stroke="#8c8370"
                strokeWidth="1.8"
              />
              <path d="M -12 -10 Q 0 -7, 12 -10" stroke="#7a684b" strokeWidth="2.2" fill="none" />
              <circle cx="0" cy="6" r="8" fill="#8d6e63" opacity="0.35" />
            </svg>
          </div>

          {/* 5 Resource + 1 Science Face-Up Supply Piles */}
          <div
            style={{
              background: 'rgba(18, 22, 28, 0.92)',
              border: '1.5px solid #363d49',
              borderRadius: '10px',
              padding: '8px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
            }}
          >
            {(['lumber', 'brick', 'natural_fiber', 'food', 'steel', 'science'] as (
              | ResourceType
              | 'science'
            )[]).map((key) => {
              const meta = CARD_METADATA[key];
              const count =
                key === 'science'
                  ? gameState.supply.science
                  : gameState.supply.resources[key];

              return (
                <div
                  key={key}
                  data-testid={`supply-pile-${key}`}
                  style={{
                    background: meta.cardFill,
                    border: `1.5px solid ${meta.border}`,
                    borderRadius: '7px',
                    padding: '5px 7px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: meta.textColor,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="18" height="18" viewBox="-10 -10 20 20">
                      <ResourceIconSvg type={key} cx={0} cy={0} scale={0.95} />
                    </svg>
                    <span style={{ fontSize: '10.5px', fontWeight: 900 }}>
                      {meta.shortLabel}
                    </span>
                  </div>
                  <span style={{ fontSize: '11.5px', fontWeight: 900 }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Face-Down Development Card Deck */}
          <div
            data-testid="supply-dev-deck"
            style={{
              background: 'linear-gradient(135deg, #2b547e 0%, #1c3a57 100%)',
              border: '2px solid #cbd5e0',
              borderRadius: '10px',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            }}
          >
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 900, color: '#90cdf4' }}>
                DEVELOPMENT DECK
              </div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#ffffff' }}>
                {gameState.supply.devDeck.length} Cards Left
              </div>
            </div>
            <svg width="28" height="36" viewBox="-14 -18 28 36">
              <rect
                x="-12"
                y="-16"
                width="24"
                height="32"
                rx="3"
                fill="#7ac1e4"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <circle cx="0" cy="-2" r="6" fill="#f5d76e" />
              <path d="M -12 5 L 12 5 L 12 16 L -12 16 Z" fill="#2e8540" />
            </svg>
          </div>
        </aside>
      </div>

      {/* =================================================================== */}
      {/* 3. BOTTOM SHOWCASE DOCK: PHASE ACTION BAR + PLAYER MAT & ORGANISER  */}
      {/* =================================================================== */}
      <footer
        data-testid="bottom-player-dock"
        style={{
          background: 'rgba(15, 18, 24, 0.96)',
          borderTop: '2px solid #363d49',
          padding: '8px 14px 10px',
          zIndex: 80,
          boxShadow: '0 -8px 28px rgba(0,0,0,0.65)',
        }}
      >
        {/* Phase Action Bar & Player Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Primary Turn Phase Progression Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {canDrawEventDisc && (
              <button
                type="button"
                data-testid="action-draw-event-btn"
                onClick={() =>
                  dispatchAction({ type: 'DRAW_EVENT_DISC', playerId: actingPlayerId })
                }
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: 'linear-gradient(180deg, #f5d11d 0%, #d4a017 100%)',
                  color: '#18150b',
                  fontWeight: 900,
                  fontSize: '12.5px',
                  border: '2px solid #ffffff',
                  cursor: 'pointer',
                }}
              >
                Draw Event Disc ({gameState.eventDiscsDrawnThisTurn}/{drawCountThisTurn})
              </button>
            )}

            {canRollSetupDice && (
              <button
                type="button"
                data-testid="action-setup-roll-btn"
                onClick={() => dispatchAction({ type: 'SETUP_ROLL_DICE', playerId: actingPlayerId })}
                style={{
                  padding: '6px 16px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f5d11d, #e08b1a)',
                  color: '#1a202c',
                  fontWeight: 900,
                  fontSize: '12.5px',
                  border: '2px solid #ffffff',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(245, 209, 29, 0.45)',
                }}
              >
                🎲 Roll for Setup Turn Order
              </button>
            )}

            {canRollDice && (
              <button
                type="button"
                data-testid="action-roll-dice-btn"
                onClick={() => dispatchAction({ type: 'ROLL_DICE', playerId: actingPlayerId })}
                style={{
                  padding: '6px 16px',
                  borderRadius: '8px',
                  background: 'linear-gradient(180deg, #439639 0%, #2e6b27 100%)',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '12.5px',
                  border: '2px solid #a8e6b8',
                  cursor: 'pointer',
                }}
              >
                🎲 Roll Production Dice
              </button>
            )}

            {canEndTurn && (
              <>
                <button
                  type="button"
                  data-testid="action-open-trade-btn"
                  onClick={() => setShowTradeModal(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: '#3676c8',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '12px',
                    border: '1px solid #90cdf4',
                    cursor: 'pointer',
                  }}
                >
                  Trade (Supply / Harbor / P2P)
                </button>

                <button
                  type="button"
                  data-testid="action-end-turn-btn"
                  onClick={() => dispatchAction({ type: 'END_TURN', playerId: actingPlayerId })}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '8px',
                    background: '#c93b2b',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '12.5px',
                    border: '1.5px solid #feb2b2',
                    cursor: 'pointer',
                  }}
                >
                  End Turn &rarr;
                </button>
              </>
            )}

            {activeBuildMode && (
              <button
                type="button"
                data-testid="cancel-build-mode-btn"
                onClick={() => setActiveBuildMode(null)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  background: '#4a5260',
                  color: '#f5d11d',
                  fontWeight: 800,
                  fontSize: '11.5px',
                  border: '1px solid #f5d11d',
                  cursor: 'pointer',
                }}
              >
                Cancel Placement ({activeBuildMode})
              </button>
            )}
          </div>

          {/* Right: Inspect Any Player's Mat Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#a0aec0', fontWeight: 700 }}>
              Viewing Player Mat:
            </span>
            {gameState.playerOrder.map((pid) => {
              const p = gameState.players[pid]!;
              const pTheme = PLAYER_THEMES[pid];
              const isSelected = displayedMatPlayerId === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  data-testid={`switch-mat-${pid}`}
                  onClick={() => setInspectedPlayerId(pid)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: isSelected ? pTheme.fill : '#252930',
                    color: isSelected ? pTheme.textOnFill : '#cbd5e0',
                    border: isSelected ? '2px solid #ffffff' : '1px solid #4a5260',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
            <button
              type="button"
              data-testid="dock-toggle-mat-btn"
              onClick={() => setIsPlayerMatHidden((h) => !h)}
              style={{
                padding: '3px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                background: isPlayerMatHidden ? '#276749' : '#2d333d',
                color: '#ffffff',
                border: '1px solid #8ce09a',
              }}
            >
              {isPlayerMatHidden ? '▲ Show Player Mat' : '▼ Hide Player Mat'}
            </button>
          </div>
        </div>

        {/* Centerpiece Player Mat & Resource Organiser Tray (Collapsible to maximize board view) */}
        {!isPlayerMatHidden && (
          <PlayerMat
            player={displayedPlayer}
            isActiveTurn={
              !isActingPlayerBot &&
              displayedMatPlayerId === actingPlayerId &&
              gameState.pendingDecisions.length === 0
            }
            isActionPhase={gameState.phase === 'ActionPhase'}
            isPreEventWindow={
              gameState.phase === 'EventPhase' && gameState.eventDiscsDrawnThisTurn === 0
            }
            turnStats={gameState.turnStats}
            devCardsBoughtThisTurn={gameState.devCardsBoughtThisTurn}
            devCardPlayedThisTurn={gameState.devCardPlayedThisTurn}
            activeBuildMode={activeBuildMode}
            redactPrivateCards={shouldRedactDisplayedMat}
            onSelectBuildMode={(mode) => setActiveBuildMode(mode)}
            onBuildWarehouse={() =>
              dispatchAction({ type: 'BUILD_WAREHOUSE', playerId: actingPlayerId })
            }
            onBuyDevCard={() =>
              dispatchAction({ type: 'BUY_DEV_CARD', playerId: actingPlayerId })
            }
            onOpenEnergyBuyCardModal={() => setShowEnergyCardModal(true)}
            onPlayDevCardPrompt={(cardId, cardType) => setDevCardPrompt({ cardId, cardType })}
            onRevealVpCards={(cardIds) =>
              dispatchAction({ type: 'REVEAL_VP_CARDS', playerId: actingPlayerId, cardIds })
            }
          />
        )}
      </footer>

      {/* =================================================================== */}
      {/* 4. MODALS & OVERLAYS                                                */}
      {/* =================================================================== */}
      {headDecision && !isActingPlayerBot && (
        <PendingDecisionBanner
          state={gameState}
          decision={headDecision}
          onDispatch={dispatchAction}
        />
      )}

      {showTradeModal && (
        <TradeModal
          state={gameState}
          onDispatch={dispatchAction}
          onClose={() => setShowTradeModal(false)}
        />
      )}

      {showEnergyCardModal && (
        <EnergyBuyCardModal
          state={gameState}
          onDispatch={dispatchAction}
          onClose={() => setShowEnergyCardModal(false)}
        />
      )}

      {devCardPrompt && (
        <DevCardPlayModal
          state={gameState}
          cardId={devCardPrompt.cardId}
          cardType={devCardPrompt.cardType}
          onDispatch={dispatchAction}
          onClose={() => setDevCardPrompt(null)}
        />
      )}

      {privacyCurtainForPlayer && (
        <PrivacyCurtainModal
          nextPlayerId={privacyCurtainForPlayer}
          nextPlayerName={gameState.players[privacyCurtainForPlayer]?.name ?? privacyCurtainForPlayer}
          onReady={() => setPrivacyCurtainForPlayer(null)}
        />
      )}

      {(gameState.phase === 'GameEnd' || gameState.winner !== null) && !dismissedVictoryModal && (
        <VictoryModal
          state={gameState}
          onInspectBoard={() => setDismissedVictoryModal(true)}
          onOpenLobby={() => {
            setDismissedVictoryModal(false);
            setShowLobby(true);
          }}
        />
      )}

      {showLobby && (
        <LobbyModal
          config={lobbyConfig}
          onChangeConfig={setLobbyConfig}
          onStartGame={handleStartNewGame}
          onClose={() => setShowLobby(false)}
          canClose={true}
        />
      )}
    </div>
  );
}
