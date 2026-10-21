/**
 * CATAN: New Energies — Seeded PRNG (mulberry32)
 *
 * Deterministic 32-bit PRNG supporting serialization and exact replay.
 */

import { PRNGState } from './types';

export class Mulberry32PRNG {
  private state: number;
  private calls: number;

  constructor(initialSeed: number, calls: number = 0) {
    this.state = initialSeed >>> 0;
    this.calls = calls;
  }

  public static fromState(state: PRNGState): Mulberry32PRNG {
    return new Mulberry32PRNG(state.seed, state.calls);
  }

  private step(): number {
    this.calls++;
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public next(): number {
    return this.step();
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.step() * (max - min + 1)) + min;
  }

  public rollDice(): [number, number] {
    return [this.nextInt(1, 6), this.nextInt(1, 6)];
  }

  public shuffle<T>(array: readonly T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = temp;
    }
    return copy;
  }

  public pickRandom<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pickRandom from empty array');
    }
    const idx = this.nextInt(0, array.length - 1);
    return array[idx]!;
  }

  public getState(): PRNGState {
    return { seed: this.state, calls: this.calls };
  }
}
