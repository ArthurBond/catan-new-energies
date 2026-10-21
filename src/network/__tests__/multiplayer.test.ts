import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../../engine/setup';
import { chooseBotAction, getActingPlayerId } from '../../ai/bot';
import { redactForPlayer } from '../redact';
import {
  BroadcastChannelTransport,
  MockTransport,
  MockTransportHub,
  MultiplayerClientSession,
  MultiplayerHostSession,
  PeerJSTransport,
} from '../transport';
import { PlayerId } from '../../engine/types';

describe('Multiplayer State Redaction & Transport Layer (Task 5.2)', () => {
  beforeEach(() => {
    MockTransport.clearDefaultHub();
  });

  describe('redactForPlayer Security Guarantees', () => {
    it('strips opponent unplayed dev cards, hidden green discs, devDeck, eventBag, and PRNG state', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 777 });
      state.players.orange!.devCards.unplayed = ['dev_cleanup_01', 'dev_victoryPoint_01'];
      state.players.purple!.devCards.unplayed = ['dev_researchGrant_01', 'dev_highYield_01'];
      state.players.pink!.devCards.unplayed = ['dev_roadConstruction_01'];

      const viewForOrange = redactForPlayer(state, 'orange');

      // Viewer sees own secrets
      expect(viewForOrange.players.orange.devCards.unplayed).toEqual([
        'dev_cleanup_01',
        'dev_victoryPoint_01',
      ]);
      expect(viewForOrange.players.orange.devCards.unplayedCount).toBe(2);
      expect(viewForOrange.players.orange.hiddenGreenDiscs).toHaveLength(9);
      expect(viewForOrange.players.orange.hiddenGreenDiscsCount).toBe(9);

      // Viewer cannot see opponent unplayed dev cards or hidden green discs
      for (const oppId of ['purple', 'pink', 'blue'] as const) {
        expect(viewForOrange.players[oppId].devCards.unplayed).toBeUndefined();
        expect(viewForOrange.players[oppId].hiddenGreenDiscs).toBeUndefined();
        expect(viewForOrange.players[oppId].hiddenGreenDiscsCount).toBe(9);
        expect(viewForOrange.players[oppId].hiddenResourcesCount).toBeGreaterThan(0);
      }
      expect(viewForOrange.players.purple.devCards.unplayedCount).toBe(2);
      expect(viewForOrange.players.pink.devCards.unplayedCount).toBe(1);

      // Supply deck order, event bag order, and PRNG seed/state are completely omitted
      expect(viewForOrange.supply.devDeck).toBeUndefined();
      expect(viewForOrange.supply.devDeckCount).toBe(25);
      expect(viewForOrange.eventBag).toBeUndefined();
      expect(viewForOrange.eventBagCount).toBe(43);
      expect(viewForOrange.prng).toBeUndefined();

      const serialized = JSON.stringify(viewForOrange);
      expect(serialized).not.toContain('dev_researchGrant_01');
      expect(serialized).not.toContain('dev_roadConstruction_01');
      expect(serialized).not.toContain('"seed"');
    });

    it('supports optional hideOpponentResources masking while preserving hiddenResourcesCount', () => {
      const state = createInitialGameState({ setupMode: 'first', playerCount: 4, seed: 55 });
      const expectedPurpleCount =
        state.players.purple!.resources.lumber +
        state.players.purple!.resources.brick +
        state.players.purple!.resources.natural_fiber +
        state.players.purple!.resources.food +
        state.players.purple!.resources.steel +
        state.players.purple!.science;

      const redacted = redactForPlayer(state, 'orange', { hideOpponentResources: true });
      expect(redacted.players.purple.hiddenResourcesCount).toBe(expectedPurpleCount);
      expect(redacted.players.purple.science).toBe(0);
      expect(redacted.players.purple.resources).toEqual({
        lumber: 0,
        brick: 0,
        natural_fiber: 0,
        food: 0,
        steel: 0,
      });
    });
  });

  describe('BroadcastChannelTransport & PeerJSTransport Wrappers', () => {
    it('delivers messages across BroadcastChannelTransport instances for the same roomId', async () => {
      const t1 = new BroadcastChannelTransport('ROOM1');
      const t2 = new BroadcastChannelTransport('ROOM1');

      const received = new Promise<string>((resolve) => {
        t2.onMessage((msg) => {
          if (msg.type === 'PING') {
            resolve(msg.senderId);
          }
        });
      });

      t1.send({
        type: 'PING',
        roomId: 'ROOM1',
        senderId: 'tab-1',
        timestamp: 12345,
      });

      const sender = await received;
      expect(sender).toBe('tab-1');

      t1.close();
      t2.close();
    });

    it('initializes PeerJSTransport safely in Node and syncs via local fallback', async () => {
      const hostPeer = new PeerJSTransport('PEER1', { isHost: true, enableWebRTC: false });
      const clientPeer = new PeerJSTransport('PEER1', { isHost: false, enableWebRTC: false });

      const received = new Promise<number>((resolve) => {
        hostPeer.onMessage((msg) => {
          if (msg.type === 'PING') {
            resolve(msg.timestamp);
          }
        });
      });

      clientPeer.send({
        type: 'PING',
        roomId: 'PEER1',
        senderId: 'peer-client-1',
        timestamp: 99999,
      });

      expect(await received).toBe(99999);

      hostPeer.close();
      clientPeer.close();
    });
  });

  describe('Full 4-Player Game over MockTransport (1 Host + 3 Clients) & Reconnection', () => {
    it('runs a complete 4-player game from Standard Setup Draft through GameEnd with seat token reconnection', () => {
      const hub = new MockTransportHub();
      const roomId = 'CATAN4P';

      const initialState = createInitialGameState({
        setupMode: 'standard',
        playerCount: 4,
        seed: 2026,
      });

      const hostTransport = hub.createTransport(roomId);
      const hostSession = new MultiplayerHostSession({
        roomId,
        initialState,
        transport: hostTransport,
        hostPlayerId: 'orange',
        hostPlayerName: 'Host Orange',
      });

      // Create 3 Clients for Purple, Pink, and Blue
      const clientTransports = {
        purple: hub.createTransport(roomId),
        pink: hub.createTransport(roomId),
        blue: hub.createTransport(roomId),
      };

      const clients = {
        purple: new MultiplayerClientSession({
          roomId,
          transport: clientTransports.purple,
          playerName: 'Client Purple',
        }),
        pink: new MultiplayerClientSession({
          roomId,
          transport: clientTransports.pink,
          playerName: 'Client Pink',
        }),
        blue: new MultiplayerClientSession({
          roomId,
          transport: clientTransports.blue,
          playerName: 'Client Blue',
        }),
      };

      // All 3 clients join the room
      clients.purple.joinRoom({ preferredPlayerId: 'purple' });
      clients.pink.joinRoom({ preferredPlayerId: 'pink' });
      clients.blue.joinRoom({ preferredPlayerId: 'blue' });

      expect(clients.purple.getPlayerId()).toBe('purple');
      expect(clients.pink.getPlayerId()).toBe('pink');
      expect(clients.blue.getPlayerId()).toBe('blue');

      const purpleToken = clients.purple.getSeatToken()!;
      expect(purpleToken).toBeTruthy();

      // Verify unauthorized seat token is rejected by Host
      const versionBeforeBadAction = hostSession.getVersion();
      clientTransports.purple.send({
        type: 'ACTION_REQUEST',
        roomId,
        playerId: 'orange',
        seatToken: 'invalid-token-123',
        action: { type: 'SETUP_BUILD_TOWN', playerId: 'orange', nodeId: 0 },
      });
      expect(hostSession.getVersion()).toBe(versionBeforeBadAction);

      // Step through game using AI bots on behalf of whichever seat is currently acting
      let stepCount = 0;
      let reconnectedPurple = false;

      while (
        hostSession.getState().phase !== 'GameEnd' &&
        hostSession.getState().winner === null &&
        stepCount < 1500
      ) {
        const authState = hostSession.getState();
        const actingPid = getActingPlayerId(authState);
        if (!actingPid) break;

        // At step 25, simulate Client Purple dropping connection, missing an update, and reconnecting with seatToken!
        if (stepCount === 25 && !reconnectedPurple) {
          reconnectedPurple = true;
          clientTransports.purple.disconnect();

          // Perform a ping from Pink while Purple is disconnected
          clients.pink.ping(54321);
          expect(hostSession.getLastPing(clients.pink.clientId)).toBe(54321);

          // Now Purple reconnects using a fresh transport and its saved seatToken
          const newPurpleTransport = hub.createTransport(roomId);
          clients.purple.reconnect(newPurpleTransport);

          expect(clients.purple.getPlayerId()).toBe('purple');
          expect(clients.purple.getSeatToken()).toBe(purpleToken);
          expect(clients.purple.getVersion()).toBe(hostSession.getVersion());
        }

        const action = chooseBotAction(authState, actingPid, {
          personality:
            actingPid === 'orange'
              ? 'GreenInnovator'
              : actingPid === 'purple'
                ? 'IndustrialExpansionist'
                : 'Balanced',
          difficulty: 'Hard',
        });

        if (actingPid === 'orange') {
          // Host acts directly
          hostSession.applyAction(action);
        } else {
          // Client sends ACTION_REQUEST over MockTransport
          const client = clients[actingPid as Exclude<PlayerId, 'orange'>];
          client.sendAction(action);
        }

        stepCount++;
      }

      expect(reconnectedPurple).toBe(true);
      expect(hostSession.getState().phase).toBe('GameEnd');
      expect(hostSession.getState().winner).not.toBeNull();
      expect(stepCount).toBeLessThan(1500);

      // Verify all 3 clients are synchronized to the final version and have properly redacted states
      for (const pid of ['purple', 'pink', 'blue'] as const) {
        const client = clients[pid];
        const clientState = client.getState()!;
        expect(client.getVersion()).toBe(hostSession.getVersion());
        expect(clientState.phase).toBe('GameEnd');
        expect(clientState.winner).toEqual(hostSession.getState().winner);

        // Verify redaction invariants on final state
        expect(clientState.prng).toBeUndefined();
        expect(clientState.supply.devDeck).toBeUndefined();
        expect(clientState.eventBag).toBeUndefined();
        expect(clientState.players[pid].hiddenGreenDiscs).toBeDefined();
        expect(clientState.players.orange.hiddenGreenDiscs).toBeUndefined();
      }

      clients.purple.close();
      clients.pink.close();
      clients.blue.close();
      hostSession.close();
      hostTransport.close();
    }, 20000);
  });
});
