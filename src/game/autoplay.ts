// A small player for the title screen's demo board: it looks one move ahead and keeps its biggest star in a
// corner, which is how good human players play too. Not unbeatable, just good enough to look like someone who
// knows the game.
import { move, toGrid, type Dir, type Game } from './engine';

const DIRS: Dir[] = ['down', 'left', 'right', 'up'];

function score(g: Game): number {
  const grid = toGrid(g);
  const n = g.n;
  let empty = 0;
  let smooth = 0;
  let mono = 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const v = grid[r][c];
      if (!v) {
        empty++;
        continue;
      }
      const l = Math.log2(v);
      if (c + 1 < n && grid[r][c + 1]) smooth -= Math.abs(l - Math.log2(grid[r][c + 1]));
      if (r + 1 < n && grid[r + 1][c]) smooth -= Math.abs(l - Math.log2(grid[r + 1][c]));
      // reward rows that rise toward the bottom-left corner
      if (c + 1 < n && grid[r][c + 1] <= v) mono += l;
      if (r > 0 && grid[r - 1][c] <= v) mono += l;
    }
  const corner = grid[n - 1][0] === Math.max(...grid.flat()) ? 40 : 0;
  return empty * 12 + smooth * 1.5 + mono * 0.8 + corner;
}

export function bestMove(g: Game): Dir | null {
  let best: Dir | null = null;
  let top = -Infinity;
  for (const d of DIRS) {
    const r = move(g, d);
    if (!r.moved) continue;
    const s = score(r.game) + r.gained * 0.05 - (d === 'up' ? 30 : 0);
    if (s > top) {
      top = s;
      best = d;
    }
  }
  return best;
}
