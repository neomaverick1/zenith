// The game itself, with no screen attached: a square board of stars, a move in one of four directions, merges,
// a new star after every move, undo, and the end of the game. Every function returns a new game and never changes
// the one it was given, so undo is just "go back to the last one" and the screen can animate from old to new.

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Mode = 'classic' | 'daily' | 'zen';

export interface Tile {
  id: number;
  value: number;
  r: number;
  c: number;
  /** This tile was made by a merge on the last move (the screen pops it). */
  merged?: boolean;
  /** This tile appeared after the last move (the screen grows it in). */
  spawned?: boolean;
  /** This tile came back with an undo (the screen fades it in). */
  restored?: boolean;
}

interface Snapshot {
  tiles: Tile[];
  score: number;
  rng: number;
  moves: number;
}

export interface Game {
  mode: Mode;
  n: number;
  /** The star that counts as a win on this board size (2048 on 4×4). */
  target: number;
  tiles: Tile[];
  /** Tiles that merged on the last move: drawn sliding into their partner, then gone. */
  ghosts: Tile[];
  score: number;
  moves: number;
  merges: number;
  best: number; // highest tile on the board this game
  won: boolean; // reached the target at least once
  keepGoing: boolean; // chose to play on after the target
  over: boolean;
  rng: number; // seeded random state, so a daily board is the same for everyone
  nextId: number;
  history: Snapshot[];
  undoLeft: number; // Infinity in zen
  usedUndo: boolean;
  seed: number;
  day?: string; // the daily challenge's date, YYYY-MM-DD
  startedAt: number;
}

export interface MoveResult {
  game: Game;
  moved: boolean;
  /** Merges on this move, biggest last: value made, where, and how many stars it took. */
  merged: { value: number; r: number; c: number }[];
  gained: number;
  spawned?: Tile;
  newBest: boolean; // a new highest tile this game
  justWon: boolean;
  justOver: boolean;
}

export const TARGETS: Record<number, number> = { 3: 256, 4: 2048, 5: 4096, 6: 8192 };
export const UNDOS: Record<Mode, number> = { classic: 3, daily: 1, zen: Infinity };
const HISTORY = 40;

