import { describe, expect, it } from 'vitest';

import { arpNote, bassHits, chordAt, drumHits, intervals, levelFor, mergeNote, MIX, PROGRESSION, THEME } from './theory';

const pcs = (chordIndex: number) => {
  const c = PROGRESSION[chordIndex];
  return intervals(c).map((i) => (c.root + i) % 12);
};

describe('the soundtrack', () => {
  it('every merge note is a tone of the chord that’s playing, so merges are always in tune', () => {
    PROGRESSION.forEach((chord, i) => {
      for (let v = 4; v <= 65536; v *= 2) expect(pcs(i)).toContain(mergeNote(v, chord) % 12);
    });
  });
  it('bigger stars ring higher, from about 150 Hz up to about 1.5 kHz at 2048', () => {
    const notes = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048].map((v) => mergeNote(v, PROGRESSION[0]));
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
    expect(notes[0]).toBe(50); // D3
    expect(notes[9]).toBe(86); // D6
  });
  it('the arpeggio and the pad only use chord tones', () => {
    PROGRESSION.forEach((chord, i) => {
      for (let s = 0; s < 16; s++) expect(pcs(i)).toContain(arpNote(s, chord) % 12);
      for (const n of chord.voicing) expect(pcs(i)).toContain(n % 12);
    });
  });
  it('the theme’s long notes land on chord tones', () => {
    THEME.forEach((bar, i) => {
      for (const [note, , len] of bar) if (len >= 8) expect(pcs(i)).toContain(note % 12);
    });
  });
  it('loops every eight bars', () => {
    expect(chordAt(8).name).toBe('Dm');
    expect(chordAt(-1).name).toBe('A');
  });
  it('builds up with the biggest star: 16 adds the arpeggio, 64 drums, 256 war drums, 1024 choir, 2048 everything', () => {
    expect([2, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 8192].map((v) => levelFor(v, 2048))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 5]);
    expect(levelFor(256, 256)).toBe(5);
  });
  it('quiet levels have no drums or bass and the top level has everything', () => {
    expect(bassHits(1)).toEqual([]);
    expect(drumHits(1, 0)).toEqual([]);
    expect(drumHits(5, 1).length).toBeGreaterThan(20);
    for (const parts of Object.values(MIX)) expect(parts.length).toBe(6);
    expect(Object.values(MIX).every((p) => p[5] > 0)).toBe(true);
  });
});
