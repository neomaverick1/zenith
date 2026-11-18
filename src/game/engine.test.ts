import { describe, expect, it } from 'vitest';

import { bestMove } from './autoplay';
import { canMove, canUndo, dailyGame, move, newGame, toGrid, undo, type Game, type Tile } from './engine';

/** A game laid out from rows of numbers (0 = empty). */
function board(rows: number[][], extra: Partial<Game> = {}): Game {
  const g = newGame({ mode: 'classic', n: rows.length, seed: 7 });
  const tiles: Tile[] = [];
  let id = 1;
  rows.forEach((row, r) => row.forEach((v, c) => v && tiles.push({ id: id++, value: v, r, c })));
  return { ...g, tiles, nextId: id, best: Math.max(...tiles.map((t) => t.value)), ...extra };
}
const values = (g: Game) => toGrid(g);

describe('moves', () => {
  it('slides stars to the edge', () => {
    const r = move(
      board([
        [0, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    );
    expect(r.moved).toBe(true);
    expect(values(r.game)[0][0]).toBe(2);
  });
  it('merges two equal stars once, nearest the edge first', () => {
    const r = move(
      board([
        [2, 2, 2, 0],
        [4, 4, 4, 4],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    );
    const g = values(r.game);
    expect(g[0].slice(0, 2)).toEqual([4, 2]);
    expect(g[1].slice(0, 2)).toEqual([8, 8]);
    expect(r.gained).toBe(4 + 8 + 8);
    expect(r.merged.map((m) => m.value)).toEqual([4, 8, 8]);
  });
  it('a star made by a merge does not merge again in the same move', () => {
    const g = values(
      move(
        board([
          [4, 2, 2, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        'left',
      ).game,
    );
    expect(g[0].slice(0, 2)).toEqual([4, 4]);
  });
  it('works in every direction', () => {
    const start = board([
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 2],
    ]);
    expect(values(move(start, 'right').game)[0][3]).toBe(4);
    expect(values(move(start, 'down').game)[3][0]).toBe(4);
    expect(values(move(start, 'up').game)[0][3]).toBe(4);
  });
  it('a move that changes nothing is not a move', () => {
    const r = move(
      board([
        [2, 4, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    );
    expect(r.moved).toBe(false);
    expect(r.game.moves).toBe(0);
  });
  it('adds one new star after every real move', () => {
    const r = move(
      board([
        [0, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    );
    expect(r.game.tiles.length).toBe(2);
    expect(r.spawned && [2, 4].includes(r.spawned.value)).toBe(true);
  });
  it('keeps the merged stars as ghosts so the screen can slide them together', () => {
    const r = move(
      board([
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    );
    expect(r.game.ghosts.map((t) => [t.r, t.c])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(r.game.tiles.find((t) => t.merged)?.value).toBe(4);
  });
});

describe('the end of the game', () => {
  it('knows when no move is left', () => {
    expect(
      canMove(
        board([
          [2, 4],
          [4, 2],
        ]),
      ),
    ).toBe(false);
    expect(
      canMove(
        board([
          [2, 2],
          [4, 8],
        ]),
      ),
    ).toBe(true);
  });
  it('wins on reaching the target, once', () => {
    const r = move(
      board([
        [1024, 1024, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    );
    expect(r.justWon).toBe(true);
    expect(r.game.won).toBe(true);
    expect(r.newBest).toBe(true);
  });
  it('uses smaller targets on small boards and bigger ones on big boards', () => {
    expect(newGame({ mode: 'classic', n: 3 }).target).toBe(256);
    expect(newGame({ mode: 'classic', n: 4 }).target).toBe(2048);
    expect(newGame({ mode: 'classic', n: 6 }).target).toBe(8192);
  });
});

describe('undo', () => {
  it('goes back exactly one move and counts down', () => {
    const start = board(
      [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      { undoLeft: 3 },
    );
    const after = move(start, 'left').game;
    const back = undo(after);
    expect(values(back)).toEqual(values(start));
    expect(back.score).toBe(0);
    expect(back.undoLeft).toBe(2);
    expect(back.usedUndo).toBe(true);
  });
  it('can’t undo with none left or before the first move', () => {
    expect(canUndo(newGame({ mode: 'classic', n: 4 }))).toBe(false);
    const g = {
      ...move(
        board([
          [2, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        'left',
      ).game,
      undoLeft: 0,
    };
    expect(canUndo(g)).toBe(false);
  });
  it('zen mode never runs out', () => {
    expect(newGame({ mode: 'zen', n: 4 }).undoLeft).toBe(Infinity);
  });
});

describe('daily challenge', () => {
  it('is the same board for everyone on a day, and different the next day', () => {
    const a = dailyGame('2026-11-17');
    const b = dailyGame('2026-11-17');
    expect(values(a)).toEqual(values(b));
    const replay = (g: Game) => {
      for (const d of ['left', 'down', 'right', 'down', 'left'] as const) g = move(g, d).game;
      return values(g);
    };
    expect(replay(a)).toEqual(replay(b));
    const other = [...Array(10).keys()].some((i) => JSON.stringify(values(dailyGame(`2026-12-${10 + i}`))) !== JSON.stringify(values(a)));
    expect(other).toBe(true);
  });
});

describe('the title screen’s demo player', () => {
  it('plays a full game without getting stuck, and does far better than random', () => {
    let g = newGame({ mode: 'classic', n: 4, seed: 42 });
    for (let i = 0; i < 3000 && !g.over; i++) {
      const d = bestMove(g);
      if (!d) break;
      g = move(g, d).game;
    }
    expect(g.best).toBeGreaterThanOrEqual(256);
  });
});
