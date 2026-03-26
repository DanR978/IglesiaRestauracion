/**
 * IRD Splash — Fish Evangelism Loading Screen
 *
 * Metaphor:
 *   - Primary-colored fish (Christians) swim RIGHT toward the light
 *   - Gray fish (non-Christians) swim LEFT into darkness
 *   - Christian fish "evangelize" nearby gray fish → they turn around,
 *     slowly change color, and follow
 *   - Sometimes a Christian fish falls away → slowly turns gray,
 *     reverses direction, fades into the dark
 *
 * Shows once per session. Morphs smoothly into the page.
 */

(() => {
  'use strict';

  /* ── gate: once per session ── */
  const KEY = 'ird-splash-shown';
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, '1');

  /* ── config ── */
  const PRIMARY  = { r: 52,  g: 90,  b: 101 };   // #345a65
  const GRAY     = { r: 120, g: 120, b: 120 };
  const BG       = '#090f11';
  const FISH_COUNT = 45;
  const MIN_DURATION = 3200;   // minimum splash time in ms
  const EVANGELIZE_CHANCE = 0.003;   // per-frame chance a christian talks to nearby gray
  const FALLAWAY_CHANCE   = 0.0004;  // per-frame chance a christian falls away

  /* ── inject DOM ── */
  const splash = document.createElement('div');
  splash.id = 'ird-splash';
  splash.innerHTML = `
    <canvas></canvas>
    <div class="splash-logo">
      <svg viewBox="0 0 236 365" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(-100.367,-0.797)">
          <path d="M255.651,343.531C234.113,314.605 247.73,273.395 277.367,248.02C321.004,210.66 291.551,186.25 222.547,177.93C153.547,169.613 228.797,148.734 228.797,148.734L228.797,86.516L263.188,86.516L263.188,65.289L228.797,65.289L228.797,30.25L207.57,30.25L207.57,65.289L173.184,65.289L173.184,86.516L207.57,86.516L207.57,148.734C135.273,169.887 156.59,191.43 207.57,197.703C258.551,203.977 225.5,228.199 161,241.34C142.68,245.07 127.609,249.641 115.477,254.969C115.301,252.539 115.184,250.09 115.184,247.613L115.184,118.613C115.184,61.816 161.391,15.609 218.184,15.609C274.98,15.609 321.188,61.816 321.188,118.613L321.188,247.613C321.188,291.191 293.969,328.513 255.651,343.531Z" fill="#345a65"/>
          <path d="M111.977,256.609C116.562,311.199 162.43,354.227 218.184,354.227C232.266,354.227 245.707,351.461 258.023,346.477C297.129,330.66 324.801,292.32 324.801,247.613L324.801,118.613C324.801,59.828 276.973,11.996 218.184,11.996C159.398,11.996 111.57,59.828 111.57,118.613L111.57,247.613C111.57,250.645 111.727,253.641 111.977,256.609ZM101.332,262.375C100.719,257.531 100.367,252.613 100.367,247.613L100.367,118.613C100.367,53.812 153.387,0.797 218.184,0.797C282.984,0.797 336.004,53.812 336.004,118.613L336.004,247.613C336.004,295.109 307.504,336.242 266.773,354.844C251.938,361.617 235.492,365.43 218.184,365.43C158.383,365.43 108.656,320.27 101.332,262.375Z" fill="#345a65"/>
        </g>
      </svg>
    </div>`;

  // Must inject BEFORE body renders anything
  if (document.body) {
    document.body.prepend(splash);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body.prepend(splash), { once: true });
  }

  /* ── canvas setup ── */
  const canvas = splash.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let W, H, dpr;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── fish helpers ── */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(c1, c2, t) {
    return { r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) };
  }
  function colorStr(c, a = 1) { return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  /* ── fish factory ── */
  function makeFish(isChristian, x, y) {
    const size = rand(8, 18);
    const speed = rand(0.6, 1.8);
    return {
      x: x ?? (isChristian ? rand(-W * 0.3, W * 0.6) : rand(W * 0.4, W * 1.3)),
      y: y ?? rand(H * 0.08, H * 0.92),
      size,
      speed,
      dir: isChristian ? 1 : -1,          // 1 = right (light), -1 = left (dark)
      christian: isChristian,
      colorT: isChristian ? 1 : 0,        // 1 = primary, 0 = gray
      targetColorT: isChristian ? 1 : 0,
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(1.5, 3),
      wobbleAmp: rand(0.3, 0.9),
      alpha: 1,
      converting: false,
      fallingAway: false,
      talkTimer: 0,                        // visual "talk" pulse
    };
  }

  /* ── populate ── */
  const fishes = [];
  const christianCount = Math.floor(FISH_COUNT * 0.35);
  for (let i = 0; i < FISH_COUNT; i++) {
    fishes.push(makeFish(i < christianCount));
  }

  /* ── draw a single fish ── */
  function drawFish(f) {
    const c = lerpColor(GRAY, PRIMARY, f.colorT);
    const facing = f.dir;
    const wobbleY = Math.sin(f.wobble) * f.wobbleAmp * f.size * 0.3;

    ctx.save();
    ctx.translate(f.x, f.y + wobbleY);
    ctx.scale(facing, 1);
    ctx.globalAlpha = f.alpha;

    const s = f.size;

    // body
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, -s * 0.6, s, 0);
    ctx.quadraticCurveTo(0, s * 0.6, -s, 0);
    ctx.fillStyle = colorStr(c);
    ctx.fill();

    // tail
    ctx.beginPath();
    ctx.moveTo(-s * 0.85, 0);
    ctx.lineTo(-s * 1.45, -s * 0.45);
    ctx.lineTo(-s * 1.45, s * 0.45);
    ctx.closePath();
    ctx.fillStyle = colorStr(c, 0.85);
    ctx.fill();

    // eye
    ctx.beginPath();
    ctx.arc(s * 0.4, -s * 0.08, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = f.christian ? 'rgba(255,255,255,0.9)' : 'rgba(200,200,200,0.6)';
    ctx.fill();

    // talk pulse (ripple)
    if (f.talkTimer > 0) {
      const progress = 1 - f.talkTimer;
      ctx.beginPath();
      ctx.arc(s * 0.7, 0, s * (0.5 + progress * 1.2), 0, Math.PI * 2);
      ctx.strokeStyle = colorStr(PRIMARY, 0.35 * f.talkTimer);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ── ambient light gradient (right = light, left = dark) ── */
  function drawBackground() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // subtle right-side glow
    const grd = ctx.createRadialGradient(W * 1.1, H * 0.5, 0, W * 1.1, H * 0.5, W * 0.9);
    grd.addColorStop(0, 'rgba(52, 90, 101, 0.08)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // subtle particles (dust in light)
    for (let i = 0; i < 12; i++) {
      const px = W * 0.5 + Math.sin(Date.now() * 0.0003 + i * 1.7) * W * 0.4;
      const py = H * 0.15 + Math.sin(Date.now() * 0.0004 + i * 2.3) * H * 0.7;
      const pa = 0.04 + 0.03 * Math.sin(Date.now() * 0.001 + i);
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(171, 204, 212, ${pa})`;
      ctx.fill();
    }
  }

  /* ── simulation tick ── */
  function tick(dt) {
    for (const f of fishes) {
      // movement
      f.x += f.dir * f.speed * dt * 60;
      f.wobble += f.wobbleSpeed * dt;

      // color transition (smooth)
      f.colorT = lerp(f.colorT, f.targetColorT, dt * 1.2);

      // talk timer decay
      if (f.talkTimer > 0) f.talkTimer = Math.max(0, f.talkTimer - dt * 1.5);

      // fade fish that leave the screen to the left (into darkness)
      if (f.dir === -1 && f.x < -W * 0.1) {
        f.alpha = Math.max(0, f.alpha - dt * 0.5);
      }

      // recycle off-screen fish
      if ((f.dir === 1 && f.x > W + 50) || (f.dir === -1 && f.x < -80 && f.alpha < 0.05)) {
        // respawn as a new gray fish from the right edge heading left
        Object.assign(f, makeFish(false, W + rand(20, 150)));
      }

      // === EVANGELISM: christian fish near a gray fish ===
      if (f.christian && !f.fallingAway && Math.random() < EVANGELIZE_CHANCE) {
        const range = f.size * 6;
        for (const other of fishes) {
          if (other === f || other.christian || other.converting) continue;
          if (dist(f, other) < range) {
            // talk!
            f.talkTimer = 1;
            other.converting = true;
            other.dir = 1;  // turn around toward the light
            other.targetColorT = 1;
            other.speed = f.speed * rand(0.8, 1.1);
            // after color transitions, mark as christian
            setTimeout(() => {
              other.christian = true;
              other.converting = false;
            }, 2500);
            break;
          }
        }
      }

      // === FALLING AWAY: christian fish turns back ===
      if (f.christian && !f.converting && !f.fallingAway && Math.random() < FALLAWAY_CHANCE) {
        f.fallingAway = true;
        f.christian = false;
        f.targetColorT = 0;
        f.dir = -1;
        f.speed = rand(0.4, 0.9);
        setTimeout(() => { f.fallingAway = false; }, 4000);
      }
    }
  }

  /* ── render loop ── */
  let lastT = performance.now();
  let running = true;

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    tick(dt);

    drawBackground();

    // sort by size for depth
    fishes.sort((a, b) => a.size - b.size);
    for (const f of fishes) drawFish(f);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // show logo after a beat
  setTimeout(() => splash.querySelector('.splash-logo')?.classList.add('visible'), 400);

  /* ── dismiss logic ── */
  const startT = performance.now();

  function dismiss() {
    const elapsed = performance.now() - startT;
    const remaining = Math.max(0, MIN_DURATION - elapsed);

    setTimeout(() => {
      splash.classList.add('fade-out');
      setTimeout(() => {
        running = false;
        splash.remove();
        window.removeEventListener('resize', resize);
      }, 900);
    }, remaining);
  }

  // Dismiss when page is ready (includes:ready or fallback)
  let dismissed = false;
  function dismissOnce() {
    if (dismissed) return;
    dismissed = true;
    dismiss();
  }

  document.addEventListener('includes:ready', dismissOnce, { once: true });

  // For pages without include.js (admin, calendar, etc.) use window.load
  window.addEventListener('load', () => {
    // small grace period so the animation plays a bit
    setTimeout(dismissOnce, 600);
  }, { once: true });

  // Hard fallback: dismiss after 6s max no matter what
  setTimeout(() => {
    if (document.getElementById('ird-splash')) dismissOnce();
  }, 6000);

})();