/**
 * CATAN: New Energies — Trade requests ("I need a brick, name your price")
 *
 * The active player asks for specific cards without saying what they will give. Every other player
 * who holds those cards is asked in turn, one pending decision at a time, and makes exactly one
 * reply: a counter-offer (they give the requested cards for something from the requester) or a
 * pass. Players who do not hold the cards are skipped (and logged). When everyone has replied the
 * requester sees all the offers together and takes one, or none.
 *
 *   REQUEST_TRADE                  -> TRADE_REQUEST_REPLY (first player who holds the cards)
 *   reply { want } | { pass }      -> TRADE_REQUEST_REPLY (next) ... -> TRADE_REQUEST_CHOICE
 *   choice { takeOfferFrom } | { decline }   -> the trade happens, or nothing does
 *
 * Same trade rules as domestic offers (energy-trades.ts): whole real cards, no card on both sides,
 * nobody ends above 5 energy. Holdings are checked again when an offer is taken.
 *
 * Replies are never checked against what the requester holds: online, the other hands are hidden,
 * so a refusal would give the hand away. An offer the requester cannot afford simply cannot be
 * taken (it shows greyed out). Energy is public, so its limit is checked at once.
 */

import { countTradeItems, isWellFormedTradeItems } from './energy-trades';
import { isHandBreakdownHidden } from './production';
import {
  GameAction,
  GameState,
  PendingDecision,
  PlayerId,
  PlayerState,
  ResourceType,
  TradeItems,
  TradeRequestOffer,
} from './types';

export type TradeRequestReply = Extract<PendingDecision, { type: 'TRADE_REQUEST_REPLY' }>;
export type TradeRequestChoice = Extract<PendingDecision, { type: 'TRADE_REQUEST_CHOICE' }>;

type TradeKind = ResourceType | 'science' | 'energy';

/** Every kind of item a trade can name, in the order they are listed in messages. */
export const TRADE_KINDS: readonly TradeKind[] = [
  'lumber',
  'brick',
  'natural_fiber',
  'food',
  'steel',
  'science',
  'energy',
];

const ENERGY_LIMIT = 5;

function heldOf(player: PlayerState, kind: TradeKind): number {
  if (kind === 'energy') return player.energy;
  if (kind === 'science') return player.science;
  return player.resources[kind];
}

/** Only the entries with a count, in a fixed order, so equal trades look equal. */
export function compactTradeItems(items: TradeItems): TradeItems {
  const out: TradeItems = {};
  for (const kind of TRADE_KINDS) {
    const n = items[kind] || 0;
    if (n > 0) out[kind] = n;
  }
  return out;
}

/** "1 brick, 2 steel" */
export function describeTradeItems(items: TradeItems): string {
  return TRADE_KINDS.filter((k) => (items[k] || 0) > 0)
    .map((k) => `${items[k]} ${k}`)
    .join(', ');
}

/** The kinds in `items` that `player` does not hold enough of (none when their hand is hidden). */
function shortKinds(player: PlayerState, items: TradeItems): TradeKind[] {
  // A browser cannot see another player's cards; only the server (full state) judges them
  if (isHandBreakdownHidden(player)) return [];
  return TRADE_KINDS.filter((k) => (items[k] || 0) > 0 && heldOf(player, k) < (items[k] || 0));
}

function transfer(from: PlayerState, to: PlayerState, items: TradeItems): void {
  for (const kind of TRADE_KINDS) {
    const n = items[kind] || 0;
    if (n <= 0) continue;
    if (kind === 'energy') {
      from.energy -= n;
      to.energy += n;
    } else if (kind === 'science') {
      from.science -= n;
      to.science += n;
    } else {
      from.resources[kind] -= n;
      to.resources[kind] += n;
    }
  }
}

function log(state: GameState, message: string): void {
  state.log.push({ timestamp: state.log.length, message });
}

// ============================================================================
// 1. The request
// ============================================================================

