// The living background: a slowly drifting nebula and a field of twinkling stars, drawn on the graphics chip. It
// warms from deep blue toward violet and gold as your biggest star grows, every merge sends a shockwave through
// space from where it happened, and a supernova floods it with light. Drawn at a fraction of the screen's
// resolution and stretched, which keeps it smooth on phones without looking any different.

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uHeat;
uniform float uFlash;
uniform vec4 uRip[8];
uniform vec3 uTint[8];

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vUv - 0.5;
  p.x *= aspect;
  vec2 warp = vec2(0.0);
  vec3 ringLight = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 3.0) continue;
    vec2 c = r.xy - 0.5;
    c.x *= aspect;
    vec2 d = p - c;
    float dist = length(d);
    float radius = age * (0.5 + 0.25 * r.w);
    float ring = exp(-pow((dist - radius) * (16.0 - 6.0 * min(r.w, 1.0)), 2.0));
    float fade = exp(-age * 1.35) * r.w;
    warp += d / (dist + 0.001) * ring * fade * 0.045;
    ringLight += uTint[i] * ring * fade * 0.55;
  }
  p -= warp;
  float t = uTime * 0.018;
  float n = fbm(p * 1.8 + vec2(t, -t * 0.6));
  float n2 = fbm(p * 3.4 - vec2(t * 0.7, t) + n * 1.4);
  // cold palette (deep space) and hot palette (a heating sky), blended by how far the game has come
  vec3 c1 = mix(vec3(0.020, 0.024, 0.075), vec3(0.055, 0.018, 0.070), uHeat);
  vec3 c2 = mix(vec3(0.090, 0.110, 0.300), vec3(0.330, 0.090, 0.300), uHeat);
  vec3 c3 = mix(vec3(0.150, 0.420, 0.620), vec3(0.980, 0.560, 0.250), uHeat);
  vec3 col = mix(c1, c2, smoothstep(0.30, 0.85, n));
  col = mix(col, c3, smoothstep(0.58, 1.05, n2) * (0.55 + 0.25 * uHeat));
  col *= 0.65 + 0.55 * n2;
  // stars, twinkling at their own pace
  vec2 sp = vUv * uRes / 2.2;
  vec2 cell = floor(sp);
  float h = hash(cell);
  vec2 f = fract(sp) - 0.5 + (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
  float tw = 0.55 + 0.45 * sin(uTime * (0.6 + h * 2.4) + h * 60.0);
  float st = step(0.982, h) * tw * smoothstep(0.24, 0.0, length(f));
  col += st * mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash(cell + 1.3));
  col += ringLight;
  // vignette, then the supernova's flash
  vec2 v = vUv - 0.5;
  col *= 1.0 - 0.75 * dot(v, v);
  col = mix(col, vec3(1.0, 0.97, 0.92), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Nebula {
  private gl: WebGLRenderingContext | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private ripples: { x: number; y: number; t: number; s: number; rgb: [number, number, number] }[] = [];
  private t0 = performance.now();
  private heat = 0;
  private heatTarget = 0;
  private flash = 0;
  private last = 0;
  scale = 0.5;
  fps = 60;
  running = false;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const name of ['uRes', 'uTime', 'uHeat', 'uFlash', 'uRip', 'uTint']) this.u[name] = gl.getUniformLocation(prog, name);
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  }

  get ok() {
    return !!this.gl;
  }

  private resize() {
    const c = this.canvas;
    const w = Math.max(1, Math.round(c.clientWidth * Math.min(2, devicePixelRatio) * this.scale));
    const h = Math.max(1, Math.round(c.clientHeight * Math.min(2, devicePixelRatio) * this.scale));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      this.gl?.viewport(0, 0, w, h);
    }
  }

  setHeat(h: number) {
    this.heatTarget = h;
  }

  /** A shockwave from a point on screen (0 to 1 across and down), as strong as `s`, tinted with a star's color. */
  ripple(x: number, y: number, s: number, hex = '#ffffff') {
    const n = parseInt(hex.slice(1), 16);
    const rgb: [number, number, number] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    this.ripples.push({ x, y: 1 - y, t: this.now(), s, rgb });
    if (this.ripples.length > 8) this.ripples.shift();
  }

  supernova() {
    this.flash = 1;
  }

  private now() {
    return (performance.now() - this.t0) / 1000;
  }

  private frame = (ms: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (ms - this.last < 1000 / this.fps - 2) return;
    this.last = ms;
    this.draw();
  };

  draw() {
    const gl = this.gl;
    if (!gl) return;
    this.resize();
    const t = this.now();
    this.heat += (this.heatTarget - this.heat) * 0.02;
    this.flash *= 0.93;
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uHeat, this.heat);
    gl.uniform1f(this.u.uFlash, this.flash > 0.01 ? this.flash : 0);
    const rip = new Float32Array(32);
    const tint = new Float32Array(24);
    this.ripples = this.ripples.filter((r) => t - r.t < 3);
    this.ripples.forEach((r, i) => {
      rip.set([r.x, r.y, r.t, r.s], i * 4);
      tint.set(r.rgb, i * 3);
    });
    gl.uniform4fv(this.u.uRip, rip);
    gl.uniform3fv(this.u.uTint, tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  start() {
    if (this.running || !this.gl) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
