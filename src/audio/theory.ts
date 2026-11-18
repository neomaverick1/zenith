// The music, written down: tempo, the chord progression, the bass, arpeggio, drum patterns and the theme. Plain
// data and small functions, so it can be tested without a sound card. The soundtrack is in D minor at 100 beats a
// minute, over an eight-bar progression that ends on an A major chord, so every loop leans back into the start.

export const BPM = 100;
export const BEAT = 60 / BPM;
export const STEP = BEAT / 4; // a sixteenth note
export const BAR = BEAT * 4;
export const STEPS = 16;

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Chord {
  name: string;
  root: number; // MIDI note of the bass
  quality: 'minor' | 'major';
  /** The pad's voicing, chosen so each chord moves smoothly into the next. */
  voicing: number[];
}

const MINOR = [0, 3, 7];
const MAJOR = [0, 4, 7];
export const intervals = (c: Chord) => (c.quality === 'minor' ? MINOR : MAJOR);

// i – VI – III – VII, then i – VI – iv – V: the classic heroic progression, with A major pulling back to D minor
export const PROGRESSION: Chord[] = [
  { name: 'Dm', root: 38, quality: 'minor', voicing: [62, 65, 69] },
  { name: 'Bb', root: 34, quality: 'major', voicing: [62, 65, 70] },
  { name: 'F', root: 41, quality: 'major', voicing: [60, 65, 69] },
  { name: 'C', root: 36, quality: 'major', voicing: [60, 64, 67] },
  { name: 'Dm', root: 38, quality: 'minor', voicing: [62, 65, 69] },
  { name: 'Bb', root: 34, quality: 'major', voicing: [62, 65, 70] },
  { name: 'Gm', root: 43, quality: 'minor', voicing: [62, 67, 70] },
  { name: 'A', root: 33, quality: 'major', voicing: [61, 64, 69] },
];

export const chordAt = (bar: number) => PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];

/**
 * The note a merge plays: a tone of the chord that's sounding right now, one step up the chord for every doubling.
 * So 2 + 2 plays the low root, a 2048 rings three octaves higher, and every merge is in tune with the music.
 */
export function mergeNote(value: number, chord: Chord): number {
  const k = Math.max(1, Math.round(Math.log2(value)) - 1); // 4 -> 1, 8 -> 2 … 2048 -> 10
  const tones = intervals(chord);
  const pc = chord.root % 12;
  const octave = 3 + Math.floor((k - 1) / 3);
  return 12 * (octave + 1) + pc + tones[(k - 1) % 3];
}

/** The arpeggio: chord tones climbing over two octaves and back, one per sixteenth. */
export function arpNote(step: number, chord: Chord): number {
  const pattern = [0, 1, 2, 3, 4, 5, 4, 3, 1, 2, 3, 4, 5, 6, 5, 2];
  const i = pattern[step % 16];
  const tones = intervals(chord);
  const base = 12 * 5 + (chord.root % 12); // the root in octave 4
  return base + tones[i % 3] + 12 * Math.floor(i / 3) - (chord.root % 12 > 7 ? 12 : 0);
}

/** Bass: eighth notes on the root, and a galloping rhythm once the music gets intense. */
export function bassHits(level: number): { step: number; octave: number; len: number }[] {
  if (level < 2) return [];
  if (level < 3) return [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, octave: step % 4 === 2 ? 1 : 0, len: 1.6 }));
  // gallop: an eighth and two sixteenths, like cavalry
  return [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15].map((step) => ({ step, octave: step === 4 || step === 12 ? 1 : 0, len: 0.9 }));
}

export type Drum = 'kick' | 'taiko' | 'taikoLow' | 'snare' | 'hat' | 'openHat';

/** Drum hits for one bar at a given intensity. Odd bars get a fill on the last beat. */
export function drumHits(level: number, bar: number): { step: number; drum: Drum; vel: number }[] {
  const hits: { step: number; drum: Drum; vel: number }[] = [];
  if (level >= 2) hits.push({ step: 0, drum: 'kick', vel: 0.9 }, { step: 8, drum: 'kick', vel: 0.75 });
  if (level >= 3) {
    // taiko-style war drums under a backbeat
    hits.push(
      { step: 0, drum: 'taikoLow', vel: 1 },
      { step: 3, drum: 'taiko', vel: 0.55 },
      { step: 6, drum: 'taiko', vel: 0.7 },
      { step: 10, drum: 'taikoLow', vel: 0.8 },
      { step: 4, drum: 'snare', vel: 0.8 },
      { step: 12, drum: 'snare', vel: 0.9 },
    );
    if (bar % 2 === 1)
      hits.push({ step: 13, drum: 'taiko', vel: 0.6 }, { step: 14, drum: 'taiko', vel: 0.75 }, { step: 15, drum: 'taiko', vel: 0.9 });
  }
  if (level >= 4) {
    for (let s = 0; s < 16; s += level >= 5 ? 1 : 2) hits.push({ step: s, drum: 'hat', vel: s % 4 === 2 ? 0.7 : 0.4 });
    hits.push({ step: 6, drum: 'kick', vel: 0.6 }, { step: 14, drum: 'openHat', vel: 0.5 });
  }
  return hits;
}

/** The theme, played by the lead at full intensity: [MIDI note, start sixteenth, length in sixteenths] per bar. */
export const THEME: [number, number, number][][] = [
  [
    [74, 0, 4],
    [69, 4, 4],
    [74, 8, 2],
    [76, 10, 2],
    [77, 12, 4],
  ], // Dm
  [
    [77, 0, 8],
    [76, 8, 4],
    [74, 12, 4],
  ], // Bb
  [
    [72, 0, 4],
    [77, 4, 4],
    [81, 8, 8],
  ], // F
  [
    [79, 0, 12],
    [76, 12, 4],
  ], // C
  [
    [77, 0, 4],
    [76, 4, 4],
    [74, 8, 4],
    [69, 12, 4],
  ], // Dm
  [
    [70, 0, 8],
    [74, 8, 8],
  ], // Bb
  [
    [79, 0, 4],
    [77, 4, 4],
    [76, 8, 4],
    [74, 12, 4],
  ], // Gm
  [
    [73, 0, 8],
    [76, 8, 4],
    [81, 12, 4],
  ], // A
];

/**
 * How intense the music is, from 0 (a soft pad) to 5 (everything), set by the biggest star on the board
 * compared with the board's goal. On 4×4: 16 brings the arpeggio, 64 the bass and drums, 256 the war drums,
 * 1024 the choir and 2048 the full theme.
 */
export function levelFor(top: number, target: number): number {
  const f = Math.log2(Math.max(2, top)) / Math.log2(target);
  const steps = [4 / 11, 6 / 11, 8 / 11, 10 / 11, 1];
  return steps.filter((s) => f >= s - 1e-9).length;
}

/** Which instruments play at each intensity, and how loud (0 to 1). */
export const MIX: Record<string, number[]> = {
  pad: [1, 1, 0.9, 0.85, 0.8, 0.8],
  arp: [0, 0.75, 0.85, 0.9, 0.9, 0.85],
  bass: [0, 0, 0.9, 1, 1, 1],
  drums: [0, 0, 0.75, 1, 1, 1],
  choir: [0, 0, 0, 0, 0.9, 1],
  lead: [0, 0, 0, 0, 0, 1],
};