export function canRequestTrade(
  state: GameState,
  playerId: PlayerId,
  ask: TradeItems
): { canRequest: boolean; reason?: string } {
  if (state.phase !== 'ActionPhase') {
    return { canRequest: false, reason: 'Can only trade during ActionPhase' };
  }
  if (state.activePlayerId !== playerId) {
    return { canRequest: false, reason: 'Only the active player can ask for cards' };
  }
  if (state.pendingDecisions.length > 0) {
    return { canRequest: false, reason: 'Unresolved pending decisions exist' };
  }
  if (!isWellFormedTradeItems(ask)) {
    return { canRequest: false, reason: 'Requests use whole numbers of real cards' };
  }
  if (countTradeItems(ask) === 0) {
    return { canRequest: false, reason: 'Ask for at least one card' };
  }
  const me = state.players[playerId]!;
  if ((ask.energy || 0) > 0 && me.energy + ask.energy! > ENERGY_LIMIT) {
    return { canRequest: false, reason: 'Trade would exceed your 5 energy limit' };
  }
  return { canRequest: true };
}

export function applyRequestTrade(state: GameState, playerId: PlayerId, ask: TradeItems): void {
  const check = canRequestTrade(state, playerId, ask);
  if (!check.canRequest) throw new Error(check.reason);

  const wanted = compactTradeItems(ask);
  // Everyone else, in the order their turns come after the requester's
  const seats = state.playerOrder.slice(0, state.playerCount);
  const at = seats.indexOf(playerId);
  const queue = seats.map((_, i) => seats[(at + 1 + i) % seats.length]!).filter((pid) => pid !== playerId);

  log(state, `${state.players[playerId]!.name} asked for ${describeTradeItems(wanted)}.`);
  askNextPlayer(state, playerId, wanted, [], queue);
}

/**
 * Puts the request to the next player who holds the cards (logging everyone passed over). When
 * nobody is left, the requester gets the offers to choose from, or is told there are none.
 */
function askNextPlayer(
  state: GameState,
  requestingPlayerId: PlayerId,
  ask: TradeItems,
  offers: TradeRequestOffer[],
  queue: PlayerId[]
): void {
  while (queue.length > 0) {
    const nextId = queue.shift()!;
    const next = state.players[nextId]!;
    const short = shortKinds(next, ask);
    if (short.length > 0) {
      const none = short.every((k) => heldOf(next, k) === 0);
      log(
        state,
        none
          ? `${next.name} has no ${short.join(' or ')} and was skipped.`
          : `${next.name} does not have enough ${short.join(' and ')} and was skipped.`
      );
      continue;
    }
    state.pendingDecisions.push({
      id: `trade-request-${requestingPlayerId}-${nextId}-${state.currentTurn}-${state.log.length}`,
      type: 'TRADE_REQUEST_REPLY',
      playerId: nextId,
      requestingPlayerId,
      ask,
      offers: [...offers],
      waiting: [...queue],
    });
    return;
  }

  const requester = state.players[requestingPlayerId]!;
  if (offers.length === 0) {
    log(state, `Nobody made ${requester.name} an offer.`);
    return;
  }
  state.pendingDecisions.push({
    id: `trade-request-${requestingPlayerId}-choice-${state.currentTurn}-${state.log.length}`,
    type: 'TRADE_REQUEST_CHOICE',
    playerId: requestingPlayerId,
    requestingPlayerId,
    ask,
    offers: [...offers],
  });
}

// ============================================================================
// 2. A player's reply
// ============================================================================

