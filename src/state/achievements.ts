// Twelve achievements, checked after every move and at the end of a game.
import type { Game } from '../game/engine';
import type { Stats } from './store';

export interface Achievement {
  id: string;
  name: string;
  how: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'First Light', how: 'Fuse your first two stars' },
  { id: 't128', name: 'Kindling', how: 'Make a Sun (128)' },
  { id: 't512', name: 'White Heat', how: 'Make a White Star (512)' },
  { id: 't1024', name: 'Blue Giant', how: 'Make a Blue Giant (1024)' },
  { id: 'nova', name: 'Supernova', how: 'Reach the goal of any board' },
  { id: 't4096', name: 'Neutron', how: 'Make a Neutron Star (4096)' },
  { id: 'chain3', name: 'Chain Reaction', how: 'Fuse three pairs in one move' },
  { id: 'chain4', name: 'Cascade', how: 'Fuse four or more pairs in one move' },
  { id: 'pure', name: 'No Regrets', how: 'Make a Blue Giant without undo' },
  { id: 'score20k', name: 'Big Bang', how: 'Score 20,000 in one game' },
  { id: 'daily3', name: 'Devotion', how: 'Play the daily challenge on three days' },
  { id: 'marathon', name: 'Long Night', how: 'Make 1,000 moves in one game' },
];

/** Which achievements this moment earns, given the game, the merges just made and the records so far. */
export function earned(g: Game, combo: number, stats: Stats): string[] {
  const have = stats.achievements;
  const out: string[] = [];
  const add = (id: string, ok: boolean) => ok && !have[id] && out.push(id);
  add('first', g.merges > 0);
  add('t128', g.best >= 128);
  add('t512', g.best >= 512);
  add('t1024', g.best >= 1024);
  add('nova', g.won);
  add('t4096', g.best >= 4096);
  add('chain3', combo >= 3);
  add('chain4', combo >= 4);
  add('pure', g.best >= 1024 && !g.usedUndo);
  add('score20k', g.score >= 20000);
  add('daily3', Object.keys(stats.dailyBest).length >= 3);
  add('marathon', g.moves >= 1000);
  return out;
}
