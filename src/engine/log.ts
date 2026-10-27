/**
 * Log lines that name a card a player received privately (steals, supply takes, trades).
 * `message` goes to `playerIds`; everyone else gets `publicMessage`. Redaction is in network/redact.
 */

import type { GameState, PlayerId } from './types';

export function pushPrivateLog(
  state: GameState,
  playerIds: PlayerId[],
  message: string,
  publicMessage: string
): void {
  state.log.push({
    timestamp: state.log.length,
    message,
    private: { playerIds, publicMessage },
  });
}
