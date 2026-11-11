// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatInviteCode, inviteLink, normalizeInviteCode } from '@/network/server-protocol';
import { deniedText, generateInviteCode, INVITE_ALPHABET, INVITE_LENGTH, InviteGate, isUsableInviteCode } from '../access';

describe('invite codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_LENGTH);
      for (const ch of code) expect(INVITE_ALPHABET).toContain(ch);
      expect(isUsableInviteCode(code)).toBe(true);
      seen.add(code);
    }
    expect(seen.size).toBe(200);
    for (const confusing of ['0', 'O', '1', 'I', 'L']) expect(INVITE_ALPHABET).not.toContain(confusing);
  });

  it('compares what people type without case, spaces or dashes', () => {
    expect(normalizeInviteCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeInviteCode('ab cd ef gh')).toBe('ABCDEFGH');
    expect(normalizeInviteCode(undefined)).toBe('');
    expect(normalizeInviteCode(42)).toBe('');
    expect(formatInviteCode('abcdefgh')).toBe('ABCD-EFGH');
    expect(inviteLink('https://pc.tail1234.ts.net/', 'ABCDEFGH')).toBe('https://pc.tail1234.ts.net/?join=ABCD-EFGH');
    expect(inviteLink('http://192.168.1.5:3210', null)).toBe('http://192.168.1.5:3210');
  });

  it('refuses to run with a code that is too short to be safe', () => {
    expect(() => new InviteGate({ code: 'abc' })).toThrow(/6 to 32/);
  });
});

describe('InviteGate', () => {
  const gate = (now = () => 0) => new InviteGate({ code: 'ABCD-EFGH', maxFailures: 3, windowMs: 60_000, now });

  it('lets the right code in and tells missing from wrong', () => {
    const g = gate();
    expect(g.check('abcd efgh', '203.0.113.1')).toBe('ok');
    expect(g.check('ABCDEFGH', '203.0.113.1')).toBe('ok');
    expect(g.check(undefined, '203.0.113.1')).toBe('missing');
    expect(g.check('', '203.0.113.1')).toBe('missing');
    expect(g.check('ABCDEFGX', '203.0.113.1')).toBe('wrong');
    expect(g.check('ABCDEFG', '203.0.113.1')).toBe('wrong');
  });

  it('opening the address without a code never counts as a guess', () => {
    const g = gate();
    for (let i = 0; i < 50; i++) expect(g.check(null, '203.0.113.2')).toBe('missing');
    expect(g.check('ABCDEFGH', '203.0.113.2')).toBe('ok');
  });

  it('locks an address out after too many wrong codes, even for the right code, then lets it back in', () => {
    let t = 0;
    const g = gate(() => t);
    for (let i = 0; i < 3; i++) expect(g.check(`WRONG${i}AA`, '203.0.113.3')).toBe('wrong');
    expect(g.check('ABCDEFGH', '203.0.113.3')).toBe('locked');
    expect(g.retryAfterSeconds('203.0.113.3')).toBe(60);
    // Other visitors are not affected.
    expect(g.check('ABCDEFGH', '203.0.113.4')).toBe('ok');
    expect(g.retryAfterSeconds('203.0.113.4')).toBe(0);
    t = 59_000;
    expect(g.check('ABCDEFGH', '203.0.113.3')).toBe('locked');
    expect(g.retryAfterSeconds('203.0.113.3')).toBe(1);
    t = 60_001;
    expect(g.check('ABCDEFGH', '203.0.113.3')).toBe('ok');
  });

  it('being locked out does not extend the lock', () => {
    let t = 0;
    const g = gate(() => t);
    for (let i = 0; i < 3; i++) g.check('NOPE1234', 'a');
    t = 30_000;
    for (let i = 0; i < 20; i++) expect(g.check('NOPE1234', 'a')).toBe('locked');
    t = 60_001;
    expect(g.check('ABCDEFGH', 'a')).toBe('ok');
  });

  it('explains each refusal in plain words', () => {
    expect(deniedText('missing', 0)).toMatch(/needs an invite code/);
    expect(deniedText('wrong', 0)).toMatch(/not right/);
    expect(deniedText('locked', 61)).toMatch(/Wait 2 minutes/);
    expect(deniedText('locked', 5)).toMatch(/Wait 1 minute,/);
  });
});
