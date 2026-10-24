import { describe, expect, it } from 'vitest';
import { logActor, splitLogNames } from '../gameView';

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

describe('splitLogNames', () => {
  it('marks every player name so the feed can colour it', () => {
    const segs = splitLogNames('Air Pollution: Highest local footprint (Pink) placed a hazard token.', four);
    expect(segs.map((s) => s.text).join('')).toBe('Air Pollution: Highest local footprint (Pink) placed a hazard token.');
    expect(segs.filter((s) => s.player).map((s) => s.player!.pid)).toEqual(['pink']);
  });

  it('colours several names in one line and prefers the longer name', () => {
    const players = [
      { pid: 'orange', name: 'Ann' },
      { pid: 'blue', name: 'Anna' },
    ];
    const segs = splitLogNames('Anna and Ann tied', players);
    expect(segs.filter((s) => s.player).map((s) => [s.text, s.player!.pid])).toEqual([
      ['Anna', 'blue'],
      ['Ann', 'orange'],
    ]);
  });

  it('leaves a line with no names as plain text', () => {
    expect(splitLogNames('The Air Pollution track is full.', four)).toEqual([{ text: 'The Air Pollution track is full.' }]);
  });
});
