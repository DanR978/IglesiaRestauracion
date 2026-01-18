// js/app/components/live-embed.js
(function () {
  const CHANNEL_ID = import.meta.env.VITE_YOUTUBE_CHANNEL_ID;
  const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

  function showIframe(videoId) {
    const liveEmbed = document.getElementById('liveEmbed');
    const iframe = document.getElementById('liveIframe');
    const placeholderLink = document.getElementById('livePlaceholderLink');

    if (!liveEmbed || !iframe) return;

    // Set embed URL for that video (live or scheduled)
    iframe.src = `https://www.youtube.com/embed/${videoId}`;

    // Show iframe, hide placeholder
    liveEmbed.style.display = 'block';
    if (placeholderLink) {
      placeholderLink.style.display = 'none';
    }
  }

  function showPlaceholder() {
    const liveEmbed = document.getElementById('liveEmbed');
    const placeholderLink = document.getElementById('livePlaceholderLink');

    if (liveEmbed) {
      liveEmbed.style.display = 'none';
    }
    if (placeholderLink) {
      placeholderLink.style.display = 'block';
    }
  }

  function fetchVideoByEventType(eventType) {
    const url =
      'https://www.googleapis.com/youtube/v3/search' +
      `?part=snippet&channelId=${CHANNEL_ID}` +
      `&eventType=${eventType}&type=video&maxResults=1&key=${API_KEY}`;

    return fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const items = (data && data.items) || [];
        if (items.length > 0 && items[0].id && items[0].id.videoId) {
          return items[0].id.videoId;
        }
        return null;
      });
  }

  function initLiveEmbed() {
    const liveEmbed = document.getElementById('liveEmbed');
    const iframe = document.getElementById('liveIframe');
    const placeholder = document.getElementById('livePlaceholder');

    if (!liveEmbed || !iframe || !placeholder) return;

    // Start with placeholder
    showPlaceholder();

    // 1) Try to find an active live stream
    fetchVideoByEventType('live')
      .then((liveVideoId) => {
        if (liveVideoId) {
          // Active live stream
          showIframe(liveVideoId);
          return;
        }

        // 2) If no live, try to find a scheduled (upcoming) live
        return fetchVideoByEventType('upcoming').then((upcomingVideoId) => {
          if (upcomingVideoId) {
            // Scheduled live – YouTube will show the countdown page
            showIframe(upcomingVideoId);
          } else {
            // Nothing scheduled/live -> keep placeholder
            showPlaceholder();
          }
        });
      })
      .catch((err) => {
        console.error('Error checking YouTube live/upcoming status:', err);
        showPlaceholder();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiveEmbed);
  } else {
    initLiveEmbed();
  }
})();
