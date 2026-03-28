// js/pages/sermons/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Sermons page — SPA-style: playlists grid ↔ video list (no page navigation).
//
// YouTube API key goes in .env as VITE_YOUTUBE_API_KEY
// Or set it in the DEFAULTS inside js/lib/supabase.js
// ─────────────────────────────────────────────────────────────────────────────

import { YT_API_KEY, YT_CHANNEL_HANDLE } from '/js/lib/supabase.js';

const YT_API = 'https://www.googleapis.com/youtube/v3';

// ── State ───────────────────────────────────────────────────────────────────
let _channelId  = '';
let _playlists  = [];
let _currentView = 'grid';  // 'grid' | 'videos'

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── YouTube API helpers ─────────────────────────────────────────────────────

async function resolveChannelId() {
  if (_channelId) return _channelId;

  // Try channels.list with forHandle (YouTube Data API v3)
  try {
    const res = await fetch(
      `${YT_API}/channels?part=id&forHandle=${encodeURIComponent(YT_CHANNEL_HANDLE.replace('@', ''))}&key=${YT_API_KEY}`
    );
    const data = await res.json();
    if (data.items?.[0]?.id) {
      _channelId = data.items[0].id;
      return _channelId;
    }
  } catch {}

  // Fallback: search for the channel
  try {
    const res = await fetch(
      `${YT_API}/search?part=snippet&type=channel&q=${encodeURIComponent(YT_CHANNEL_HANDLE)}&key=${YT_API_KEY}`
    );
    const data = await res.json();
    _channelId = data.items?.[0]?.snippet?.channelId || '';
  } catch {}

  return _channelId;
}

