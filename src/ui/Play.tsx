import { Home, Pause, Play as PlayIcon, RotateCcw, Share2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { sound } from '../audio/sound';
import { fx } from '../fx';
import { canUndo, dailyGame, keepGoing, move, newGame, undo, type Dir, type Game, type Mode, type MoveResult } from '../game/engine';
import { feel, share } from '../native';
import { earned } from '../state/achievements';
import { getState, saveGame, savedGame, setStats, todayKey, useSettings, useStats } from '../state/store';
import { Board, TileView, type BoardHandle } from './Board';
import { Count, Layer } from './controls';
import { fmt, heat, MODE_NAMES, shortDay, star } from './stars';

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

function startGame(mode: Mode, size: number, undoOn: boolean, fresh = false): Game {
  const today = todayKey();
  if (!fresh) {
    const saved = savedGame(mode);
    if (saved && !saved.over && (mode !== 'daily' || saved.day === today)) return saved;
  }
  if (mode === 'daily') return dailyGame(today);
  return newGame({ mode, n: size, undo: undoOn });
}

const scoreKey = (g: Game) => (g.mode === 'daily' ? 'daily' : `${g.mode}-${g.n}`);

export function Play({
  mode,
  blocked,
  onQuit,
  onSheet,
  onEarned,
}: {
  mode: Mode;
  blocked: boolean;
  onQuit: () => void;
  onSheet: (s: 'settings' | 'howto') => void;
  onEarned: (ids: string[]) => void;
}) {
  const settings = useSettings();
  const stats = useStats();
  const [game, setGame] = useState<Game>(() => startGame(mode, settings.size, settings.undo));
  const ref = useRef(game);
  const board = useRef<BoardHandle>(null);
  const [entering, setEntering] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(game.over);
  const [nova, setNova] = useState(false);
  const [gains, setGains] = useState<{ id: number; v: number }[]>([]);
  const [chain, setChain] = useState<{ id: number; n: number } | null>(null);
  const [said, setSaid] = useState('');
  const swipe = useRef<{ x: number; y: number; done: boolean } | null>(null);
  const lastMove = useRef(0);
  const first = useRef(game);
  const slide = settings.reduceMotion ? 60 : settings.speed === 'fast' ? 70 : 110;
  const best = Math.max(stats.bestScore[scoreKey(game)] ?? 0, game.score);

  // music and sky follow this game
  useEffect(() => {
    const g = first.current;
    lastMove.current = performance.now();
    sound.gameMusic(g.best, g.target, mode === 'zen');
    fx.nebula?.setHeat(heat(g.best, g.target));
    const t = window.setTimeout(() => setEntering(false), 900);
    return () => window.clearTimeout(t);
  }, [mode]);

  const set = useCallback((g: Game) => {
    ref.current = g;
    setGame(g);
    saveGame(g, g.mode);
  }, []);

  const finishGame = useCallback(() => setStats((s) => ({ ...s, games: s.games + 1 })), []);

  const effects = useCallback(
    (r: MoveResult, dir: Dir) => {
      const g = r.game;
      sound.move(dir);
      const top = r.merged.length ? r.merged[r.merged.length - 1].value : 0;
      feel(top >= 1024 ? 'huge' : top >= 256 ? 'big' : r.merged.length ? 'merge' : 'move');
      if (r.merged.length) {
        sound.merges(
          r.merged.map((m) => ({ value: m.value, c: m.c })),
          g.n,
        );
        window.setTimeout(() => {
          for (const m of r.merged) {
            const p = board.current?.point(m.r, m.c);
            if (!p) continue;
            const s = star(m.value);
            const power = Math.min(1.7, Math.log2(m.value) / 7);
            fx.sparks?.burst(p.x, p.y, s.from === '#ffffff' ? '#bfe4ff' : s.from, power);
            fx.nebula?.ripple(p.x / window.innerWidth, p.y / window.innerHeight, 0.25 + power * 0.55, s.from);
          }
          if (top >= 512 && !getState().settings.reduceMotion) board.current?.quake(top >= 1024);
        }, slide * 0.8);
        const id = performance.now();
        setGains((gs) => [...gs.slice(-3), { id, v: r.gained }]);
        if (r.merged.length >= 2) setChain({ id, n: r.merged.length });
        setSaid(`Fused into ${r.merged.map((m) => m.value).join(', ')}. Score ${fmt(g.score)}.`);
      }
      if (r.spawned) sound.spawn(r.spawned.c, g.n);
      sound.follow(g.best, g.target);
      fx.nebula?.setHeat(heat(g.best, g.target));

      // records
      const now = performance.now();
      const spent = Math.min(30000, now - lastMove.current);
      lastMove.current = now;
      const key = scoreKey(g);
      const before = getState().stats;
      const prevBest = before.bestScore[key] ?? 0;
      setStats((s) => ({
        ...s,
        merges: s.merges + r.merged.length,
        moves: s.moves + 1,
        playMs: s.playMs + spent,
        bestTile: Math.max(s.bestTile, g.best),
        bestCombo: Math.max(s.bestCombo, r.merged.length),
        bestScore: { ...s.bestScore, [key]: Math.max(prevBest, g.score) },
        dailyBest: g.mode === 'daily' && g.day ? { ...s.dailyBest, [g.day]: Math.max(s.dailyBest[g.day] ?? 0, g.score) } : s.dailyBest,
        wins: s.wins + (r.justWon ? 1 : 0),
      }));
      if (prevBest > 0 && g.score > prevBest && g.score - r.gained <= prevBest) sound.newBest();
      const got = earned(g, r.merged.length, getState().stats);
      if (got.length) {
        setStats((s) => ({ ...s, achievements: { ...s.achievements, ...Object.fromEntries(got.map((id) => [id, Date.now()])) } }));
        window.setTimeout(() => {
          sound.achievement();
          onEarned(got);
        }, 450);
      }

      if (r.justWon && !g.keepGoing) {
        window.setTimeout(() => {
          sound.supernova();
          fx.nebula?.supernova();
          feel('win');
          const p = board.current?.point((g.n - 1) / 2, (g.n - 1) / 2);
          if (p) {
            fx.sparks?.burst(p.x, p.y, '#bfe4ff', 2.4);
            fx.sparks?.burst(p.x, p.y, '#ffd36b', 1.8);
          }
          setNova(true);
        }, slide + 260);
      }
      if (r.justOver) {
        finishGame();
        window.setTimeout(() => {
          sound.gameOver();
          feel('lose');
          setEnded(true);
        }, 650);
      }
    },
    [slide, finishGame, onEarned],
  );

  const act = useCallback(
    (dir: Dir) => {
      const g = ref.current;
      if (g.over) return;
      const r = move(g, dir);
      if (!r.moved) {
        board.current?.nudge(dir);
        sound.blocked();
        feel('blocked');
        return;
      }
      set(r.game);
      effects(r, dir);
    },
    [set, effects],
  );

  const rewind = useCallback(() => {
    const g = ref.current;
    if (!canUndo(g)) return;
    const u = undo(g);
    set(u);
    sound.undo();
    feel('tap');
    if (ended) {
      setEnded(false);
      sound.clear();
      sound.follow(u.best, u.target);
      setStats((s) => ({ ...s, games: Math.max(0, s.games - 1) }));
    }
  }, [set, ended]);

  const restart = useCallback(() => {
    const g = ref.current;
    if (g.moves > 0 && !g.over) finishGame();
    const fresh = startGame(mode, getState().settings.size, getState().settings.undo, true);
    set(fresh);
    setEnded(false);
    setNova(false);
    setPaused(false);
    setEntering(true);
    window.setTimeout(() => setEntering(false), 900);
    sound.gameMusic(fresh.best, fresh.target, mode === 'zen');
    fx.nebula?.setHeat(heat(fresh.best, fresh.target));
  }, [mode, set, finishGame]);

  const live = !blocked && !paused && !ended && !nova;

  // keys
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!live) return;
      const dir = KEYS[e.key];
      if (dir) {
        e.preventDefault();
        act(dir);
      } else if (e.key === 'z' || e.key === 'Z' || e.key === 'u') rewind();
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        setPaused(true);
        sound.muffle(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [live, act, rewind]);

  // the phone's back button or leaving the app pauses the game
  useEffect(() => {
    const pause = () => {
      if (live) {
        setPaused(true);
        sound.muffle(true);
      }
    };
    window.addEventListener('zenith:pause', pause);
    return () => window.removeEventListener('zenith:pause', pause);
  }, [live]);

  const resume = () => {
    sound.click();
    setPaused(false);
    sound.muffle(false);
  };

  const goal = star(game.target);
  const seq: number[] = [];
  for (let v = 2; v <= game.target; v *= 2) seq.push(v);
  const top = star(game.best);
  const nextUp = game.best >= game.target ? game.best * 2 : game.target;
  const undos = game.undoLeft === Infinity ? '' : String(game.undoLeft);
  const where = mode === 'daily' ? `Daily · ${shortDay(game.day)}` : `${MODE_NAMES[mode]} · ${game.n}×${game.n}`;

  return (
    <div
      className={`play screen-in`}
      onPointerDown={(e) => {
        if (!live || (e.target as HTMLElement).closest('button')) return;
        swipe.current = { x: e.clientX, y: e.clientY, done: false };
      }}
      onPointerMove={(e) => {
        const s = swipe.current;
        if (!s || s.done || !live) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
        s.done = true;
        act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }}
      onPointerUp={() => (swipe.current = null)}
      onPointerCancel={() => (swipe.current = null)}
      style={{ '--slide': `${slide}ms` } as CSSProperties}
    >
      <div className="hud">
        <button
          className="icon-btn"
          aria-label="Pause"
          onClick={() => {
            sound.click();
            setPaused(true);
            sound.muffle(true);
          }}
        >
          <Pause />
        </button>
        <div className="where">
          {where}
          <small>
            Goal · {goal.name} {fmt(game.target)}
          </small>
        </div>
        <button
          className="icon-btn"
          aria-label={`Undo${undos ? `, ${undos} left` : ''}`}
          disabled={!canUndo(game)}
          onClick={() => {
            rewind();
          }}
        >
          <Undo2 />
          {undos && game.undoLeft > 0 ? <span className="count">{undos}</span> : null}
        </button>
      </div>

      <div className="center">
        <div className="scores">
          <div className="score main">
            <label>Score</label>
            <div className="n">
              <Count value={game.score} />
            </div>
            {gains.map((g) => (
              <span key={g.id} className="gain" onAnimationEnd={() => setGains((gs) => gs.filter((x) => x.id !== g.id))}>
                +{fmt(g.v)}
              </span>
            ))}
            {chain ? (
              <span key={chain.id} className="chain" onAnimationEnd={() => setChain(null)}>
                ×{chain.n} chain
              </span>
            ) : null}
          </div>
          <div className="score best">
            <label>Best</label>
            <div className="n">{fmt(best)}</div>
          </div>
        </div>

        <div className="stage">
          <Board
            ref={board}
            n={game.n}
            tiles={game.tiles}
            ghosts={game.ghosts}
            names={settings.names}
            marks={settings.colorblind}
            entering={entering}
            label={`Board, ${game.tiles.length} stars, biggest ${game.best}`}
          />
        </div>

        <div className="sequence" aria-label={`Biggest star ${top.name}, ${game.best}`}>
          <div className="dots">
            {seq.map((v) => (
              <span
                key={v}
                className={`dot${game.best >= v ? ' on' : ''}`}
                style={{ '--c': star(v).from === '#ffffff' ? '#bfe4ff' : star(v).from } as CSSProperties}
              />
            ))}
          </div>
          <div className="label">
            <span>
              <b>{top.name}</b> · {fmt(game.best)}
            </span>
            <span>
              {game.best >= game.target ? 'Next' : 'Goal'} · {star(nextUp).name} {fmt(nextUp)}
            </span>
          </div>
        </div>
      </div>

      <div className="sr" aria-live="polite">
        {said}
      </div>

      {paused ? (
        <Layer label="Paused" onClose={resume}>
          <h2>Paused</h2>
          <p className="sub">
            {where} · score {fmt(game.score)}
          </p>
          <div className="actions">
            <button className="btn primary wide" onClick={resume}>
              <PlayIcon /> Resume
            </button>
            <div className="row2">
              <button
                className="btn glass"
                onClick={() => {
                  sound.click();
                  restart();
                }}
              >
                <RotateCcw /> New game
              </button>
              <button
                className="btn glass"
                onClick={() => {
                  sound.click();
                  onSheet('settings');
                }}
              >
                Settings
              </button>
            </div>
            <div className="row2">
              <button
                className="btn glass"
                onClick={() => {
                  sound.click();
                  onSheet('howto');
                }}
              >
                How to play
              </button>
              <button
                className="btn glass"
                onClick={() => {
                  sound.click();
                  setPaused(false);
                  onQuit();
                }}
              >
                <Home /> Title
              </button>
            </div>
          </div>
        </Layer>
      ) : null}

      {ended ? (
        <Layer label="Game over">
          <div className="trophy-tile">
            <TileView t={{ id: 0, value: game.best, r: 0, c: 0 }} cell={84} gap={0} />
          </div>
          <h2>No moves left</h2>
          <p className="sub">
            You made a {top.name}.{' '}
            {mode === 'daily' ? 'A new daily board arrives tomorrow.' : game.score >= best && game.score > 0 ? 'A new best score.' : ''}
          </p>
          <div className="final">
            <Count value={game.score} ms={1100} />
          </div>
          <div className="end-stats">
            <div>
              <b>{fmt(game.moves)}</b>
              <span>Moves</span>
            </div>
            <div>
              <b>{fmt(game.merges)}</b>
              <span>Fused</span>
            </div>
            <div>
              <b>{fmt(best)}</b>
              <span>Best</span>
            </div>
          </div>
          <div className="actions">
            <button
              className="btn primary wide"
              onClick={() => {
                sound.click();
                restart();
              }}
            >
              <RotateCcw /> {mode === 'daily' ? 'Try today’s board again' : 'Play again'}
            </button>
            <div className="row2">
              {canUndo(game) ? (
                <button className="btn glass" onClick={rewind}>
                  <Undo2 /> Rewind
                </button>
              ) : (
                <button
                  className="btn glass"
                  onClick={() => {
                    sound.click();
                    void share('Zenith', `I made a ${top.name} (${game.best}) and scored ${fmt(game.score)} in Zenith.`);
                  }}
                >
                  <Share2 /> Share
                </button>
              )}
              <button
                className="btn glass"
                onClick={() => {
                  sound.click();
                  onQuit();
                }}
              >
                <Home /> Title
              </button>
            </div>
          </div>
        </Layer>
      ) : null}

      {nova ? (
        <div className="nova" role="dialog" aria-modal="true" aria-label="Supernova">
          <div className="big-tile">
            <TileView t={{ id: 0, value: game.target, r: 0, c: 0 }} cell={Math.min(window.innerWidth * 0.46, 210)} gap={0} />
          </div>
          <h2>Supernova</h2>
          <p>
            You fused a {goal.name} in {fmt(game.moves)} moves. The universe is yours to keep growing.
          </p>
          <div className="actions">
            <button
              className="btn primary wide"
              onClick={() => {
                sound.click();
                set(keepGoing(ref.current));
                setNova(false);
              }}
            >
              Keep going
            </button>
            <div className="row2">
              <button
                className="btn glass"
                onClick={() => {
                  sound.click();
                  void share(
                    'Zenith',
                    `I went Supernova (${game.target}) in ${fmt(game.moves)} moves in Zenith. Score ${fmt(game.score)}.`,
                  );
                }}
              >
                <Share2 /> Share
              </button>
              <button
                className="btn glass"
                onClick={() => {
                  sound.click();
                  restart();
                }}
              >
                <RotateCcw /> New game
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
