/**
 * CATAN: New Energies — Right rail: the seven event tracks as one straight row of the icons used on the
 * board's islands, the track nearest to triggering first.
 */

import './event-row.css';
import type { EventDiscType, GameState } from '../engine/types';
import { eventName, eventTrackStandings } from './gameView';
import { EVENT_TRACK_METADATA } from './theme';
import { EventDiscSvg } from './WoodenPiecesSvg';

export interface EventRowProps {
  state: Pick<GameState, 'eventTracks' | 'log'>;
  /** Opens the rules for a track, as clicking its island does */
  onSelect?: (track: EventDiscType) => void;
}

export function EventRow({ state, onSelect }: EventRowProps) {
  const standings = eventTrackStandings(state);
  return (
    <section
      className="tt-card tt-events"
      data-testid="event-row"
      aria-label="Event tracks, closest to triggering first"
    >
      <div className="tt-events-head">
        <span className="tt-card-title">Event tracks</span>
        <small>Closest first</small>
      </div>
      <ol className="tt-events-row">
        {standings.map(({ type, filled, capacity, remaining }) => {
          // Same colours as the islands: the shared Climate Conference island is green
          const green = EVENT_TRACK_METADATA[type].category !== 'brown';
          const label = `${eventName(type)}: ${filled} of ${capacity} discs, ${remaining} to go`;
          return (
            <li key={type}>
              <button
                type="button"
                className="tt-event"
                data-testid={`event-row-item-${type}`}
                data-green={green ? 'true' : 'false'}
                data-filled={filled}
                data-capacity={capacity}
                data-remaining={remaining}
                aria-label={label}
                title={label}
                onClick={() => onSelect?.(type)}
              >
                <svg viewBox="-14.5 -14 29 32" aria-hidden="true">
                  <EventDiscSvg type={type} green={green} r={13} />
                </svg>
                <span className="tt-event-pips" aria-hidden="true">
                  {Array.from({ length: capacity }, (_, i) => (
                    <i key={i} data-on={i < filled ? 'true' : 'false'} />
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