async function fetchPlaylists() {
  const channelId = await resolveChannelId();
  if (!channelId) throw new Error('No se pudo encontrar el canal de YouTube');

  const all = [];
  let pageToken = '';

  do {
    const url = `${YT_API}/playlists?part=snippet,contentDetails&channelId=${channelId}&maxResults=50&key=${YT_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    all.push(...(data.items || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return all.map(p => ({
    id: p.id,
    title: p.snippet.title,
    description: p.snippet.description || '',
    thumbnail: p.snippet.thumbnails?.high?.url || '',
    videoCount: p.contentDetails.itemCount,
    publishedAt: p.snippet.publishedAt,
  }))
  .filter(p => p.videoCount > 0 || p.title.includes('Coming Soon'))
}

async function fetchPlaylistVideos(playlistId) {
  const all = [];
  let pageToken = '';

  do {
    const url = `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${YT_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    all.push(...(data.items || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return all
    .map(v => ({
      videoId:     v.contentDetails.videoId,
      title:       v.snippet.title,
      description: v.snippet.description || '',
      thumbnail:   v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || '',
      publishedAt: v.snippet.publishedAt,
      position:    v.snippet.position,
    }))
    .filter(v => v.title !== 'Private video' && v.title !== 'Deleted video');
}

// ── Date formatter ──────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
}

// ── Render: playlist grid ───────────────────────────────────────────────────
function renderPlaylistGrid(container) {
  _currentView = 'grid';
  const back = $('sermonBack');
  if (back) back.innerHTML = '';

  const title = $('sermonPageTitle');
  if (title) title.textContent = 'SERMONES';

  if (!_playlists.length) {
    container.innerHTML = `
      <div class="sermon-empty">
        <i class="fas fa-video-slash"></i>
        <p>No hay series todavía.</p>
      </div>`;
    return;
  }

  const PLAY_ICON = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const LIST_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>`;

  container.innerHTML = `
    <div class="sermon-grid">
      ${_playlists.map(p => `
        <div class="sermon-card animate-fade-in" data-playlist-id="${p.id}" data-threshold="0.1">
          <div class="sermon-card__thumb">
            <img src="${p.thumbnail}" alt="${p.title}" loading="lazy">
            <div class="sermon-card__count">${LIST_ICON} ${p.videoCount} videos</div>
            <div class="sermon-card__play">${PLAY_ICON}</div>
          </div>
          <div class="sermon-card__body">
            <div class="sermon-card__title">${p.title}</div>
            <div class="sermon-card__meta">${p.description.slice(0, 100)}</div>
          </div>
        </div>`).join('')}
    </div>`;

  // Wire clicks
  container.querySelectorAll('[data-playlist-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.playlistId;
      const pl = _playlists.find(p => p.id === id);
      showPlaylistVideos(id, pl?.title || 'Videos');
    });
  });

  // Trigger scroll animations
  if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());
}

// ── Render: videos in a playlist ────────────────────────────────────────────
async function showPlaylistVideos(playlistId, playlistTitle) {
  _currentView = 'videos';
  const container = $('sermonContent');

  // Update page title
  const title = $('sermonPageTitle');
  if (title) title.textContent = playlistTitle;

  // Loading state
  container.innerHTML = `<div class="sermon-loading"><i class="fas fa-spinner fa-spin"></i> Cargando videos...</div>`;

  try {
    const videos = await fetchPlaylistVideos(playlistId);

    if (!videos.length) {
      container.innerHTML = `
        <div class="sermon-empty">
          <i class="fas fa-video-slash"></i>
          <p>No hay videos en esta serie.</p>
        </div>`;
      return;
    }

    // Start with first video playing
    let activeId = videos[0].videoId;

    function renderVideoView() {
      const activeVideo = videos.find(v => v.videoId === activeId) || videos[0];

      container.innerHTML = `
        <div class="sermon-header-row">
          <button class="ird-btn ird-btn--teal gap" id="sermonBackBtn">
            <i class="fas fa-arrow-left"></i>
            Todas las series
          </button>

          <h3 class="sermon-header__title">
            ${playlistTitle}
            <span class="sermon-header__count">${videos.length} videos</span>
          </h3>
        </div>

        <div class="sermon-player">
          <div class="sermon-player__frame">
            <iframe
              src="https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1&rel=0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen loading="lazy"></iframe>
          </div>

          <div class="sermon-player__content">
            <h2 class="sermon-player__title">${activeVideo.title}</h2>
            <p class="sermon-player__meta">${fmtDate(activeVideo.publishedAt)}</p>
            ${activeVideo.description ? `<p class="sermon-player__desc">${activeVideo.description.slice(0, 400)}</p>` : ''}
          </div>
        </div>

        <div class="sermon-video-list">
          ${videos.map(v => `
            <div class="sermon-video${v.videoId === activeId ? ' sermon-video--active' : ''}"
                data-vid="${v.videoId}">
              <div class="sermon-video__thumb">
                <img src="${v.thumbnail}" alt="${v.title}" loading="lazy">
              </div>
              <div class="sermon-video__info">
                <div class="sermon-video__title">${v.title}</div>
                <div class="sermon-video__meta">${fmtDate(v.publishedAt)}</div>
                ${v.description ? `<div class="sermon-video__desc">${v.description.slice(0, 120)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Wire video clicks
      container.querySelectorAll('[data-vid]').forEach(el => {
        el.addEventListener('click', () => {
          activeId = el.dataset.vid;
          renderVideoView();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      // Wire back button
      $('sermonBackBtn').addEventListener('click', () => {
        renderPlaylistGrid(container);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    renderVideoView();

  } catch (err) {
    container.innerHTML = `
      <div class="sermon-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error: ${err.message}</p>
      </div>`;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const container = $('sermonContent');
  if (!container) return;

  // Check for API key
  if (!YT_API_KEY || YT_API_KEY === 'your-youtube-api-key-here') {
    container.innerHTML = `
      <div class="sermon-empty">
        <i class="fas fa-key"></i>
        <p style="margin-bottom:.5rem">Configura tu YouTube API Key</p>
        <p style="font-size:.8rem;max-width:400px;margin:0 auto">
          Agrega <code>VITE_YOUTUBE_API_KEY</code> a tu archivo <code>.env</code>
          o edita los defaults en <code>js/lib/supabase.js</code>.
          <br><br>
          Obtén tu clave en
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>
          → habilita "YouTube Data API v3" → crea una API Key.
        </p>
      </div>`;
    return;
  }

  // Load playlists
  container.innerHTML = `<div class="sermon-loading"><i class="fas fa-spinner fa-spin"></i> Cargando series...</div>`;

  try {
    _playlists = await fetchPlaylists();
    renderPlaylistGrid(container);
  } catch (err) {
    container.innerHTML = `
      <div class="sermon-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error al cargar: ${err.message}</p>
      </div>`;
  }
});