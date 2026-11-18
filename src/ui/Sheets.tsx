import {
  Award,
  Clock,
  Gauge,
  Grid3x3,
  Hash,
  Lock,
  Music,
  Palette,
  RotateCcw,
  Sparkles,
  Undo2,
  Vibrate,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

import { sound } from '../audio/sound';
import { ACHIEVEMENTS } from '../state/achievements';
import { resetStats, setSettings, useSettings, useStats, type Settings as S } from '../state/store';
import { Layer, Seg, Slider, Toggle } from './controls';
import { fmt, STARS, star } from './stars';

const VERSION = __APP_VERSION__;

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header>
      <h2>{title}</h2>
      <button
        className="icon-btn"
        aria-label="Close"
        onClick={() => {
          sound.click();
          onClose();
        }}
      >
        <X />
      </button>
    </header>
  );
}

function Row({
  icon,
  title,
  hint,
  children,
  stack,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children?: React.ReactNode;
  stack?: boolean;
}) {
  return (
    <div className={`setting${stack ? ' stack' : ''}`}>
      {icon}
      <div className="what">
        <b>{title}</b>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="control">{children}</div>
    </div>
  );
}

export function SettingsSheet({ onClose, inGame, onTutorial }: { onClose: () => void; inGame: boolean; onTutorial: () => void }) {
  const s = useSettings();
  const set = (p: Partial<S>) => setSettings(p);
  const [confirm, setConfirm] = useState(false);
  return (
    <Layer sheet onClose={onClose} label="Settings">
      <Head title="Settings" onClose={onClose} />
      <div className="body">
        <section className="group">
          <h3>Sound</h3>
          <div className="rows">
            <Row icon={<Music />} title="Music" hint="Builds as your stars grow">
              <Slider
                label="Music volume"
                value={s.music}
                onChange={(v) => {
                  set({ music: v });
                  sound.setVolumes(v, s.sfx);
                }}
              />
            </Row>
            <Row icon={<Volume2 />} title="Effects" hint="Merges, swipes and buttons">
              <Slider
                label="Effects volume"
                value={s.sfx}
                onChange={(v) => {
                  set({ sfx: v });
                  sound.setVolumes(s.music, v);
                }}
                onRelease={() => sound.preview('sfx')}
              />
            </Row>
            <Row icon={<Vibrate />} title="Haptics" hint="Feel every merge">
              <Toggle label="Haptics" on={s.haptics} onChange={(v) => set({ haptics: v })} />
            </Row>
          </div>
        </section>

        <section className="group">
          <h3>Game</h3>
          <div className="rows">
            <Row icon={<Grid3x3 />} title="Board size" hint={inGame ? 'Starts with your next game' : 'The goal grows with the board'} stack>
              <Seg
                label="Board size"
                value={s.size}
                onChange={(v) => set({ size: v })}
                options={[
                  [3, '3×3'],
                  [4, '4×4'],
                  [5, '5×5'],
                  [6, '6×6'],
                ]}
              />
            </Row>
            <Row icon={<Undo2 />} title="Undo in Classic" hint="Three rewinds a game">
              <Toggle label="Undo in Classic" on={s.undo} onChange={(v) => set({ undo: v })} />
            </Row>
            <Row icon={<Zap />} title="Animation speed" stack>
              <Seg
                label="Animation speed"
                value={s.speed}
                onChange={(v) => set({ speed: v })}
                options={[
                  ['normal', 'Smooth'],
                  ['fast', 'Fast'],
                ]}
              />
            </Row>
          </div>
        </section>

        <section className="group">
          <h3>Look</h3>
          <div className="rows">
            <Row icon={<Gauge />} title="Graphics" hint="Lower it to save battery" stack>
              <Seg
                label="Graphics quality"
                value={s.quality}
                onChange={(v) => set({ quality: v })}
                options={[
                  ['high', 'Ultra'],
                  ['balanced', 'Balanced'],
                  ['saver', 'Battery saver'],
                ]}
              />
            </Row>
            <Row icon={<Sparkles />} title="Reduce motion" hint="Calmer animations, no screen shake">
              <Toggle label="Reduce motion" on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
            </Row>
            <Row icon={<Hash />} title="Star names" hint="Show each star’s name on its tile">
              <Toggle label="Star names" on={s.names} onChange={(v) => set({ names: v })} />
            </Row>
            <Row icon={<Palette />} title="Color-blind marks" hint="A shape on every tile, so color isn’t needed">
              <Toggle label="Color-blind marks" on={s.colorblind} onChange={(v) => set({ colorblind: v })} />
            </Row>
          </div>
        </section>

        <section className="group">
          <h3>Help and data</h3>
          <div className="rows">
            <Row icon={<Sparkles />} title="How to play">
              <button
                className="btn glass"
                style={{ minHeight: 38, padding: '0 14px', fontSize: 14 }}
                onClick={() => {
                  sound.click();
                  onTutorial();
                }}
              >
                Show
              </button>
            </Row>
            <Row icon={<RotateCcw />} title="Reset records" hint="Scores, stats and achievements">
              <button
                className="btn glass"
                style={{ minHeight: 38, padding: '0 14px', fontSize: 14, color: confirm ? 'var(--danger)' : undefined }}
                onClick={() => {
                  sound.click();
                  if (!confirm) setConfirm(true);
                  else {
                    resetStats();
                    setConfirm(false);
                  }
                }}
              >
                {confirm ? 'Tap again to reset' : 'Reset'}
              </button>
            </Row>
          </div>
        </section>
        <p style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5, margin: 0 }}>
          Zenith {VERSION} · design, code, music and sound by Randy Kundinger
          <br />
          Every note you hear is played live by the game. No sound files.
        </p>
      </div>
    </Layer>
  );
}

