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

// ── Fetch latest video from uploads playlist ────────────────────────────────
async function fetchLatestVideo(uploadsPlaylistId) {
  const res = await fetch(
    `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=1&key=${YT_API_KEY}`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const item = data.items?.[0];
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
        src="https://www.youtube.com/embed/${video.videoId}?rel=0"
        title="${video.title}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        loading="lazy"
      ></iframe>
    </div>`;

  infoEl.innerHTML = `
    <h3 class="latest-sermon__title">${video.title}</h3>
    <p class="latest-sermon__date">${fmtDate(video.publishedAt)}</p>
    ${video.description
      ? `<p class="latest-sermon__desc">${video.description.slice(0, 200)}${video.description.length > 200 ? '...' : ''}</p>`
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