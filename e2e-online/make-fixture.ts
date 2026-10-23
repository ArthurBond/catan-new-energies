/**
 * Writes a saved game (`current-game.json` + `host-key.txt`) for the online dialog tests, so a
 * server started on that folder resumes in a prepared situation: a roll of 7 with two discards,
 * a Clean Up card in a friend's hand, a game one draw from its end.
 *
 *   FIXTURE=seven SAVES_DIR=<folder> node node_modules/vite-node/vite-node.mjs e2e-online/make-fixture.ts
 *
 * The table is the First Game layout (orange = host "Hana", purple = friend "Finn", pink and blue
 * are server bots). Seat token and host key are fixed so a browser can walk straight in.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createGameFromOnlineConfig, type SavedRoom } from '../server/room';
import { createDefaultOnlineLobbyConfig } from '../src/network/server-protocol';
import type { GameState, PlayerId, ResourceType } from '../src/engine/types';

import { FIXTURE_FRIEND_TOKEN, FIXTURE_HOST_KEY, type FixtureName } from './fixture-constants';

type Hand = Partial<Record<ResourceType, number>> & { science?: number };

/** Gives a player exactly this hand and keeps the supply piles consistent. */
function setHand(state: GameState, pid: PlayerId, hand: Hand): void {
  const p = state.players[pid]!;
  const kinds: ResourceType[] = ['lumber', 'brick', 'natural_fiber', 'food', 'steel'];
  for (const k of kinds) {
    const next = hand[k] ?? 0;
    state.supply.resources[k] = Math.max(0, state.supply.resources[k] - (next - p.resources[k]));
    p.resources[k] = next;
  }
  const science = hand.science ?? 0;
  state.supply.science = Math.max(0, state.supply.science - (science - p.science));
  p.science = science;
}

function baseGame(): GameState {
  const config = createDefaultOnlineLobbyConfig(5);
  config.setupMode = 'first';
  config.placement = 'fixed';
  config.botSpeed = 'instant';
  config.seats.purple.controller = 'human';
  const game = createGameFromOnlineConfig(config, { orange: 'Hana', purple: 'Finn' });
  // Quiet table: small hands, nothing pending
  setHand(game, 'orange', {});
  setHand(game, 'purple', {});
  setHand(game, 'pink', { food: 1, steel: 2, lumber: 1, brick: 1, natural_fiber: 0 });
  setHand(game, 'blue', { lumber: 1, brick: 1, natural_fiber: 1, science: 1 });
  return game;
}

export function buildFixture(name: FixtureName): SavedRoom {
  const config = createDefaultOnlineLobbyConfig(5);
  config.setupMode = 'first';
  config.placement = 'fixed';
  config.botSpeed = 'instant';
  config.seats.purple.controller = 'human';
  const game = baseGame();

  if (name === 'seven') {
    // A 7 has just been rolled: orange (9 cards) and purple (8 cards) discard 4 each, then the
    // inspector moves and its owner steals. Orange also holds a Road Construction card.
    game.phase = 'ProductionPhase';
    game.activePlayerId = 'orange';
    game.lastDiceRoll = [3, 4];
    setHand(game, 'orange', { lumber: 2, brick: 2, natural_fiber: 2, food: 2, steel: 1 });
    setHand(game, 'purple', { lumber: 1, brick: 2, natural_fiber: 1, food: 1, steel: 2, science: 1 });
    game.players.orange.devCards.unplayed = ['dev_roadConstruction_01'];
    game.pendingDecisions = [
      { id: 'e2e-discard-orange', type: 'DISCARD_ON_SEVEN', playerId: 'orange', cardsToDiscard: 4 },
      { id: 'e2e-discard-purple', type: 'DISCARD_ON_SEVEN', playerId: 'purple', cardsToDiscard: 4 },
    ];
  } else if (name === 'friend-clean-up') {
    // Purple (the friend) is about to start a turn holding a Clean Up card, with a few cards in
    // every hand to steal from.
    game.phase = 'EventPhase';
    game.activePlayerId = 'purple';
    setHand(game, 'orange', { lumber: 2, steel: 1 });
    setHand(game, 'purple', { food: 1 });
    game.players.purple.devCards.unplayed = ['dev_cleanup_01'];
  } else {
    // The bag is empty and orange (the host) must draw: that ends the game on the clean-energy
    // balance. Finn and Pink hold Victory Point cards nobody has seen.
    game.phase = 'EventPhase';
    game.activePlayerId = 'orange';
    game.eventBag = [];
    game.players.orange.victoryPoints = 4;
    game.players.orange.renewablePlantsBuilt = 3;
    game.players.purple.victoryPoints = 6;
    game.players.purple.renewablePlantsBuilt = 1;
    game.players.purple.devCards.unplayed = ['dev_victoryPoint_01', 'dev_victoryPoint_02', 'dev_cleanup_02'];
    game.players.pink.victoryPoints = 5;
    game.players.pink.devCards.unplayed = ['dev_victoryPoint_03'];
  }

  return {
    format: 1,
    savedAt: Date.now(),
    config,
    started: true,
    game,
    version: 0,
    lastAction: null,
    seats: { purple: { token: FIXTURE_FRIEND_TOKEN, name: 'Finn' } },
  };
}

export function writeFixture(name: FixtureName, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'current-game.json'), JSON.stringify(buildFixture(name)), 'utf8');
  fs.writeFileSync(path.join(dir, 'host-key.txt'), `${FIXTURE_HOST_KEY}\n`, 'utf8');
}

const requested = process.env.FIXTURE as FixtureName | undefined;
const target = process.env.SAVES_DIR;
if (requested && target) writeFixture(requested, target);
