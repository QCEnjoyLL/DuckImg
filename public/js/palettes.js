/**
 * Color palettes — Studio Gallery default + 10 curated accent/surface themes
 * Sidebar "切换配色" expands inline swatches — does NOT toggle light/dark.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'themePalette';

  const PALETTES = [
    { key: 'studio', label: '静墨（默认）', swatch: 'linear-gradient(135deg, #18181b 52%, #e4e4e7 52%)', featured: true,
      light: { accent: '#18181b', accentHover: '#27272a', onAccent: '#ffffff', accentSoft: 'rgba(24,24,27,.08)', pageBg: '#f7f7f6', cardBg: '#ffffff', elevated: '#f0f0ee', sidebar: '#f1f1ef', text: '#141413', muted: '#5c5c58', border: 'rgba(20,20,19,.09)', borderStrong: 'rgba(20,20,19,.17)' },
      dark: { accent: '#f4f4f5', accentHover: '#ffffff', onAccent: '#111113', accentSoft: 'rgba(255,255,255,.11)', pageBg: '#0c0c0e', cardBg: '#151518', elevated: '#1e1e22', sidebar: '#101012', text: '#f3f3f2', muted: '#9e9e98', border: 'rgba(255,255,255,.09)', borderStrong: 'rgba(255,255,255,.17)' } },
    { key: 'cobalt', label: '深海蓝', swatch: '#2554e0',
      light: { accent: '#2554e0', accentHover: '#1d46c7', onAccent: '#ffffff', accentSoft: 'rgba(37,84,224,.12)', pageBg: '#f4f6fb', cardBg: '#ffffff', elevated: '#eaf0fb', sidebar: '#edf1f8', text: '#111827', muted: '#52607a', border: 'rgba(17,24,39,.09)', borderStrong: 'rgba(17,24,39,.16)' },
      dark: { accent: '#7aa2ff', accentHover: '#96b6ff', onAccent: '#091124', accentSoft: 'rgba(122,162,255,.2)', pageBg: '#0a0e1a', cardBg: '#111728', elevated: '#182238', sidebar: '#0d1322', text: '#eef3ff', muted: '#93a5c7', border: 'rgba(238,243,255,.1)', borderStrong: 'rgba(238,243,255,.18)' } },
    { key: 'aurora', label: '极光玻璃', swatch: '#0c7c6e',
      light: { accent: '#0c7c6e', accentHover: '#086358', onAccent: '#ffffff', accentSoft: 'rgba(12,124,110,.12)', pageBg: '#f2f8f6', cardBg: '#ffffff', elevated: '#e4f2ee', sidebar: '#eaf4f1', text: '#102624', muted: '#4d6b68', border: 'rgba(16,38,36,.09)', borderStrong: 'rgba(16,38,36,.16)' },
      dark: { accent: '#6ee7c8', accentHover: '#93f0d8', onAccent: '#071a15', accentSoft: 'rgba(110,231,200,.18)', pageBg: '#081210', cardBg: '#0f1d19', elevated: '#162b25', sidebar: '#0b1613', text: '#ebfff9', muted: '#8eb5aa', border: 'rgba(235,255,249,.1)', borderStrong: 'rgba(235,255,249,.18)' } },
    { key: 'porcelain', label: '暖纸', swatch: '#b84a25',
      light: { accent: '#b84a25', accentHover: '#9e3c1b', onAccent: '#ffffff', accentSoft: 'rgba(184,74,37,.12)', pageBg: '#f3eee5', cardBg: '#fffcf6', elevated: '#ebe3d6', sidebar: '#ede6da', text: '#26211c', muted: '#6b6056', border: 'rgba(38,33,28,.1)', borderStrong: 'rgba(38,33,28,.18)' },
      dark: { accent: '#ff9b73', accentHover: '#ffb699', onAccent: '#1f120c', accentSoft: 'rgba(255,155,115,.18)', pageBg: '#1b1815', cardBg: '#24201c', elevated: '#302a24', sidebar: '#161311', text: '#fcf6ec', muted: '#bfb0a0', border: 'rgba(252,246,236,.1)', borderStrong: 'rgba(252,246,236,.18)' } },
    { key: 'moss', label: '苔原', swatch: '#386242',
      light: { accent: '#386242', accentHover: '#2b4e33', onAccent: '#ffffff', accentSoft: 'rgba(56,98,66,.12)', pageBg: '#f2f4eb', cardBg: '#fcfdf7', elevated: '#e6eadb', sidebar: '#eaeee0', text: '#222d24', muted: '#5d695c', border: 'rgba(34,45,36,.1)', borderStrong: 'rgba(34,45,36,.18)' },
      dark: { accent: '#9bcf91', accentHover: '#b4ddac', onAccent: '#0d1a0f', accentSoft: 'rgba(155,207,145,.18)', pageBg: '#141915', cardBg: '#1c241d', elevated: '#263128', sidebar: '#101511', text: '#eff5e8', muted: '#a2b19b', border: 'rgba(239,245,232,.1)', borderStrong: 'rgba(239,245,232,.18)' } },
    { key: 'ember', label: '暮火', swatch: '#c83737',
      light: { accent: '#c83737', accentHover: '#ad2b2b', onAccent: '#ffffff', accentSoft: 'rgba(200,55,55,.12)', pageBg: '#fdf5f2', cardBg: '#fffbfa', elevated: '#f9e6df', sidebar: '#f8ece8', text: '#311a1a', muted: '#7a524e', border: 'rgba(49,26,26,.09)', borderStrong: 'rgba(49,26,26,.17)' },
      dark: { accent: '#ff8a8a', accentHover: '#ffabab', onAccent: '#240b0e', accentSoft: 'rgba(255,138,138,.2)', pageBg: '#170f13', cardBg: '#22161b', elevated: '#2f1f26', sidebar: '#130b0f', text: '#ffece8', muted: '#cca29a', border: 'rgba(255,236,232,.1)', borderStrong: 'rgba(255,236,232,.18)' } },
    { key: 'glacier', label: '冰原', swatch: '#0d78a6',
      light: { accent: '#0d78a6', accentHover: '#096187', onAccent: '#ffffff', accentSoft: 'rgba(13,120,166,.12)', pageBg: '#f2f7fb', cardBg: '#ffffff', elevated: '#e2eff8', sidebar: '#e9f2f9', text: '#102a3b', muted: '#506f85', border: 'rgba(16,42,59,.09)', borderStrong: 'rgba(16,42,59,.16)' },
      dark: { accent: '#63d8ff', accentHover: '#8ce3ff', onAccent: '#061a26', accentSoft: 'rgba(99,216,255,.2)', pageBg: '#08121a', cardBg: '#0f1c27', elevated: '#162837', sidebar: '#09141d', text: '#eaf7ff', muted: '#8fb2c7', border: 'rgba(234,247,255,.1)', borderStrong: 'rgba(234,247,255,.18)' } },
    { key: 'noir', label: '紫夜', swatch: '#6d39c4',
      light: { accent: '#6d39c4', accentHover: '#582aa3', onAccent: '#ffffff', accentSoft: 'rgba(109,57,196,.12)', pageBg: '#f6f3fb', cardBg: '#ffffff', elevated: '#ebe3fa', sidebar: '#efeaf8', text: '#251c38', muted: '#675b80', border: 'rgba(37,28,56,.09)', borderStrong: 'rgba(37,28,56,.16)' },
      dark: { accent: '#c9a0ff', accentHover: '#dabfff', onAccent: '#180c29', accentSoft: 'rgba(201,160,255,.2)', pageBg: '#110c19', cardBg: '#1a1326', elevated: '#241a35', sidebar: '#0d0914', text: '#f3ebff', muted: '#b3a3cf', border: 'rgba(243,235,255,.1)', borderStrong: 'rgba(243,235,255,.18)' } },
    { key: 'candy', label: '梦糖', swatch: '#c23670',
      light: { accent: '#c23670', accentHover: '#a62a5d', onAccent: '#ffffff', accentSoft: 'rgba(194,54,112,.12)', pageBg: '#fcf4f8', cardBg: '#ffffff', elevated: '#f9e6f0', sidebar: '#f8ebf2', text: '#3d1e34', muted: '#7f5770', border: 'rgba(61,30,52,.09)', borderStrong: 'rgba(61,30,52,.16)' },
      dark: { accent: '#ff94c6', accentHover: '#ffb3d7', onAccent: '#240b19', accentSoft: 'rgba(255,148,198,.2)', pageBg: '#181016', cardBg: '#231720', elevated: '#30202c', sidebar: '#130c12', text: '#ffecf5', muted: '#cba1b7', border: 'rgba(255,236,245,.1)', borderStrong: 'rgba(255,236,245,.18)' } },
    { key: 'catppuccin', label: 'Catppuccin', swatch: '#7c2ae8',
      light: { accent: '#7c2ae8', accentHover: '#661ec4', onAccent: '#ffffff', accentSoft: 'rgba(124,42,232,.12)', pageBg: '#eff1f5', cardBg: '#ffffff', elevated: '#e6e9ef', sidebar: '#e6e9ef', text: '#4c4f69', muted: '#6c6f85', border: 'rgba(76,79,105,.1)', borderStrong: 'rgba(76,79,105,.18)' },
      dark: { accent: '#cba6f7', accentHover: '#dbc0ff', onAccent: '#181424', accentSoft: 'rgba(203,166,247,.18)', pageBg: '#1e1e2e', cardBg: '#181825', elevated: '#252538', sidebar: '#14141f', text: '#cdd6f4', muted: '#a6adc8', border: 'rgba(205,214,244,.1)', borderStrong: 'rgba(205,214,244,.18)' } },
    { key: 'nord', label: 'Nord', swatch: '#3e6880',
      light: { accent: '#3e6880', accentHover: '#325569', onAccent: '#ffffff', accentSoft: 'rgba(62,104,128,.12)', pageBg: '#eceff4', cardBg: '#ffffff', elevated: '#e5e9f0', sidebar: '#e5e9f0', text: '#2e3440', muted: '#4c566a', border: 'rgba(46,52,64,.1)', borderStrong: 'rgba(46,52,64,.18)' },
      dark: { accent: '#88c0d0', accentHover: '#a3d4e3', onAccent: '#161b22', accentSoft: 'rgba(136,192,208,.18)', pageBg: '#2e3440', cardBg: '#3b4252', elevated: '#434c5e', sidebar: '#252b35', text: '#eceff4', muted: '#d8dee9', border: 'rgba(236,239,244,.1)', borderStrong: 'rgba(236,239,244,.18)' } },
  ];

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return '24, 24, 27';
    return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
  }

  function getPalette(key) {
    return PALETTES.find((p) => p.key === key) || PALETTES[0];
  }

  function isDark() {
    return document.documentElement.classList.contains('dark-mode') ||
      document.body.classList.contains('dark-mode');
  }

  function getStoredPalette() {
    try { return localStorage.getItem(STORAGE_KEY) || 'studio'; } catch (_) { return 'studio'; }
  }

  function applyPalette(key, opts) {
    const def = getPalette(key);
    const mode = isDark() ? 'dark' : 'light';
    const c = def[mode];
    const root = document.documentElement;
    const rgb = hexToRgb(c.accent);

    root.setAttribute('data-palette', def.key);
    root.style.setProperty('--primary-color', c.accent);
    root.style.setProperty('--primary-light', c.accentHover);
    root.style.setProperty('--primary-dark', c.accent);
    root.style.setProperty('--primary-hover', c.accentHover);
    root.style.setProperty('--text-on-primary', c.onAccent);
    root.style.setProperty('--primary-light-rgb', rgb);
    root.style.setProperty('--primary-dark-rgb', rgb);
    root.style.setProperty('--primary-gradient', `linear-gradient(180deg, ${c.accentHover}, ${c.accent})`);
    root.style.setProperty('--accent-color', c.accent);
    root.style.setProperty('--accent-light', c.accentHover);
    root.style.setProperty('--accent-dark', c.accent);
    root.style.setProperty('--bg-color', c.pageBg);
    root.style.setProperty('--card-bg', c.cardBg);
    root.style.setProperty('--card-bg-hover', c.elevated);
    root.style.setProperty('--text-color', c.text);
    root.style.setProperty('--text-light', c.muted);
    root.style.setProperty('--text-lighter', c.muted);
    root.style.setProperty('--border-color', c.border);
    root.style.setProperty('--border-strong', c.borderStrong);
    root.style.setProperty('--divider-color', c.border);
    root.style.setProperty('--glass-bg', `color-mix(in srgb, ${c.pageBg} 84%, transparent)`);
    root.style.setProperty('--sidebar-bg', c.sidebar);
    root.style.setProperty('--primary-soft', c.accentSoft);

    if (mode === 'dark') {
      root.style.setProperty('--dark-bg', c.pageBg);
      root.style.setProperty('--dark-card-bg', c.cardBg);
      root.style.setProperty('--dark-card-bg-hover', c.elevated);
      root.style.setProperty('--dark-text', c.text);
      root.style.setProperty('--dark-text-light', c.muted);
      root.style.setProperty('--dark-border', c.border);
      root.style.setProperty('--dark-divider', c.border);
      root.style.setProperty('--dark-glass-bg', `color-mix(in srgb, ${c.pageBg} 84%, transparent)`);
    }

    if (!opts || opts.persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, def.key); } catch (_) {}
    }

    document.querySelectorAll('.palette-swatch').forEach((el) => {
      const active = el.dataset.key === def.key;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });

    window.dispatchEvent(new CustomEvent('paletteChanged', { detail: { palette: def.key, mode } }));
  }

  function buildInlineHtml() {
    return `
      <div class="palette-inline" id="paletteInline" hidden>
        <div class="palette-inline-grid">
          ${PALETTES.map((p) => `
            <button type="button" class="palette-swatch${p.featured ? ' palette-swatch-featured' : ''}" data-key="${p.key}" title="${p.label}" aria-pressed="false">
              <span class="palette-swatch-color" style="background:${p.swatch}"></span>
              <span class="palette-swatch-label">${p.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function ensureInline() {
    const menuItem = document.getElementById('themeMenuItem');
    if (!menuItem) return null;

    let wrap = document.getElementById('paletteInlineWrap');
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.id = 'paletteInlineWrap';
    wrap.className = 'palette-inline-wrap';
    wrap.innerHTML = buildInlineHtml();

    if (menuItem.parentNode) {
      menuItem.parentNode.insertBefore(wrap, menuItem.nextSibling);
    }

    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sw = e.target.closest('.palette-swatch');
      if (sw && sw.dataset.key) {
        applyPalette(sw.dataset.key);
        collapse();
      }
    });

    return wrap;
  }

  function isOpen() {
    const inline = document.getElementById('paletteInline');
    return inline && !inline.hidden;
  }

  function expand() {
    ensureInline();
    const inline = document.getElementById('paletteInline');
    const item = document.getElementById('themeMenuItem');
    if (!inline) return;
    const key = getStoredPalette();
    inline.querySelectorAll('.palette-swatch').forEach((el) => {
      const active = el.dataset.key === key;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    inline.hidden = false;
    if (item) item.classList.add('palette-open');
    setTimeout(() => {
      inline.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
  }

  function collapse() {
    const inline = document.getElementById('paletteInline');
    const item = document.getElementById('themeMenuItem');
    if (inline) inline.hidden = true;
    if (item) item.classList.remove('palette-open');
  }

  function toggle() {
    if (isOpen()) collapse();
    else expand();
  }

  function paletteLabel() {
    if (window.UserPrefs && typeof window.UserPrefs.t === 'function') {
      const lang = (window.UserPrefs.read && window.UserPrefs.read().language) || 'zh-CN';
      return window.UserPrefs.t('menu.palette', lang);
    }
    return '切换配色';
  }

  function syncPaletteMenuLabel() {
    const item = document.getElementById('themeMenuItem');
    if (!item) return;
    const label = paletteLabel();
    const text = item.querySelector('.menu-item-text');
    if (text) {
      if (!text.hasAttribute('data-i18n')) text.setAttribute('data-i18n', 'menu.palette');
      text.textContent = label;
    }
    const tip = item.querySelector('.menu-tooltip');
    if (tip) {
      if (!tip.hasAttribute('data-i18n')) tip.setAttribute('data-i18n', 'menu.palette');
      tip.textContent = label;
    }
    const icon = item.querySelector('.menu-item-icon i');
    if (icon) icon.className = 'ri-palette-line';
  }

  function bindMenu() {
    const item = document.getElementById('themeMenuItem');
    if (!item) return;

    syncPaletteMenuLabel();

    if (item.dataset.paletteBound) return;
    item.dataset.paletteBound = '1';

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle();
    }, true);

    ensureInline();
  }

  window.addEventListener('languageChanged', syncPaletteMenuLabel);
  window.addEventListener('userPrefsChanged', (e) => {
    if (e.detail && e.detail.language) syncPaletteMenuLabel();
  });

  window.addEventListener('themeChanged', () => {
    applyPalette(getStoredPalette(), { persist: false });
  });

  function init() {
    applyPalette(getStoredPalette(), { persist: false });
    bindMenu();
    setTimeout(bindMenu, 0);
    setTimeout(bindMenu, 100);
    setTimeout(bindMenu, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DuckPalette = {
    list: PALETTES,
    apply: applyPalette,
    get: getStoredPalette,
    open: expand,
    close: collapse,
    toggle,
  };
})();
