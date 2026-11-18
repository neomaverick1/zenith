// The instruments, built from oscillators, noise and filters. No sound files: every note is made the moment it
// plays. Each one takes the time to play at and where to send its sound, so the same code plays live and can be
// rendered offline to check the mix.

export interface Bus {
  ctx: BaseAudioContext;
  out: AudioNode; // dry
  verb: AudioNode; // reverb send
  echo?: AudioNode; // delay send
}

let noiseCache: WeakMap<BaseAudioContext, AudioBuffer> = new WeakMap();
export function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}
export const resetNoise = () => (noiseCache = new WeakMap());

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function env(ctx: BaseAudioContext, t: number, peak: number, a: number, d: number, sustain = 0, hold = 0, r = 0.05): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  if (sustain > 0) {
    g.gain.exponentialRampToValueAtTime(Math.max(peak * sustain, 0.0002), t + a + d);
    g.gain.setValueAtTime(Math.max(peak * sustain, 0.0002), t + a + d + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
  } else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  return g;
}

function send(bus: Bus, node: AudioNode, dry = 1, verb = 0, echo = 0) {
  if (dry) {
    const g = bus.ctx.createGain();
    g.gain.value = dry;
    node.connect(g).connect(bus.out);
  }
  if (verb) {
    const g = bus.ctx.createGain();
    g.gain.value = verb;
    node.connect(g).connect(bus.verb);
  }
  if (echo && bus.echo) {
    const g = bus.ctx.createGain();
    g.gain.value = echo;
    node.connect(g).connect(bus.echo);
  }
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, stop: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.setValueAtTime(detune, t);
  o.start(t);
  o.stop(stop);
  return o;
}

/** A wide, warm pad: two detuned saws per note through a soft filter, fading in slowly and overlapping the next chord. */
export function pad(bus: Bus, t: number, dur: number, notes: number[], bright: number) {
  const ctx = bus.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(500 + bright * 2200, t);
  f.frequency.linearRampToValueAtTime(700 + bright * 2600, t + dur * 0.6);
  f.Q.value = 0.6;
  const g = ctx.createGain();
  const peak = 0.2 / notes.length;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.9);
  g.gain.setValueAtTime(peak, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.1);
  for (const n of notes) for (const d of [-9, 9]) osc(ctx, 'sawtooth', hz(n), t, t + dur + 1.2, d).connect(f);
  // a soft octave below gives it body
  osc(ctx, 'triangle', hz(notes[0] - 12), t, t + dur + 1.2).connect(f);
  f.connect(g);
  send(bus, g, 0.8, 0.55);
}

/** A choir: a buzzing tone shaped by the formants of an "ah" vowel, with a slow vibrato. */
export function choir(bus: Bus, t: number, dur: number, notes: number[]) {
  const ctx = bus.ctx;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.18, t + 1.4);
  g.gain.setValueAtTime(0.18, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.4);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vibAmt = ctx.createGain();
  vibAmt.gain.value = 9;
  vib.connect(vibAmt);
  vib.start(t);
  vib.stop(t + dur + 1.5);
  for (const n of notes) {
    const o = osc(ctx, 'sawtooth', hz(n + 12), t, t + dur + 1.5, Math.random() * 6 - 3);
    vibAmt.connect(o.detune);
    for (const [fr, q, amt] of [
      [800, 9, 1],
      [1150, 10, 0.6],
      [2900, 12, 0.25],
    ]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = q;
      const a = ctx.createGain();
      a.gain.value = amt;
      o.connect(bp).connect(a).connect(g);
    }
  }
  send(bus, g, 0.6, 0.9);
}

/** A bright pluck for the arpeggio, echoing in time with the beat. */
export function pluck(bus: Bus, t: number, note: number, vel: number) {
  const ctx = bus.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(4200, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.22);
  f.Q.value = 2;
  const g = env(ctx, t, 0.21 * vel, 0.004, 0.32);
  osc(ctx, 'sawtooth', hz(note), t, t + 0.4, 4).connect(f);
  osc(ctx, 'triangle', hz(note), t, t + 0.4, -4).connect(f);
  f.connect(g);
  send(bus, g, 0.75, 0.3, 0.32);
}

/** Bass: a saw for bite and a sine for weight. */
export function bass(bus: Bus, t: number, note: number, len: number) {
  const ctx = bus.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(220, t + 0.25);
  f.Q.value = 3;
  const g = env(ctx, t, 0.12, 0.006, 0.08, 0.7, len * 0.15, 0.08);
  osc(ctx, 'sawtooth', hz(note), t, t + len * 0.3 + 0.3).connect(f);
  f.connect(g);
  const sub = env(ctx, t, 0.15, 0.006, 0.1, 0.8, len * 0.15, 0.1);
  osc(ctx, 'sine', hz(note - 12 < 24 ? note : note - 12), t, t + len * 0.3 + 0.3).connect(sub);
  send(bus, g, 1, 0.05);
  send(bus, sub, 1);
}

