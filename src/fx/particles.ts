// Sparks: glowing particles that burst out of a merge in the star's own color, drawn with additive light so
// overlapping sparks glow brighter. Only runs while sparks are alive.

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  sprite: HTMLCanvasElement;
  streak: boolean;
}

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(color: string): HTMLCanvasElement {
  let s = sprites.get(color);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.5, color + '55');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprites.set(color, s);
  return s;
}

export class Sparks {
  private ctx: CanvasRenderingContext2D | null;
  private ps: P[] = [];
  private raf = 0;
  private last = 0;
  density = 1;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  private fit() {
    const dpr = Math.min(2, devicePixelRatio);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return dpr;
  }

  /** A burst at a point on screen (CSS pixels), sized to the merge. */
  burst(x: number, y: number, color: string, power: number) {
    if (!this.ctx || this.density <= 0) return;
    const count = Math.round((10 + power * 26) * this.density);
    const sp = sprite(color);
    const white = sprite('#ffffff');
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (60 + Math.random() * 260) * (0.6 + power * 0.7);
      const life = 0.35 + Math.random() * 0.55 + power * 0.25;
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        max: life,
        size: 6 + Math.random() * 14 * (0.6 + power * 0.5),
        sprite: Math.random() < 0.18 ? white : sp,
        streak: Math.random() < 0.35,
      });
    }
    if (this.ps.length > 900) this.ps.splice(0, this.ps.length - 900);
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (ms: number) => {
    const ctx = this.ctx!;
    const dt = Math.min(0.05, (ms - this.last) / 1000);
    this.last = ms;
    const dpr = this.fit();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const drag = Math.pow(0.04, dt);
    this.ps = this.ps.filter((p) => (p.life -= dt) > 0);
    for (const p of this.ps) {
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const s = p.size * (0.4 + 0.6 * k);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.streak) {
        // stretch the spark along its path for a sense of speed
        const ang = Math.atan2(p.vy, p.vx);
        const len = Math.min(5, 1 + Math.hypot(p.vx, p.vy) / 80);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.drawImage(p.sprite, (-s * len) / 2, -s / 4, s * len, s / 2);
        ctx.restore();
      } else ctx.drawImage(p.sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    if (this.ps.length) this.raf = requestAnimationFrame(this.tick);
    else {
      this.raf = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  };
}
