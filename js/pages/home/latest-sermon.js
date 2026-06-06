import { esc } from '/js/utils/escape.js';
// js/pages/home/latest-sermon.js
// Fetches and displays the most recent video from the channel on the homepage.

import { YT_API_KEY, YT_CHANNEL_HANDLE } from '/js/lib/supabase.js';

const YT_API = 'https://www.googleapis.com/youtube/v3';



// ── Resolve channel ID from handle ──────────────────────────────────────────
async function resolveChannelId() {
  // Try forHandle first
  try {
    const handle = YT_CHANNEL_HANDLE.replace('@', '');
    const res = await fetch(
      `${YT_API}/channels?part=id,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${YT_API_KEY}`
    );
    const data = await res.json();
    if (data.items?.[0]) {
      return {
        channelId: data.items[0].id,
        uploadsPlaylistId: data.items[0].contentDetails?.relatedPlaylists?.uploads || '',
      };
    }
  } catch (err) {
    console.warn('forHandle lookup failed:', err);
  }

  // Fallback: search
  try {
    const res = await fetch(
      `${YT_API}/search?part=snippet&type=channel&q=${encodeURIComponent(YT_CHANNEL_HANDLE)}&key=${YT_API_KEY}`
    );
    const data = await res.json();
    const channelId = data.items?.[0]?.snippet?.channelId;
    if (channelId) {
      // Now get the uploads playlist
      const chRes = await fetch(
        `${YT_API}/channels?part=contentDetails&id=${channelId}&key=${YT_API_KEY}`
      );
      const chData = await chRes.json();
      return {
        channelId,
        uploadsPlaylistId: chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || '',
      };
    }
  } catch (err) {
    console.warn('Search fallback failed:', err);
  }

  return { channelId: '', uploadsPlaylistId: '' };
}

/** Map an ISO-8601 duration (PT1H2M3S / PT45S) to total seconds. */
function durationSeconds(iso) {
  if (!iso) return 0;
  const m = String(iso).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

// ── Fetch latest video from uploads playlist ────────────────────────────────
// Shorts are excluded by using YouTube's per-channel "long-form videos only"
// system playlist: replace the UU prefix on the uploads playlist with UULF.
// If that playlist returns nothing (rare), fall back to the regular uploads
// playlist and skip any item whose duration is ≤ 60 s.
async function fetchLatestVideo(uploadsPlaylistId) {
  const longFormId = uploadsPlaylistId.replace(/^UU/, 'UULF');

  async function pickFromPlaylist(playlistId, skipShorts = false) {
    const res = await fetch(
      `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${skipShorts ? 10 : 1}&key=${YT_API_KEY}`
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const items = data.items || [];
    if (!items.length) return null;

    if (!skipShorts) return items[0];

    // Defensive: query durations and pick first non-Short
    const ids = items.map(i => i.contentDetails.videoId).join(',');
    const dRes = await fetch(`${YT_API}/videos?part=contentDetails&id=${ids}&key=${YT_API_KEY}`);
    const dData = await dRes.json();
    const longIds = new Set(
      (dData.items || [])
        .filter(v => durationSeconds(v.contentDetails?.duration) > 60)
        .map(v => v.id),
    );
    return items.find(i => longIds.has(i.contentDetails.videoId)) || null;
  }

  // 1) Try the long-form-only system playlist (no Shorts by design)
  let item = null;
  try {
    item = await pickFromPlaylist(longFormId, false);
  } catch (_) { /* UULF can 404 on small channels — fall through */ }

  // 2) Fallback: full uploads + duration filter
  if (!item) item = await pickFromPlaylist(uploadsPlaylistId, true);

  if (!item) return null;

  return {
    videoId:     item.contentDetails.videoId,
    title:       item.snippet.title,
    description: item.snippet.description || '',
    thumbnail:   item.snippet.thumbnails?.high?.url || '',
    publishedAt: item.snippet.publishedAt,
  };
}

// ── Date formatter ──────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderLatestSermon(video) {
  const playerEl = document.getElementById('latestSermonPlayer');
  const infoEl   = document.getElementById('latestSermonInfo');

  if (!playerEl || !infoEl) return;

  if (!video) {
    playerEl.innerHTML = `
      <div class="sermon-empty">
        <i class="fas fa-video-slash"></i>
        <p>No hay videos disponibles.</p>
      </div>`;
    infoEl.innerHTML = '';
    return;
  }

  playerEl.innerHTML = `
    <div class="latest-sermon__frame">
      <iframe
        src="https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?rel=0"
        title="${esc(video.title)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        loading="lazy"
      ></iframe>
    </div>`;

  infoEl.innerHTML = `
    <h3 class="latest-sermon__title">${esc(video.title)}</h3>
    <p class="latest-sermon__date">${esc(fmtDate(video.publishedAt))}</p>
    ${video.description
      ? `<p class="latest-sermon__desc">${esc(video.description.slice(0, 200))}${video.description.length > 200 ? '...' : ''}</p>`
      : ''}
  `;
}

function renderError(message) {
  const playerEl = document.getElementById('latestSermonPlayer');
  if (playerEl) {
    playerEl.innerHTML = `
      <div class="sermon-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>${message}</p>
      </div>`;
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────
export async function initLatestSermon() {
  const container = document.getElementById('latestSermon');
  if (!container) return;

  if (!YT_API_KEY) {
    renderError('YouTube API key no configurada.');
    return;
  }

  try {
    const { uploadsPlaylistId } = await resolveChannelId();

    if (!uploadsPlaylistId) {
      renderError('No se pudo encontrar el canal.');
      return;
    }

    const video = await fetchLatestVideo(uploadsPlaylistId);
    renderLatestSermon(video);
  } catch (err) {
    console.error('Latest sermon error:', err);
    renderError(`Error: ${err.message}`);
  }
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLatestSermon);
} else {
  initLatestSermon();
}