// mulberry32: small, fast and the same on every device, so a seed gives the same board everywhere
export function rand(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function spawn(g: Game): Game {
  const free: [number, number][] = [];
  for (let r = 0; r < g.n; r++) for (let c = 0; c < g.n; c++) if (!g.tiles.some((t) => t.r === r && t.c === c)) free.push([r, c]);
  if (!free.length) return g;
  const [a, s1] = rand(g.rng);
  const [b, s2] = rand(s1);
  const [r, c] = free[Math.floor(a * free.length)];
  const tile: Tile = { id: g.nextId, value: b < 0.9 ? 2 : 4, r, c, spawned: true };
  return { ...g, tiles: [...g.tiles, tile], rng: s2, nextId: g.nextId + 1 };
}

export function newGame(opts: { mode: Mode; n: number; seed?: number; day?: string; undo?: boolean }): Game {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  let g: Game = {
    mode: opts.mode,
    n: opts.n,
    target: TARGETS[opts.n] ?? 2048,
    tiles: [],
    ghosts: [],
    score: 0,
    moves: 0,
    merges: 0,
    best: 0,
    won: false,
    keepGoing: false,
    over: false,
    rng: seed,
    nextId: 1,
    history: [],
    undoLeft: opts.undo === false && opts.mode !== 'zen' ? 0 : UNDOS[opts.mode],
    usedUndo: false,
    seed,
    day: opts.day,
    startedAt: Date.now(),
  };
  g = spawn(spawn(g));
  return { ...g, best: Math.max(...g.tiles.map((t) => t.value)) };
}

export const tileAt = (g: Pick<Game, 'tiles'>, r: number, c: number) => g.tiles.find((t) => t.r === r && t.c === c);

const VECTORS: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

export function canMove(g: Pick<Game, 'tiles' | 'n'>): boolean {
  if (g.tiles.length < g.n * g.n) return true;
  const grid = toGrid(g);
  for (let r = 0; r < g.n; r++)
    for (let c = 0; c < g.n; c++) {
      const v = grid[r][c];
      if ((c + 1 < g.n && grid[r][c + 1] === v) || (r + 1 < g.n && grid[r + 1][c] === v)) return true;
    }
  return false;
}

export function toGrid(g: Pick<Game, 'tiles' | 'n'>): number[][] {
  const grid = Array.from({ length: g.n }, () => Array<number>(g.n).fill(0));
  for (const t of g.tiles) grid[t.r][t.c] = t.value;
  return grid;
}

/** Plays one move. When nothing can move that way, the same game comes back with moved: false. */
export function move(g: Game, dir: Dir): MoveResult {
  const none: MoveResult = { game: g, moved: false, merged: [], gained: 0, newBest: false, justWon: false, justOver: false };
  if (g.over) return none;
  const [dr, dc] = VECTORS[dir];
  const n = g.n;
  // walk each line starting from the edge the stars move toward
  const order = [...Array(n).keys()];
  const rows = dr === 1 ? [...order].reverse() : order;
  const cols = dc === 1 ? [...order].reverse() : order;
  const at = new Map<string, Tile>(g.tiles.map((t) => [`${t.r},${t.c}`, { ...t, merged: false, spawned: false, restored: false }]));
  const placed = new Map<string, Tile & { fresh?: boolean }>();
  const ghosts: Tile[] = [];
  const merged: MoveResult['merged'] = [];
  let nextId = g.nextId;
  let gained = 0;
  let moved = false;

  for (const r0 of rows)
    for (const c0 of cols) {
      const t = at.get(`${r0},${c0}`);
      if (!t) continue;
      let r = r0;
      let c = c0;
      // slide to the farthest free cell
      while (r + dr >= 0 && r + dr < n && c + dc >= 0 && c + dc < n && !placed.has(`${r + dr},${c + dc}`)) {
        r += dr;
        c += dc;
      }
      const ahead = placed.get(`${r + dr},${c + dc}`);
      if (ahead && !ahead.fresh && ahead.value === t.value) {
        // merge into the star ahead: both slide there and a new, bigger star takes their place
        const value = t.value * 2;
        const made: Tile & { fresh?: boolean } = { id: nextId++, value, r: ahead.r, c: ahead.c, merged: true, fresh: true };
        ghosts.push({ ...ahead }, { ...t, r: ahead.r, c: ahead.c });
        placed.set(`${ahead.r},${ahead.c}`, made);
        merged.push({ value, r: ahead.r, c: ahead.c });
        gained += value;
        moved = true;
      } else {
        if (r !== r0 || c !== c0) moved = true;
        placed.set(`${r},${c}`, { ...t, r, c });
      }
    }

  if (!moved) return none;
  const tiles = [...placed.values()].map(({ fresh: _fresh, ...t }) => t);
  const snapshot: Snapshot = {
    tiles: g.tiles.map(({ id, value, r, c }) => ({ id, value, r, c })),
    score: g.score,
    rng: g.rng,
    moves: g.moves,
  };
  let next: Game = {
    ...g,
    tiles,
    ghosts,
    nextId,
    score: g.score + gained,
    moves: g.moves + 1,
    merges: g.merges + merged.length,
    history: [...g.history, snapshot].slice(-HISTORY),
  };
  next = spawn(next);
  const spawned = next.tiles.find((t) => t.spawned);
  const top = Math.max(...next.tiles.map((t) => t.value));
  const justWon = !g.won && top >= g.target;
  const over = !canMove(next);
  next = { ...next, best: Math.max(g.best, top), won: g.won || justWon, over };
  merged.sort((a, b) => a.value - b.value);
  return { game: next, moved: true, merged, gained, spawned, newBest: top > g.best, justWon, justOver: over };
}

export function canUndo(g: Game) {
  return g.history.length > 0 && g.undoLeft > 0;
}

/** Goes back one move. The stars that come back fade in where they were. */
export function undo(g: Game): Game {
  if (!canUndo(g)) return g;
  const last = g.history[g.history.length - 1];
  const now = new Set(g.tiles.map((t) => t.id));
  return {
    ...g,
    tiles: last.tiles.map((t) => ({ ...t, restored: !now.has(t.id) })),
    ghosts: [],
    score: last.score,
    rng: last.rng,
    moves: last.moves,
    over: false,
    history: g.history.slice(0, -1),
    undoLeft: g.undoLeft - 1,
    usedUndo: true,
  };
}

export const keepGoing = (g: Game): Game => ({ ...g, keepGoing: true });

/** The day's challenge: the same opening board and the same new stars for everyone on that date. */
export function dailyGame(day: string): Game {
  return newGame({ mode: 'daily', n: 4, seed: seedFrom(`zenith-${day}`), day });
}

export const maxTile = (g: Pick<Game, 'tiles'>) => g.tiles.reduce((m, t) => Math.max(m, t.value), 0);
export const log2 = (v: number) => Math.round(Math.log2(Math.max(1, v)));
