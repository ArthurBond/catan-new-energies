/**
 * CATAN: New Energies — lobby screens for games on the host's server.
 *
 * Host: choose who sits where (Host / Friend / Bot), the island, share the join link, start.
 * Friend: type a name, pick an open seat, wait for the host. `SeatPicker` is also shown mid-game
 * to anyone without a seat, so late joiners can take a free seat.
 */

import 'preact/compat';
import { ComponentChildren } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import type { PlayerId } from '../../engine/types';
import {
  activeSeatIds,
  type OnlineLobbyConfig,
  type OnlineSeatConfig,
  type SeatInfo,
  type ShareInfo,
  type ShareLink,
} from '../../network/server-protocol';
import { LobbyOption, STRATEGY_OPTIONS } from '../Modals';
import { PlayerBadge } from '../PlayersRail';
import { PLAYER_THEMES } from '../theme';
import type { ConnectionStatus, OnlineSession } from './useOnlineGame';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  offline: 'Offline — retrying',
  replaced: 'Opened elsewhere',
  denied: 'Invite code needed',
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className="ol-badge"
      data-testid="connection-badge"
      data-status={status}
      role="status"
      title={status === 'connected' ? 'Connected to the host’s game' : 'Not connected to the host right now'}
    >
      <span className="ol-dot" aria-hidden="true" />
      <span className="tt-btn-label">{STATUS_LABEL[status]}</span>
    </span>
  );
}

/** Full-screen tablecloth with one dialog card, for the lobby and connection screens. */
export function OnlinePage({ children }: { children: ComponentChildren }) {
  return (
    <div className="ol-page" data-testid="online-page">
      {children}
    </div>
  );
}

export function seatRoleLabel(info: SeatInfo | undefined, seat: OnlineSeatConfig, me: PlayerId | null): string {
  if (info?.playerId === me && me !== null) return 'You';
  if (info?.role === 'host') return 'Host';
  if (seat.controller === 'bot') {
    const style = STRATEGY_OPTIONS.find((o) => o.value === seat.botStrategy)?.label ?? seat.botStrategy;
    return `Bot · ${style}, ${seat.botDifficulty}`;
  }
  return info?.claimed ? 'Friend' : 'Open seat';
}

function presence(info: SeatInfo | undefined): string {
  if (!info?.claimed) return 'Waiting for a friend';
  return info.connected ? 'Connected' : 'Offline';
}

/** The server's latest refusal or warning, shown for a few seconds. */
export function useNoticeText(session: OnlineSession): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!session.notice) return;
    setText(session.notice.message);
    const timer = setTimeout(() => setText(null), 4500);
    return () => clearTimeout(timer);
  }, [session.notice?.id]);
  return text;
}

/** The address friends should open: this page's own address, or the LAN one when it is localhost. */
export function joinUrlFor(lanUrls: string[]): { primary: string; others: string[] } {
  const here = window.location.origin;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
  const primary = local ? (lanUrls[0] ?? here) : here;
  return { primary, others: lanUrls.filter((u) => u !== primary) };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Plain http on a LAN address has no clipboard API: fall back to a hidden text field.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** What the host reads above the link, per way of sharing. */
const SHARE_INTRO: Record<ShareInfo['mode'], string> = {
  online: 'Send this link to your friends. It works from any network, and the connection is encrypted.',
  tailnet: 'Send this link to friends who use Tailscale. The connection is encrypted and not public.',
  lan: 'Friends on your Wi-Fi open this link, type their name and pick a seat.',
};

/**
 * The links the server says friends can use. Until the server has sent them (or with an older
 * server) the panel falls back to this page's own address, as before.
 */
export function shareLinksFor(share: ShareInfo | null, lanUrls: string[]): ShareLink[] {
  // On a computer with no network at all the page's own address is still better than nothing.
  if (share && (share.links.length > 0 || share.mode !== 'lan')) return share.links;
  const { primary, others } = joinUrlFor(lanUrls);
  return [primary, ...others].map((url) => ({ url, kind: 'lan' as const, label: 'Same Wi-Fi only' }));
}

function CopyButton({ text, testId, label = 'Copy link' }: { text: string; testId: string; label?: string }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2200);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="tt-icon-btn"
      data-testid={testId}
      onClick={async () => setCopied((await copyText(text)) ? 'yes' : 'no')}
    >
      <span aria-live="polite">{copied === 'yes' ? 'Copied' : copied === 'no' ? 'Copy failed' : label}</span>
    </button>
  );
}

