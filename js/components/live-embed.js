// js/app/components/live-embed.js
(function () {
  const CHANNEL_ID = 'UCIrKtgR89PjeEJMHPDuomQw';
  const API_KEY = 'AIzaSyBvV3Gq4sDsX-H32e_mBv30XM3BPccZTGA';

  function showIframe(videoId) {
    const liveEmbed = document.getElementById('liveEmbed');
    const iframe = document.getElementById('liveIframe');
    const placeholderLink = document.getElementById('livePlaceholderLink');

    if (!liveEmbed || !iframe) return;

    iframe.src = `https://www.youtube.com/embed/${videoId}`;
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

    showPlaceholder();

    fetchVideoByEventType('live')
      .then((liveVideoId) => {
        if (liveVideoId) {
          showIframe(liveVideoId);
          return;
        }

        return fetchVideoByEventType('upcoming').then((upcomingVideoId) => {
          if (upcomingVideoId) {
            showIframe(upcomingVideoId);
          } else {
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
