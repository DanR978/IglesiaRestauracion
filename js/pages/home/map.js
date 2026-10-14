// js/pages/home/map.js
// Clean, branded location map for the home "Visítanos" section.
// MapLibre GL + OpenFreeMap's "Positron" style — a minimal grayscale basemap
// with a single branded marker. OpenFreeMap is free with no API key or account;
// CARTO's Positron tiles (the previous source) started requiring a key and
// rendered "API KEY REQUIRED" across the whole map.
// MapLibre is fetched only when the map scrolls into view, so pages that never
// reach it pay nothing. Without WebGL, or if the basemap can't load, the
// section falls back to the same Google embed no-JS visitors get.

const EL = document.getElementById('homeMap');

if (EL) {
  const COORD = [-84.538253, 38.014455]; // MapLibre takes [lng, lat]
  const LABEL = 'Iglesia Restauración Divina';
  const ADDR = '2601 Clays Mill Rd, Lexington, KY 40503';

  const MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';
  const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.css';
  const CSS_SRI = 'sha384-ntw3zEt6rcVML7jDK0ULmHa5hxLB23afsPqzqfY+gLgMfAkbFCnCgPpkZvV5mmZX';
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
  const GOOGLE_EMBED = 'https://www.google.com/maps?q=2601+Clays+Mill+Rd,+Lexington,+KY+40503&output=embed';

  const UI_STRINGS = {
    'Map.Title': 'Mapa',
    'NavigationControl.ZoomIn': 'Acercar',
    'NavigationControl.ZoomOut': 'Alejar',
    'Popup.Close': 'Cerrar',
    'AttributionControl.ToggleAttribution': 'Mostrar u ocultar créditos',
  };

  const loadCSS = (href, integrity) =>
    new Promise((resolve) => {
      if (document.querySelector(`link[href="${href}"]`)) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.integrity = integrity;
      l.crossOrigin = '';
      l.onload = () => resolve();
      l.onerror = () => resolve(); // map still renders; controls lose styling only
      document.head.appendChild(l);
    });

  const showGoogleEmbed = (map) => {
    try { map?.remove(); } catch {}
    const frame = document.createElement('iframe');
    frame.className = 'home-location__map';
    frame.title = `Mapa de ${LABEL} en ${ADDR}`;
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.src = GOOGLE_EMBED;
    EL.replaceChildren(frame);
  };

  let booted = false;
  const boot = async () => {
    if (booted) return;
    booted = true;

    let ml;
    try {
      [ml] = await Promise.all([import(MAPLIBRE_JS), loadCSS(MAPLIBRE_CSS, CSS_SRI)]);
    } catch (e) {
      console.warn('[map] MapLibre failed to load, using the Google embed', e);
      showGoogleEmbed();
      return;
    }

    let map;
    try {
      map = new ml.Map({
        container: EL,
        style: STYLE_URL,
        center: COORD,
        zoom: 15,
        scrollZoom: false, // never hijack page scroll
        locale: UI_STRINGS,
      });
    } catch (e) {
      console.warn('[map] WebGL unavailable, using the Google embed', e);
      showGoogleEmbed();
      return;
    }

    // An error before the style lands means no basemap at all (OpenFreeMap
    // unreachable); afterwards it's a single tile and the map is still usable.
    let settled = false;
    map.once('style.load', () => { settled = true; });
    map.on('error', (e) => {
      if (settled) return;
      settled = true;
      console.warn('[map] basemap failed to load, using the Google embed', e?.error);
      showGoogleEmbed(map);
    });

    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');

    const pin = document.createElement('div');
    pin.className = 'ird-pin';
    pin.setAttribute('aria-label', LABEL);
    pin.innerHTML = '<span class="ird-pin__dot"></span>';

    new ml.Marker({ element: pin, anchor: 'center' })
      .setLngLat(COORD)
      .setPopup(new ml.Popup({ offset: 14 }).setHTML(`<strong>${LABEL}</strong><br>${ADDR}`))
      .addTo(map);
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
