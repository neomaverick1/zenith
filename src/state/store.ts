// What the game remembers on the device: settings, the game in progress for each mode, records and achievements.
import { useSyncExternalStore } from 'react';

import type { Game, Mode } from '../game/engine';

export type Quality = 'high' | 'balanced' | 'saver';
export interface Settings {
  music: number; // 0 to 1
  sfx: number;
  haptics: boolean;
  quality: Quality;
  reduceMotion: boolean;
  size: 3 | 4 | 5 | 6;
  undo: boolean;
  speed: 'normal' | 'fast';
  colorblind: boolean;
  names: boolean; // show each star's name on the tile
  tutorialDone: boolean;
}

export interface Stats {
  games: number;
  wins: number;
  bestScore: Record<string, number>; // "classic-4" -> score
  bestTile: number;
  merges: number;
  moves: number;
  playMs: number;
  bestCombo: number;
  dailyBest: Record<string, number>; // date -> best score that day
  achievements: Record<string, number>; // id -> when it was earned
}

export interface Saved {
  games: Partial<Record<Mode, Game>>;
}

const KEY = 'zenith-v1';
const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Settings = {
  music: 0.7,
  sfx: 0.85,
  haptics: true,
  quality: 'high',
  reduceMotion: prefersReduced,
  size: 4,
  undo: true,
  speed: 'normal',
  colorblind: false,
  names: false,
  tutorialDone: false,
};
const EMPTY_STATS: Stats = {
  games: 0,
  wins: 0,
  bestScore: {},
  bestTile: 0,
  merges: 0,
  moves: 0,
  playMs: 0,
  bestCombo: 0,
  dailyBest: {},
  achievements: {},
};

interface State {
  settings: Settings;
  stats: Stats;
  saved: Saved;
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw, (_k, v) => (v === '__inf__' ? Infinity : v)) as State;
      return { settings: { ...DEFAULT_SETTINGS, ...s.settings }, stats: { ...EMPTY_STATS, ...s.stats }, saved: s.saved ?? { games: {} } };
    }
  } catch {
    /* storage blocked or broken: start fresh */
  }
  return { settings: DEFAULT_SETTINGS, stats: EMPTY_STATS, saved: { games: {} } };
}

let state = load();
const listeners = new Set<() => void>();
let saveTimer = 0;

function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify(state, (_k, v) => (v === Infinity ? '__inf__' : v)),
      );
    } catch {
      /* storage full or blocked: keep playing from memory */
    }
  }, 150);
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

export const getState = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useSettings = () => useSyncExternalStore(subscribe, () => state.settings);
export const useStats = () => useSyncExternalStore(subscribe, () => state.stats);

export const setSettings = (patch: Partial<Settings>) => set({ settings: { ...state.settings, ...patch } });
export const setStats = (fn: (s: Stats) => Stats) => set({ stats: fn(state.stats) });
export const resetStats = () => set({ stats: EMPTY_STATS });

/** Saves the game in progress, without the move history the screen doesn't need after a restart. */
export function saveGame(g: Game | null, mode: Mode) {
  const games = { ...state.saved.games };
  if (!g || g.over) delete games[mode];
  else games[mode] = { ...g, ghosts: [], tiles: g.tiles.map(({ id, value, r, c }) => ({ id, value, r, c })) };
  set({ saved: { games } });
}
export const savedGame = (mode: Mode) => state.saved.games[mode] ?? null;

export const flush = () => {
  window.clearTimeout(saveTimer);
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(state, (_k, v) => (v === Infinity ? '__inf__' : v)),
    );
  } catch {
    /* ignore */
  }
};

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
