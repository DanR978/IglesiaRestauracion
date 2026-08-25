/* ============================================================================
 * web/src/lib/stores/lightbox.svelte.ts — photo viewer state + actions (S20)
 * ----------------------------------------------------------------------------
 * Retires js/components/lightbox.js, which drove a fixed block of markup in
 * galeria/album/index.html through eleven global element ids (#lightbox,
 * #lbImg, #lbPrev, #lbCounter…). Here the state is a runes module and
 * <Lightbox> is the only renderer: the viewer can be mounted on any route,
 * twice on a page would be a mounting mistake rather than a silent id clash
 * (G-009), and a grid can open it without knowing a single id.
 *
 * The API the callers keep is the legacy one:
 *   openLightbox(photos, startIndex)
 *
 * Navigation, share and download all act on "the current photo", so they live
 * here with the state rather than in the component — a keyboard shortcut, a
 * kebab menu and the on-screen buttons all reach the same behaviour, and the
 * whole contract is testable without rendering anything.
 *
 * Usage:
 *   import { openLightbox } from '$lib/stores/lightbox.svelte';
 *   openLightbox(photos, i);          // photos: gallery_photos rows
 *   <Lightbox />                      // mounted once on the route
 * ========================================================================== */
import { toast } from '$lib/stores/toast.svelte';

/**
 * Structurally a `gallery_photos` row (Database['public']['Tables']
 * ['gallery_photos']['Row']), narrowed to what the viewer reads — so the
 * repo's row type satisfies it without the component depending on the DB types.
 */
export interface LightboxPhoto {
  public_url: string;
  thumbnail_url?: string | null;
  webp_url?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Horizontal travel that counts as a deliberate prev/next swipe (legacy: 50). */
export const SWIPE_NEXT_PX = 50;
/** Downward travel that closes the viewer (legacy: 80). */
export const SWIPE_CLOSE_PX = 80;
/** Share title when the photo has no caption (legacy string, kept). */
export const SHARE_FALLBACK_TITLE = 'Foto · Iglesia Restauración Divina';
/** Downloaded files are `foto-<n>.<ext>` (legacy `foto-${i + 1}.jpg`). */
export const DOWNLOAD_BASENAME = 'foto';

const DEFAULT_EXTENSION = 'jpg';
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};
const URL_EXTENSION = /\.(jpe?g|png|webp|gif|avif|svg)(?:$|[?#])/i;

/** The URL the viewer shows, shares and downloads. Full size first, thumb as a last resort. */
export function photoSrc(photo: LightboxPhoto): string {
  return photo.public_url || photo.thumbnail_url || '';
}

/**
 * The legacy set `alt=""` whenever a photo had no caption, which left the only
 * content of the dialog unnamed. An uncaptioned photo still gets its position.
 */
export function photoAlt(photo: LightboxPhoto, index: number, count: number): string {
  return photo.caption?.trim() || `Foto ${index + 1} de ${count}`;
}

/**
 * `foto-3.webp`. The extension follows the file (URL first, then the blob's
 * media type) instead of the legacy's hardcoded `.jpg`, which mislabelled
 * every WebP the optimizer produced.
 */
export function photoFilename(photo: LightboxPhoto, index: number, mimeType?: string): string {
  const fromUrl = URL_EXTENSION.exec(photoSrc(photo))?.[1]?.toLowerCase();
  const fromMime = EXTENSION_BY_MIME[mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''];
  const extension = (fromUrl === 'jpeg' ? 'jpg' : fromUrl) || fromMime || DEFAULT_EXTENSION;
  return `${DOWNLOAD_BASENAME}-${index + 1}.${extension}`;
}

let open = $state(false);
let photos = $state<readonly LightboxPhoto[]>([]);
let index = $state(0);
let downloading = $state(false);
/** navigator.share throws InvalidStateError if a second share starts mid-flight. */
let sharing = false;

function currentPhoto(): LightboxPhoto | null {
  return photos[index] ?? null;
}

/**
 * Show `photos`, starting at `startIndex`. A non-array or an empty list is
 * ignored exactly as the legacy ignored it — a grid with nothing in it must
 * not be able to open an empty viewer.
 *
 * The list is copied: the viewer's indices stay valid even if the caller sorts
 * or reloads its own array while the overlay is up.
 */
export function openLightbox(list: readonly LightboxPhoto[], startIndex = 0): void {
  if (!Array.isArray(list) || list.length === 0) return;
  photos = [...list];
  index = clampIndex(startIndex);
  downloading = false;
  open = true;
}

/** Close the viewer and drop the list (nothing is rendered while closed). */
export function closeLightbox(): void {
  if (!open) return;
  open = false;
  photos = [];
  index = 0;
  downloading = false;
}

function clampIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), photos.length - 1));
}

