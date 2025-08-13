(function () {
    const isDev = /^(localhost|127\.0\.0\.1)/.test(location.hostname);
    if (!isDev) return;

    window.addEventListener('error', (ev) => {
    if (!ev || !ev.error || !ev.error.stack) ev.stopImmediatePropagation();
    }, true);

    window.addEventListener('unhandledrejection', (ev) => {
    const r = ev?.reason;
    if (r == null || (typeof r === 'object' && !r.stack)) ev.stopImmediatePropagation();
    }, true);
})();
