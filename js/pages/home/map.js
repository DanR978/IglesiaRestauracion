// js/pages/home/map.js
// Clean, branded location map for the home "Visítanos" section.
// Uses Leaflet + CartoDB "Positron" (light) tiles — a minimal grayscale
// basemap with a single branded marker, no address card / no Google chrome.
// Leaflet's CSS + JS are fetched only when the map scrolls into view, so
// pages that never reach it pay nothing.

const EL = document.getElementById('homeMap');

if (EL) {
  const COORD = [38.014455, -84.538253];
  const LABEL = 'Iglesia Restauración Divina';
  const ADDR = '2601 Clays Mill Rd, Lexington, KY 40503';

  const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  const JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

  const loadCSS = (href, integrity) =>
    new Promise((resolve) => {
      if (document.querySelector(`link[href="${href}"]`)) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.integrity = integrity;
      l.crossOrigin = '';
      l.onload = () => resolve();
      l.onerror = () => resolve(); // tiles still render; styling degrades only
      document.head.appendChild(l);
    });

  const loadJS = (src, integrity) =>
    new Promise((resolve, reject) => {
      if (window.L) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.integrity = integrity;
      s.crossOrigin = '';
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });

  let booted = false;
  const boot = async () => {
    if (booted) return;
    booted = true;
    try {
      await loadCSS(LEAFLET_CSS, CSS_SRI);
      await loadJS(LEAFLET_JS, JS_SRI);

      const map = L.map(EL, {
        center: COORD,
        zoom: 15,
        scrollWheelZoom: false, // never hijack page scroll
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }
      ).addTo(map);

      const icon = L.divIcon({
        className: 'ird-pin',
        html: '<span class="ird-pin__dot"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      });

      L.marker(COORD, { icon, title: LABEL, keyboard: false })
        .addTo(map)
        .bindPopup(`<strong>${LABEL}</strong><br>${ADDR}`);

      // Container may have been sized after init (grid/lazy reveal); re-measure.
      setTimeout(() => map.invalidateSize(), 200);
    } catch (e) {
      console.warn('[map] Leaflet failed to load', e);
      booted = false;
    }
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            io.disconnect();
            boot();
          }
        });
      },
      { rootMargin: '200px' }
    );
    io.observe(EL);
  } else {
    boot();
  }
}
