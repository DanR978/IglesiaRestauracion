// js/components/live-embed.js
// Calls Supabase Edge Function to check YouTube live status.
// The API key lives server-side — never exposed to the browser.
(function () {
  const FUNCTION_URL =
    'https://snqwxgyhfiinouewxgiy.supabase.co/functions/v1/youtube-live';

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

  function initLiveEmbed() {
    const liveEmbed = document.getElementById('liveEmbed');
    const iframe = document.getElementById('liveIframe');
    const placeholder = document.getElementById('livePlaceholder');

    if (!liveEmbed || !iframe || !placeholder) return;

    showPlaceholder();

    fetch(FUNCTION_URL)
      .then((res) => res.json())
      .then((data) => {
        if (data.videoId) {
          showIframe(data.videoId);
        } else {
          showPlaceholder();
        }
      })
      .catch((err) => {
        console.error('Error checking live status:', err);
        showPlaceholder();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiveEmbed);
  } else {
    initLiveEmbed();
  }
})();