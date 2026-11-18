import { BarChart3, CalendarDays, CircleHelp, Download, Infinity as Zen, Play, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import { sound } from '../audio/sound';
import { bestMove } from '../game/autoplay';
import { move, newGame, type Mode } from '../game/engine';
import { feel, native } from '../native';
import { savedGame, todayKey, useSettings, useStats } from '../state/store';
import { Board } from './Board';
import { StarMark } from './controls';
import { fmt } from './stars';

/** A game playing itself behind the title, tilted into the distance. */
function Demo() {
  const [g, setG] = useState(() => newGame({ mode: 'classic', n: 4, seed: 2048 }));
  useEffect(() => {
    const t = window.setInterval(() => {
      setG((cur) => {
        if (cur.over || cur.best >= 1024) return newGame({ mode: 'classic', n: 4 });
        const d = bestMove(cur);
        return d ? move(cur, d).game : newGame({ mode: 'classic', n: 4 });
      });
    }, 720);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="demo" aria-hidden="true">
      <Board n={4} tiles={g.tiles} ghosts={g.ghosts} names={false} marks={false} label="" />
    </div>
  );
}

export function Title({
  onPlay,
  onSheet,
  leaving,
}: {
  onPlay: (m: Mode) => void;
  onSheet: (s: 'settings' | 'stats' | 'howto') => void;
  leaving: boolean;
}) {
  const settings = useSettings();
  const stats = useStats();
  const saved = savedGame('classic');
  const daily = savedGame('daily');
  const today = todayKey();
  const dailyBest = stats.dailyBest[today];
  const go = (m: Mode) => {
    sound.click();
    feel('tap');
    onPlay(m);
  };
  const tap = (s: 'settings' | 'stats' | 'howto') => {
    sound.click();
    feel('tap');
    onSheet(s);
  };
  return (
    <div className={`title ${leaving ? 'screen-out' : 'screen-in'}`}>
      <div className="top logo reveal">
        <StarMark />
        <h1>ZENITH</h1>
        <div className="tag">Fuse the stars</div>
      </div>
      <div className="horizon">{!settings.reduceMotion ? <Demo /> : null}</div>
      <div className="modes reveal">
        <button className="btn primary play-big" onClick={() => go('classic')}>
          <Play />
          <span>
            {saved && saved.moves > 0 ? 'Continue' : 'Play'} {saved && saved.moves > 0 ? <small>· {fmt(saved.score)}</small> : null}
          </span>
        </button>
        <div className="mode-row">
          <button className="mode" onClick={() => go('daily')}>
            <CalendarDays />
            <b>Daily</b>
            <span>
              {dailyBest ? `Today’s best ${fmt(dailyBest)}` : daily && daily.day === today ? 'In progress' : 'Same board for everyone'}
            </span>
          </button>
          <button className="mode" onClick={() => go('zen')}>
            <Zen />
            <b>Zen</b>
            <span>Endless rewinds, calm music</span>
          </button>
        </div>
      </div>
      <div className="title-foot reveal">
        <button className="icon-btn" aria-label="How to play" onClick={() => tap('howto')}>
          <CircleHelp />
        </button>
        <button className="icon-btn" aria-label="Records and achievements" onClick={() => tap('stats')}>
          <BarChart3 />
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={() => tap('settings')}>
          <Settings />
        </button>
      </div>
      {!native ? (
        <a className="get-app" href="./Zenith.apk">
          <Download /> Get the Android app
        </a>
      ) : null}
    </div>
  );
}
