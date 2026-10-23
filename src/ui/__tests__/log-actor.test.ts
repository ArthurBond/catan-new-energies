import { describe, expect, it } from 'vitest';
import { logActor } from '../gameView';

const four = [
  { pid: 'orange', name: 'Orange' },
  { pid: 'purple', name: 'Purple' },
  { pid: 'pink', name: 'Pink' },
  { pid: 'blue', name: 'Blue' },
];

describe('activity feed colours', () => {
  it('uses the player who acted, not the first seat named anywhere in the line', () => {
    // The seat order is rotated after the roll-off, so "first match" used to pick the wrong colour
    const rotated = [four[3]!, four[0]!, four[1]!, four[2]!];
    expect(logActor('Blue rolled 6 (5 + 1). Orange rolled highest (9) and goes first!', rotated)?.pid).toBe('blue');
    expect(logActor('Pink built a Renewable Power Plant (-1 LF).', rotated)?.pid).toBe('pink');
    expect(logActor('Pink rolled 9 (5 + 4) for setup turn order.', four)?.pid).toBe('pink');
  });

  it('gives every seat its own colour in 3 and 4 player games', () => {
    for (const p of four) expect(logActor(`${p.name} ended their turn.`, four)?.pid).toBe(p.pid);
    const three = four.slice(0, 3);
    for (const p of three) expect(logActor(`${p.name} drew an event disc.`, three)?.pid).toBe(p.pid);
  });

  it('handles nobody named, and overlapping names', () => {
    expect(logActor('Showcase scenario loaded.', four)).toBeUndefined();
    const names = [{ name: 'Ann' }, { name: 'Anna' }];
    expect(logActor('Anna built a road.', names)?.name).toBe('Anna');
  });
});