/**
 * Wrap-around, and a no-op below two photos — the legacy semantics exactly
 * (`if (state.photos.length < 2) return`), which is why the arrow keys and the
 * nav buttons do nothing on a one-photo album instead of flickering.
 */
export function nextPhoto(): void {
  if (photos.length < 2) return;
  index = (index + 1) % photos.length;
}

export function prevPhoto(): void {
  if (photos.length < 2) return;
  index = (index - 1 + photos.length) % photos.length;
}

/** Jump to a position (a thumbnail strip, a deep link). Out of range is ignored. */
export function goToPhoto(target: number): void {
  if (!Number.isInteger(target) || target < 0 || target >= photos.length) return;
  index = target;
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/**
 * A shared link has to survive leaving the page. Supabase public URLs are
 * already absolute, but a photo served from our own origin would otherwise be
 * pasted into WhatsApp as `/galeria/foto-3.webp`.
 */
export function shareUrl(url: string): string {
  if (typeof location === 'undefined') return url;
  try {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- parsed and thrown away
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

async function copyLink(url: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
      return false;
    }
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    console.warn('[lightbox] copyLink:', error);
    return false;
  }
}

/**
 * Web Share API, falling back to the clipboard.
 *
 * Two fixes on the legacy: a share the user CANCELS is not treated as a
 * failure (it used to silently copy the link and claim success), and the
 * fallback-of-the-fallback is a toast rather than `alert(url)` — the raw
 * `alert()` DESIGN-SYSTEM §4.2 tells every port to retire.
 */
export async function sharePhoto(): Promise<void> {
  const photo = currentPhoto();
  if (!photo || sharing) return;
  const src = photoSrc(photo);
  if (!src) return;
  const url = shareUrl(src);

  sharing = true;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: photo.caption?.trim() || SHARE_FALLBACK_TITLE, url });
        return;
      } catch (error) {
        if (isAbort(error)) return;
        console.warn('[lightbox] share:', error);
      }
    }
    if (await copyLink(url)) toast.success('Enlace copiado');
    else toast.error('No pudimos copiar el enlace de la foto.');
  } finally {
    sharing = false;
  }
}

/**
 * Download through fetch → Blob → object URL.
 *
 * The legacy pointed an `<a download>` at the Supabase public URL, and the
 * `download` attribute is IGNORED cross-origin: the browser navigated to the
 * image instead, dropping the visitor out of the gallery with no way back but
 * the back button. Storage answers with `Access-Control-Allow-Origin: *`, so
 * reading the bytes and handing over a same-origin blob: URL is what actually
 * downloads — and it is what makes the filename ours.
 */
export async function downloadPhoto(): Promise<void> {
  const photo = currentPhoto();
  if (!photo || downloading) return;
  const url = photoSrc(photo);
  if (!url || typeof document === 'undefined' || typeof fetch !== 'function') return;

  const at = index;
  downloading = true;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = photoFilename(photo, at, blob.type);
    anchor.rel = 'noopener';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoked a task later: Safari and Firefox cancel the download if the
    // object URL dies in the same task as the click.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } catch (error) {
    console.warn('[lightbox] download:', error);
    toast.error('No pudimos descargar la foto. Intenta de nuevo.');
  } finally {
    downloading = false;
  }
}

export const lightbox = {
  /** True while the overlay is mounted. */
  get isOpen(): boolean {
    return open;
  },
  /** The copied list being shown, in display order. */
  get photos(): readonly LightboxPhoto[] {
    return photos;
  },
  /** Zero-based position of the photo on screen. */
  get index(): number {
    return index;
  },
  get count(): number {
    return photos.length;
  },
  /** The photo on screen, or null while closed. */
  get current(): LightboxPhoto | null {
    return currentPhoto();
  },
  /** True while the download is in flight — the button shows a spinner and cannot re-fire. */
  get downloading(): boolean {
    return downloading;
  },
  open: openLightbox,
  close: closeLightbox,
  next: nextPhoto,
  prev: prevPhoto,
  goTo: goToPhoto,
  share: sharePhoto,
  download: downloadPhoto,
};
