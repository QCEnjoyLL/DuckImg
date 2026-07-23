/**
 * DuckShell — drawer, scroll-lock, toast
 * Motion optional; close is always reliable (CSS first).
 */
(function () {
  'use strict';

  let animateFn = null;
  let animatePromise = null;
  let scrollY = 0;
  let lockCount = 0;
  let drawerOpen = false;
  let reducedMotion = false;
  let closing = false;

  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {}

  function loadAnimate() {
    if (animateFn) return Promise.resolve(animateFn);
    if (animatePromise) return animatePromise;
    animatePromise = import('https://cdn.jsdelivr.net/npm/motion@11.15.0/+esm')
      .then((m) => {
        animateFn = m.animate;
        return animateFn;
      })
      .catch(() => {
        animateFn = null;
        return null;
      });
    return animatePromise;
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function lockScroll() {
    lockCount += 1;
    if (lockCount > 1) return;
    scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('dk-scroll-lock');
    document.body.style.top = `-${scrollY}px`;
  }

  function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0) return;
    document.body.classList.remove('dk-scroll-lock');
    document.body.style.top = '';
    window.scrollTo(0, scrollY);
  }

  /** Force-unlock everything (safety for stuck overlay) */
  function forceUnlock() {
    lockCount = 0;
    document.body.classList.remove('dk-scroll-lock');
    document.body.style.top = '';
    document.body.style.overflow = '';
  }

  function springOpts(extra) {
    return Object.assign(
      { type: 'spring', bounce: 0, duration: reducedMotion ? 0.01 : 0.35 },
      extra || {}
    );
  }

  function setDrawerOpenVisual(open) {
    const menu = document.getElementById('sideMenu');
    const overlay = document.getElementById('menuOverlay');
    if (menu) {
      menu.classList.toggle('mobile-visible', open);
      if (open) {
        menu.style.transform = 'translateX(0)';
      } else {
        menu.style.transform = '';
        menu.style.removeProperty('transform');
      }
    }
    if (overlay) {
      overlay.classList.toggle('active', open);
      // belt-and-suspenders for stuck glass
      if (!open) {
        overlay.style.opacity = '';
        overlay.style.visibility = '';
        overlay.style.pointerEvents = '';
      }
    }
  }

  async function openDrawer() {
    const menu = document.getElementById('sideMenu');
    if (!menu || !isMobile()) return;
    if (drawerOpen) return;

    drawerOpen = true;
    closing = false;
    lockScroll();
    setDrawerOpenVisual(true);

    // start off-screen then spring in (optional polish)
    menu.style.transform = 'translateX(-105%)';
    // force reflow
    void menu.offsetWidth;

    const animate = await loadAnimate();
    if (animate && !reducedMotion && drawerOpen) {
      try {
        await animate(menu, { x: 0 }, springOpts()).finished;
      } catch (_) {}
      if (drawerOpen) menu.style.transform = 'translateX(0)';
    } else {
      menu.style.transform = 'translateX(0)';
    }
  }

  async function closeDrawer() {
    const menu = document.getElementById('sideMenu');
    if (!menu) {
      drawerOpen = false;
      forceUnlock();
      return;
    }
    if (closing) return;
    closing = true;
    drawerOpen = false;

    // Immediate overlay hide + unlock — never leave glass stuck waiting for Motion
    const overlay = document.getElementById('menuOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.style.pointerEvents = 'none';
    }
    forceUnlock();

    const finish = () => {
      menu.classList.remove('mobile-visible');
      menu.style.transform = '';
      menu.style.removeProperty('transform');
      if (overlay) {
        overlay.classList.remove('active');
        overlay.style.opacity = '';
        overlay.style.visibility = '';
        overlay.style.pointerEvents = '';
      }
      closing = false;
    };

    if (!isMobile()) {
      finish();
      return;
    }

    const animate = await loadAnimate();
    if (animate && !reducedMotion) {
      try {
        await animate(menu, { x: '-105%' }, springOpts({ duration: 0.3 })).finished;
      } catch (_) {}
      finish();
    } else {
      // CSS fallback
      menu.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';
      menu.style.transform = 'translateX(-105%)';
      setTimeout(finish, 300);
    }
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  }

  function isDrawerOpen() {
    return drawerOpen;
  }

  // ponytail: mobile edge drag-to-close; velocity handoff only if Gesture API grows
  function bindDrawerDrag() {
    const menu = document.getElementById('sideMenu');
    if (!menu || menu.dataset.dragBound) return;
    menu.dataset.dragBound = '1';

    let active = false;
    let startX = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;

    const onDown = (e) => {
      if (!isMobile() || !drawerOpen || closing) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      active = true;
      dragging = false;
      startX = e.clientX;
      lastX = e.clientX;
      lastT = performance.now();
      velocity = 0;
      try { menu.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const onMove = (e) => {
      if (!active || !drawerOpen) return;
      const x = e.clientX;
      const dx = x - startX;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = ((x - lastX) / dt) * 1000;
      lastX = x;
      lastT = now;
      if (!dragging && Math.abs(dx) > 10) {
        dragging = true;
        menu.style.transition = 'none';
      }
      if (!dragging) return;
      // only drag closed (left)
      const tx = Math.min(0, dx);
      menu.style.transform = `translateX(${tx}px)`;
      const overlay = document.getElementById('menuOverlay');
      if (overlay) {
        const w = menu.offsetWidth || 280;
        const p = Math.max(0, 1 + tx / w);
        overlay.style.opacity = String(p);
      }
      e.preventDefault();
    };

    const onUp = () => {
      if (!active) return;
      active = false;
      if (!dragging) return;
      dragging = false;
      menu.style.transition = '';
      const overlay = document.getElementById('menuOverlay');
      if (overlay) overlay.style.opacity = '';
      const w = menu.offsetWidth || 280;
      const m = menu.style.transform.match(/translateX\((-?[\d.]+)px\)/);
      const cur = m ? parseFloat(m[1]) : 0;
      const shouldClose = cur < -w * 0.28 || velocity < -500;
      if (shouldClose) closeDrawer();
      else {
        // spring back open
        menu.style.transform = 'translateX(0)';
        loadAnimate().then((animate) => {
          if (animate && !reducedMotion) {
            animate(menu, { x: 0 }, springOpts({ velocity: velocity / 1000 })).catch(() => {});
          }
        });
      }
    };

    menu.addEventListener('pointerdown', onDown);
    menu.addEventListener('pointermove', onMove);
    menu.addEventListener('pointerup', onUp);
    menu.addEventListener('pointercancel', onUp);
  }

  function hidePageLoader() {
    const el = document.getElementById('pageLoader');
    if (!el) return;
    el.classList.add('loaded', 'is-hidden');
    setTimeout(() => {
      el.style.display = 'none';
    }, 280);
  }

  function toast(message, type) {
    let host = document.getElementById('dkToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dkToastHost';
      host.style.cssText =
        'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:500;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(host);
    }
    const node = document.createElement('div');
    node.textContent = message;
    node.style.cssText =
      'pointer-events:auto;padding:12px 18px;border-radius:12px;background:rgba(28,28,30,0.92);color:#f5f5f7;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,0.15);max-width:min(360px,90vw);text-align:center;';
    if (type === 'error') node.style.background = 'rgba(255,59,48,0.95)';
    if (type === 'success') node.style.background = 'rgba(52,199,89,0.95)';
    host.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity 0.25s ease';
      setTimeout(() => node.remove(), 260);
    }, 2600);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerOpen) closeDrawer();
  });

  // Resize to desktop: force close mobile drawer + clear leftover lock
  window.addEventListener('resize', () => {
    if (!isMobile() && (drawerOpen || document.getElementById('menuOverlay')?.classList.contains('active'))) {
      drawerOpen = false;
      closing = false;
      setDrawerOpenVisual(false);
      forceUnlock();
    }
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(hidePageLoader, 80);
    setTimeout(bindDrawerDrag, 0);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(hidePageLoader, 80);
      bindDrawerDrag();
    });
  }
  window.addEventListener('load', () => setTimeout(hidePageLoader, 40));

  window.DuckShell = {
    openDrawer,
    closeDrawer,
    toggleDrawer,
    isDrawerOpen,
    lockScroll,
    unlockScroll,
    forceUnlock,
    hidePageLoader,
    toast,
    loadAnimate,
    springOpts,
    isMobile,
  };
})();
