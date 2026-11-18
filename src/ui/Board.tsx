import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import type { Tile } from '../game/engine';
import { star } from './stars';

export interface BoardHandle {
  /** The center of a cell on screen, in CSS pixels. */
  point(r: number, c: number): { x: number; y: number };
  nudge(dir: 'up' | 'down' | 'left' | 'right'): void;
  quake(big: boolean): void;
  el(): HTMLDivElement | null;
}

const gapFor = (n: number) => (n <= 3 ? 0.04 : n === 4 ? 0.032 : n === 5 ? 0.026 : 0.022);

/** One star tile. Position is a transform, so sliding runs on the graphics chip and stays smooth. */
export function TileView({
  t,
  cell,
  gap,
  kind,
  names,
  marks,
  delay,
}: {
  t: Tile;
  cell: number;
  gap: number;
  kind?: 'ghost';
  names?: boolean;
  marks?: boolean;
  delay?: number;
}) {
  const s = star(t.value);
  const digits = String(t.value).length;
  const fs = cell * (digits <= 2 ? 0.42 : digits === 3 ? 0.35 : digits === 4 ? 0.28 : 0.225);
  const cls = ['tile'];
  if (kind === 'ghost') cls.push('ghost');
  else {
    if (t.merged) cls.push('merged');
    if (t.spawned) cls.push('spawned');
    if (t.restored) cls.push('restored');
    if (delay !== undefined) cls.push('enter');
  }
  if (s.glow) cls.push('glow');
  if (t.value >= 256 && t.value < 8192) cls.push('shine');
  if (t.value === 2048 || t.value >= 16384) cls.push('corona');
  if (t.value === 4096) cls.push('pulse');
  if (t.value === 8192) cls.push('hole');
  const style = {
    '--x': `${gap + t.c * (cell + gap)}px`,
    '--y': `${gap + t.r * (cell + gap)}px`,
    '--from': s.from,
    '--to': s.to,
    '--inkc': s.ink,
    '--glow': s.glow || 'transparent',
    '--fs': `${fs}px`,
    '--sheen-delay': `${(t.id % 7) * 0.6}s`,
    '--enter-delay': delay !== undefined ? `${delay}s` : undefined,
  } as CSSProperties;
  return (
    <div className={cls.join(' ')} style={style} aria-hidden="true">
      <div className="face">
        {marks ? <span className="mk">{s.mark}</span> : null}
        <span className="num">{t.value}</span>
        {names && cell >= 64 ? <span className="nm">{s.name}</span> : null}
      </div>
    </div>
  );
}

export const Board = forwardRef<
  BoardHandle,
  { n: number; tiles: Tile[]; ghosts: Tile[]; names: boolean; marks: boolean; entering?: boolean; label: string }
>(function Board({ n, tiles, ghosts, names, marks, entering, label }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const [fx, setFx] = useState('');
  const fxTimer = useRef(0);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setSize(node.clientWidth));
    ro.observe(node);
    setSize(node.clientWidth);
    return () => ro.disconnect();
  }, []);

  const gap = size * gapFor(n);
  const cell = size ? (size - gap * (n + 1)) / n : 0;

  const flash = (cls: string, ms: number) => {
    setFx('');
    window.clearTimeout(fxTimer.current);
    requestAnimationFrame(() => {
      setFx(cls);
      fxTimer.current = window.setTimeout(() => setFx(''), ms);
    });
  };

  useImperativeHandle(ref, () => ({
    point(r, c) {
      const b = el.current!.getBoundingClientRect();
      const k = b.width / Math.max(1, size);
      return { x: b.left + (gap + c * (cell + gap) + cell / 2) * k, y: b.top + (gap + r * (cell + gap) + cell / 2) * k };
    },
    nudge: (dir) => flash(`nudge-${dir}`, 220),
    quake: (big) => flash(big ? 'quake-big' : 'quake', big ? 900 : 420),
    el: () => el.current,
  }));

  return (
    <div
      ref={el}
      className={`board ${fx}`}
      style={{ '--cell': `${cell}px`, '--gap': `${gap}px` } as CSSProperties}
      role="img"
      aria-label={label}
    >
      {cell > 0
        ? Array.from({ length: n * n }, (_, i) => (
            <div
              key={`c${i}`}
              className="cell"
              style={{ transform: `translate(${gap + (i % n) * (cell + gap)}px, ${gap + Math.floor(i / n) * (cell + gap)}px)` }}
            />
          ))
        : null}
      {/* one list, keyed by star, so a star that merges keeps its element and slides into its partner */}
      {cell > 0
        ? [
            ...ghosts.map((t) => <TileView key={t.id} t={t} cell={cell} gap={gap} kind="ghost" names={names} marks={marks} />),
            ...tiles.map((t, i) => (
              <TileView key={t.id} t={t} cell={cell} gap={gap} names={names} marks={marks} delay={entering ? 0.15 + i * 0.05 : undefined} />
            )),
          ]
        : null}
    </div>
  );
});
