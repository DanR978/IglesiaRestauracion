// js/components/live-embed.js
// Calls Supabase Edge Function to check YouTube live status.
// The API key lives server-side — never exposed to the browser.
(function () {
  const FUNCTION_URL = import.meta.env?.VITE_YOUTUBE_LIVE_FN
    || 'https://snqwxgyhfiinouewxgiy.supabase.co/functions/v1/youtube-live';

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

  /** Update the homepage hero "Ver en línea" → "EN VIVO" when streaming. */
  function reflectLiveOnHero(isLive) {
    const dot = document.getElementById('heroLiveDot');
    const label = document.getElementById('heroWatchLabel');
    if (!dot || !label) return;
    if (isLive) {
      dot.hidden = false;
      label.textContent = 'EN VIVO';
    } else {
      dot.hidden = true;
      label.textContent = 'Ver en línea';
    }
  }

  function initLiveEmbed() {
    const liveEmbed = document.getElementById('liveEmbed');
    const iframe = document.getElementById('liveIframe');
    const placeholder = document.getElementById('livePlaceholder');

    // The hero indicator runs on every page that has #heroLiveDot, even when
    // the full live-embed widget isn't on the page.
    const heroOnly = !liveEmbed || !iframe || !placeholder;

    if (!heroOnly) showPlaceholder();

    fetch(FUNCTION_URL)
      .then((res) => res.json())
      .then((data) => {
        const isLive = !!data.videoId;
        reflectLiveOnHero(isLive);
        if (heroOnly) return;
        if (isLive) showIframe(data.videoId);
        else        showPlaceholder();
      })
      .catch((err) => {
        console.error('Error checking live status:', err);
        reflectLiveOnHero(false);
        if (!heroOnly) showPlaceholder();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiveEmbed);
  } else {
    initLiveEmbed();
  }
})();