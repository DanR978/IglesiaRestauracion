/* ============================================================================
 * web/src/lib/reduced-motion.ts — prefers-reduced-motion as reactive state (S12)
 * ----------------------------------------------------------------------------
 * CSS handles reduced motion globally (base/motion.css). This is for the
 * cases CSS cannot reach: a Svelte `transition:` duration, a JS-timed close
 * (action sheet defers its action so the slide can start), a shimmer you
 * want to skip entirely, a scroll you would otherwise animate.
 *
 * Built on svelte/reactivity's MediaQuery: read `.current` inside a template
 * or $effect and it re-runs when the OS setting changes; read it anywhere
 * else and it returns the live value. SSR / prerender-safe: with no
 * matchMedia (server, jsdom) it reports `false` — never throws, never
 * touches `window` at import time.
 *
 * Usage:
 *   import { prefersReducedMotion, motionMs } from '$lib/reduced-motion';
 *   {#if !prefersReducedMotion.current} <div transition:fly={{ duration: motionMs(220) }}>
 *   setTimeout(close, motionMs(240));
 * ========================================================================== */
import { MediaQuery } from 'svelte/reactivity';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let query: MediaQuery | undefined;

function matches(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  query ??= new MediaQuery(REDUCED_MOTION_QUERY);
  return query.current;
}

export const prefersReducedMotion = {
  /** true when the user asked for reduced motion; false on the server. */
  get current(): boolean {
    return matches();
  },
};

/** A duration in ms, or 0 when motion should be skipped. */
export function motionMs(ms: number): number {
  return prefersReducedMotion.current ? 0 : ms;
}