const hm = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export function StatsSheet({ onClose }: { onClose: () => void }) {
  const st = useStats();
  const bestAny = Math.max(0, ...Object.values(st.bestScore));
  const top = st.bestTile ? star(st.bestTile) : null;
  return (
    <Layer sheet onClose={onClose} label="Records">
      <Head title="Records" onClose={onClose} />
      <div className="body">
        <section className="group">
          <h3>Your universe</h3>
          <div className="stat-grid">
            <div className="stat">
              <b>{fmt(bestAny)}</b>
              <span>Best score</span>
            </div>
            <div className="stat">
              <b style={top ? { color: top.from === '#ffffff' ? '#bfe4ff' : top.from } : undefined}>{st.bestTile || '–'}</b>
              <span>{top ? top.name : 'Biggest star'}</span>
            </div>
            <div className="stat">
              <b>{fmt(st.wins)}</b>
              <span>Supernovas</span>
            </div>
            <div className="stat">
              <b>{fmt(st.games)}</b>
              <span>Games</span>
            </div>
            <div className="stat">
              <b>{fmt(st.merges)}</b>
              <span>Stars fused</span>
            </div>
            <div className="stat">
              <b>×{st.bestCombo || 0}</b>
              <span>Best chain</span>
            </div>
            <div className="stat">
              <b>{fmt(st.moves)}</b>
              <span>Moves</span>
            </div>
            <div className="stat">
              <b>{hm(st.playMs)}</b>
              <span>Time played</span>
            </div>
            <div className="stat">
              <b>{Object.keys(st.dailyBest).length}</b>
              <span>Daily boards</span>
            </div>
          </div>
        </section>
        <section className="group">
          <h3>
            Achievements · {Object.keys(st.achievements).length} of {ACHIEVEMENTS.length}
          </h3>
          <div className="ach">
            {ACHIEVEMENTS.map((a) => {
              const got = !!st.achievements[a.id];
              return (
                <div key={a.id} className={got ? 'got' : ''}>
                  {got ? <Award /> : <Lock />}
                  <b>{a.name}</b>
                  <span>{a.how}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="group">
          <h3>The stellar sequence</h3>
          <div className="rows">
            {Object.entries(STARS).map(([v, s]) => (
              <div key={v} className="setting" style={{ minHeight: 46, padding: '8px 14px', opacity: st.bestTile >= Number(v) ? 1 : 0.45 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: `linear-gradient(180deg, ${s.from}, ${s.to})`,
                    boxShadow: s.glow ? `0 0 10px ${s.glow}` : undefined,
                  }}
                />
                <div className="what">
                  <b style={{ fontSize: 14 }}>{s.name}</b>
                </div>
                <span style={{ fontFamily: 'var(--display)', fontSize: 13, color: 'var(--ink-2)' }}>{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layer>
  );
}

function MiniTile({ v, x, y, x2, cls = '' }: { v: number; x: number; y: number; x2?: number; cls?: string }) {
  const s = star(v);
  const p = (i: number) => `${4 + i * 30}px`;
  return (
    <div
      className={`tile ${cls}`}
      style={
        {
          '--x': p(x),
          '--y': p(y),
          '--x2': p(x2 ?? x),
          '--from': s.from,
          '--to': s.to,
          '--inkc': s.ink,
          '--fs': '11px',
          '--glow': s.glow || 'transparent',
        } as React.CSSProperties
      }
    >
      <div className="face">
        <span className="num">{v}</span>
      </div>
    </div>
  );
}

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Layer sheet onClose={onClose} label="How to play">
      <Head title="How to play" onClose={onClose} />
      <div className="body howto">
        <div className="lesson">
          <div className="mini">
            <MiniTile v={2} x={2} y={1} x2={0} cls="slide" />
            <MiniTile v={8} x={1} y={2} x2={0} cls="slide" />
          </div>
          <div>
            <b>Swipe to move every star</b>
            <span>Swipe anywhere, or use the arrow keys. All stars slide as far as they can, and a new one appears after every move.</span>
          </div>
        </div>
        <div className="lesson">
          <div className="mini">
            <MiniTile v={4} x={0} y={1} cls="gone" />
            <MiniTile v={4} x={2} y={1} x2={0} cls="slide gone" />
            <MiniTile v={8} x={0} y={1} cls="fuse" />
          </div>
          <div>
            <b>Two of the same fuse</b>
            <span>Push two equal stars together and they fuse into the next, hotter star. Fuse several in one move for a chain.</span>
          </div>
        </div>
        <div className="lesson">
          <div className="ladder" style={{ width: 92 }}>
            {[2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048].map((v) => {
              const s = star(v);
              return (
                <i key={v} style={{ '--from': s.from, '--to': s.to, '--glow': s.glow } as React.CSSProperties} title={`${v} · ${s.name}`} />
              );
            })}
          </div>
          <div>
            <b>Reach the Supernova</b>
            <span>
              Dust becomes a red dwarf, a sun, a white star, a blue giant, then a 2048 Supernova. The music grows with your biggest star.
            </span>
          </div>
        </div>
        <div className="rows">
          <Row icon={<Sparkles />} title="Classic" hint="Three rewinds a game. Chase your best score." />
          <Row icon={<Clock />} title="Daily" hint="The same board for everyone today, with one rewind." />
          <Row icon={<Music />} title="Zen" hint="Rewind as often as you like, with calmer music." />
        </div>
        <button
          className="btn primary wide"
          onClick={() => {
            sound.click();
            onClose();
          }}
        >
          Got it
        </button>
      </div>
    </Layer>
  );
}