export function InvitePanel({ share, lanUrls }: { share: ShareInfo | null; lanUrls: string[] }) {
  const mode = share?.mode ?? 'lan';
  const links = shareLinksFor(share, lanUrls);
  const primary = links[0];
  const others = links.slice(1);
  return (
    <div className="lb-section ol-invite" data-testid="online-invite" data-share-mode={mode}>
      <h3>Invite friends</h3>
      {primary ? (
        <>
          <p className="lb-muted">{SHARE_INTRO[mode]}</p>
          <div className="ol-link-row">
            <code className="ol-link" data-testid="online-join-link">
              {primary.url}
            </code>
            <CopyButton text={primary.url} testId="copy-join-link" />
          </div>
        </>
      ) : (
        <p className="ol-share-status" role="status" data-testid="online-share-status">
          <span className="ol-dot" aria-hidden="true" />
          {share?.status ?? 'No Wi-Fi or network address found.'}
        </p>
      )}
      {primary && share?.status && (
        <p className="lb-muted" role="status" data-testid="online-share-status">
          {share.status}
        </p>
      )}
      {share?.inviteCode && (
        <p className="lb-muted" data-testid="online-invite-code">
          Invite code <strong className="ol-code">{share.inviteCode}</strong> (already in the link; anyone who opens the
          address without it is asked for it).
        </p>
      )}
      {others.length > 0 && (
        <p className="lb-muted" data-testid="online-lan-urls">
          {mode === 'lan' ? 'Other addresses of this PC: ' : 'Also works: '}
          {others.map((l, i) => (
            <span key={l.url}>
              {i > 0 && ' · '}
              {l.url}
              {mode !== 'lan' && ` (${l.label.toLowerCase()})`}
            </span>
          ))}
        </p>
      )}
      {mode === 'lan' && (
        <p className="lb-muted" data-testid="online-share-hint">
          Friends on another network? Stop the server and start it with <code>npm run host:online</code>.
        </p>
      )}
    </div>
  );
}

/** Shown instead of the lobby while the server wants the invite code. */
export function InviteCodeForm({ session }: { session: OnlineSession }) {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const denied = session.denied;
  // "This game needs a code" is the reason for the screen, not a mistake to flag in red.
  const error = touched && !code.trim() ? 'Type the invite code first.' : denied && denied.reason !== 'missing' ? denied.message : null;
  return (
    <form
      className="ol-invite-form"
      data-testid="online-invite-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!code.trim()) return;
        session.submitInviteCode(code);
        setCode('');
        setTouched(false);
      }}
    >
      <div className="lb-field ol-code-field">
        <label htmlFor={inputId}>Invite code</label>
        <input
          id={inputId}
          name="invite-code"
          type="text"
          className="lb-input ol-code-input"
          data-testid="online-invite-input"
          placeholder="ABCD-EFGH"
          maxLength={40}
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellcheck={false}
          enterkeyhint="go"
          // Set as an attribute: as a property, browsers that know it read the string "off" as true.
          ref={(el) => el?.setAttribute('autocorrect', 'off')}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          aria-invalid={error ? 'true' : undefined}
          value={code}
          onInput={(e) => {
            setCode((e.target as HTMLInputElement).value);
            setTouched(false);
          }}
        />
        <span id={helpId} className="lb-muted">
          It is in the link your host sent, after “join=”. Capitals and the dash do not matter.
        </span>
      </div>
      <p id={errorId} className="ol-notice" role="alert" data-testid="online-invite-error" hidden={!error}>
        {error}
      </p>
      <button type="submit" className="tt-cta is-ready" data-testid="online-invite-submit">
        Join the game
      </button>
    </form>
  );
}

function NameField({
  session,
  onCommit,
  inline = false,
}: {
  session: OnlineSession;
  onCommit?: (name: string) => void;
  /** One line: label and field side by side (used to save height in the host lobby). */
  inline?: boolean;
}) {
  return (
    <label className={`lb-field ol-name${inline ? ' is-inline' : ''}`}>
      <span>Your name</span>
      <input
        type="text"
        className="lb-input"
        data-testid="online-name-input"
        placeholder="Type your name"
        maxLength={20}
        value={session.name}
        onInput={(e) => session.setName((e.target as HTMLInputElement).value)}
        onChange={(e) => onCommit?.((e.target as HTMLInputElement).value.trim())}
      />
    </label>
  );
}