/** Checks an answer to the head `TRADE_REQUEST_REPLY` directly against the rules. */
export function canResolveTradeReply(
  state: GameState,
  playerId: PlayerId,
  decisionId: string,
  response: unknown
): { ok: boolean; reason?: string } {
  const head = state.pendingDecisions[0];
  if (!head || head.type !== 'TRADE_REQUEST_REPLY' || head.id !== decisionId || head.playerId !== playerId) {
    return { ok: false, reason: 'No trade request is waiting for this player' };
  }
  const resp = response as { pass?: unknown; want?: unknown } | null;
  if (!resp || typeof resp !== 'object') return { ok: false, reason: 'Reply with an offer or pass' };
  if (resp.pass === true && resp.want === undefined) return { ok: true };
  if (resp.want === undefined) return { ok: false, reason: 'Reply with an offer or pass' };

  if (!isWellFormedTradeItems(resp.want)) {
    return { ok: false, reason: 'Trades use whole numbers of real cards' };
  }
  const want = resp.want;
  if (countTradeItems(want) === 0) {
    return { ok: false, reason: 'Name what you want in return, or pass' };
  }
  for (const kind of TRADE_KINDS) {
    if ((head.ask[kind] || 0) > 0 && (want[kind] || 0) > 0) {
      return { ok: false, reason: `Cannot trade ${kind} for ${kind}` };
    }
  }

  const responder = state.players[playerId]!;
  const requester = state.players[head.requestingPlayerId]!;
  if (shortKinds(responder, head.ask).length > 0) {
    return { ok: false, reason: 'You do not hold the cards that were asked for' };
  }
  if ((want.energy || 0) > 0 && responder.energy + want.energy! - (head.ask.energy || 0) > ENERGY_LIMIT) {
    return { ok: false, reason: 'Trade would exceed your 5 energy limit' };
  }
  if ((head.ask.energy || 0) > 0 && requester.energy + head.ask.energy! - (want.energy || 0) > ENERGY_LIMIT) {
    return { ok: false, reason: `Trade would exceed ${requester.name}'s 5 energy limit` };
  }
  return { ok: true };
}

/** Records the head player's reply and moves on to the next player (or to the requester's choice). */
export function applyTradeRequestReply(state: GameState, decisionId: string, response: unknown): void {
  const head = state.pendingDecisions[0];
  if (!head || head.type !== 'TRADE_REQUEST_REPLY' || head.id !== decisionId) {
    throw new Error(`Invalid trade request decision ${decisionId}`);
  }
  const check = canResolveTradeReply(state, head.playerId, decisionId, response);
  if (!check.ok) throw new Error(check.reason);

  const responder = state.players[head.playerId]!;
  const offers = [...head.offers];
  const resp = response as { pass?: boolean; want?: TradeItems };
  state.pendingDecisions.shift();

  if (resp.want) {
    const want = compactTradeItems(resp.want);
    offers.push({ playerId: head.playerId, want });
    log(state, `${responder.name} offered ${describeTradeItems(head.ask)} for ${describeTradeItems(want)}.`);
  } else {
    log(state, `${responder.name} passed.`);
  }
  askNextPlayer(state, head.requestingPlayerId, head.ask, offers, [...head.waiting]);
}

// ============================================================================
// 3. The requester's choice
// ============================================================================

/** Whether the requester can take this offer right now (holdings are checked again here). */
export function canTakeRequestOffer(
  state: GameState,
  requestingPlayerId: PlayerId,
  ask: TradeItems,
  offer: TradeRequestOffer
): { ok: boolean; reason?: string } {
  const requester = state.players[requestingPlayerId]!;
  const offeror = state.players[offer.playerId];
  if (!offeror || offer.playerId === requestingPlayerId) return { ok: false, reason: 'Invalid offer' };

  const lacking = shortKinds(requester, offer.want);
  if (lacking.length > 0) {
    return { ok: false, reason: `${requester.name} does not have enough ${lacking.join(' and ')}` };
  }
  const missing = shortKinds(offeror, ask);
  if (missing.length > 0) {
    return { ok: false, reason: `${offeror.name} no longer has enough ${missing.join(' and ')}` };
  }
  if (requester.energy + (ask.energy || 0) - (offer.want.energy || 0) > ENERGY_LIMIT) {
    return { ok: false, reason: `${requester.name} would go over 5 energy` };
  }
  if (offeror.energy + (offer.want.energy || 0) - (ask.energy || 0) > ENERGY_LIMIT) {
    return { ok: false, reason: `${offeror.name} would go over 5 energy` };
  }
  return { ok: true };
}

