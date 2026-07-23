/**
 * Color palettes (adapted from cyber-nav featured themes)
 * Sidebar "切换配色" expands inline swatches — does NOT toggle light/dark.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'themePalette';

  const PALETTES = [
    { key: 'cobalt', label: '深海蓝', swatch: '#4d7cff',
      light: { accent: '#315ee8', accentHover: '#4d7cff', accentSoft: 'rgba(49,94,232,.14)', pageBg: '#eef3ff', cardBg: '#ffffff', elevated: '#dfe8ff', sidebar: '#e7edfb', text: '#111c3a', muted: '#596784', border: 'rgba(17,28,58,.12)' },
      dark: { accent: '#6c8fff', accentHover: '#8ce7ff', accentSoft: 'rgba(108,143,255,.22)', pageBg: '#080d1c', cardBg: '#10182d', elevated: '#172440', sidebar: '#0b1225', text: '#edf3ff', muted: '#8fa1c4', border: 'rgba(237,243,255,.12)' } },
    { key: 'aurora', label: '极光玻璃', swatch: '#0f9f8d',
      light: { accent: '#0f9f8d', accentHover: '#08776a', accentSoft: 'rgba(15,159,141,.14)', pageBg: '#edf8f6', cardBg: '#f9fffd', elevated: '#e1f2ef', sidebar: '#e8f6f3', text: '#102b2b', muted: '#567171', border: 'rgba(16,43,43,.12)' },
      dark: { accent: '#78f7d4', accentHover: '#b493ff', accentSoft: 'rgba(120,247,212,.2)', pageBg: '#071411', cardBg: '#0d211c', elevated: '#143129', sidebar: '#0a1b17', text: '#e9fff9', muted: '#91b9ae', border: 'rgba(233,255,249,.12)' } },
    { key: 'porcelain', label: '暖纸', swatch: '#d9653b',
      light: { accent: '#b84a25', accentHover: '#d9653b', accentSoft: 'rgba(184,74,37,.14)', pageBg: '#f3eee5', cardBg: '#fffaf1', elevated: '#e9e0d3', sidebar: '#eee5d8', text: '#2e2924', muted: '#74695f', border: 'rgba(46,41,36,.12)' },
      dark: { accent: '#ff9b73', accentHover: '#ffc1a8', accentSoft: 'rgba(255,155,115,.2)', pageBg: '#211d1a', cardBg: '#2b2521', elevated: '#372f29', sidebar: '#191614', text: '#fff8ed', muted: '#c4b5a6', border: 'rgba(255,248,237,.12)' } },
    { key: 'moss', label: '苔原', swatch: '#4f7b58',
      light: { accent: '#386242', accentHover: '#4f7b58', accentSoft: 'rgba(56,98,66,.14)', pageBg: '#f1f3e8', cardBg: '#fbfcef', elevated: '#e4e9d6', sidebar: '#e9eddd', text: '#263329', muted: '#657064', border: 'rgba(38,51,41,.12)' },
      dark: { accent: '#9bcf91', accentHover: '#d6e98d', accentSoft: 'rgba(155,207,145,.2)', pageBg: '#151b16', cardBg: '#1e281f', elevated: '#29352a', sidebar: '#121813', text: '#f0f6e8', muted: '#a6b49f', border: 'rgba(240,246,232,.12)' } },
    { key: 'ember', label: '暮火', swatch: '#ff6b6b',
      light: { accent: '#d94848', accentHover: '#ff6b6b', accentSoft: 'rgba(217,72,72,.14)', pageBg: '#fff1ec', cardBg: '#fff8f5', elevated: '#ffe4db', sidebar: '#fde8e1', text: '#3a1f1f', muted: '#8a5a55', border: 'rgba(58,31,31,.12)' },
      dark: { accent: '#ff7a7a', accentHover: '#ffb087', accentSoft: 'rgba(255,122,122,.22)', pageBg: '#1a0f14', cardBg: '#26151c', elevated: '#341f28', sidebar: '#140b10', text: '#ffe8e4', muted: '#d0a39a', border: 'rgba(255,232,228,.12)' } },
    { key: 'glacier', label: '冰原', swatch: '#3ec7ff',
      light: { accent: '#1493c9', accentHover: '#3ec7ff', accentSoft: 'rgba(20,147,201,.14)', pageBg: '#eef8ff', cardBg: '#f8fcff', elevated: '#dcefff', sidebar: '#e5f3ff', text: '#123247', muted: '#567891', border: 'rgba(18,50,71,.12)' },
      dark: { accent: '#63d8ff', accentHover: '#b7f0ff', accentSoft: 'rgba(99,216,255,.22)', pageBg: '#07131d', cardBg: '#0d1d2b', elevated: '#13293b', sidebar: '#081520', text: '#e8f7ff', muted: '#8eb3c9', border: 'rgba(232,247,255,.12)' } },
    { key: 'noir', label: '紫夜', swatch: '#b57bff',
      light: { accent: '#7d45d6', accentHover: '#b57bff', accentSoft: 'rgba(125,69,214,.14)', pageBg: '#f4efff', cardBg: '#fbf8ff', elevated: '#e8ddff', sidebar: '#efe8ff', text: '#2a2140', muted: '#6f6488', border: 'rgba(42,33,64,.12)' },
      dark: { accent: '#c9a0ff', accentHover: '#f0a8ff', accentSoft: 'rgba(201,160,255,.22)', pageBg: '#120c1c', cardBg: '#1b1329', elevated: '#261a3a', sidebar: '#0e0916', text: '#f3eaff', muted: '#b5a4d2', border: 'rgba(243,234,255,.12)' } },
    { key: 'candy', label: '梦糖', swatch: '#ff7eb6',
      light: { accent: '#e85a97', accentHover: '#ff7eb6', accentSoft: 'rgba(232,90,151,.14)', pageBg: '#fff3f8', cardBg: '#fffafc', elevated: '#ffe6f1', sidebar: '#ffebf4', text: '#4a2740', muted: '#9a6a84', border: 'rgba(74,39,64,.12)' },
      dark: { accent: '#ff8fc4', accentHover: '#ffd18a', accentSoft: 'rgba(255,143,196,.22)', pageBg: '#1a1018', cardBg: '#261722', elevated: '#342030', sidebar: '#140c13', text: '#ffeaf4', muted: '#d1a4bc', border: 'rgba(255,234,244,.12)' } },
    { key: 'catppuccin', label: 'Catppuccin', swatch: '#cba6f7',
      light: { accent: '#8839ef', accentHover: '#cba6f7', accentSoft: 'rgba(136,57,239,.13)', pageBg: '#eff1f5', cardBg: '#ffffff', elevated: '#e6e9ef', sidebar: '#e6e9ef', text: '#4c4f69', muted: '#6c6f85', border: 'rgba(76,79,105,.12)' },
      dark: { accent: '#cba6f7', accentHover: '#ddb6ff', accentSoft: 'rgba(203,166,247,.18)', pageBg: '#1e1e2e', cardBg: '#181825', elevated: '#252538', sidebar: '#181825', text: '#cdd6f4', muted: '#a6adc8', border: 'rgba(205,214,244,.12)' } },
    { key: 'nord', label: 'Nord', swatch: '#88c0d0',
      light: { accent: '#4c7a92', accentHover: '#5e81ac', accentSoft: 'rgba(76,122,146,.14)', pageBg: '#eceff4', cardBg: '#ffffff', elevated: '#e5e9f0', sidebar: '#e5e9f0', text: '#2e3440', muted: '#4c566a', border: 'rgba(46,52,64,.12)' },
      dark: { accent: '#88c0d0', accentHover: '#a3d7e6', accentSoft: 'rgba(136,192,208,.2)', pageBg: '#2e3440', cardBg: '#3b4252', elevated: '#434c5e', sidebar: '#252b35', text: '#eceff4', muted: '#d8dee9', border: 'rgba(236,239,244,.12)' } },
  ];

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return '59, 130, 246';
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
    try { return localStorage.getItem(STORAGE_KEY) || 'cobalt'; } catch (_) { return 'cobalt'; }
  }

  function applyPalette(key) {
    const def = getPalette(key);
    const mode = isDark() ? 'dark' : 'light';
    const c = def[mode];
    const root = document.documentElement;
    const rgb = hexToRgb(c.accent);

    root.setAttribute('data-palette', def.key);
    root.style.setProperty('--primary-color', c.accent);
    root.style.setProperty('--primary-light', c.accentHover);
    root.style.setProperty('--primary-dark', c.accent);
    root.style.setProperty('--primary-light-rgb', rgb);
    root.style.setProperty('--primary-dark-rgb', rgb);
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
    root.style.setProperty('--divider-color', c.border);
    root.style.setProperty('--glass-bg', `color-mix(in srgb, ${c.cardBg} 86%, transparent)`);
    root.style.setProperty('--sidebar-bg', c.sidebar);
    root.style.setProperty('--primary-soft', c.accentSoft);

    if (mode === 'dark') {
      root.style.setProperty('--dark-bg', c.pageBg);
      root.style.setProperty('--dark-card-bg', c.cardBg);
      root.style.setProperty('--dark-card-bg-hover', c.elevated);
      root.style.setProperty('--dark-text', c.text);
      root.style.setProperty('--dark-text-light', c.muted);
      root.style.setProperty('--dark-border', c.border);
    }

    try { localStorage.setItem(STORAGE_KEY, def.key); } catch (_) {}

    document.querySelectorAll('.palette-swatch').forEach((el) => {
      el.classList.toggle('active', el.dataset.key === def.key);
    });

    window.dispatchEvent(new CustomEvent('paletteChanged', { detail: { palette: def.key, mode } }));
  }

  function buildInlineHtml() {
    return `
      <div class="palette-inline" id="paletteInline" hidden>
        <div class="palette-inline-grid">
          ${PALETTES.map((p) => `
            <button type="button" class="palette-swatch" data-key="${p.key}" title="${p.label}">
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

    // insert after the menu item
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
      el.classList.toggle('active', el.dataset.key === key);
    });
    inline.hidden = false;
    if (item) item.classList.add('palette-open');
    // scroll into view inside menu
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
      e.stopImmediatePropagation(); // block any leftover light/dark handlers
      toggle();
    }, true); // capture phase — run before dashboard/profile handlers

    ensureInline();
  }

  window.addEventListener('languageChanged', syncPaletteMenuLabel);
  window.addEventListener('userPrefsChanged', (e) => {
    if (e.detail && e.detail.language) syncPaletteMenuLabel();
  });

  // re-apply colors when light/dark flips (palette itself unchanged)
  window.addEventListener('themeChanged', () => {
    applyPalette(getStoredPalette());
  });

  function init() {
    applyPalette(getStoredPalette());
    bindMenu();
    // menu HTML may re-render after us
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
