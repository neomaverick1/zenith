import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { sound } from '../audio/sound';
import { feel } from '../native';

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        sound.toggle(!on);
        feel('tap');
        onChange(!on);
      }}
    />
  );
}

export function Slider({
  value,
  onChange,
  label,
  onRelease,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  onRelease?: () => void;
}) {
  return (
    <div className="slider">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        aria-label={label}
        value={Math.round(value * 100)}
        style={{ '--p': `${Math.round(value * 100)}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onRelease}
        onKeyUp={onRelease}
      />
      <output>{Math.round(value * 100)}</output>
    </div>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          aria-pressed={v === value}
          onClick={() => {
            sound.click();
            feel('tap');
            onChange(v);
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** A dimmed backdrop with a card or a sheet on it. Closes on the backdrop, the Escape key, or the phone's back button. */
export function Layer({ children, onClose, sheet, label }: { children: ReactNode; onClose?: () => void; sheet?: boolean; label: string }) {
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    if (!onClose || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 200);
  };
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input');
    first?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      // only the panel on top closes
      const layers = document.querySelectorAll('[data-layer]');
      if (layers[layers.length - 1] !== ref.current?.parentElement) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  return (
    <div
      className={`scrim${sheet ? ' sheet-scrim' : ''}${closing ? ' closing' : ''}`}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      data-layer
    >
      <div ref={ref} className={sheet ? 'sheet' : 'card'} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/** A number that counts up to its new value instead of jumping. */
export function Count({ value, ms = 380 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (value - a) * e);
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{shown.toLocaleString('en-US')}</>;
}

export function StarMark({ size = 64, className = 'mark' }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="zcore" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.45" stopColor="#d9eeff" />
          <stop offset="1" stopColor="#7cbcff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="zray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#9fd3ff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="22" fill="url(#zcore)" opacity="0.55" />
      <path d="M32 2 C34 22 42 30 62 32 C42 34 34 42 32 62 C30 42 22 34 2 32 C22 30 30 22 32 2 Z" fill="url(#zray)" />
    </svg>
  );
}
