import { describe, expect, it } from 'vitest';
import { botStepDelayMs, type OnlineBotSpeed } from '../server-protocol';

describe('botStepDelayMs', () => {
  it('Relaxed ("normal") waits 1.4 s per step and 2 s during setup', () => {
    expect(botStepDelayMs('normal', false)).toBe(1400);
    expect(botStepDelayMs('normal', true)).toBe(2000);
  });

  it('Fast keeps the pace Relaxed used to have: 0.6 s per step and 0.95 s during setup', () => {
    expect(botStepDelayMs('fast', false)).toBe(600);
    expect(botStepDelayMs('fast', true)).toBe(950);
  });

  it('Instant is a token delay whether or not it is setup', () => {
    expect(botStepDelayMs('instant', false)).toBe(10);
    expect(botStepDelayMs('instant', true)).toBe(10);
  });

  it('Relaxed is at least twice as slow as the old Relaxed pace (600 ms / 950 ms)', () => {
    expect(botStepDelayMs('normal', false)).toBeGreaterThanOrEqual(2 * 600);
    expect(botStepDelayMs('normal', true)).toBeGreaterThanOrEqual(2 * 950);
  });

  it('always orders Relaxed > Fast > Instant, and setup is never faster than play', () => {
    for (const isSetup of [false, true]) {
      expect(botStepDelayMs('normal', isSetup)).toBeGreaterThan(botStepDelayMs('fast', isSetup));
      expect(botStepDelayMs('fast', isSetup)).toBeGreaterThan(botStepDelayMs('instant', isSetup));
    }
    for (const speed of ['normal', 'fast', 'instant'] as OnlineBotSpeed[]) {
      expect(botStepDelayMs(speed, true)).toBeGreaterThanOrEqual(botStepDelayMs(speed, false));
    }
  });
});
