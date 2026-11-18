import { Award } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { sound } from './audio/sound';
import { fx } from './fx';
import { Nebula } from './fx/nebula';
import { Sparks } from './fx/particles';
import type { Mode } from './game/engine';
import { onLifecycle } from './native';
import { ACHIEVEMENTS } from './state/achievements';
import { flush, getState, setSettings, useSettings } from './state/store';
import { StarMark } from './ui/controls';
import { Play } from './ui/Play';
import { HowTo, SettingsSheet, StatsSheet } from './ui/Sheets';
import { Title } from './ui/Title';

type Sheet = 'settings' | 'stats' | 'howto' | null;

const QUALITY = {
  high: { scale: 0.6, fps: 60, sparks: 1 },
  balanced: { scale: 0.4, fps: 40, sparks: 0.65 },
  saver: { scale: 0.28, fps: 12, sparks: 0.35 },
};

export default function App() {
  const settings = useSettings();
  const sky = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const [screen, setScreen] = useState<'title' | 'play'>('title');
  const [leaving, setLeaving] = useState(false);
  const [mode, setMode] = useState<Mode>('classic');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [toasts, setToasts] = useState<{ key: number; id: string }[]>([]);
  const [round, setRound] = useState(0);
  const state = useRef({ sheet, screen });
  useEffect(() => {
    state.current = { sheet, screen };
  }, [sheet, screen]);

  useEffect(() => {
    if (sky.current) fx.nebula = new Nebula(sky.current);
    if (sparks.current) fx.sparks = new Sparks(sparks.current);
    fx.nebula?.start();
    onLifecycle(
      () => {
        window.dispatchEvent(new Event('zenith:pause'));
        sound.suspend();
        fx.nebula?.stop();
        flush();
      },
      () => {
        sound.resume();
        fx.nebula?.start();
      },
      () => {
        const s = state.current;
        if (document.querySelector('[data-layer]')) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          return true;
        }
        if (s.screen === 'play') {
          window.dispatchEvent(new Event('zenith:pause'));
          return true;
        }
        return false;
      },
    );
    window.addEventListener('beforeunload', flush);
  }, []);

  // graphics quality
  useEffect(() => {
    const q = QUALITY[settings.quality];
    if (fx.nebula) {
      fx.nebula.scale = q.scale;
      fx.nebula.fps = settings.reduceMotion ? Math.min(q.fps, 20) : q.fps;
    }
    if (fx.sparks) fx.sparks.density = settings.reduceMotion ? 0.25 : q.sparks;
    sound.lite = settings.quality === 'saver';
  }, [settings.quality, settings.reduceMotion]);

  const begin = () => {
    if (started) return;
    sound.start();
    sound.setVolumes(getState().settings.music, getState().settings.sfx);
    sound.menuMusic();
    setStarted(true);
    window.setTimeout(() => setSplashGone(true), 650);
  };

  const play = useCallback((m: Mode) => {
    if (!getState().settings.tutorialDone) {
      setPendingMode(m);
      setSheet('howto');
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      setMode(m);
      setRound((r) => r + 1);
      setScreen('play');
      setLeaving(false);
    }, 300);
  }, []);

  const quit = useCallback(() => {
    sound.menuMusic();
    fx.nebula?.setHeat(0);
    setScreen('title');
  }, []);

  const closeSheet = () => {
    const was = sheet;
    setSheet(null);
    if (was === 'howto' && !getState().settings.tutorialDone) setSettings({ tutorialDone: true });
    if (was === 'howto' && pendingMode) {
      const m = pendingMode;
      setPendingMode(null);
      window.setTimeout(() => play(m), 50);
    }
  };

  const earned = useCallback((ids: string[]) => {
    setToasts((t) => [...t, ...ids.map((id, i) => ({ key: Date.now() + i, id }))]);
  }, []);

  return (
    <>
      <canvas ref={sky} className="sky" aria-hidden="true" />
      <div className={`app q-${settings.quality}${settings.reduceMotion ? ' motion-reduced' : ''}`}>
        {splashGone ? (
          screen === 'title' ? (
            <Title onPlay={play} onSheet={setSheet} leaving={leaving} />
          ) : (
            <Play key={`${mode}-${round}`} mode={mode} blocked={!!sheet} onQuit={quit} onSheet={setSheet} onEarned={earned} />
          )
        ) : null}
      </div>
      <canvas ref={sparks} className="sparks" aria-hidden="true" />
      {!splashGone ? (
        <div
          className={`splash${started ? ' leaving' : ''}`}
          onPointerDown={begin}
          onKeyDown={begin}
          role="button"
          tabIndex={0}
          aria-label="Tap to begin"
        >
          <div className="logo reveal">
            <StarMark size={78} />
            <h1>ZENITH</h1>
            <div className="tag">A 2048 merge puzzle with a living soundtrack</div>
          </div>
          <div className="hint">Tap anywhere to begin · sound on</div>
        </div>
      ) : null}
      {sheet === 'settings' ? <SettingsSheet onClose={closeSheet} inGame={screen === 'play'} onTutorial={() => setSheet('howto')} /> : null}
      {sheet === 'stats' ? <StatsSheet onClose={closeSheet} /> : null}
      {sheet === 'howto' ? <HowTo onClose={closeSheet} /> : null}
      {toasts.slice(0, 1).map((t) => {
        const a = ACHIEVEMENTS.find((x) => x.id === t.id);
        return a ? (
          <div key={t.key} className="toast" role="status" onAnimationEnd={() => setToasts((ts) => ts.filter((x) => x.key !== t.key))}>
            <Award />
            <div>
              <b>{a.name}</b>
              <span>{a.how}</span>
            </div>
          </div>
        ) : null;
      })}
    </>
  );
}