type SeatChoice = 'host' | 'friend' | 'bot';

function HostSeatRow({
  pid,
  config,
  info,
  me,
  onConfigure,
}: {
  pid: PlayerId;
  config: OnlineLobbyConfig;
  info: SeatInfo | undefined;
  me: PlayerId | null;
  onConfigure: (next: OnlineLobbyConfig) => void;
}) {
  const seat = config.seats[pid];
  const isHostSeat = pid === config.hostPlayerId;
  const choice: SeatChoice = isHostSeat ? 'host' : seat.controller === 'bot' ? 'bot' : 'friend';
  const patchSeat = (patch: Partial<OnlineSeatConfig>, extra: Partial<OnlineLobbyConfig> = {}) =>
    onConfigure({ ...config, ...extra, seats: { ...config.seats, [pid]: { ...seat, ...patch } } });
  const choose = (next: SeatChoice) => {
    if (next === choice) return;
    if (next === 'host') patchSeat({ controller: 'human' }, { hostPlayerId: pid });
    else patchSeat({ controller: next === 'bot' ? 'bot' : 'human' });
  };

  return (
    <div
      className="lb-seat ol-seat"
      data-testid={`online-seat-${pid}`}
      data-role={choice}
      data-claimed={info?.claimed ? 'true' : 'false'}
      style={{ ['--player' as string]: PLAYER_THEMES[pid].fill }}
    >
      <PlayerBadge playerId={pid} size={26} />
      {choice === 'bot' ? (
        <input
          type="text"
          className="lb-input"
          aria-label="Bot name"
          maxLength={16}
          value={seat.name}
          onChange={(e) => patchSeat({ name: (e.target as HTMLInputElement).value })}
        />
      ) : (
        <span className="ol-seat-name">
          <strong>{info?.claimed ? info.name : 'Open seat'}</strong>
          <span className="lb-muted" data-testid={`online-seat-${pid}-status`}>
            {isHostSeat ? (pid === me ? 'You' : 'Host') : presence(info)}
          </span>
        </span>
      )}
      <div className="lb-segment" role="group" aria-label="Who sits here">
        {(['host', 'friend', 'bot'] as const).map((c) => (
          <button
            key={c}
            type="button"
            data-testid={`online-seat-${pid}-${c}`}
            data-selected={choice === c ? 'true' : 'false'}
            // The host seat changes by picking Host on another seat
            disabled={isHostSeat && c !== 'host'}
            onClick={() => choose(c)}
          >
            {c === 'host' ? 'Host' : c === 'friend' ? 'Friend' : 'Bot'}
          </button>
        ))}
      </div>
      {choice === 'bot' ? (
        <div className="lb-bot">
          <select
            className="lb-input"
            data-testid={`online-seat-${pid}-strategy`}
            aria-label="Bot style"
            value={seat.botStrategy}
            onChange={(e) => patchSeat({ botStrategy: (e.target as HTMLSelectElement).value as OnlineSeatConfig['botStrategy'] })}
          >
            {STRATEGY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="lb-input"
            data-testid={`online-seat-${pid}-difficulty`}
            aria-label="Bot difficulty"
            value={seat.botDifficulty}
            onChange={(e) =>
              patchSeat({ botDifficulty: (e.target as HTMLSelectElement).value as OnlineSeatConfig['botDifficulty'] })
            }
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      ) : (
        <span className="lb-bot lb-muted">
          {isHostSeat ? 'Plays on this PC' : info?.claimed ? 'Plays on their own laptop' : 'A friend takes it'}
        </span>
      )}
    </div>
  );
}

function HostLobby({ session }: { session: OnlineSession }) {
  const lobby = session.lobby!;
  const config = lobby.config;
  const seatIds = activeSeatIds(config);
  const infoFor = (pid: PlayerId) => lobby.seats.find((s) => s.playerId === pid);
  const openFriendSeats = lobby.seats.filter((s) => s.role === 'friend' && !s.claimed).length;
  const fixedAllowed = config.setupMode === 'first';
  const configure = (next: OnlineLobbyConfig) => session.send({ type: 'configure', config: next });
  const setPlayerCount = (playerCount: 3 | 4) => {
    if (playerCount === config.playerCount) return;
    const next: OnlineLobbyConfig = { ...config, playerCount };
    // Blue sits out of a 3-player game; the host moves to orange
    if (playerCount === 3 && config.hostPlayerId === 'blue') {
      next.hostPlayerId = 'orange';
      next.seats = { ...config.seats, orange: { ...config.seats.orange, controller: 'human' } };
    }
    configure(next);
  };

  return (
    <>
      <div className="lb-head">
        <div>
          <h2 id="online-lobby-title">Host a game</h2>
          <p>Choose who sits where, invite your friends, then start.</p>
        </div>
        <ConnectionBadge status={session.status} />
      </div>

      <InvitePanel share={session.share} lanUrls={session.info.lanUrls} />

      <div className="lb-section">
        <div className="lb-section-head ol-seats-head">
          <h3>Seats</h3>
          <NameField
            session={session}
            inline
            onCommit={(name) => session.playerId && name && session.send({ type: 'claimSeat', playerId: session.playerId, name })}
          />
          <div className="lb-segment" role="group" aria-label="Number of players">
            {([3, 4] as const).map((cnt) => (
              <button
                key={cnt}
                type="button"
                data-testid={`online-player-count-${cnt}`}
                data-selected={config.playerCount === cnt ? 'true' : 'false'}
                onClick={() => setPlayerCount(cnt)}
              >
                {cnt} players
              </button>
            ))}
          </div>
        </div>
        <div className="lb-seats">
          {seatIds.map((pid) => (
            <HostSeatRow key={pid} pid={pid} config={config} info={infoFor(pid)} me={session.playerId} onConfigure={configure} />
          ))}
        </div>
      </div>

      <div className="lb-columns">
        <div className="lb-section">
          <h3>Island</h3>
          <LobbyOption
            testId="online-setup-first"
            selected={config.setupMode === 'first'}
            title="Beginner layout"
            description="The recommended terrain and numbers from the rulebook."
            onSelect={() => configure({ ...config, setupMode: 'first' })}
          />
          <LobbyOption
            testId="online-setup-standard"
            selected={config.setupMode === 'standard'}
            title="Random island"
            description="Shuffled terrain, numbers laid along the spiral."
            onSelect={() => configure({ ...config, setupMode: 'standard', placement: 'draft' })}
          />
        </div>
        <div className="lb-section">
          <h3>Starting pieces</h3>
          <LobbyOption
            testId="online-placement-draft"
            selected={config.placement === 'draft'}
            title="Players place them"
            badge="Recommended"
            description="Roll for order, place a town each, then a city each in reverse."
            onSelect={() => configure({ ...config, placement: 'draft' })}
          />
          <LobbyOption
            testId="online-placement-fixed"
            selected={config.placement === 'fixed'}
            disabled={!fixedAllowed}
            title="Beginner positions"
            description={
              fixedAllowed ? 'Start with the town and city shown in the rulebook.' : 'Only available on the beginner layout.'
            }
            onSelect={() => configure({ ...config, placement: 'fixed' })}
          />
        </div>
      </div>

      <div className="ol-start-row">
        <div className="lb-field">
          <span>Bot speed</span>
          <div className="lb-segment" role="group" aria-label="Bot speed">
            {(['normal', 'fast', 'instant'] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                data-testid={`online-bot-speed-${spd}`}
                data-selected={config.botSpeed === spd ? 'true' : 'false'}
                onClick={() => configure({ ...config, botSpeed: spd })}
              >
                {spd === 'normal' ? 'Relaxed' : spd === 'fast' ? 'Fast' : 'Instant'}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={`tt-cta${openFriendSeats === 0 ? ' is-ready' : ''}`}
          data-testid="online-start-btn"
          disabled={openFriendSeats > 0 || session.status !== 'connected'}
          onClick={() => session.send({ type: 'start' })}
        >
          {openFriendSeats > 0
            ? `Waiting for ${openFriendSeats} friend${openFriendSeats > 1 ? 's' : ''} to take a seat`
            : 'Start game'}
        </button>
      </div>
    </>
  );
}

/** Seats a friend can take; used in the lobby and mid-game for anyone without a seat. */
export function SeatPicker({ session, midGame = false }: { session: OnlineSession; midGame?: boolean }) {
  const lobby = session.lobby!;
  const config = lobby.config;
  const me = session.playerId;
  const name = session.name.trim();
  return (
    <div className="lb-seats" data-testid="online-seat-picker">
      {activeSeatIds(config).map((pid) => {
        const info = lobby.seats.find((s) => s.playerId === pid);
        const seat = config.seats[pid];
        const open = info?.role === 'friend' && !info.claimed;
        const mine = pid === me;
        // A friend who is offline may have changed device, or may not come back
        const away = info?.role === 'friend' && info.claimed && !info.connected && !mine;
        return (
          <div
            key={pid}
            className="lb-seat ol-seat ol-seat-pick"
            data-testid={`online-seat-${pid}`}
            data-claimed={info?.claimed ? 'true' : 'false'}
            data-mine={mine ? 'true' : 'false'}
            style={{ ['--player' as string]: PLAYER_THEMES[pid].fill }}
          >
            <PlayerBadge playerId={pid} size={26} />
            <span className="ol-seat-name">
              <strong>{open ? 'Open seat' : (info?.name ?? seat.name)}</strong>
              <span className="lb-muted">
                {seatRoleLabel(info, seat, me)}
                {info?.role !== 'bot' && info?.claimed && !mine ? ` · ${presence(info)}` : ''}
              </span>
            </span>
            <span className="lb-bot">
              {mine && !midGame && (
                <button
                  type="button"
                  className="tt-icon-btn"
                  data-testid="online-leave-seat"
                  onClick={() => session.send({ type: 'leaveSeat' })}
                >
                  Leave seat
                </button>
              )}
              {open && !mine && !(midGame && me) && (
                <button
                  type="button"
                  className="tt-icon-btn is-primary"
                  data-testid={`online-claim-${pid}`}
                  disabled={!name || session.status !== 'connected'}
                  title={name ? 'Sit here' : 'Type your name first'}
                  onClick={() => session.send({ type: 'claimSeat', playerId: pid, name })}
                >
                  {me ? 'Move here' : 'Take this seat'}
                </button>
              )}
              {away && !(midGame && me) && (
                <button
                  type="button"
                  className="tt-icon-btn"
                  data-testid={`online-takeover-${pid}`}
                  disabled={!name || session.status !== 'connected'}
                  title={
                    name
                      ? `${info.name} is offline. Take over this seat if this is you on another device, or if they cannot come back.`
                      : 'Type your name first'
                  }
                  onClick={() => {
                    const question = `Take over ${info.name}’s seat? Do this if ${info.name} is you on another device, or cannot come back.`;
                    if (window.confirm(question)) session.send({ type: 'claimSeat', playerId: pid, name });
                  }}
                >
                  Take over
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FriendLobby({ session }: { session: OnlineSession }) {
  const lobby = session.lobby!;
  const hostSeat = lobby.seats.find((s) => s.role === 'host');
  const mySeat = lobby.seats.find((s) => s.playerId === session.playerId);
  const openSeats = lobby.seats.filter((s) => s.role === 'friend' && !s.claimed).length;
  return (
    <>
      <div className="lb-head">
        <div>
          <h2 id="online-lobby-title">Join the game</h2>
          <p>
            {hostSeat?.claimed ? `${hostSeat.name} is hosting.` : 'The host is setting up.'} Type your name and pick a seat.
          </p>
        </div>
        <ConnectionBadge status={session.status} />
      </div>
      <NameField
        session={session}
        onCommit={(name) => session.playerId && name && session.send({ type: 'claimSeat', playerId: session.playerId, name })}
      />
      <div className="lb-section">
        <h3>Seats</h3>
        <SeatPicker session={session} />
      </div>
      {mySeat ? (
        <p className="ol-waiting" data-testid="online-waiting" role="status">
          <PlayerBadge playerId={mySeat.playerId} size={20} />
          You have a seat. Waiting for the host to start the game…
        </p>
      ) : (
        <p className="lb-muted" role="status">
          {openSeats > 0
            ? session.name.trim()
              ? 'Pick an open seat.'
              : 'Type your name, then pick an open seat.'
            : 'All seats are taken. Ask the host to make one a Friend seat.'}
        </p>
      )}
    </>
  );
}

export function OnlineLobby({ session }: { session: OnlineSession }) {
  const notice = useNoticeText(session);
  return (
    <OnlinePage>
      <div
        className="lb-sheet ol-sheet"
        data-testid={session.isHost ? 'online-host-lobby' : 'online-friend-lobby'}
        role="dialog"
        aria-labelledby="online-lobby-title"
      >
        {session.isHost ? <HostLobby session={session} /> : <FriendLobby session={session} />}
        {notice && (
          <p className="ol-notice" role="alert" data-testid="online-notice" data-kind={session.notice?.kind}>
            {notice}
          </p>
        )}
      </div>
    </OnlinePage>
  );
}
