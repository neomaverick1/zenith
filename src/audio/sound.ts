// Everything you hear. The soundtrack is played live by a scheduler that looks a moment ahead and places every note
// on the beat. It has six layers that fade in as your biggest star grows, so the music builds with your game.
// Merges play bells tuned to the chord that's sounding, big merges add trailer-style hits, pausing muffles the
// music as if you'd stepped into another room, and reaching the goal sets off a supernova of sound.
import * as I from './instruments';
import { arpNote, BAR, bassHits, chordAt, drumHits, levelFor, mergeNote, MIX, STEP, THEME } from './theory';

type Layer = keyof typeof MIX;
const LAYERS = Object.keys(MIX) as Layer[];

interface LayerNodes {
  dry: GainNode;
  verb: GainNode;
  echo: GainNode;
  bus: I.Bus;
  on: number;
}

export interface MusicGraph {
  ctx: BaseAudioContext;
  pre: GainNode;
  layers: Record<Layer, LayerNodes>;
}

/** Builds the music's mixing desk: layers, a hall reverb and a ping-pong echo in time with the beat. */
export function musicGraph(ctx: BaseAudioContext, out: AudioNode): MusicGraph {
  const pre = ctx.createGain();
  pre.connect(out);
  const verbIn = ctx.createGain();
  const hall = ctx.createConvolver();
  hall.buffer = I.hall(ctx, 3.4, 2.4);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.85;
  verbIn.connect(hall).connect(verbOut).connect(pre);
  // ping-pong echo, a dotted eighth apart
  const echoIn = ctx.createGain();
  const dl = ctx.createDelay(2);
  const dr = ctx.createDelay(2);
  dl.delayTime.value = STEP * 3;
  dr.delayTime.value = STEP * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  const pl = ctx.createStereoPanner();
  pl.pan.value = -0.7;
  const pr = ctx.createStereoPanner();
  pr.pan.value = 0.7;
  echoIn.connect(tone).connect(dl);
  dl.connect(pl).connect(pre);
  dl.connect(dr);
  dr.connect(pr).connect(pre);
  dr.connect(fb).connect(dl);
  const layers = {} as Record<Layer, LayerNodes>;
  for (const l of LAYERS) {
    const dry = ctx.createGain();
    const verb = ctx.createGain();
    const echo = ctx.createGain();
    dry.gain.value = verb.gain.value = echo.gain.value = 0;
    dry.connect(pre);
    verb.connect(verbIn);
    echo.connect(echoIn);
    layers[l] = { dry, verb, echo, bus: { ctx, out: dry, verb, echo }, on: 0 };
  }
  return { ctx, pre, layers };
}

export function setLayers(g: MusicGraph, level: number, t: number, glide: number, lite = false, menu = false) {
  for (const l of LAYERS) {
    let v = l === 'choir' && lite ? 0 : MIX[l][Math.max(0, Math.min(5, level))];
    if (menu) v = l === 'pad' ? 0.9 : l === 'arp' ? 0.55 : 0;
    g.layers[l].on = v;
    for (const node of [g.layers[l].dry, g.layers[l].verb, g.layers[l].echo]) {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(v, t, glide);
    }
  }
}

/** Plays one sixteenth of the soundtrack at a given intensity. Used live and to render the music offline. */
export function playStep(g: MusicGraph, step: number, t: number, level: number, opts: { menu?: boolean; lite?: boolean } = {}) {
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const chord = chordAt(bar);
  const L = g.layers;
  const live = (l: Layer) => L[l].on > 0.001 || MIX[l][level] > 0;
  if (s === 0) {
    I.pad(L.pad.bus, t, BAR, chord.voicing, opts.menu ? 0.25 : 0.35 + level * 0.12);
    if (level >= 4 && live('choir') && !opts.lite) I.choir(L.choir.bus, t, BAR, chord.voicing);
    if (level >= 4 && bar % 2 === 0) I.stab(L.drums.bus, t, chord.voicing);
  }
  if (live('arp') && (level >= 1 || opts.menu)) {
    const every = opts.menu ? 4 : level >= 2 ? 1 : 2;
    if (s % every === 0) I.pluck(L.arp.bus, t, arpNote(s, chord), opts.menu ? 0.6 : s % 4 === 0 ? 1 : 0.7);
  }
  if (live('bass'))
    for (const h of bassHits(Math.max(level, 2)))
      if (h.step === s && level >= 2) I.bass(L.bass.bus, t, chord.root + 12 * h.octave, h.len * STEP * 4);
  if (live('drums')) for (const h of drumHits(level, bar)) if (h.step === s) I.drum(L.drums.bus, t, h.drum, h.vel);
  if (live('lead') && level >= 5)
    for (const [note, at, len] of THEME[bar % 8]) if (at === s) I.lead(L.lead.bus, t, note, len * STEP * 0.95);
}

