/**
 * CATAN: New Energies — Tabletop application shell (`src/ui/TabletopApp.tsx`)
 *
 * Owns the game state and composes the table:
 * 1. Top bar: brand, whose turn, phase stepper, Global Footprint meter, tools (`TopBar`)
 * 2. Left rail: player boards & activity feed (`PlayersRail`)
 * 3. Centre: the circular island board with pan/zoom, setup coach & action toasts
 * 4. Right rail: event bag, dice tray, supply and award tiles (`TableRail`)
 * 5. Bottom dock: the viewed player's hand, build palette & primary action (`ActionDock`),
 *    with the detailed player board (`PlayerMat`) in a slide-up drawer
 * 6. Bot scheduler, hotseat privacy curtain, multi-tab BroadcastChannel sync, undo stack and
 *    URL autostart (`/?seed=42&setup=first&placement=draft&players=4`).
 */

import 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BotDifficulty, chooseBotAction, getActingPlayerId } from '../ai/bot';
import { legalActions } from '../engine/actions';
import { getEventDiscDrawCount } from '../engine/config';
import { getDevCardType, isEdgeConnectedToPlayerNetwork } from '../engine/dev-cards';
import { applyAction } from '../engine/reducer';
import { createInitialGameState, StartingPlacement } from '../engine/setup';
import {
  CleanupOption,
  DevCardPlayParams,
  DevelopmentCardType,
  EdgeId,
  EventDiscType,
  GameAction,
  GameState,
  HexId,
  NodeId,
  PlayerId,
} from '../engine/types';
import { botStepDelayMs } from '../network/server-protocol';
import { BroadcastChannelTransport } from '../network/transport';
import { ActionDock, PrimaryAction } from './ActionDock';
import { applyDevScenario } from './devScenarios';
import { DiscardPanel } from './DiscardPanel';
import {
  eventName,
  handCount,
  humanizeLog,
  normaliseTradePrefs,
  rememberedTrade,
  stealVictimsOnHex,
  tradeTurnKey,
  type TradeMemory,
  type TradePrefs,
} from './gameView';
import { IslandBoardSvg } from './IslandBoardSvg';
import { Icon } from './Icons';
import {
  DevCardPlayModal,
  EnergyBuyCardModal,
  LobbyConfig,
  LobbyModal,
  PendingDecisionBanner,
  PrivacyCurtainModal,
  SeatConfig,
  StealChooserModal,
  TradeModal,
  VictoryModal,
} from './Modals';
import { ActiveBuildMode, PlayerMat } from './PlayerMat';
import { PlayerBadge, PlayersRail } from './PlayersRail';
import { getProductionNumbers } from './productionNumbers';
import { SetupCoach, SetupRollOff } from './SetupCoach';
import { TableRail } from './TableRail';
import { describeTradeRequestMove } from './TradeRequest';
import { DEV_CARD_METADATA, EVENT_TRACK_METADATA, PLAYER_THEMES } from './theme';
import type { OnlineTable } from './online/onlineTypes';
import { DEFAULT_TABLECLOTH_COLOR, TopBar } from './TopBar';
import { EventDiscSvg, EventIconSvg } from './WoodenPiecesSvg';

const SAVED_GAME_KEY = 'catan_new_energies_saved_game_v2';
const TABLECLOTH_COLOR_KEY = 'catan_new_energies_tablecloth_color_v2';
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 5;
const TOAST_MS = 3400;
const EVENT_REVEAL_MS = 1900;

/** A development card being finished on the board (paths, a hex, or a hazard to pick). */
type DevTargeting =
  | { cardId: string; kind: 'road'; first: EdgeId | null }
  | { cardId: string; kind: 'inspector' }
  | { cardId: string; kind: 'hazard' };