/** Drums, all synthesized: a punchy kick, deep taiko-style war drums, a big snare and hi-hats. */
export function drum(bus: Bus, t: number, kind: string, vel: number) {
  const ctx = bus.ctx;
  if (kind === 'kick' || kind === 'taiko' || kind === 'taikoLow') {
    const [from, to, len, peak, verb] =
      kind === 'kick' ? [150, 44, 0.42, 0.4, 0.05] : kind === 'taikoLow' ? [118, 52, 0.9, 0.42, 0.55] : [175, 82, 0.6, 0.3, 0.5];
    const o = ctx.createOscillator();
    o.type = kind === 'kick' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + (kind === 'kick' ? 0.11 : 0.22));
    o.start(t);
    o.stop(t + len + 0.05);
    const g = env(ctx, t, peak * vel, 0.002, len);
    o.connect(g);
    send(bus, g, 1, verb);
    // the stick's attack
    const n = ctx.createBufferSource();
    n.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = kind === 'kick' ? 'highpass' : 'lowpass';
    f.frequency.value = kind === 'kick' ? 3000 : 1400;
    const ng = env(ctx, t, (kind === 'kick' ? 0.08 : 0.22) * vel, 0.001, kind === 'kick' ? 0.02 : 0.12);
    n.connect(f).connect(ng);
    n.start(t, Math.random());
    n.stop(t + 0.2);
    send(bus, ng, 1, verb);
    return;
  }
  if (kind === 'snare') {
    const n = ctx.createBufferSource();
    n.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const g = env(ctx, t, 0.22 * vel, 0.002, 0.24);
    n.connect(bp).connect(g);
    n.start(t, Math.random());
    n.stop(t + 0.3);
    const body = env(ctx, t, 0.12 * vel, 0.002, 0.11);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    o.start(t);
    o.stop(t + 0.15);
    o.connect(body);
    send(bus, g, 0.9, 0.7);
    send(bus, body, 1, 0.4);
    return;
  }
  // hats
  const open = kind === 'openHat';
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  const g = env(ctx, t, (open ? 0.07 : 0.05) * vel, 0.001, open ? 0.28 : 0.045);
  n.connect(hp).connect(g);
  n.start(t, Math.random());
  n.stop(t + (open ? 0.35 : 0.08));
  send(bus, g, 1, 0.15);
}

/** The lead for the theme: a heroic, brassy synth with vibrato that blooms on long notes. */
export function lead(bus: Bus, t: number, note: number, len: number) {
  const ctx = bus.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.linearRampToValueAtTime(3200, t + 0.08);
  f.frequency.exponentialRampToValueAtTime(1800, t + Math.max(0.2, len));
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.04);
  g.gain.setValueAtTime(0.1, t + len * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.18);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.5;
  const va = ctx.createGain();
  va.gain.setValueAtTime(0, t);
  va.gain.linearRampToValueAtTime(len > 0.5 ? 14 : 0, t + Math.min(0.5, len));
  vib.connect(va);
  vib.start(t);
  vib.stop(t + len + 0.25);
  for (const [type, d] of [
    ['sawtooth', -7],
    ['sawtooth', 7],
    ['square', 0],
  ] as const) {
    const o = osc(ctx, type, hz(note), t, t + len + 0.25, d);
    va.connect(o.detune);
    o.connect(f);
  }
  f.connect(g);
  send(bus, g, 0.8, 0.45, 0.25);
}

/** A short brass-like chord hit on the first beat of the bar at high intensity. */
export function stab(bus: Bus, t: number, notes: number[]) {
  const ctx = bus.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
  f.frequency.exponentialRampToValueAtTime(600, t + 0.5);
  const g = env(ctx, t, 0.09, 0.01, 0.12, 0.5, 0.2, 0.35);
  for (const n of notes) for (const d of [-6, 6]) osc(ctx, 'sawtooth', hz(n - 12), t, t + 1, d).connect(f);
  f.connect(g);
  send(bus, g, 0.8, 0.6);
}

/** A rising sweep of noise and tone that builds into the next section. */
export function riser(bus: Bus, t: number, dur: number, peak = 0.18) {
  const ctx = bus.ctx;
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  n.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  n.connect(bp).connect(g);
  n.start(t);
  n.stop(t + dur + 0.1);
  send(bus, g, 1, 0.5);
}

/** A cinematic hit: a deep falling boom, a burst of air and a long tail. */
export function impact(bus: Bus, t: number, size: number) {
  const ctx = bus.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 1.4 * size);
  o.start(t);
  o.stop(t + 1.8 * size + 0.1);
  const g = env(ctx, t, 0.55 * Math.min(1, size), 0.004, 1.6 * size);
  o.connect(g);
  send(bus, g, 1, 0.3);
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(6000, t);
  lp.frequency.exponentialRampToValueAtTime(150, t + 1.2 * size);
  const ng = env(ctx, t, 0.3 * Math.min(1, size), 0.002, 1.3 * size);
  n.connect(lp).connect(ng);
  n.start(t, Math.random());
  n.stop(t + 1.5 * size + 0.1);
  send(bus, ng, 0.8, 0.9);
}