export class Sound {
  ctx: AudioContext | null = null;
  private music?: MusicGraph;
  private musicFilter!: BiquadFilterNode;
  private duck!: GainNode;
  private musicVol!: GainNode;
  private sfxVol!: GainNode;
  private sfx!: I.Bus;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private startedAt = 0;
  private level = 0;
  private playing = 0; // the level the layers are set to
  private applied = ''; // the level and mode the layers were last set for
  private menu = true;
  private cap = 5; // zen keeps the music calm
  private hold = 0; // a pause in the music (after a supernova), in steps
  musicVolume = 0.7;
  sfxVolume = 0.85;
  lite = false;

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Starts sound. Browsers only allow this from a tap, so it's called from the first button press. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = 0.92;
    limiter.connect(master).connect(ctx.destination);
    this.musicVol = ctx.createGain();
    this.musicVol.gain.value = this.musicVolume ** 2;
    this.duck = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.8;
    this.musicFilter.connect(this.duck).connect(this.musicVol).connect(limiter);
    this.music = musicGraph(ctx, this.musicFilter);
    this.sfxVol = ctx.createGain();
    this.sfxVol.gain.value = this.sfxVolume ** 2;
    this.sfxVol.connect(limiter);
    const sfxDry = ctx.createGain();
    sfxDry.connect(this.sfxVol);
    const sfxVerbIn = ctx.createGain();
    const sfxHall = ctx.createConvolver();
    sfxHall.buffer = I.hall(ctx, 2.4, 2.8);
    sfxVerbIn.connect(sfxHall).connect(this.sfxVol);
    this.sfx = { ctx, out: sfxDry, verb: sfxVerbIn };
    this.startedAt = ctx.currentTime + 0.1;
    this.nextTime = this.startedAt;
    setLayers(this.music, 0, ctx.currentTime, 0.01, this.lite, this.menu);
    this.applied = `0|${this.menu}`;
    this.timer = window.setInterval(() => this.schedule(), 25);
    // phones can stop audio when a call comes in or the app goes to the background
    const wake = () => {
      if (this.ctx && this.ctx.state !== 'running' && document.visibilityState === 'visible') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.music || ctx.state !== 'running') return;
    // if the app was asleep, jump ahead instead of playing a burst of missed notes
    if (this.nextTime < ctx.currentTime - 0.2) {
      const skip = Math.ceil((ctx.currentTime - this.nextTime) / STEP);
      this.step += skip;
      this.nextTime += skip * STEP;
    }
    while (this.nextTime < ctx.currentTime + 0.15) {
      const s = this.step % 16;
      if (this.hold > 0) this.hold--;
      else {
        const want = Math.min(this.level, this.cap);
        const key = `${want}|${this.menu}`;
        if (s === 0 && key !== this.applied) {
          // new layers come in on the downbeat, with a hit to mark the moment
          if (want > this.playing && want >= 2 && !this.menu && this.playing >= 0)
            I.impact(this.music.layers.drums.bus, this.nextTime, 0.5);
          setLayers(this.music, want, this.nextTime, want > this.playing ? 0.5 : 0.9, this.lite, this.menu);
          this.playing = want;
          this.applied = key;
        }
        playStep(this.music, this.step, this.nextTime, this.playing, { menu: this.menu, lite: this.lite });
      }
      this.step++;
      this.nextTime += STEP;
    }
  }

  private now() {
    return this.ctx ? this.ctx.currentTime + 0.005 : 0;
  }
  private chord() {
    const bar = this.ctx ? Math.floor((this.ctx.currentTime - this.startedAt) / BAR) : 0;
    return chordAt(bar);
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicVol.gain.setTargetAtTime(music ** 2, this.ctx.currentTime, 0.05);
    this.sfxVol.gain.setTargetAtTime(sfx ** 2, this.ctx.currentTime, 0.05);
  }

  /** The title screen's music: just the pad and a slow arpeggio. */
  menuMusic() {
    this.menu = true;
    this.level = 0;
    this.cap = 5;
    this.clear();
  }
  /** Game music: intensity follows the biggest star. */
  gameMusic(top: number, target: number, zen = false) {
    this.menu = false;
    this.cap = zen ? 2 : 5;
    this.level = levelFor(top, target);
    this.clear();
  }
  follow(top: number, target: number) {
    this.level = levelFor(top, target);
  }

  /** Muffles the music, as if heard through a wall: for the pause menu and the end of a game. */
  muffle(on: boolean, deep = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setTargetAtTime(on ? (deep ? 420 : 900) : 20000, t, on ? 0.12 : 0.25);
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(on ? 0.55 : 1, t, 0.15);
  }
  clear() {
    this.muffle(false);
  }

  private duckFor(seconds: number, depth = 0.45) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(depth, t, 0.015);
    this.duck.gain.setTargetAtTime(1, t + seconds, 0.3);
  }

  suspend() {
    void this.ctx?.suspend();
  }
  resume() {
    if (this.ctx && document.visibilityState === 'visible') void this.ctx.resume();
  }

  // ---- effects -------------------------------------------------------------------------------------------------

  move(dir: 'up' | 'down' | 'left' | 'right') {
    if (!this.ready) return;
    I.whoosh(this.sfx, this.now(), dir === 'left' ? -1 : dir === 'right' ? 1 : 0, 0.8);
  }

  /** Merges in one move, smallest first, strummed like a harp and placed left to right where they happened. */
  merges(list: { value: number; c: number }[], n: number) {
    if (!this.ready || !list.length) return;
    const chord = this.chord();
    const t0 = this.now() + 0.07; // land with the slide
    list.forEach((m, i) => {
      const t = t0 + i * 0.035;
      const pan = n > 1 ? (m.c / (n - 1)) * 1.2 - 0.6 : 0;
      const note = mergeNote(m.value, chord);
      I.bell(this.sfx, t, note, Math.min(1, 0.55 + Math.log2(m.value) * 0.05), pan);
      if (m.value >= 256) I.shimmer(this.sfx, t, note);
    });
    const top = list[list.length - 1].value;
    if (top >= 512) {
      I.impact(this.sfx, t0, top >= 1024 ? 1.1 : 0.7);
      this.duckFor(0.4, 0.5);
    }
    if (top >= 1024) I.braam(this.sfx, t0, chord.root);
    if (list.length >= 3) {
      // a rising flourish for a chain reaction
      const tones = chord.voicing;
      [0, 1, 2, 3].forEach((k) => I.blip(this.sfx, t0 + 0.12 + k * 0.05, tones[k % 3] + 24 + (k === 3 ? 12 : 0), 0.035));
    }
  }

  spawn(c: number, n: number) {
    if (!this.ready) return;
    const chord = this.chord();
    I.tick(this.sfx, this.now() + 0.12, chord.voicing[2] + 24, n > 1 ? (c / (n - 1)) * 0.8 - 0.4 : 0);
  }

  blocked() {
    if (this.ready) I.thud(this.sfx, this.now());
  }
  undo() {
    if (this.ready) I.rewind(this.sfx, this.now());
  }
  click() {
    if (this.ready) I.blip(this.sfx, this.now(), 84, 0.04);
  }
  toggle(on: boolean) {
    if (!this.ready) return;
    const t = this.now();
    I.blip(this.sfx, t, on ? 79 : 84, 0.04);
    I.blip(this.sfx, t + 0.06, on ? 86 : 74, 0.04);
  }
  /** Volume sliders play a note at the new loudness, so you hear what you're setting. */
  preview(kind: 'music' | 'sfx') {
    if (!this.ready) return;
    if (kind === 'sfx') I.bell(this.sfx, this.now(), mergeNote(64, this.chord()), 0.8, 0);
  }

  newBest() {
    if (!this.ready) return;
    const t = this.now() + 0.25;
    const v = this.chord().voicing;
    [v[0] + 24, v[1] + 24, v[2] + 24, v[0] + 36].forEach((m, i) => I.blip(this.sfx, t + i * 0.07, m, 0.035));
  }

  achievement() {
    if (!this.ready) return;
    const t = this.now();
    [74, 78, 81, 86].forEach((m, i) => I.bell(this.sfx, t + i * 0.09, m, 0.6, -0.3 + i * 0.2));
  }

  /** The end of a game: a falling arpeggio while the music sinks underwater. */
  gameOver() {
    if (!this.ctx) return;
    this.muffle(true, true);
    this.level = 0;
    if (!this.ready) return;
    const t = this.now() + 0.15;
    [69, 65, 62, 57].forEach((m, i) => I.bell(this.sfx, t + i * 0.22, m, 0.6, 0));
  }

  /**
   * Reaching the goal: the music stops dead, a cinematic hit and a trailer horn land, a choir swells on a major
   * chord, and the full soundtrack comes back in two bars later at its peak.
   */
  supernova() {
    if (!this.ready || !this.music || !this.ctx) return;
    const t = this.now();
    const g = this.music;
    for (const l of LAYERS) for (const node of [g.layers[l].dry, g.layers[l].verb, g.layers[l].echo]) node.gain.setTargetAtTime(0, t, 0.03);
    this.playing = -1;
    this.applied = '';
    this.hold = Math.ceil((BAR * 2 - ((t - this.startedAt) % BAR)) / STEP); // back on a downbeat, two bars on
    I.impact(this.sfx, t, 1.6);
    I.braam(this.sfx, t, 38);
    I.choir(this.sfx, t + 0.15, BAR * 1.6, [62, 66, 69]); // D major, the bright ending of a minor key
    I.shimmer(this.sfx, t + 0.3, 74);
    I.riser(this.sfx, t + BAR * 2 - BAR, BAR - 0.05, 0.12);
    this.level = 5;
  }

  stop() {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }
}

export const sound = new Sound();
