// js/lib/qr.js
// Shared QR-code helpers used by the admin panel (special events, and — by
// extension — anywhere a downloadable QR is needed).
//
// QRCode is loaded as a full CDN URL (not a bare specifier) so it resolves in
// the browser even when files are served raw (GitHub Pages deploy does NOT run
// `vite build`). Mirrors the pattern in js/lib/supabase.js.
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';

/** Render a data-URL PNG for `data` at the requested pixel size. */
export async function generateQrDataUrl(data, size = 320) {
  return await QRCode.toDataURL(data, {
    width:  size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0e2d38', light: '#ffffff' },   // church teal on white
  });
}

/**
 * Generate a high-res (1024px) PNG for `data` and trigger a browser download.
 * Everything happens locally — no network involved. Throws on failure.
 */
export async function downloadQrPng(data, filename = 'qr.png') {
  const dataUrl = await generateQrDataUrl(data, 1024);
  const res  = await fetch(dataUrl);     // data: URL → blob (cheap, local)
  const blob = await res.blob();
  if (!blob || blob.size < 500) throw new Error('Imagen QR vacía');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Copy text to the clipboard, with a legacy execCommand fallback. Returns bool. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/** Slugify a title → url-safe, accent-stripped, lowercase token. */
export function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'evento';
}
