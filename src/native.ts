// The phone: haptics, sharing, the back button and the app going to the background.
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

import { getState } from './state/store';

export const native = Capacitor.isNativePlatform();

export type Feel = 'tap' | 'move' | 'merge' | 'big' | 'huge' | 'blocked' | 'win' | 'lose';

/** One haptic per moment, tuned so the phone feels like part of the game rather than buzzing at everything. */
export function feel(kind: Feel) {
  if (!getState().settings.haptics) return;
  try {
    if (native) {
      if (kind === 'win') void Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'lose') void Haptics.notification({ type: NotificationType.Warning });
      else if (kind === 'blocked') void Haptics.impact({ style: ImpactStyle.Light });
      else
        void Haptics.impact({
          style: kind === 'huge' || kind === 'big' ? ImpactStyle.Heavy : kind === 'merge' ? ImpactStyle.Medium : ImpactStyle.Light,
        });
      if (kind === 'huge') window.setTimeout(() => void Haptics.impact({ style: ImpactStyle.Heavy }), 120);
    } else if ('vibrate' in navigator) {
      const ms: Record<Feel, number | number[]> = {
        tap: 6,
        move: 8,
        merge: 14,
        big: 28,
        huge: [40, 60, 70],
        blocked: [8, 40, 8],
        win: [30, 60, 30, 60, 90],
        lose: [60, 80, 120],
      };
      navigator.vibrate(ms[kind]);
    }
  } catch {
    /* no haptics here */
  }
}

export async function share(title: string, text: string) {
  const url = 'https://neomaverick1.github.io/zenith/';
  try {
    if (native) await Share.share({ title, text, url, dialogTitle: title });
    else if (navigator.share) await navigator.share({ title, text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      return 'copied';
    }
  } catch {
    /* share sheet closed */
  }
  return 'shared';
}

export function onLifecycle(pause: () => void, resume: () => void, back: () => boolean) {
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? pause() : resume()));
  if (!native) return;
  void App.addListener('pause', pause);
  void App.addListener('resume', resume);
  void App.addListener('backButton', () => {
    if (!back()) void App.minimizeApp();
  });
}
