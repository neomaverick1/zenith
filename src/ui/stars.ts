// The stars: what each tile value is called and how it looks. The colors follow real stars, cooling dust and
// nebula at the start, then red, orange, yellow and white as they heat up, blue at the top, and beyond the goal
// the strange objects stars become.

export interface Star {
  name: string;
  /** Tile fill, top to bottom. */
  from: string;
  to: string;
  ink: string;
  glow: string; // '' for none
  /** For color-blind mode: a shape that tells values apart without color. */
  mark: string;
}

const S = (name: string, from: string, to: string, ink: string, glow: string, mark: string): Star => ({ name, from, to, ink, glow, mark });

export const STARS: Record<number, Star> = {
  2: S('Stardust', '#2c2f6e', '#232559', '#c9ccff', '', '·'),
  4: S('Nebula', '#41318c', '#33266f', '#ded6ff', '', '··'),
  8: S('Protostar', '#7d2b80', '#612066', '#ffd9f8', '', '△'),
  16: S('Red Dwarf', '#b8294d', '#931f3e', '#ffe2e8', 'rgba(220, 50, 90, 0.35)', '▲'),
  32: S('Ember', '#e04a38', '#bd352a', '#fff1ec', 'rgba(240, 90, 60, 0.4)', '◇'),
  64: S('Orange Star', '#f27a2c', '#d65b1c', '#fff5ea', 'rgba(250, 130, 50, 0.45)', '◆'),
  128: S('Sun', '#fbb03a', '#ec8f17', '#3a1a00', 'rgba(255, 180, 60, 0.55)', '○'),
  256: S('Yellow Giant', '#ffd862', '#f7bb33', '#3b2300', 'rgba(255, 210, 90, 0.6)', '●'),
  512: S('White Star', '#fff7df', '#ffe7a8', '#3d2a00', 'rgba(255, 240, 200, 0.65)', '□'),
  1024: S('Blue Giant', '#d7ecff', '#93c9ff', '#0b2850', 'rgba(150, 205, 255, 0.7)', '■'),
  2048: S('Supernova', '#ffffff', '#a9d8ff', '#071a3d', 'rgba(170, 220, 255, 0.9)', '✦'),
  4096: S('Neutron Star', '#7ff3ff', '#2fb6ff', '#03203a', 'rgba(90, 230, 255, 0.85)', '✧'),
  8192: S('Black Hole', '#1b0d2b', '#07040d', '#ffcf8a', 'rgba(255, 150, 60, 0.75)', '◉'),
  16384: S('Quasar', '#ff5fd6', '#7a2bff', '#ffffff', 'rgba(220, 90, 255, 0.85)', '✺'),
  32768: S('Singularity', '#fff8e6', '#ffd36b', '#2a1600', 'rgba(255, 230, 160, 0.95)', '❂'),
};

export const star = (v: number): Star => STARS[v] ?? STARS[32768];

/** The heat of the board, 0 to 1, from the biggest star: tints the nebula behind it. */
export const heat = (top: number, target: number) => Math.min(1, Math.max(0, (Math.log2(Math.max(2, top)) - 1) / (Math.log2(target) - 1)));

export const fmt = (n: number) => n.toLocaleString('en-US');

export const MODE_NAMES = { classic: 'Classic', daily: 'Daily', zen: 'Zen' } as const;

/** "Nov 17" from a YYYY-MM-DD date. */
export function shortDay(day?: string) {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
