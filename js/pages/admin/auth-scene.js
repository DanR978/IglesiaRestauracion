// js/pages/admin/auth-scene.js
// Procedurally generated underwater fish scene.
// Every page load is unique — random positions, speeds, sizes, depths.
// Fish always enter from the correct edge and face the direction they swim.
// "Depth emergence" is handled by scale + blur animation, not opacity pop.

export function initAuthScene() {
  const screen = document.getElementById('authScreen');
  if (!screen) return;

  // ── Fish SVG ─────────────────────────────────────────────────────────────────
  // Fish ALWAYS faces RIGHT (head/eye on left, tail fork on right).
  // RTL fish get scaleX(-1) baked into every keyframe — never a CSS base flip,
  // which would be overridden by the keyframe animation.
  const makeFishSVG = (bodyColor, finColor, w, h) => `
    <svg width="${w}" height="${h}" viewBox="0 0 120 30"
        fill="none" xmlns="http://www.w3.org/2000/svg">

      <!-- Body (tapered toward head on RIGHT) -->
      <path d="M110 15 
              Q95 4 50 8 
              Q25 12 25 15 
              Q25 18 50 22 
              Q95 26 110 15 Z"
            fill="${bodyColor}"/>

      <!-- Tail (LEFT side now) -->
      <path d="M25 15 L0 2 L8 15 L0 28 Z"
            fill="${finColor}" opacity="0.9"/>

      <!-- Dorsal fin -->
      <path d="M70 6 Q55 -2 45 7"
            fill="${finColor}" opacity="0.45"/>

      <!-- Bottom fin -->
      <path d="M70 24 Q55 30 45 22"
            fill="${finColor}" opacity="0.35"/>

      <!-- Subtle body line -->
      <path d="M100 15 Q60 13 30 15"
            stroke="${finColor}" stroke-width="0.6"
            opacity="0.15" fill="none"/>

    </svg>`;

  // ── Random helpers ────────────────────────────────────────────────────────────
  const rand  = (min, max) => Math.random() * (max - min) + min;
  const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
  const rInt  = (min, max) => Math.floor(rand(min, max));

  // ── Fish palette ──────────────────────────────────────────────────────────────
  // One teal hero, rest are dark slate silhouettes at varying tints
  const palettes = [
    { body: 'rgba(18,108,138,0.84)', fin: 'rgba(12,88,118,0.76)', isTeal: true  }, // teal hero
    { body: 'rgba(20,42,58,0.70)',   fin: 'rgba(14,32,46,0.65)',  isTeal: false },
    { body: 'rgba(24,52,72,0.75)',   fin: 'rgba(16,40,60,0.68)',  isTeal: false },
    { body: 'rgba(16,30,44,0.55)',   fin: 'rgba(12,22,34,0.50)',  isTeal: false },
    { body: 'rgba(22,50,70,0.68)',   fin: 'rgba(15,38,56,0.62)',  isTeal: false },
    { body: 'rgba(28,60,80,0.72)',   fin: 'rgba(20,48,65,0.65)',  isTeal: false },
    { body: 'rgba(38,38,38,0.48)',   fin: 'rgba(28,28,28,0.44)',   isTeal: false },
    { body: 'rgba(44,44,44,0.46)',   fin: 'rgba(34,34,34,0.42)',   isTeal: false },
    { body: 'rgba(50,50,50,0.50)',   fin: 'rgba(36,36,36,0.44)',   isTeal: false },
    { body: 'rgba(42,42,42,0.47)',   fin: 'rgba(32,32,32,0.43)',   isTeal: false },
    { body: 'rgba(46,46,46,0.49)',   fin: 'rgba(34,34,34,0.45)',   isTeal: false },
  ];

  // ── Build fish configs ────────────────────────────────────────────────────────
  // 9 fish total: 1 guaranteed teal, 8 randomised dark
  const fishConfigs = [];

  const heroDuration = rand(26, 34);

  fishConfigs.push({
    palette: palettes[0],
    direction: pick(['ltr', 'rtl']),
    topPct: rand(10, 500),
    scale: rand(1.0, 1.25),
    blur: rand(0.6, 1.2),
    duration: heroDuration,
    delay: rand(-heroDuration * 0.5, 0),
    wiggleDur: rand(1, 3),
    yAmplitude: rand(10, 18),
  });

  // 20 dark fish — random everything
  for (let i = 0; i < 55; i++) {
    const palette = pick(palettes.slice(1));
    const topBands = [0,5,12,20,30,42,55,65,75,82,88,100];
    const topPct   = topBands[i % topBands.length] + rand(-4, 4);

    const duration = rand(18, 52);

    fishConfigs.push({
      palette,
      direction: i % 2 === 0 ? 'ltr' : 'rtl',
      topPct: Math.max(3, Math.min(92, topPct)),
      scale: rand(0.55, 1.35),
      blur: rand(0.8, 4.5),
      duration,
      delay: rand(-duration * 0.6, 0),
      wiggleDur: rand(1.0, 2.2),
      yAmplitude: rand(6, 22),
    });
  }

  // ── Inject per-fish keyframes + elements ──────────────────────────────────────
  const styleEl = document.createElement('style');
  let css = '';

  
  // ── Inject per-fish keyframes + elements ──────────────────────────────────────
  fishConfigs.forEach((cfg, idx) => {
    const id    = `fish${idx}`;
    const isRTL = cfg.direction === 'rtl';
    const w     = Math.round(150 * cfg.scale);
    const h     = Math.round(58  * cfg.scale);
    const amp   = cfg.yAmplitude;

    // Determine facing
    const sc = isRTL ? ' scaleX(-1)' : '';

    // X positions
    const x0   = isRTL ? `calc(100vw + ${w}px)` : `${-w}px`;
    const x100 = isRTL ? `${-w}px` : `calc(100vw + ${w}px)`;
    const p1   = rand(15, 35);
    const p2   = rand(40, 60);
    const p3   = rand(65, 85);
    const x25  = isRTL ? `${100 - p1}vw` : `${p1}vw`;
    const x50  = `${p2}vw`;
    const x75  = isRTL ? `${100 - p3}vw` : `${p3}vw`;

    // Random start Y
    const yStart = rand(-1000, 1000);
    const y1 = yStart + rand(-amp, amp);
    const y2 = y1 + rand(-amp, amp);
    const y3 = y2 + rand(-amp * 0.6, amp * 0.6);

    const deepFish   = cfg.blur > 2.5;
    const startScale = deepFish ? 0.5 : 0.85;
    const midScale   = deepFish ? 0.8 : 1.0;

    // Add wavy swimming motion using sine wave along the path
    const waveAmp = rand(6, 18);  // lateral wiggle amplitude
    const waveFreq = rand(1.5, 3.5); // frequency of wiggle

    css += `
@keyframes ${id} {
  0% {
    transform: translateX(${x0}) translateY(${yStart.toFixed(1)}px) scale(${startScale})${sc};
    opacity: 0;
    filter: blur(${(cfg.blur * 2.2).toFixed(1)}px);
  }
  10% {
    transform: translateX(calc(${x0} + (${x25.replace('vw','')}vw - ${x0.replace('px','')}px) * 0.1))
               translateY(calc(${yStart.toFixed(1)}px + ${waveAmp}px * sin(0rad)))
               scale(${midScale})${sc};
    opacity: ${deepFish ? 0.3 : 0.5};
  }
  25% {
    transform: translateX(${x25}) translateY(calc(${y1.toFixed(1)}px + ${waveAmp}px * sin(0.5rad))) scale(${midScale})${sc};
  }
  50% {
    transform: translateX(${x50}) translateY(calc(${y2.toFixed(1)}px + ${waveAmp}px * sin(1.5rad))) scale(1)${sc};
    opacity: ${deepFish ? 0.45 : 0.6};
    filter: blur(${(cfg.blur * 0.7).toFixed(1)}px);
  }
  75% {
    transform: translateX(${x75}) translateY(calc(${y3.toFixed(1)}px + ${waveAmp}px * sin(2.5rad))) scale(${midScale})${sc};
  }
  90% {
    transform: translateX(calc(${x75} + (${x100.replace('vw','')}vw - ${x75.replace('px','')}px) * 0.1))
               translateY(calc(${y3.toFixed(1)}px + ${waveAmp}px * sin(3rad))) scale(${midScale})${sc};
    opacity: ${deepFish ? 0.3 : 0.5};
  }
  100% {
    transform: translateX(${x100}) translateY(${yStart.toFixed(1)}px) scale(${startScale})${sc};
    opacity: 0;
    filter: blur(${(cfg.blur * 2).toFixed(1)}px);
  }
}`;

    // Create DOM element
    const el       = document.createElement('div');
    el.className   = 'auth-fish';
    el.style.cssText = `
      top: ${cfg.topPct.toFixed(1)}%;
      animation: ${id} ${cfg.duration.toFixed(1)}s ease-in-out ${cfg.delay.toFixed(1)}s infinite;
    `;
    el.innerHTML = makeFishSVG(
      cfg.palette.body,
      cfg.palette.fin,
      w, h
    );

    // Body wiggle on the SVG itself (tail-driven swimming feel)
    el.querySelector('svg').style.animation =
      `bodyWiggle ${cfg.wiggleDur.toFixed(2)}s ease-in-out infinite alternate`;

    screen.appendChild(el);
  });

  // Shared keyframe for body wiggle
  css += `
@keyframes bodyWiggle {
  0%   { transform: rotate(-2.2deg) scaleY(1);    }
  100% { transform: rotate( 2.2deg) scaleY(0.95); }
}`;

  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Bubbles ───────────────────────────────────────────────────────────────────
  for (let i = 0; i < 20; i++) {
    const size  = rand(2, 15);
    const el    = document.createElement('div');
    el.className = 'auth-bubble';
    el.style.cssText = `
      width:  ${size.toFixed(1)}px;
      height: ${size.toFixed(1)}px;
      left:   ${rand(4, 96).toFixed(1)}%;
      bottom: -12px;
      --dur:   ${rand(8, 18).toFixed(1)}s;
      --delay: ${rand(0, 14).toFixed(1)}s;
      --drift: ${(rand(-18, 18)).toFixed(1)}px;
    `;
    screen.appendChild(el);
  }
}