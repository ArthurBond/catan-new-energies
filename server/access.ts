/**
 * The invite code: who may sit down at a game that is reachable from outside the home network.
 *
 * A game shared with a public link (`--share online`) is reachable by anyone who learns the
 * address, so the lobby only opens for browsers that present the code. The code travels in the
 * link the host sends (`?join=ABCD-EFGH`) or is typed in. The host never needs it: the host key
 * outranks it.
 *
 * Guessing is made pointless rather than merely slow: 31^8 (about 850 billion) codes, and an
 * address that sends too many wrong ones is refused for a while, right or wrong.
 */

import { randomInt, timingSafeEqual } from 'node:crypto';
import { normalizeInviteCode } from '@/network/server-protocol';

/** No 0/O, 1/I/L: the code survives being read out over the phone. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 8;

export function generateInviteCode(random: (max: number) => number = randomInt): string {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i++) code += INVITE_ALPHABET[random(INVITE_ALPHABET.length)];
  return code;
}

/** A code this server would hand out or accept from the host (`INVITE_CODE`, the saved file). */
export function isUsableInviteCode(code: string): boolean {
  return /^[A-Z0-9]{6,32}$/.test(code);
}

export type InviteVerdict = 'ok' | 'missing' | 'wrong' | 'locked';

export interface InviteGateOptions {
  code: string;
  /** Wrong codes one address may send inside `windowMs` before it is locked out. */
  maxFailures?: number;
  windowMs?: number;
  now?: () => number;
}

const DEFAULT_MAX_FAILURES = 8;
const DEFAULT_WINDOW_MS = 10 * 60_000;
/** Addresses remembered at once; the oldest are forgotten first. */
const MAX_TRACKED_ADDRESSES = 5000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export class InviteGate {
  readonly code: string;
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  /** Times of recent wrong codes, per address (insertion order = oldest first). */
  private readonly failures = new Map<string, number[]>();

  constructor(options: InviteGateOptions) {
    this.code = normalizeInviteCode(options.code);
    if (!isUsableInviteCode(this.code)) throw new Error('The invite code must be 6 to 32 letters and digits.');
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  /** Judges one hello. `remote` is the visitor's network address (see `clientAddress`). */
  check(candidate: unknown, remote: string): InviteVerdict {
    const sent = normalizeInviteCode(candidate);
    // Opening the bare address is not a guess: it just brings up the prompt.
    if (!sent) return 'missing';
    const recent = this.recentFailures(remote);
    if (recent.length >= this.maxFailures) return 'locked';
    if (safeEqual(sent, this.code)) return 'ok';
    recent.push(this.now());
    this.failures.delete(remote);
    this.failures.set(remote, recent);
    if (this.failures.size > MAX_TRACKED_ADDRESSES) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
    return 'wrong';
  }

  /** Seconds until `remote` may try again (0 when it is not locked out). */
  retryAfterSeconds(remote: string): number {
    const recent = this.recentFailures(remote);
    if (recent.length < this.maxFailures) return 0;
    // The lock lifts when enough old failures leave the window to drop below the limit.
    const releasing = recent[recent.length - this.maxFailures]!;
    return Math.max(1, Math.ceil((releasing + this.windowMs - this.now()) / 1000));
  }

  private recentFailures(remote: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.failures.get(remote) ?? []).filter((t) => t > cutoff);
    if (recent.length === 0) this.failures.delete(remote);
    else this.failures.set(remote, recent);
    return recent;
  }
}

export function deniedText(verdict: Exclude<InviteVerdict, 'ok'>, retryAfterSeconds: number): string {
  if (verdict === 'missing') return 'This game needs an invite code. Ask the host for the invite link or the code.';
  if (verdict === 'wrong') return 'That invite code is not right. Check it with the host and try again.';
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many wrong codes. Wait ${minutes} minute${minutes === 1 ? '' : 's'}, then try again.`;
}
