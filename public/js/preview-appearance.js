/** Preview pages reuse the main site's theme/palette managers, without its navigation. */
(function () {
    const logo = document.getElementById('previewBrandLogo');
    if (logo) {
        const useFallback = () => {
            const fallback = new URL('/images/logo.svg', window.location.origin).href;
            if (logo.src !== fallback) logo.src = fallback;
        };
        logo.addEventListener('error', useFallback);
        if (logo.complete && !logo.naturalWidth) useFallback();
    }

    window.addEventListener('storage', (event) => {
        if (event.key === 'themePalette' || event.key === null) {
            window.DuckPalette?.apply(event.newValue || 'cobalt');
        }
        if ((event.key === 'theme' && !event.newValue) || event.key === null) {
            const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            window.themeManager?.applyTheme(theme);
        }
    });
})();