interface EventReveal {
  id: number;
  disc: EventDiscType;
  onTrack: number;
  capacity: number;
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  return [
    parseInt(full.slice(0, 2), 16) || 24,
    parseInt(full.slice(2, 4), 16) || 26,
    parseInt(full.slice(4, 6), 16) || 29,
  ];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHexColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToLightBase(hex: string): string {
  const [r, g, b] = parseHexColor(hex);
  const mix = (channel: number) => Math.round(channel * 0.25 + 235 * 0.75);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

interface UrlParams {
  seed: number;
  setupMode: 'first' | 'standard';
  placement: StartingPlacement;
  playerCount: 3 | 4;
  autostart: boolean;
  allHuman: boolean;
  allBots: boolean;
  roomCode: string;
  scenario: string;
  /** The URL asks for a specific new game (so a saved game should not be resumed) */
  hasGameParams: boolean;
}

function parseUrlParams(): UrlParams {
  if (typeof window === 'undefined') {
    return {
      seed: 42,
      setupMode: 'first',
      placement: 'draft',
      playerCount: 4,
      autostart: true,
      allHuman: false,
      allBots: false,
      roomCode: '',
      scenario: '',
      hasGameParams: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('scenario') ?? '';
  const gameParams = ['seed', 'setup', 'placement', 'players', 'bots', 'mode', 'room', 'scenario'];
  return {
    hasGameParams: gameParams.some((k) => params.has(k)),
    seed: parseInt(params.get('seed') ?? '42', 10) || 42,
    setupMode: params.get('setup') === 'standard' ? 'standard' : 'first',
    // Players place their own starting pieces unless beginner positions are asked for
    placement: params.get('placement') === 'fixed' || scenario ? 'fixed' : 'draft',
    playerCount: params.get('players') === '3' ? 3 : 4,
    autostart: params.get('lobby') !== '1',
    allHuman: params.get('bots') === '0' || params.get('mode') === 'hotseat',
    allBots: params.get('bots') === 'all',
    roomCode: (params.get('room') ?? '').toUpperCase(),
    scenario,
  };
}

function createDefaultLobbyConfig(url: UrlParams): LobbyConfig {
  const seat = (
    playerId: PlayerId,
    name: string,
    controller: SeatConfig['controller'],
    botStrategy: SeatConfig['botStrategy'],
    botDifficulty: SeatConfig['botDifficulty']
  ): SeatConfig => ({ playerId, name, controller, botStrategy, botDifficulty });

  return {
    playerCount: url.playerCount,
    setupMode: url.setupMode,
    placement: url.placement,
    seed: url.seed,
    botSpeed: 'normal',
    privacyCurtain: false,
    roomCode: url.roomCode,
    seats: {
      orange: seat('orange', 'Orange', url.allBots ? 'bot' : 'human', 'Balanced', 'normal'),
      purple: seat('purple', 'Purple', url.allHuman ? 'human' : 'bot', 'GreenInnovator', 'normal'),
      pink: seat('pink', 'Pink', url.allHuman ? 'human' : 'bot', 'IndustrialExpansionist', 'normal'),
      blue: seat('blue', 'Blue', url.allHuman ? 'human' : 'bot', 'Balanced', 'hard'),
    },
  };
}

function createGameFromConfig(cfg: LobbyConfig, scenario = ''): GameState {
  const drafted = cfg.setupMode === 'standard' || cfg.placement === 'draft';
  const state = createInitialGameState({
    setupMode: cfg.setupMode,
    placement: cfg.placement,
    playerCount: cfg.playerCount,
    seed: cfg.seed,
    setupRoll: drafted,
    playerNames: {
      orange: cfg.seats.orange.name,
      purple: cfg.seats.purple.name,
      pink: cfg.seats.pink.name,
      blue: cfg.seats.blue.name,
    },
  });
  return scenario ? applyDevScenario(state, scenario) : state;
}

interface SavedGame {
  version: 2;
  savedAt: number;
  state: GameState;
  config: LobbyConfig;
}

/** The unfinished game this browser was last playing, if any. */
function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVED_GAME_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedGame;
    if (saved?.version !== 2 || !saved.state?.board || !saved.config?.seats) return null;
    if (saved.state.phase === 'GameEnd' || saved.state.winner !== null) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveGame(state: GameState, config: LobbyConfig) {
  try {
    const saved: SavedGame = { version: 2, savedAt: Date.now(), state, config };
    localStorage.setItem(SAVED_GAME_KEY, JSON.stringify(saved));
  } catch {
    // Ignore storage quota / privacy-mode errors
  }
}

/** What a bot's next step is called on the Next button. */
function botStepLabel(action: GameAction): string {
  switch (action.type) {
    case 'DRAW_EVENT_DISC':
      return 'draw disc';
    case 'ROLL_DICE':
    case 'SETUP_ROLL_DICE':
      return 'roll dice';
    case 'END_TURN':
      return 'end turn';
    default:
      return 'next move';
  }
}

function mapDifficulty(d: 'easy' | 'normal' | 'hard'): BotDifficulty {
  if (d === 'easy') return 'Easy';
  if (d === 'hard') return 'Hard';
  return 'Normal';
}

interface Toast {
  id: number;
  playerId: PlayerId;
  title: string;
  detail: string;
  /** A move the rules refused: shown in red so it is never silent */
  isError?: boolean;
}

const PLANT_WORD = { BUILD_FOSSIL_PLANT: 'a fossil fuel plant', BUILD_RENEWABLE_PLANT: 'a renewable plant' };

/** The event disc type that left the bag between two states, if any. */
function drawnDisc(prev: GameState, next: GameState): EventDiscType | null {
  const counts = new Map<EventDiscType, number>();
  for (const d of prev.eventBag) counts.set(d, (counts.get(d) ?? 0) + 1);
  for (const d of next.eventBag) counts.set(d, (counts.get(d) ?? 0) - 1);
  for (const [d, n] of counts) if (n > 0) return d;
  return null;
}

/** Plain-language headline for what just happened at the table. */
function describeAction(
  action: GameAction,
  prev: GameState,
  next: GameState,
  /** Online: the disc the server says was drawn (the redacted state has no bag to diff). */
  drawn?: EventDiscType | null
): Toast {
  const name = next.players[action.playerId]?.name ?? action.playerId;
  const detail = humanizeLog(next.log[next.log.length - 1]?.message ?? '');
  const base = { id: Date.now() + Math.random(), playerId: action.playerId, detail };
  switch (action.type) {
    case 'SETUP_ROLL_DICE': {
      const r = next.lastDiceRoll;
      const rolled = r ? `${name} rolled ${r[0] + r[1]}` : `${name} rolled`;
      if (prev.phase === 'SetupRoll' && next.phase === 'SetupDraft' && next.setupRollWinner) {
        const first = next.players[next.setupRollWinner]!.name;
        return { ...base, playerId: next.setupRollWinner, title: `${first} goes first`, detail: `${rolled}. Place a starting town.` };
      }
      const rerolling = prev.phase === 'SetupRoll' && Object.keys(next.setupRolls ?? {}).length < Object.keys(prev.setupRolls ?? {}).length + 1;
      return { ...base, title: rolled, detail: rerolling ? 'Tie for highest — tied players roll again.' : '' };
    }
    case 'SETUP_BUILD_TOWN':
      return { ...base, title: `${name} placed a starting town` };
    case 'SETUP_BUILD_CITY':
      return { ...base, title: `${name} placed a starting city` };
    case 'SETUP_BUILD_ROAD':
      return {
        ...base,
        title:
          next.phase === 'EventPhase' && prev.phase === 'SetupDraft'
            ? 'Setup complete — let the game begin'
            : `${name} placed a road`,
      };
    case 'ROLL_DICE': {
      const d = next.lastDiceRoll;
      return { ...base, title: d ? `${name} rolled ${d[0] + d[1]}` : `${name} rolled` };
    }
    case 'DRAW_EVENT_DISC': {
      const disc = drawn !== undefined ? drawn : drawnDisc(prev, next);
      if (!disc) return { ...base, title: `${name} drew an event disc` };
      const meta = EVENT_TRACK_METADATA[disc];
      const onTrack = next.eventTracks[disc] ?? 0;
      return {
        ...base,
        title: `${name} drew ${eventName(disc)}`,
        detail:
          onTrack === 0
            ? `The ${eventName(disc)} track filled up.`
            : `${onTrack} of ${meta.capacity} on the track`,
      };
    }
    case 'BUILD_ROAD':
      return { ...base, title: `${name} built a road` };
    case 'BUILD_TOWN':
      return { ...base, title: `${name} built a town` };
    case 'BUILD_CITY':
      return { ...base, title: `${name} upgraded to a city` };
    case 'BUILD_FOSSIL_PLANT':
    case 'BUILD_RENEWABLE_PLANT':
      return { ...base, title: `${name} built ${PLANT_WORD[action.type]}` };
    case 'BUILD_WAREHOUSE':
      return { ...base, title: `${name} built a warehouse` };
    case 'BUY_DEV_CARD':
      return { ...base, title: `${name} bought a development card` };
    case 'PLAY_DEV_CARD':
      return { ...base, title: `${name} played ${DEV_CARD_METADATA[getDevCardType(action.cardId)].title}` };
    case 'SPEND_ENERGY':
      return {
        ...base,
        title:
          action.usage === 'BUY_CARD'
            ? `${name} bought a card with energy`
            : action.usage === 'CLEAN_HAZARD'
              ? `${name} cleaned up a hazard`
              : `${name} removed a fossil fuel plant`,
      };
    case 'TRADE_SUPPLY':
      return { ...base, title: `${name} traded with the supply` };
    case 'TRADE_HARBOR':
      return { ...base, title: `${name} traded at a harbor` };
    case 'OFFER_TRADE':
      return { ...base, title: `${name} offered a trade` };
    case 'REQUEST_TRADE':
      return { ...base, title: describeTradeRequestMove(prev, action) ?? `${name} asked for cards` };
    case 'RESOLVE_PENDING_DECISION': {
      const requestMove = describeTradeRequestMove(prev, action);
      return requestMove ? { ...base, title: requestMove, detail: '' } : { ...base, title: detail || name, detail: '' };
    }
    case 'END_TURN': {
      const nextName = next.players[next.activePlayerId]?.name ?? next.activePlayerId;
      return { ...base, playerId: next.activePlayerId, title: `${nextName}’s turn`, detail: `Turn ${next.currentTurn}` };
    }
    default:
      return { ...base, title: detail || name, detail: '' };
  }
}

/**
 * The table. Offline (default) it owns the game: bots, hotseat, undo, local save. With `online`
 * it only renders the host server's state for one fixed seat and sends moves to the server.
 */
export function TabletopApp({ online }: { online?: OnlineTable }) {
  const initialUrl = useMemo(() => parseUrlParams(), []);
  // A refresh picks the unfinished game back up unless the URL asks for a specific new one
  const resumed = useMemo(
    () => (online || initialUrl.hasGameParams ? null : loadSavedGame()),
    [initialUrl, online]
  );
  const [offlineLobbyConfig, setLobbyConfig] = useState<LobbyConfig>(
    () => resumed?.config ?? online?.config ?? createDefaultLobbyConfig(initialUrl)
  );
  const lobbyConfig = online ? online.config : offlineLobbyConfig;
  const [showLobby, setShowLobby] = useState<boolean>(!initialUrl.autostart && !online);
  const [offlineGameState, setGameState] = useState<GameState>(
    () => resumed?.state ?? online?.update.state ?? createGameFromConfig(lobbyConfig, initialUrl.scenario)
  );
  const gameState = online ? online.update.state : offlineGameState;
  const myPlayerId = online?.myPlayerId ?? null;

  const [history, setHistory] = useState<GameState[]>([]);
  const [activeBuildMode, setActiveBuildMode] = useState<ActiveBuildMode>(null);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  // The last offer sent this turn (cleared by a new turn), and each player's choice of who offers go to
  const [tradeMemory, setTradeMemory] = useState<TradeMemory | null>(null);
  const [tradePrefs, setTradePrefs] = useState<Partial<Record<PlayerId, TradePrefs>>>({});
  const [showEnergyCardModal, setShowEnergyCardModal] = useState(false);
  const [devCardPrompt, setDevCardPrompt] = useState<{
    cardId: string;
    cardType: DevelopmentCardType;
  } | null>(null);
  const [devTargeting, setDevTargeting] = useState<DevTargeting | null>(null);
  const [stealPrompt, setStealPrompt] = useState<{
    cardId: string;
    option: CleanupOption;
    victims: PlayerId[];
  } | null>(null);
  const [dismissedVictoryModal, setDismissedVictoryModal] = useState(false);
  const [selectedEventInfo, setSelectedEventInfo] = useState<EventDiscType | null>(null);
  const [privacyCurtainForPlayer, setPrivacyCurtainForPlayer] = useState<PlayerId | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const [isMatOpen, setIsMatOpen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<NodeId | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<EdgeId | null>(null);
  const [toast, setToast] = useState<Toast | null>(() =>
    resumed
      ? {
          id: 1,
          playerId: resumed.state.activePlayerId,
          title: 'Welcome back',
          detail: 'Your game was restored where you left off.',
        }
      : null
  );
  const [rollAnimKey, setRollAnimKey] = useState<number | null>(null);
  const [eventReveal, setEventReveal] = useState<EventReveal | null>(null);

  const [tableclothColor, setTableclothColor] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(TABLECLOTH_COLOR_KEY);
      if (stored) return stored;
      const v1 = localStorage.getItem('catan_new_energies_tablecloth_color_v1');
      if (v1 && v1 !== '#181a1d') return v1;
      return DEFAULT_TABLECLOTH_COLOR;
    } catch {
      return DEFAULT_TABLECLOTH_COLOR;
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

  // Pan & zoom of the circular board
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

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

  useEffect(() => {
    if (!eventReveal) return;
    const timer = setTimeout(
      () => setEventReveal((r) => (r?.id === eventReveal.id ? null : r)),
      EVENT_REVEAL_MS
    );
    return () => clearTimeout(timer);
  }, [eventReveal]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Online: the server decides; show what just happened (toast, dice, event disc) from lastAction
  const onlineUpdate = online?.update;
  useEffect(() => {
    if (!onlineUpdate?.lastAction || !onlineUpdate.prev) return;
    const { lastAction, prev, state: next, drawnEventDisc } = onlineUpdate;
    setActiveBuildMode(null);
    setDevTargeting(null);
    setStealPrompt(null);
    setHoveredNodeId(null);
    setHoveredEdgeId(null);
    setToast(describeAction(lastAction, prev, next, drawnEventDisc));
    if ((lastAction.type === 'ROLL_DICE' || lastAction.type === 'SETUP_ROLL_DICE') && next.lastDiceRoll) {
      setRollAnimKey(Date.now());
    }
    if (lastAction.type === 'DRAW_EVENT_DISC' && drawnEventDisc && lobbyConfig.botSpeed !== 'instant') {
      setEventReveal({
        id: Date.now(),
        disc: drawnEventDisc,
        onTrack: next.eventTracks[drawnEventDisc] ?? 0,
        capacity: EVENT_TRACK_METADATA[drawnEventDisc].capacity,
      });
    }
  }, [onlineUpdate]);

  // Online: a refusal from the server is shown like a refused local move
  const onlineNotice = online?.notice;
  useEffect(() => {
    if (!onlineNotice) return;
    setToast({
      id: Date.now(),
      playerId: myPlayerId ?? gameState.activePlayerId,
      title: onlineNotice.kind === 'rejected' ? 'That move is not allowed' : 'Heads up',
      detail: onlineNotice.message,
      isError: true,
    });
  }, [onlineNotice?.id]);

  // Escape leaves a placement mode (or a card being played on the board) without doing anything
  useEffect(() => {
    if (!activeBuildMode && !devTargeting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setActiveBuildMode(null);
      setDevTargeting(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeBuildMode, devTargeting]);

  const actingPlayerId = getActingPlayerId(gameState) ?? gameState.activePlayerId;
  const actingSeatIsBot = lobbyConfig.seats[actingPlayerId]?.controller === 'bot';
  // Offline: a bot is moving. Online: it is anyone's move but mine, so nothing here can be clicked.
  const waitingOnOthers = online ? actingPlayerId !== myPlayerId : actingSeatIsBot;
  const hasBots = !online && gameState.playerOrder.some((pid) => lobbyConfig.seats[pid]?.controller === 'bot');

  // In hotseat play the dock follows whichever human is acting next
  useEffect(() => {
    if (online) return;
    if (lobbyConfig.seats[actingPlayerId]?.controller === 'human') setInspectedPlayerId(null);
  }, [actingPlayerId, lobbyConfig.seats, online]);

  // Online the dock and player board always show my own seat (or the active player, when watching)
  const displayedMatPlayerId: PlayerId = online
    ? myPlayerId && gameState.players[myPlayerId]
      ? myPlayerId
      : gameState.activePlayerId
    : inspectedPlayerId && gameState.players[inspectedPlayerId]
      ? inspectedPlayerId
      : gameState.players[actingPlayerId] && lobbyConfig.seats[actingPlayerId]?.controller === 'human'
        ? actingPlayerId
        : (gameState.playerOrder.find((pid) => lobbyConfig.seats[pid]?.controller === 'human') ??
          gameState.activePlayerId);

  const displayedPlayer = gameState.players[displayedMatPlayerId]!;

  // Dispatch game action with history, persistence, multi-tab broadcast and table feedback
  const dispatchAction = (action: GameAction) => {
    if (online) {
      // Never applied locally: the server validates it and answers with the new state
      online.sendAction(action);
      setActiveBuildMode(null);
      setDevTargeting(null);
      setStealPrompt(null);
      setHoveredNodeId(null);
      setHoveredEdgeId(null);
      return;
    }
    try {
      const prevActing = getActingPlayerId(gameState);
      const next = applyAction(gameState, action);
      const nextActing = getActingPlayerId(next);

      setHistory((prev) => [...prev.slice(-24), gameState]);
      setGameState(next);
      setActiveBuildMode(null);
      setDevTargeting(null);
      setStealPrompt(null);
      setHoveredNodeId(null);
      setHoveredEdgeId(null);
      setToast(describeAction(action, gameState, next));
      if ((action.type === 'ROLL_DICE' || action.type === 'SETUP_ROLL_DICE') && next.lastDiceRoll) {
        setRollAnimKey(Date.now());
      }
      if (action.type === 'DRAW_EVENT_DISC' && lobbyConfig.botSpeed !== 'instant') {
        const disc = drawnDisc(gameState, next);
        if (disc) {
          setEventReveal({
            id: Date.now(),
            disc,
            onTrack: next.eventTracks[disc] ?? 0,
            capacity: EVENT_TRACK_METADATA[disc].capacity,
          });
        }
      }

      saveGame(next, lobbyConfig);

      if (transportRef.current) {
        transportRef.current.send({
          type: 'ACTION_REQUEST',
          roomId: lobbyConfig.roomCode,
          playerId: action.playerId,
          seatToken: 'local',
          action,
        });
      }

      // Hotseat privacy curtain when the device passes between two human seats
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
      setToast({
        id: Date.now(),
        playerId: action.playerId,
        title: 'That move is not allowed',
        detail: err instanceof Error ? err.message : String(err),
        isError: true,
      });
    }
  };

  const handleStartNewGame = (cfg: LobbyConfig) => {
    const fresh = createGameFromConfig(cfg);
    setLobbyConfig(cfg);
    setGameState(fresh);
    saveGame(fresh, cfg);
    setHistory([]);
    setActiveBuildMode(null);
    setInspectedPlayerId(null);
    setDismissedVictoryModal(false);
    setShowLobby(false);
    setToast(null);
    setRollAnimKey(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setGameState(prev);
    setActiveBuildMode(null);
  };

  // The bot's next move, worked out only while autoplay is off so its name can be put on the Next button
  const stepBotId = !online && !autoplay && !showLobby && gameState.phase !== 'GameEnd' && gameState.winner === null ? getActingPlayerId(gameState) : null;
  const nextBotAction = useMemo(() => {
    if (!stepBotId) return null;
    const seat = lobbyConfig.seats[stepBotId];
    if (!seat || seat.controller !== 'bot') return null;
    try {
      return chooseBotAction(gameState, stepBotId, {
        personality: seat.botStrategy,
        difficulty: mapDifficulty(seat.botDifficulty),
      });
    } catch (e) {
      console.warn('Bot failed to choose action:', e);
      return null;
    }
  }, [gameState, stepBotId, lobbyConfig]);

  // Automated bot turn scheduler (setup placements are paced so humans can follow them)
  useEffect(() => {
    if (online || showLobby || !autoplay || privacyCurtainForPlayer !== null) return;
    if (gameState.phase === 'GameEnd' || gameState.winner !== null) return;

    const currentActor = getActingPlayerId(gameState);
    if (!currentActor) return;
    const seat = lobbyConfig.seats[currentActor];
    if (!seat || seat.controller !== 'bot') return;

    const isSetup = gameState.phase === 'SetupRoll' || gameState.phase === 'SetupDraft';
    const delayMs = botStepDelayMs(lobbyConfig.botSpeed, isSetup);

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
  }, [gameState, showLobby, autoplay, privacyCurtainForPlayer, lobbyConfig]);

  // Legal actions for the acting human drive board highlights and the build palette
  const currentLegalActions = useMemo(() => {
    if (waitingOnOthers) return [];
    try {
      return legalActions(gameState, actingPlayerId);
    } catch (err) {
      // Online the opponents' hidden cards are placeholders: highlight nothing rather than crash
      if (!online) throw err;
      console.warn('Could not work out legal moves from the server view:', err);
      return [];
    }
  }, [gameState, actingPlayerId, waitingOnOthers]);

  const headDecision = gameState.pendingDecisions[0] ?? null;

  const { highlightedHexIds, highlightedNodeIds, highlightedEdgeIds, highlightedCutoutSlots } =
    useMemo(() => {
      const hexes = new Set<HexId>();
      const nodes = new Set<NodeId>();
      const edges = new Set<EdgeId>();
      const cutouts = new Set<string>();
      const result = {
        highlightedHexIds: hexes,
        highlightedNodeIds: nodes,
        highlightedEdgeIds: edges,
        highlightedCutoutSlots: cutouts,
      };

      if (waitingOnOthers) return result;

      // 0. A development card being finished on the board
      if (devTargeting) {
        const board = gameState.board;
        if (devTargeting.kind === 'road') {
          for (const e of board.edges) {
            if (e.road !== null || e.id === devTargeting.first) continue;
            const prior = devTargeting.first === null ? [] : [devTargeting.first];
            if (isEdgeConnectedToPlayerNetwork(board, actingPlayerId, e.id, prior)) edges.add(e.id);
          }
        } else if (devTargeting.kind === 'inspector') {
          for (const h of board.hexes) if (!h.hasHazard && !h.hasInspector) hexes.add(h.id);
        } else {
          for (const h of board.hexes) if (h.hasHazard) hexes.add(h.id);
          for (const n of board.intersections) if (n.hasHazard) nodes.add(n.id);
        }
        return result;
      }

      // 1. Pending decision highlights
      if (headDecision && headDecision.playerId === actingPlayerId) {
        if (headDecision.type === 'SETUP_PLACE_SETTLEMENT') {
          for (const a of currentLegalActions) {
            if (a.type === 'SETUP_BUILD_TOWN' || a.type === 'SETUP_BUILD_CITY') nodes.add(a.nodeId);
          }
        } else if (headDecision.type === 'SETUP_PLACE_ROAD') {
          for (const a of currentLegalActions) {
            if (a.type === 'SETUP_BUILD_ROAD') edges.add(a.edgeId);
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
        return result;
      }

      // 2. Action phase placement modes
      for (const a of currentLegalActions) {
        if (activeBuildMode === 'BUILD_ROAD' && a.type === 'BUILD_ROAD') edges.add(a.edgeId);
        else if (activeBuildMode === 'BUILD_TOWN' && a.type === 'BUILD_TOWN') nodes.add(a.nodeId);
        else if (activeBuildMode === 'BUILD_CITY' && a.type === 'BUILD_CITY') nodes.add(a.nodeId);
        else if (activeBuildMode === 'BUILD_FOSSIL_PLANT' && a.type === 'BUILD_FOSSIL_PLANT')
          cutouts.add(`${a.nodeId}-${a.hexId}`);
        else if (activeBuildMode === 'BUILD_RENEWABLE_PLANT' && a.type === 'BUILD_RENEWABLE_PLANT')
          cutouts.add(`${a.nodeId}-${a.hexId}`);
      }
      if (activeBuildMode === 'CLEAN_HAZARD') {
        for (const h of gameState.board.hexes) if (h.hasHazard) hexes.add(h.id);
        for (const n of gameState.board.intersections) if (n.hasHazard) nodes.add(n.id);
      } else if (activeBuildMode === 'DEMOLISH_PLANT') {
        for (const n of gameState.board.intersections) {
          for (const p of n.powerPlants) {
            if (p.playerId === actingPlayerId && p.type === 'fossil') cutouts.add(`${n.id}-${p.hexId}`);
          }
        }
      }

      return result;
    }, [
      waitingOnOthers,
      devTargeting,
      headDecision,
      actingPlayerId,
      currentLegalActions,
      activeBuildMode,
      gameState.board,
    ]);

  // Ghost piece previews while hovering a legal spot
  const previewNode = useMemo(() => {
    if (hoveredNodeId === null || !highlightedNodeIds.has(hoveredNodeId)) return null;
    if (headDecision?.type === 'SETUP_PLACE_SETTLEMENT') {
      return { nodeId: hoveredNodeId, type: headDecision.round === 1 ? 'town' : 'city', playerId: actingPlayerId } as const;
    }
    if (activeBuildMode === 'BUILD_TOWN') return { nodeId: hoveredNodeId, type: 'town', playerId: actingPlayerId } as const;
    if (activeBuildMode === 'BUILD_CITY') return { nodeId: hoveredNodeId, type: 'city', playerId: actingPlayerId } as const;
    return null;
  }, [hoveredNodeId, highlightedNodeIds, headDecision, activeBuildMode, actingPlayerId]);

  const previewEdge = useMemo(() => {
    if (hoveredEdgeId === null || !highlightedEdgeIds.has(hoveredEdgeId)) return null;
    if (
      headDecision?.type === 'SETUP_PLACE_ROAD' ||
      activeBuildMode === 'BUILD_ROAD' ||
      devTargeting?.kind === 'road'
    ) {
      return { edgeId: hoveredEdgeId, playerId: actingPlayerId };
    }
    return null;
  }, [hoveredEdgeId, highlightedEdgeIds, headDecision, activeBuildMode, devTargeting, actingPlayerId]);

  // Road Construction: the first free road stays on the board as a ghost while the second is picked
  const pinnedEdges =
    devTargeting?.kind === 'road' && devTargeting.first !== null
      ? [{ edgeId: devTargeting.first, playerId: actingPlayerId }]
      : [];

  const startDevCard = (cardId: string, cardType: DevelopmentCardType) => {
    setActiveBuildMode(null);
    if (cardType === 'roadConstruction') {
      setDevTargeting({ cardId, kind: 'road', first: null });
    } else {
      setDevCardPrompt({ cardId, cardType });
    }
  };

  const playDevCard = (cardId: string, params: DevCardPlayParams) =>
    dispatchAction({ type: 'PLAY_DEV_CARD', playerId: actingPlayerId, cardId, params });

  /** Finish a Clean Up card: steal straight away, or ask whom to steal from when there is a choice. */
  const finishCleanup = (cardId: string, option: CleanupOption, victims: PlayerId[]) => {
    setDevTargeting(null);
    if (victims.length > 1) {
      setStealPrompt({ cardId, option, victims });
      return;
    }
    playDevCard(cardId, {
      cardType: 'cleanup',
      option: victims[0] ? { ...option, targetPlayerId: victims[0] } : option,
    });
  };

  const footprintVictims = (): PlayerId[] => {
    const mine = gameState.players[actingPlayerId]!.localFootprint;
    return gameState.playerOrder.filter(
      (pid) =>
        pid !== actingPlayerId &&
        gameState.players[pid]!.localFootprint >= mine &&
        handCount(gameState, pid) > 0
    );
  };

  // Board click handlers
  const handleHexClick = (hexId: HexId) => {
    if (waitingOnOthers || dragRef.current?.moved) return;
    if (devTargeting && highlightedHexIds.has(hexId)) {
      if (devTargeting.kind === 'inspector') {
        finishCleanup(
          devTargeting.cardId,
          { type: 'INSPECTOR_MOVE_STEAL', newHexId: hexId },
          stealVictimsOnHex(gameState, hexId)
        );
      } else if (devTargeting.kind === 'hazard') {
        finishCleanup(
          devTargeting.cardId,
          { type: 'REMOVE_HAZARD_STEAL', hazardTarget: { kind: 'hex', id: hexId } },
          footprintVictims()
        );
      }
      return;
    }
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
    if (waitingOnOthers || dragRef.current?.moved) return;
    if (!highlightedNodeIds.has(nodeId)) return;
    if (devTargeting?.kind === 'hazard') {
      finishCleanup(
        devTargeting.cardId,
        { type: 'REMOVE_HAZARD_STEAL', hazardTarget: { kind: 'node', id: nodeId } },
        footprintVictims()
      );
      return;
    }
    if (headDecision?.type === 'SETUP_PLACE_SETTLEMENT') {
      dispatchAction({
        type: headDecision.round === 1 ? 'SETUP_BUILD_TOWN' : 'SETUP_BUILD_CITY',
        playerId: actingPlayerId,
        nodeId,
      });
      return;
    }
    if (headDecision?.type === 'EVENT_HAZARD_CHOICE') {
      dispatchAction({
        type: 'RESOLVE_PENDING_DECISION',
        playerId: actingPlayerId,
        decisionId: headDecision.id,
        response: { nodeId },
      });
      return;
    }
    if (activeBuildMode === 'BUILD_TOWN') {
      dispatchAction({ type: 'BUILD_TOWN', playerId: actingPlayerId, nodeId });
    } else if (activeBuildMode === 'BUILD_CITY') {
      dispatchAction({ type: 'BUILD_CITY', playerId: actingPlayerId, nodeId });
    } else if (activeBuildMode === 'CLEAN_HAZARD') {
      dispatchAction({
        type: 'SPEND_ENERGY',
        playerId: actingPlayerId,
        usage: 'CLEAN_HAZARD',
        params: { hazardTarget: { kind: 'node', id: nodeId } },
      });
    }
  };

  const handleEdgeClick = (edgeId: EdgeId) => {
    if (waitingOnOthers || dragRef.current?.moved) return;
    if (!highlightedEdgeIds.has(edgeId)) return;
    if (devTargeting?.kind === 'road') {
      const roadsLeft = gameState.players[actingPlayerId]!.roadsInReserve;
      if (devTargeting.first === null && roadsLeft >= 2) {
        setDevTargeting({ ...devTargeting, first: edgeId });
      } else if (devTargeting.first === null) {
        playDevCard(devTargeting.cardId, { cardType: 'roadConstruction', edge1: edgeId });
      } else {
        playDevCard(devTargeting.cardId, {
          cardType: 'roadConstruction',
          edge1: devTargeting.first,
          edge2: edgeId,
        });
      }
      return;
    }
    if (headDecision?.type === 'SETUP_PLACE_ROAD') {
      dispatchAction({ type: 'SETUP_BUILD_ROAD', playerId: actingPlayerId, edgeId });
    } else if (activeBuildMode === 'BUILD_ROAD') {
      dispatchAction({ type: 'BUILD_ROAD', playerId: actingPlayerId, edgeId });
    }
  };

  const handleCutoutClick = (nodeId: NodeId, hexId: HexId) => {
    if (waitingOnOthers || dragRef.current?.moved) return;
    if (!highlightedCutoutSlots.has(`${nodeId}-${hexId}`)) return;

    if (headDecision?.type === 'EVENT_PRODUCTION_INCREASE') {
      dispatchAction({
        type: 'RESOLVE_PENDING_DECISION',
        playerId: actingPlayerId,
        decisionId: headDecision.id,
        response: { build: true, nodeId, hexId },
      });
    } else if (activeBuildMode === 'BUILD_FOSSIL_PLANT') {
      dispatchAction({ type: 'BUILD_FOSSIL_PLANT', playerId: actingPlayerId, nodeId, hexId });
    } else if (activeBuildMode === 'BUILD_RENEWABLE_PLANT') {
      dispatchAction({ type: 'BUILD_RENEWABLE_PLANT', playerId: actingPlayerId, nodeId, hexId });
    } else if (activeBuildMode === 'DEMOLISH_PLANT') {
      dispatchAction({
        type: 'SPEND_ENERGY',
        playerId: actingPlayerId,
        usage: 'DEMOLISH_PLANT',
        params: { plantTarget: { nodeId, hexId } },
      });
    }
  };

  const drawCountThisTurn =
    gameState.lockedDrawCount ?? getEventDiscDrawCount(gameState.clampedGF, gameState.playerCount);
  const noPending = gameState.pendingDecisions.length === 0;
  const canDrawEventDisc = !waitingOnOthers && gameState.phase === 'EventPhase' && noPending;
  const canRollDice = !waitingOnOthers && gameState.phase === 'ProductionPhase' && noPending;
  const canEndTurn = !waitingOnOthers && gameState.phase === 'ActionPhase' && noPending;
  const canRollSetupDice = !waitingOnOthers && gameState.phase === 'SetupRoll';
  const isGameOver = gameState.phase === 'GameEnd' || gameState.winner !== null;

  // Hexes that produced on this turn's roll
  const producingHexIds = useMemo(() => {
    const prod = new Set<HexId>();
    if (!gameState.lastDiceRoll || gameState.phase !== 'ActionPhase') return prod;
    const sum = gameState.lastDiceRoll[0] + gameState.lastDiceRoll[1];
    if (sum === 7) return prod;
    for (const h of gameState.board.hexes) {
      if (h.numberDisc === sum && !h.hasHazard && !h.hasInspector) prod.add(h.id);
    }
    return prod;
  }, [gameState.lastDiceRoll, gameState.phase, gameState.board.hexes]);

  // A discard on a 7 is answered in a panel docked where the dock sits (no backdrop, so the island
  // stays in view), with the hexes the player produces from lit up on the board
  const discardDecision =
    headDecision?.type === 'DISCARD_ON_SEVEN' && !waitingOnOthers && !isGameOver ? headDecision : null;
  const discardHelp = useMemo(() => {
    if (!discardDecision) return null;
    const production = getProductionNumbers(gameState, discardDecision.playerId);
    return { production, hexIds: new Set(production.hexIds) };
  }, [gameState.board, discardDecision?.playerId]);

  const shouldRedactDisplayedMat = online
    ? displayedMatPlayerId !== myPlayerId
    : privacyCurtainForPlayer !== null || lobbyConfig.seats[displayedMatPlayerId]?.controller === 'bot';

  const actingName = gameState.players[actingPlayerId]?.name ?? actingPlayerId;

  const primary: PrimaryAction = (() => {
    if (isGameOver) {
      return { label: 'Game over', disabled: true, sub: 'Start a new game from the top bar' };
    }
    if (waitingOnOthers) {
      if (online) {
        return actingSeatIsBot
          ? { label: `${actingName} is playing`, disabled: true, sub: 'Bots move on their own' }
          : {
              label: `Waiting for ${actingName}`,
              disabled: true,
              sub: myPlayerId ? 'It is their move' : 'You are watching this game',
            };
      }
      if (!autoplay && nextBotAction) {
        return {
          label: `${actingName}: ${botStepLabel(nextBotAction)}`,
          testId: 'action-bot-next-btn',
          disabled: false,
          onClick: () => dispatchAction(nextBotAction),
          sub: 'Autoplay is off: press for the next step',
        };
      }
      return {
        label: `${actingName} is playing`,
        disabled: true,
        sub: 'Bots move on their own',
      };
    }
    if (headDecision && headDecision.playerId === actingPlayerId) {
      switch (headDecision.type) {
        case 'SETUP_PLACE_SETTLEMENT':
          return {
            label: `Place your ${headDecision.round === 1 ? 'town' : 'city'}`,
            disabled: true,
            sub: 'Click a glowing corner on the board',
          };
        case 'SETUP_PLACE_ROAD':
          return { label: 'Place a road', disabled: true, sub: 'Click a glowing path next to your new piece' };
        case 'MOVE_INSPECTOR':
          return { label: 'Move the inspector', disabled: true, sub: 'Click a glowing hex on the board' };
        case 'EVENT_HAZARD_CHOICE':
          return { label: 'Place a hazard', disabled: true, sub: 'Click one of your glowing buildings' };
        default:
          return { label: 'Your decision', disabled: true, sub: 'Answer the prompt on screen' };
      }
    }
    if (canRollSetupDice) {
      return {
        label: 'Roll for turn order',
        testId: 'action-setup-roll-btn',
        disabled: false,
        onClick: () => dispatchAction({ type: 'SETUP_ROLL_DICE', playerId: actingPlayerId }),
        sub: 'Highest roll places first',
      };
    }
    if (canDrawEventDisc) {
      return {
        label: 'Draw event disc',
        testId: 'action-draw-event-btn',
        disabled: false,
        onClick: () => dispatchAction({ type: 'DRAW_EVENT_DISC', playerId: actingPlayerId }),
        sub: `Disc ${gameState.eventDiscsDrawnThisTurn + 1} of ${drawCountThisTurn} this turn`,
      };
    }
    if (canRollDice) {
      return {
        label: 'Roll the dice',
        testId: 'action-roll-dice-btn',
        disabled: false,
        onClick: () => dispatchAction({ type: 'ROLL_DICE', playerId: actingPlayerId }),
        sub: 'Every hex showing that number produces',
      };
    }
    if (canEndTurn) {
      return {
        label: 'End turn',
        testId: 'action-end-turn-btn',
        disabled: false,
        onClick: () => dispatchAction({ type: 'END_TURN', playerId: actingPlayerId }),
        sub: 'Build, trade or spend energy before you pass',
      };
    }
    return { label: 'Waiting', disabled: true };
  })();

  const activeSeat = lobbyConfig.seats[gameState.activePlayerId];
  const humanSeats = gameState.playerOrder.filter((pid) => lobbyConfig.seats[pid]?.controller === 'human').length;
  const activeLabel = online
    ? gameState.activePlayerId === myPlayerId
      ? 'your turn'
      : activeSeat?.controller === 'bot'
        ? 'bot'
        : 'player'
    : activeSeat?.controller === 'bot'
      ? 'bot'
      : humanSeats > 1
        ? 'your turn'
        : gameState.activePlayerId === displayedMatPlayerId
          ? 'your turn'
          : 'human';

  const ginghamRgba = hexToRgba(tableclothColor, 0.58);
  const ginghamBase = hexToLightBase(tableclothColor);
  const isSetupDraft = gameState.phase === 'SetupDraft';
  const toastTheme = toast ? PLAYER_THEMES[toast.playerId] : null;

  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(z.toFixed(2))));

  return (
    <div
      className="tt-app"
      data-testid="tabletop-app"
      data-phase={gameState.phase}
      data-acting-player={actingPlayerId}
      data-my-seat={online ? (myPlayerId ?? 'none') : undefined}
      data-tablecloth-color={tableclothColor}
      style={{
        // Buffalo-plaid gingham tablecloth (default picnic red, changeable to any colour)
        backgroundColor: ginghamBase,
        backgroundImage: `
          linear-gradient(90deg, ${ginghamRgba} 50%, transparent 50%),
          linear-gradient(${ginghamRgba} 50%, transparent 50%)
        `,
        backgroundSize: '56px 56px',
      }}
    >
      <TopBar
        state={gameState}
        drawCount={drawCountThisTurn}
        activeIsBot={!online && activeSeat?.controller === 'bot' && !isGameOver}
        activeLabel={activeLabel}
        canUndo={history.length > 0}
        onUndo={handleUndo}
        hasBots={hasBots}
        autoplay={autoplay}
        onToggleAutoplay={() => setAutoplay((on) => !on)}
        botSpeed={lobbyConfig.botSpeed}
        onChangeBotSpeed={(botSpeed) => setLobbyConfig((c) => ({ ...c, botSpeed }))}
        isMatOpen={isMatOpen}
        onToggleMat={() => setIsMatOpen((o) => !o)}
        tableclothColor={tableclothColor}
        onTableclothColorChange={handleTableclothColorChange}
        onOpenLobby={() => setShowLobby(true)}
        online={online ? { badge: online.badge, onNewGame: online.isHost ? online.onNewGame : null } : undefined}
      />

      <div className="tt-table">
        <PlayersRail
          state={gameState}
          seats={lobbyConfig.seats}
          inspectedPlayerId={displayedMatPlayerId}
          // Online the board on show is always mine
          onInspect={(pid) => !online && setInspectedPlayerId(pid)}
          roleLabels={online?.roleLabels}
        />

        <main
          className={`tt-board-area${isDragging ? ' is-dragging' : ''}`}
          aria-label="Board"
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.2 : -0.2)));
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
          }}
          onMouseMove={(e) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            if (!drag.moved && Math.hypot(dx, dy) < 5) return;
            drag.moved = true;
            setIsDragging(true);
            setPan({ x: drag.panX + dx, y: drag.panY + dy });
          }}
          onMouseUp={() => {
            // Let the click that ends a drag see `moved`, then forget the drag
            setTimeout(() => {
              dragRef.current = null;
            }, 0);
            setIsDragging(false);
          }}
          onMouseLeave={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
        >
          {devTargeting && (
            <div className="tt-ink tt-board-prompt" data-testid="dev-card-board-prompt" role="status">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {devTargeting.kind === 'road'
                    ? devTargeting.first === null
                      ? 'Road Construction: place your first free road'
                      : 'Place your second free road'
                    : devTargeting.kind === 'inspector'
                      ? 'Clean Up: move the inspector'
                      : 'Clean Up: remove a hazard'}
                </strong>
                <span>
                  {devTargeting.kind === 'road'
                    ? devTargeting.first === null
                      ? 'Click a glowing path connected to your roads, towns or cities.'
                      : 'Click another glowing path, or keep just the one.'
                    : devTargeting.kind === 'inspector'
                      ? 'Click a glowing hex. Then you take a card from a player there.'
                      : 'Click a hazard on a hex or building.'}
                </span>
              </div>
              {devTargeting.kind === 'road' && devTargeting.first !== null && (
                <button
                  type="button"
                  className="tt-icon-btn"
                  data-testid="road-construction-just-one"
                  onClick={() =>
                    devTargeting.first !== null &&
                    playDevCard(devTargeting.cardId, { cardType: 'roadConstruction', edge1: devTargeting.first })
                  }
                >
                  Just one road
                </button>
              )}
              <button type="button" className="tt-icon-btn" onClick={() => setDevTargeting(null)}>
                Cancel
              </button>
            </div>
          )}

          <div className="tt-board-overlay-top">
            <div
              data-testid="live-action-banner"
              aria-live="polite"
              style={{ maxWidth: '100%', pointerEvents: 'none' }}
            >
              {toast && toastTheme && (
                <div
                  className={`tt-toast${toast.isError ? ' is-error' : ''}`}
                  key={toast.id}
                  role={toast.isError ? 'alert' : undefined}
                  data-testid={toast.isError ? 'action-error-toast' : undefined}
                >
                  <PlayerBadge playerId={toast.playerId} size={24} />
                  <strong>{toast.title}</strong>
                  {toast.detail && toast.detail !== toast.title && <span>{toast.detail}</span>}
                </div>
              )}
            </div>
          </div>

          {eventReveal && (
            <div className="tt-event-reveal" key={eventReveal.id} data-testid="event-reveal" aria-hidden="true">
              <svg className="tt-event-reveal-disc" width="132" height="132" viewBox="-33 -33 66 66">
                <EventDiscSvg
                  type={eventReveal.disc}
                  green={EVENT_TRACK_METADATA[eventReveal.disc].category === 'green'}
                  r={26}
                />
              </svg>
              <div className="tt-event-reveal-name">{eventName(eventReveal.disc)}</div>
              <div className="tt-event-reveal-sub">
                {eventReveal.onTrack === 0
                  ? 'The track is full'
                  : `${eventReveal.onTrack} of ${eventReveal.capacity} on the track`}
              </div>
            </div>
          )}

          {gameState.phase === 'SetupRoll' && (
            <SetupRollOff
              state={gameState}
              canRoll={canRollSetupDice}
              actingPlayerId={actingPlayerId}
              onRoll={() => dispatchAction({ type: 'SETUP_ROLL_DICE', playerId: actingPlayerId })}
            />
          )}

          <div
            className="tt-board-stage"
            data-testid="tabletop-board"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <IslandBoardSvg
              state={gameState}
              highlightedHexIds={highlightedHexIds}
              highlightedNodeIds={highlightedNodeIds}
              highlightedEdgeIds={highlightedEdgeIds}
              highlightedCutoutSlots={highlightedCutoutSlots}
              producingHexIds={producingHexIds}
              yourHexes={
                discardDecision && discardHelp
                  ? { playerId: discardDecision.playerId, hexIds: discardHelp.hexIds }
                  : undefined
              }
              previewNode={previewNode}
              previewEdge={previewEdge}
              pinnedEdges={pinnedEdges}
              onHexClick={handleHexClick}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onCutoutClick={handleCutoutClick}
              onNodeHover={setHoveredNodeId}
              onEdgeHover={setHoveredEdgeId}
              onSelectEventTrackInfo={(track) => setSelectedEventInfo(track)}
            />
          </div>

          <div className="tt-zoom" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              data-testid="zoom-in-btn"
              aria-label="Zoom in"
              title="Zoom in (up to 500%)"
              onClick={() => setZoom((z) => clampZoom(z + 0.35))}
            >
              +
            </button>
            <button
              type="button"
              data-testid="reset-view-btn"
              title="Reset view"
              aria-label="Reset view"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              style={{ fontSize: '10.5px', height: '22px' }}
            >
              <span data-testid="zoom-level-readout">{Math.round(zoom * 100)}%</span>
            </button>
            <button
              type="button"
              data-testid="zoom-out-btn"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => setZoom((z) => clampZoom(z - 0.35))}
            >
              &minus;
            </button>
          </div>

          {selectedEventInfo && (
            <div className="tt-ink tt-event-info" data-testid="event-info-popover" role="dialog">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <circle r="14" fill="#fbf6ea" />
                  <EventIconSvg type={selectedEventInfo} scale={0.95} />
                </svg>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: '#ffffff', flex: 1 }}>
                  {EVENT_TRACK_METADATA[selectedEventInfo].title}
                  <span style={{ fontWeight: 400, color: 'var(--ink-300)', marginLeft: '8px', fontSize: '13px' }}>
                    {gameState.eventTracks[selectedEventInfo] ?? 0} of {EVENT_TRACK_METADATA[selectedEventInfo].capacity} discs
                  </span>
                </strong>
                <button
                  type="button"
                  className="tt-icon-btn"
                  aria-label="Close"
                  onClick={() => setSelectedEventInfo(null)}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
              <p style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.45 }}>
                {EVENT_TRACK_METADATA[selectedEventInfo].ruleSummary}
              </p>
            </div>
          )}
        </main>