/** Checks an answer to the head `TRADE_REQUEST_CHOICE` directly against the rules. */
export function canResolveTradeChoice(
  state: GameState,
  playerId: PlayerId,
  decisionId: string,
  response: unknown
): { ok: boolean; reason?: string } {
  const head = state.pendingDecisions[0];
  if (!head || head.type !== 'TRADE_REQUEST_CHOICE' || head.id !== decisionId || head.playerId !== playerId) {
    return { ok: false, reason: 'No offers are waiting for this player' };
  }
  const resp = response as { decline?: unknown; takeOfferFrom?: unknown } | null;
  if (!resp || typeof resp !== 'object') return { ok: false, reason: 'Take an offer or turn them all down' };
  if (resp.decline === true && resp.takeOfferFrom === undefined) return { ok: true };
  const offer = head.offers.find((o) => o.playerId === resp.takeOfferFrom);
  if (!offer) return { ok: false, reason: 'That player made no offer' };
  return canTakeRequestOffer(state, head.requestingPlayerId, head.ask, offer);
}

/** Takes the chosen offer (the requester gets the asked cards, the offeror gets what they wanted) or none. */
export function applyTradeRequestChoice(state: GameState, decisionId: string, response: unknown): void {
  const head = state.pendingDecisions[0];
  if (!head || head.type !== 'TRADE_REQUEST_CHOICE' || head.id !== decisionId) {
    throw new Error(`Invalid trade request decision ${decisionId}`);
  }
  const check = canResolveTradeChoice(state, head.playerId, decisionId, response);
  if (!check.ok) throw new Error(check.reason);

  const requester = state.players[head.requestingPlayerId]!;
  const resp = response as { takeOfferFrom?: PlayerId };
  state.pendingDecisions.shift();

  const offer = head.offers.find((o) => o.playerId === resp.takeOfferFrom);
  if (!offer) {
    log(state, `${requester.name} turned down every offer.`);
    return;
  }
  const offeror = state.players[offer.playerId]!;
  transfer(offeror, requester, head.ask);
  transfer(requester, offeror, offer.want);
  log(state, `${requester.name} took ${offeror.name}'s offer.`);
}

// ============================================================================
// 4. Legal actions (a sample: the rules above accept any valid reply)
// ============================================================================

function answer(playerId: PlayerId, decisionId: string, response: unknown): GameAction {
  return { type: 'RESOLVE_PENDING_DECISION', playerId, decisionId, response };
}

/**
 * Pass, or ask for one or two of any other kind of card in return. Deliberately blind to the
 * requester's hand (online it is hidden), so every seat lists the same moves for this prompt.
 */
export function tradeRequestReplyActions(state: GameState, head: TradeRequestReply): GameAction[] {
  const actions: GameAction[] = [answer(head.playerId, head.id, { pass: true })];
  for (const kind of TRADE_KINDS) {
    for (const n of [1, 2]) {
      const want: TradeItems = { [kind]: n };
      if (canResolveTradeReply(state, head.playerId, head.id, { want }).ok) {
        actions.push(answer(head.playerId, head.id, { want }));
      }
    }
  }
  return actions;
}

/** Each offer the requester can take right now, and turning them all down. */
export function tradeRequestChoiceActions(state: GameState, head: TradeRequestChoice): GameAction[] {
  const actions: GameAction[] = [];
  for (const offer of head.offers) {
    if (canTakeRequestOffer(state, head.requestingPlayerId, head.ask, offer).ok) {
      actions.push(answer(head.playerId, head.id, { takeOfferFrom: offer.playerId }));
    }
  }
  actions.push(answer(head.playerId, head.id, { decline: true }));
  return actions;
}
