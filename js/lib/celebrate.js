// js/lib/celebrate.js
// ─────────────────────────────────────────────────────────────────────────────
// Reusable, dependency-free celebration animations built on a single overlay
// <canvas> particle engine (neon fireworks + confetti). Two moments use it:
//
//   • celebrateModal()     — the registration success popup: neon animated
//                            border + glow, fireworks/confetti, and the finish
//                            button pulses until it's clicked.
//   • celebrateQrLanding() — a visitor who arrives via the event QR code: the
//                            page blurs, fireworks play, the register button
//                            glows + pulses, then everything fades back to
//                            normal.
//
// Everything respects prefers-reduced-motion (the canvas never starts; CSS
// neutralises the keyframes and leaves a gentle static emphasis instead) and
// cleans up after itself. Particle counts scale down on phones for smooth
// 60fps on both desktop and mobile.
// ─────────────────────────────────────────────────────────────────────────────

// "Illumination Station" rainbow — the saturated paper-strip burst from the VBS
// artwork (magenta → purple → blue → cyan → green → lime → yellow → orange → red),
// plus white for the bright sparkles at the centre of the light.
const PALETTE = [
  '#ff2d9b', '#c026ff', '#7b3ff2', '#2b8cff', '#18d6e0',
  '#3ddc4a', '#b6e21a', '#ffe11a', '#ff8a1e', '#ff3b3b',
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

// Lighter load on small / low-DPI screens so the animation stays smooth.
function autoDensity() {
  return window.innerWidth < 600 ? 0.6 : 1;
}

// ─── Particle engine ─────────────────────────────────────────────────────────
// One fixed, full-viewport canvas. `pointer-events:none` (set in CSS) keeps the
// button it celebrates fully clickable. After `duration` it stops launching and
// lets the last particles settle, then fades the canvas out and removes it.
class CelebrationShow {
  constructor({ host = document.body, confetti = true, density = 1 } = {}) {
    this.host = host;
    this.confettiOn = confetti;
    this.density = density;
    this.rockets = [];
    this.sparks = [];
    this.confetti = [];
    this.running = false;
    this._fading = false;
    this._raf = 0;
    this._fadeTimer = 0;
    this._prev = 0;
    this._lastLaunch = 0;
    this._lastConfetti = 0;
    this._endAt = 0;

    const c = document.createElement('canvas');
    c.className = 'celebrate-canvas';
    c.setAttribute('aria-hidden', 'true');
    c.style.position = 'fixed';
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this._onResize = () => this._resize();
  }

  start(duration = 4000) {
    if (this.running) return;
    this.running = true;
    this.host.appendChild(this.canvas);
    this._resize();
    window.addEventListener('resize', this._onResize);
    const now = performance.now();
    this._prev = now;
    this._endAt = now + duration;
    if (this.confettiOn) this._burstConfetti(Math.round(80 * this.density));
    this._raf = requestAnimationFrame((t) => this._loop(t));
  }

  stop() {
    if (!this.running || this._fading) return;
    this._fading = true;
    // Keep the loop running so particles keep drifting + fading naturally while
    // the whole canvas eases to transparent — no frozen frame, no abrupt cut.
    this.canvas.style.transition = 'opacity 1.25s cubic-bezier(.33, 1, .68, 1)';
    this.canvas.style.opacity = '0';
    this._fadeTimer = setTimeout(() => this._teardown(), 1300);
  }

  _teardown() {
    this.running = false;
    this._fading = false;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._fadeTimer);
    window.removeEventListener('resize', this._onResize);
    this.canvas.remove();
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _loop(t) {
    this._raf = requestAnimationFrame((nt) => this._loop(nt));
    // Delta in 60fps "frames", capped so a background-tab stall can't teleport
    // every particle across the screen on resume.
    const dt = Math.min((t - this._prev) / 16.67, 2.5);
    this._prev = t;

    const launching = t < this._endAt;
    if (launching) {
      if (t - this._lastLaunch > 360 / this.density) {
        this._lastLaunch = t;
        this._spawnRocket();
        if (Math.random() < 0.4) this._spawnRocket();
      }
      // A light, steady confetti drizzle for the longer (modal) celebration.
      if (this.confettiOn && t - this._lastConfetti > 700) {
        this._lastConfetti = t;
        this._burstConfetti(Math.round(14 * this.density));
      }
    }

    this._update(dt);
    this._render();

    const settled = !this.rockets.length && !this.sparks.length && !this.confetti.length;
    if ((!launching && settled) || t > this._endAt + 6000) this.stop();
  }

  _spawnRocket() {
    this.rockets.push({
      x: rand(this.w * 0.15, this.w * 0.85),
      y: this.h + 10,
      vx: rand(-0.6, 0.6),
      vy: -rand(9, 13),
      targetY: rand(this.h * 0.12, this.h * 0.45),
      color: pick(PALETTE),
    });
  }

  _explode(x, y, color) {
    const n = Math.round(rand(34, 54) * this.density);
    const speed = rand(2.6, 4.6);
    // Multi-colour bursts (like the artwork's rainbow starburst) most of the
    // time; occasionally a single-hue burst for variety.
    const rainbow = Math.random() < 0.7;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rand(-0.12, 0.12);
      const sp = speed * rand(0.45, 1);
      // ~72% of fragments are elongated paper "strips" that radiate outward —
      // the signature look of the Illumination Station burst; the rest are
      // round white-ish sparkles for the glowing centre.
      const strip = Math.random() < 0.72;
      const col = strip
        ? (rainbow ? pick(PALETTE) : color)
        : (Math.random() < 0.5 ? '#ffffff' : pick(PALETTE));
      this.sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.7, 1),
        size: strip ? rand(2, 3.4) : rand(1.6, 2.6),
        strip,
        color: col,
      });
    }
  }

  _burstConfetti(n) {
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: rand(0, this.w),
        y: rand(-this.h * 0.45, -10),
        vx: rand(-0.6, 0.6),
        vy: rand(1.4, 3.2),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.2, 0.2),
        w: rand(5, 9),
        h: rand(7, 13),
        sway: rand(0, 1000),
        color: pick(PALETTE),
      });
    }
  }

  _update(dt) {
    // Rockets — rise, then burst at apex (or once they reach their target).
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vy += 0.16 * dt;
      if (r.vy >= -1.5 || r.y <= r.targetY) {
        this._explode(r.x, r.y, r.color);
        this.rockets.splice(i, 1);
      }
    }
    // Sparks — drift, gravity, friction, fade.
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.vx *= 0.985; s.vy *= 0.985;
      s.vy += 0.05 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= 0.018 * dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    // Confetti — fall with a gentle sway + spin, removed once off-screen.
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.vy += 0.03 * dt;
      c.x += (c.vx + Math.sin((c.y + c.sway) * 0.02) * 0.6) * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > this.h + 40) this.confetti.splice(i, 1);
    }
  }

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Confetti (normal blending).
    for (const c of this.confetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }

    // Sparks + rocket heads. Normal blending (not additive) so the vivid
    // rainbow strips stay visible over the light modal surface as well as the
    // dark QR veil; the glow comes from shadowBlur.
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life));
      ctx.fillStyle = s.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = s.color;
      if (s.strip) {
        // Elongated paper strip, drawn along its direction of travel — length
        // tracks speed so fragments streak out from the centre then shrink.
        const sp = Math.hypot(s.vx, s.vy);
        const len = Math.max(6, sp * 4.2);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(Math.atan2(s.vy, s.vx));
        ctx.fillRect(-len / 2, -s.size / 2, len, s.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const r of this.rockets) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = r.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ─── Public helpers ──────────────────────────────────────────────────────────

// Success popup. Adds the neon animated border + glow to `modal`, makes `button`
// pulse (it keeps pulsing until the user clicks it — i.e. leaves the screen),
// and rains fireworks/confetti over the modal. Returns a cleanup function.
export function celebrateModal({ modal, button, duration = 5200 } = {}) {
  if (modal) modal.classList.add('sw-modal--celebrate');
  if (button) button.classList.add('sw-btn--pulse');

  let show = null;
  if (!prefersReducedMotion()) {
    const host = (modal && modal.closest('.sw-backdrop')) || document.body;
    show = new CelebrationShow({ host, confetti: true, density: autoDensity() });
    show.start(duration);
  }

  return () => {
    show?.stop();
    modal?.classList.remove('sw-modal--celebrate');
    button?.classList.remove('sw-btn--pulse');
  };
}

// Ease the register button's pulse back to rest instead of snapping the glow
// class off mid-keyframe. Freezes the current animated frame, keeps the button
// lifted above the (still-fading) veil, then transitions box-shadow + transform
// smoothly down to the button's natural look.
function settleGlow(el, onDone) {
  if (!el) { onDone?.(); return; }
  const cs = getComputedStyle(el);
  el.style.position = 'relative';
  el.style.zIndex = '9995';                                  // stay above the veil
  el.style.boxShadow = cs.boxShadow;                         // freeze current frame
  el.style.transform = cs.transform === 'none' ? 'scale(1)' : cs.transform;
  el.classList.remove('qr-cta-glow');                        // stop the keyframes
  requestAnimationFrame(() => {
    el.style.transition = 'box-shadow 1.25s cubic-bezier(.33, 1, .68, 1), transform 1.25s cubic-bezier(.33, 1, .68, 1)';
    el.style.boxShadow = '';                                 // ease back to resting shadow
    el.style.transform = 'scale(1)';
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      el.removeEventListener('transitionend', done);
      ['position', 'z-index', 'box-shadow', 'transform', 'transition']
        .forEach((p) => el.style.removeProperty(p));
      onDone?.();
    };
    el.addEventListener('transitionend', done);
    setTimeout(done, 1450);                                  // fallback if transitionend misses
  });
}

// QR-arrival page intro. Blurs the page behind a veil, lifts + glows the register
// `button`, plays fireworks, then winds everything down gently so the normal
// page returns. Returns a cleanup function (also safe to ignore — self-finishes).
export function celebrateQrLanding({ button, duration = 3200 } = {}) {
  if (prefersReducedMotion()) return () => {};

  const root = document.documentElement;
  root.classList.add('qr-intro-on');

  const veil = document.createElement('div');
  veil.className = 'qr-intro-veil';
  veil.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veil);

  if (button) button.classList.add('qr-cta-glow');

  // Next frame: trigger the blur/opacity transition.
  requestAnimationFrame(() => veil.classList.add('is-on'));

  const show = new CelebrationShow({ host: document.body, confetti: true, density: autoDensity() });
  show.start(duration);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(fadeTimer);
    show.stop();                          // canvas keeps drifting while it fades
    veil.classList.remove('is-on');       // blur + scrim ease out gently
    setTimeout(() => veil.remove(), 1450);
    // Ease the CTA down in step with the veil, then drop the page-state class
    // once it has fully settled.
    settleGlow(button, () => root.classList.remove('qr-intro-on'));
  };

  const fadeTimer = setTimeout(cleanup, duration);
  return cleanup;
}