        <TableRail
          state={gameState}
          drawCount={drawCountThisTurn}
          canDrawEventDisc={canDrawEventDisc}
          onDrawEventDisc={() => dispatchAction({ type: 'DRAW_EVENT_DISC', playerId: actingPlayerId })}
          canRoll={canRollDice || canRollSetupDice}
          onRoll={() =>
            dispatchAction({
              type: canRollSetupDice ? 'SETUP_ROLL_DICE' : 'ROLL_DICE',
              playerId: actingPlayerId,
            })
          }
          rollAnimKey={rollAnimKey}
          producingCount={producingHexIds.size}
          onSelectEventTrackInfo={(track) => setSelectedEventInfo(track)}
        />
      </div>

      <ActionDock
        state={gameState}
        fixedViewer={!!online}
        viewedPlayerId={displayedMatPlayerId}
        actingPlayerId={actingPlayerId}
        canAct={canEndTurn && displayedMatPlayerId === actingPlayerId}
        legal={currentLegalActions}
        redact={shouldRedactDisplayedMat}
        activeBuildMode={activeBuildMode}
        onSelectBuildMode={setActiveBuildMode}
        onBuyDevCard={() => dispatchAction({ type: 'BUY_DEV_CARD', playerId: actingPlayerId })}
        onBuildWarehouse={() => dispatchAction({ type: 'BUILD_WAREHOUSE', playerId: actingPlayerId })}
        onOpenEnergyBuyCardModal={() => setShowEnergyCardModal(true)}
        onPlayDevCardPrompt={startDevCard}
        onRevealVpCards={(cardIds) => dispatchAction({ type: 'REVEAL_VP_CARDS', playerId: actingPlayerId, cardIds })}
        onInspect={(pid) => !online && setInspectedPlayerId(pid)}
        primary={primary}
        canTrade={canEndTurn}
        onOpenTrade={() => setShowTradeModal(true)}
        isMatOpen={isMatOpen}
        onToggleMat={() => setIsMatOpen((o) => !o)}
        setupPanel={
          isSetupDraft ? (
            <SetupCoach state={gameState} seats={lobbyConfig.seats} hoveredNodeId={hoveredNodeId} />
          ) : undefined
        }
        decisionPanel={
          discardDecision && discardHelp ? (
            <DiscardPanel
              key={discardDecision.id}
              state={gameState}
              decision={discardDecision}
              production={discardHelp.production}
              hidden={privacyCurtainForPlayer !== null}
              onDispatch={dispatchAction}
            />
          ) : undefined
        }
        drawer={
          isMatOpen && !discardDecision ? (
            <div className="tt-drawer" data-testid="player-board-drawer" role="dialog" aria-label={`${displayedPlayer.name}'s player board`}>
              <div className="tt-drawer-head">
                <h3>{displayedPlayer.name}’s player board</h3>
                <button
                  type="button"
                  className="tt-icon-btn"
                  aria-label="Close player board"
                  onClick={() => setIsMatOpen(false)}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
              <PlayerMat
                player={displayedPlayer}
                isActiveTurn={!waitingOnOthers && displayedMatPlayerId === actingPlayerId && noPending}
                isActionPhase={gameState.phase === 'ActionPhase'}
                isPreEventWindow={gameState.phase === 'EventPhase' && gameState.eventDiscsDrawnThisTurn === 0}
                turnStats={gameState.turnStats}
                devCardsBoughtThisTurn={gameState.devCardsBoughtThisTurn}
                devCardPlayedThisTurn={gameState.devCardPlayedThisTurn}
                activeBuildMode={activeBuildMode}
                redactPrivateCards={shouldRedactDisplayedMat}
                showOrganiser={false}
                onSelectBuildMode={(mode) => setActiveBuildMode(mode)}
                onBuildWarehouse={() => dispatchAction({ type: 'BUILD_WAREHOUSE', playerId: actingPlayerId })}
                onBuyDevCard={() => dispatchAction({ type: 'BUY_DEV_CARD', playerId: actingPlayerId })}
                onOpenEnergyBuyCardModal={() => setShowEnergyCardModal(true)}
                onPlayDevCardPrompt={startDevCard}
                onRevealVpCards={(cardIds) =>
                  dispatchAction({ type: 'REVEAL_VP_CARDS', playerId: actingPlayerId, cardIds })
                }
              />
            </div>
          ) : null
        }
      />