/** The deep, distorted horn blast you hear in movie trailers. Saved for the biggest merges. */
export function braam(bus: Bus, t: number, root: number) {
  const ctx = bus.ctx;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.6);
  }
  shaper.curve = curve;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 4;
  f.frequency.setValueAtTime(140, t);
  f.frequency.exponentialRampToValueAtTime(1300, t + 0.35);
  f.frequency.exponentialRampToValueAtTime(220, t + 2.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.06);
  g.gain.setValueAtTime(0.16, t + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  for (const n of [root - 24, root - 12, root - 5])
    for (const d of [-12, 0, 12]) osc(ctx, 'sawtooth', hz(n), t, t + 2.7, d).connect(shaper);
  shaper.connect(f).connect(g);
  send(bus, g, 0.9, 0.7);
}

/** The merge sound: an FM bell with a soft body, pitched to the chord that's playing. */
export function bell(bus: Bus, t: number, note: number, vel: number, pan: number) {
  const ctx = bus.ctx;
  const f = hz(note);
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * 3.5;
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(f * 2.4, t);
  idx.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.9);
  mod.connect(idx).connect(car.frequency);
  const g = env(ctx, t, 0.4 * vel, 0.003, 1.5);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  car.connect(g).connect(p);
  car.start(t);
  mod.start(t);
  car.stop(t + 1.6);
  mod.stop(t + 1.6);
  // a warm sine under it
  const body = env(ctx, t, 0.14 * vel, 0.004, 0.6);
  osc(ctx, 'sine', f, t, t + 0.7)
    .connect(body)
    .connect(p);
  send(bus, p, 1, 0.38);
}

/** A shimmer of octaves that blooms after a big merge. */
export function shimmer(bus: Bus, t: number, note: number) {
  const ctx = bus.ctx;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.045, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  for (const k of [12, 19, 24]) osc(ctx, 'sine', hz(note + k), t, t + 2.3, Math.random() * 8 - 4).connect(g);
  send(bus, g, 0.4, 1);
}

/** The swipe: a quick breath of filtered air, panned the way the stars move. */
export function whoosh(bus: Bus, t: number, pan: number, vel = 1) {
  const ctx = bus.ctx;
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
  const g = env(ctx, t, 0.14 * vel, 0.02, 0.13);
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(-pan * 0.6, t);
  p.pan.linearRampToValueAtTime(pan * 0.6, t + 0.14);
  n.connect(bp).connect(g).connect(p);
  n.start(t, Math.random());
  n.stop(t + 0.2);
  send(bus, p, 1, 0.08);
}

/** A tiny glassy tap when a new star appears. */
export function tick(bus: Bus, t: number, note: number, pan: number) {
  const ctx = bus.ctx;
  const g = env(ctx, t, 0.055, 0.002, 0.12);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  osc(ctx, 'sine', hz(note), t, t + 0.15)
    .connect(g)
    .connect(p);
  send(bus, p, 1, 0.25);
}

/** A soft, muted knock when a swipe can't move anything. */
export function thud(bus: Bus, t: number) {
  const ctx = bus.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
  o.start(t);
  o.stop(t + 0.2);
  const g = env(ctx, t, 0.22, 0.003, 0.16);
  o.connect(g);
  send(bus, g, 1, 0.05);
}

/** A short blip for buttons; two blips for switches turning on or off. */
export function blip(bus: Bus, t: number, note: number, vol = 0.05) {
  const ctx = bus.ctx;
  const g = env(ctx, t, vol, 0.002, 0.08);
  osc(ctx, 'sine', hz(note), t, t + 0.1).connect(g);
  osc(ctx, 'triangle', hz(note + 12), t, t + 0.06)
    .connect(env(ctx, t, vol * 0.3, 0.001, 0.04))
    .connect(g);
  send(bus, g, 1, 0.15);
}

/** Undo: the sound of time running backwards, a sweep falling as the board rewinds. */
export function rewind(bus: Bus, t: number) {
  const ctx = bus.ctx;
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(3000, t);
  bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  n.connect(bp).connect(g);
  n.start(t, Math.random());
  n.stop(t + 0.35);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(300, t + 0.28);
  o.start(t);
  o.stop(t + 0.3);
  const og = env(ctx, t, 0.04, 0.2, 0.08);
  o.connect(og);
  send(bus, g, 1, 0.3);
  send(bus, og, 1, 0.3);
}

/** A stereo hall, made from shaped noise, so no reverb file is needed. */
export function hall(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // a short gap, then a dense tail that darkens as it fades
      d[i] = i < ctx.sampleRate * 0.012 ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - x, decay) * (0.6 + 0.4 * (1 - x));
    }
  }
  return b;
}