      {headDecision && !waitingOnOthers && (
        <PendingDecisionBanner state={gameState} decision={headDecision} onDispatch={dispatchAction} />
      )}

      {showTradeModal && (
        <TradeModal
          state={gameState}
          onDispatch={dispatchAction}
          onClose={() => setShowTradeModal(false)}
          remembered={rememberedTrade(gameState, tradeMemory)}
          prefs={normaliseTradePrefs(gameState, gameState.activePlayerId, tradePrefs[gameState.activePlayerId])}
          onPrefsChange={(prefs) => setTradePrefs((all) => ({ ...all, [gameState.activePlayerId]: prefs }))}
          onOffered={(give, want) => setTradeMemory({ turnKey: tradeTurnKey(gameState), give, want })}
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
          onStartBoardTargeting={(target) => {
            const cardId = devCardPrompt.cardId;
            setDevTargeting(target === 'road' ? { cardId, kind: 'road', first: null } : { cardId, kind: target });
          }}
        />
      )}

      {stealPrompt && (
        <StealChooserModal
          state={gameState}
          victims={stealPrompt.victims}
          onChoose={(pid) =>
            playDevCard(stealPrompt.cardId, {
              cardType: 'cleanup',
              option: { ...stealPrompt.option, targetPlayerId: pid },
            })
          }
          onCancel={() => setStealPrompt(null)}
        />
      )}

      {!online && privacyCurtainForPlayer && (
        <PrivacyCurtainModal
          nextPlayerId={privacyCurtainForPlayer}
          nextPlayerName={gameState.players[privacyCurtainForPlayer]?.name ?? privacyCurtainForPlayer}
          onReady={() => setPrivacyCurtainForPlayer(null)}
        />
      )}

      {isGameOver && !dismissedVictoryModal && (
        <VictoryModal
          state={gameState}
          onInspectBoard={() => setDismissedVictoryModal(true)}
          onOpenLobby={
            online
              ? online.isHost
                ? online.onNewGame
                : undefined
              : () => {
                  setDismissedVictoryModal(false);
                  setShowLobby(true);
                }
          }
        />
      )}

      {showLobby && !online && (
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
