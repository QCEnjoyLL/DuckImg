/**
 * 前端回归测试（CDP + 无头浏览器）。
 *
 * 为什么需要：最近的三个真实故障**全部是前端问题**（透明背景变黑、WebP 上传失败、
 * 「再次上传」后布局失去居中），而 test/ 里只有 Workers 侧测试，一个都拦不住。
 *
 * 设计要点：
 *  - 不引入 puppeteer/playwright 依赖：Node 24 自带 fetch 与 WebSocket，直接驱动 CDP
 *  - 断言的是**计算样式与几何**，不是源码字符串 —— 这样才能真正锁住"布局回归"
 *  - 每个断言都针对一类已发生过的真实 bug，并尽量带"反向对照"（先制造问题再确认能被发现）
 *
 * 用法：
 *   npm run test:frontend
 *   npm run test:frontend -- --keep-open   # 排查时保留浏览器
 *   CHROME_PATH=/path/to/chrome npm run test:frontend
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const KEEP = process.argv.includes('--keep-open');

/** 按平台寻找可用的 Chromium 系浏览器 */
function findBrowser() {
  const fromEnv = process.env.CHROME_PATH || process.env.CHROME_BIN;
  const candidates = [
    fromEnv,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return null;
}

let pass = 0, fail = 0;
const results = [];
function check(label, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push({ ok, label, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('✗ 找不到 Chrome / Edge。请设置 CHROME_PATH 环境变量指向浏览器可执行文件。');
    process.exit(2);
  }
  console.log(`前端回归测试\n浏览器：${browser}\n`);

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckimg-fe-'));
  const port = 9500 + Math.floor(Math.random() * 400);
  const proc = spawn(browser, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1400,900', 'about:blank',
  ], { stdio: 'ignore' });

  let ws, msgId = 0;
  const pending = new Map();
  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  };
  const evalIn = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const open = async (relPath, readyExpr) => {
    await send('Page.navigate', { url: 'file:///' + path.join(ROOT, relPath).replace(/\\/g, '/') });
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      const r = await send('Runtime.evaluate', { expression: `document.readyState === 'complete'`, returnByValue: true });
      if (r.result.value === true) break;
    }
    if (readyExpr) {
      for (let i = 0; i < 40; i++) {
        if (await evalIn(readyExpr)) return;
        await sleep(250);
      }
      throw new Error(`等待就绪超时：${readyExpr}`);
    }
  };

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch {}
      await sleep(250);
    }
    if (!targets?.length) throw new Error('无法连接浏览器调试端口');
    ws = new WebSocket((targets.find((t) => t.type === 'page') || targets[0]).webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');

    // ── 1. index.html：配额胶囊的显示/隐藏 ──────────────────────────────
    // 回归：.upload-quota 在 CSS 里是 display:inline-flex !important，
    // 内联 style.display 永远输给它，所以隐藏必须是空操作以外的机制（hidden 属性）。
    console.log('index.html');
    await open('public/index.html', `!!document.getElementById('uploadQuota')`);
    const quota = await evalIn(`(() => {
      const el = document.getElementById('uploadQuota');
      const before = { hidden: el.hidden, display: getComputedStyle(el).display, text: (el.textContent||'').trim() };
      el.hidden = false; const shown = getComputedStyle(el).display;
      el.hidden = true;  const hidden = getComputedStyle(el).display;
      return { before, shown, hidden };
    })()`);
    check('初始态自洽（可见必有内容，不可见必为空）',
      (quota.before.hidden && quota.before.display === 'none' && quota.before.text === '')
      || (!quota.before.hidden && quota.before.display !== 'none' && quota.before.text.length > 0),
      `hidden=${quota.before.hidden} display=${quota.before.display} text="${quota.before.text}"`);
    check('可以显示（未被 !important 压掉）', quota.shown !== 'none', quota.shown);
    check('可以真正隐藏（修复前这是空操作）', quota.hidden === 'none', quota.hidden);

    // ── 2. index.html：「再次上传」后上传区仍是 flex ─────────────────────
    // 回归：app.js 曾写 dropArea.style.display='block'，覆盖 CSS 的 display:flex，
    // 导致 .upload-hint 撑满整行、失去居中。
    const again = await evalIn(`(async () => {
      const drop = document.getElementById('dropArea');
      const result = document.getElementById('resultContainer');
      const btn = document.getElementById('uploadAgainBtn');
      const before = getComputedStyle(drop).display;
      // 模拟"已上传成功"
      drop.style.display = 'none'; result.style.display = 'block';
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 300));
      const hint = document.querySelector('.upload-hint');
      const hr = hint.getBoundingClientRect();
      const tr = document.querySelector('.upload-text').getBoundingClientRect();
      const tops = new Set([...hint.children].map(c => Math.round(c.getBoundingClientRect().top)));
      return {
        before,
        after: getComputedStyle(drop).display,
        rows: tops.size,
        hintVsText: Math.round(((hr.left + hr.right) / 2 - (tr.left + tr.right) / 2) * 10) / 10,
      };
    })()`);
    check('初始是 flex', again.before === 'flex', again.before);
    check('点「再次上传」后仍恢复为 flex（未退化成 block）', again.after === 'flex', again.after);
    check('.upload-hint 保持单行', again.rows === 1, `${again.rows} 行`);
    check('.upload-hint 与标题水平居中一致', Math.abs(again.hintVsText) <= 1, `偏移 ${again.hintVsText}px`);

    const linkIcons = await evalIn(`(() => {
      return [...document.querySelectorAll('.link-item label')].map(label => ({
        icons: label.querySelectorAll('i').length,
        before: getComputedStyle(label, '::before').content,
        beforeDisplay: getComputedStyle(label, '::before').display,
        icon: label.querySelector('i')?.className,
      }));
    })()`);
    check('四种链接标签只显示一个图标，无重复装饰色块', linkIcons.length === 4 && linkIcons.every(item => item.icons === 1 && item.before === 'none' && item.beforeDisplay === 'none'), JSON.stringify(linkIcons));
    check('Markdown 使用自己的图标且复制目标保持不变', linkIcons[3]?.icon === 'ri-markdown-line' && await evalIn(`document.querySelector('[data-clipboard-target="#mdCode"]') !== null`));

    // Use mocked upload responses: no images or credentials leave the browser.
    console.log('\nupload moderation dialog');
    await evalIn(`(() => {
      window.__originalXHR = window.XMLHttpRequest;
      if (window.UserPrefs) window.UserPrefs.processFiles = async files => Array.from(files);
      window.__uploadResponse = [];
      window.__uploadHttpStatus = 200;
      window.XMLHttpRequest = class {
        upload = { addEventListener() {} };
        open() {} setRequestHeader() {}
        send() { this.status = window.__uploadHttpStatus; this.response = window.__uploadResponse; this.onload(); }
      };
      window.__testUpload = async (response, status = 200) => {
        window.__uploadResponse = response;
        window.__uploadHttpStatus = status;
        document.getElementById('uploadAgainBtn').click();
        document.getElementById('uploadBtn').focus();
        await window.uploadHandlers.handleFiles([new File(['test'], 'test.png', { type: 'image/png' })]);
      };
    })()`);
    const blocked = await evalIn(`(async () => {
      await window.__testUpload([
        { blocked: true, error: '图片未通过内容审核，已被拦截', fileName: '<img src=x onerror=alert(1)>.png' },
        { blocked: true, error: '图片未通过内容审核，已被拦截', fileName: 'second.png' },
      ]);
      const dialog = document.getElementById('uploadModerationDialog');
      return {
        open: dialog.open, modal: dialog.matches(':modal'),
        rows: dialog.querySelectorAll('li').length,
        focus: document.activeElement.className,
        images: dialog.querySelectorAll('img').length,
        filename: dialog.querySelector('strong').textContent,
        scrollLocked: document.body.classList.contains('dk-scroll-lock'),
        inline: document.getElementById('uploadStatus').textContent,
      };
    })()`);
    check('审核失败显示真正的模态弹窗', blocked.open && blocked.modal);
    check('批量拦截合并到一个弹窗', blocked.rows === 2, `${blocked.rows} rows`);
    check('默认聚焦确认按钮且锁定背景滚动', blocked.focus === 'upload-moderation-confirm' && blocked.scrollLocked);
    check('文件名安全显示，不作为 HTML 解析', blocked.images === 0 && blocked.filename.startsWith('<img'));
    check('保留原上传区错误提示', blocked.inline.includes('图片未通过内容审核'));

    if (process.env.DUCKIMG_FRONTEND_SCREENSHOTS) {
      fs.mkdirSync(process.env.DUCKIMG_FRONTEND_SCREENSHOTS, { recursive: true });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.env.DUCKIMG_FRONTEND_SCREENSHOTS, 'moderation-desktop.png'), Buffer.from(shot.data, 'base64'));
    }
    await evalIn(`document.querySelector('.upload-moderation-confirm').click()`);
    await sleep(50);
    const closed = await evalIn(`({ open: document.getElementById('uploadModerationDialog').open,
      locked: document.body.classList.contains('dk-scroll-lock'), focus: document.activeElement.id })`);
    check('确认后关闭、解锁并恢复焦点', !closed.open && !closed.locked && closed.focus === 'uploadBtn', JSON.stringify(closed));

    const mixed = await evalIn(`(async () => {
      await window.__testUpload([{ src: '/file/test.png', listed: true },
        { blocked: true, error: '图片未通过内容审核，已被拦截', fileName: 'blocked.png' }]);
      return { open: document.getElementById('uploadModerationDialog').open,
        resultsVisible: document.getElementById('resultContainer').style.display === 'block' };
    })()`);
    check('部分成功仍弹窗，成功图片正常展示', mixed.open && mixed.resultsVisible);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(50);
    check('Escape 可以关闭弹窗', await evalIn(`!document.getElementById('uploadModerationDialog').open && !document.body.classList.contains('dk-scroll-lock')`));

    const service = await evalIn(`(async () => {
      await window.__testUpload({ error: '已达每日上传上限', results: [
        { blocked: true, error: '内容审核服务异常，已按站点策略拦截', fileName: 'service.png' }] }, 403);
      return { open: document.getElementById('uploadModerationDialog').open,
        title: document.getElementById('uploadModerationTitle').textContent };
    })()`);
    check('403 中的审核异常也提醒，不误报为图片违规', service.open && service.title === '审核服务暂时不可用');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
    const mobile = await evalIn(`(() => {
      const dialog = document.getElementById('uploadModerationDialog');
      const r = dialog.getBoundingClientRect();
      return { fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        overflow: dialog.scrollWidth > dialog.clientWidth };
    })()`);
    check('375px 窄屏弹窗完整可见且无水平溢出', mobile.fits && !mobile.overflow, JSON.stringify(mobile));
    if (process.env.DUCKIMG_FRONTEND_SCREENSHOTS) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.env.DUCKIMG_FRONTEND_SCREENSHOTS, 'moderation-mobile.png'), Buffer.from(shot.data, 'base64'));
    }
    await send('Emulation.clearDeviceMetricsOverride');
    await evalIn(`document.querySelector('.upload-moderation-confirm').click()`);
    await sleep(50);
    const ordinary = await evalIn(`(async () => {
      await window.__testUpload([{ blocked: true, error: '文件超过大小限制', fileName: 'large.png' }]);
      const result = !document.getElementById('uploadModerationDialog').open;
      window.XMLHttpRequest = window.__originalXHR;
      return result;
    })()`);
    check('普通上传错误不触发审核弹窗', ordinary);

    // ── 3. dashboard.html：空状态 hidden 与 flex ───────────────────────
    console.log('\ndashboard.html');
    await open('public/dashboard.html', `!!document.getElementById('emptyState')`);

    console.log('gallery page size');
    const defaultSize = await evalIn(`(async () => {
      window.__galleryOriginalFetch = window.fetch;
      window.__galleryRequests = [];
      window.__galleryMockData = url => {
        const u = new URL(url, 'https://duckimg.test');
        const page = Number(u.searchParams.get('page'));
        const limit = Number(u.searchParams.get('limit'));
        const count = Math.max(0, Math.min(limit, 125 - (page - 1) * limit));
        return {
          files: Array.from({ length: count }, (_, i) => ({
            id: 'page-test-' + ((page - 1) * limit + i), fileName: 'image-' + i + '.png',
            fileSize: 100, uploadTime: 1700000000000 + i, tags: ['test-tag'],
            url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
          })),
          pagination: { page, limit, totalPages: Math.ceil(125 / limit), total: 125 },
          totalImages: 125, totalSize: 12500, recentUploads: 0, averageFileSize: 100,
        };
      };
      window.fetch = async url => {
        window.__galleryRequests.push(String(url));
        return { ok: true, json: async () => window.__galleryMockData(url) };
      };
      localStorage.removeItem('duckimg.galleryPageSize');
      initGalleryPageSize();
      await loadUserImages(1, '', '');
      return { value: document.getElementById('pageSizeSelect').value,
        cards: document.querySelectorAll('#imageGrid .image-card').length,
        pages: totalPages, url: window.__galleryRequests.at(-1),
        options: [...document.getElementById('pageSizeSelect').options].map(o => o.value).join(',') };
    })()`);
    check('默认每页 20 张，真实请求带 limit', defaultSize.value === '20' && defaultSize.cards === 20 && defaultSize.pages === 7 && defaultSize.url.includes('limit=20'), JSON.stringify(defaultSize));
    check('提供 20/40/60/100 四档选择', defaultSize.options === '20,40,60,100');

    for (const size of [40, 60, 100]) {
      const changed = await evalIn(`(async () => {
        await loadUserImages(2, 'image', 'test-tag');
        const select = document.getElementById('pageSizeSelect');
        select.value = '${size}';
        select.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 30));
        const u = new URL(window.__galleryRequests.at(-1), 'https://duckimg.test');
        return { page: currentPage, count: currentImages.length,
          cards: document.querySelectorAll('#imageGrid .image-card').length,
          limit: u.searchParams.get('limit'), query: u.searchParams.get('q'), tag: u.searchParams.get('tag'),
          saved: localStorage.getItem('duckimg.galleryPageSize'),
          pages: totalPages };
      })()`);
      check(`切换每页 ${size} 张回到第一页并正确渲染`, changed.page === 1 && changed.count === size && changed.cards === size && changed.pages === Math.ceil(125 / size), JSON.stringify(changed));
      check(`每页 ${size} 张保留搜索/标签并保存选择`, changed.limit === String(size) && changed.query === 'image' && changed.tag === 'test-tag' && changed.saved === String(size));
    }
    const nextPage = await evalIn(`(async () => {
      const next = [...document.querySelectorAll('#pagination button')].find(b => b.textContent === tt('common.next', '下一页'));
      next.click();
      await new Promise(r => setTimeout(r, 30));
      return { page: currentPage, count: currentImages.length, url: window.__galleryRequests.at(-1) };
    })()`);
    check('翻页沿用数量和筛选，末页剩余 25 张', nextPage.page === 2 && nextPage.count === 25 && nextPage.url.includes('limit=100') && nextPage.url.includes('tag=test-tag') && nextPage.url.includes('q=image'), JSON.stringify(nextPage));

    const preference = await evalIn(`(() => {
      imagesPerPage = 20;
      initGalleryPageSize();
      const restored = imagesPerPage;
      localStorage.setItem('duckimg.galleryPageSize', '999999');
      initGalleryPageSize();
      const fallback = imagesPerPage;
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = () => { throw new Error('storage unavailable'); };
      try { initGalleryPageSize(); } finally { Storage.prototype.getItem = original; }
      return { restored, fallback, unavailable: imagesPerPage };
    })()`);
    check('重新初始化恢复选择，非法值/存储不可用回退 20', preference.restored === 100 && preference.fallback === 20 && preference.unavailable === 20, JSON.stringify(preference));

    const race = await evalIn(`(async () => {
      let release;
      const baseFetch = window.fetch;
      window.fetch = url => new Promise(resolve => { release = () => resolve({ ok: true, json: async () => window.__galleryMockData(url) }); });
      const slow = loadUserImages(2, 'old', '');
      window.fetch = baseFetch;
      await loadUserImages(1, 'new', 'test-tag');
      release();
      await slow;
      return { page: currentPage, query: currentSearchQuery, count: currentImages.length };
    })()`);
    check('旧请求不覆盖最新分页结果', race.page === 1 && race.query === 'new' && race.count === 20, JSON.stringify(race));

    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
    const pageSizeMobile = await evalIn(`(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const el = document.getElementById('pageSizeSelect');
      const r = el.getBoundingClientRect();
      return { fits: r.left >= 0 && r.right <= innerWidth, width: r.width, label: el.labels[0].textContent };
    })()`);
    check('375px 窄屏数量选择可用且有明确标签', pageSizeMobile.fits && pageSizeMobile.width >= 50 && pageSizeMobile.label.length > 0, JSON.stringify(pageSizeMobile));
    if (process.env.DUCKIMG_FRONTEND_SCREENSHOTS) {
      await evalIn(`document.getElementById('pageSizeSelect').scrollIntoView({ block: 'center' })`);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.env.DUCKIMG_FRONTEND_SCREENSHOTS, 'gallery-page-size-mobile.png'), Buffer.from(shot.data, 'base64'));
    }
    await send('Emulation.clearDeviceMetricsOverride');
    const pageSizeEnglish = await evalIn(`(() => {
      window.UserPrefs.applyLanguage('en-US');
      return document.querySelector('label[for="pageSizeSelect"]').textContent;
    })()`);
    check('每页数量控件支持英文', pageSizeEnglish === 'Per page:', pageSizeEnglish);
    await evalIn(`window.UserPrefs.applyLanguage('zh-CN'); window.fetch = window.__galleryOriginalFetch; localStorage.removeItem('duckimg.galleryPageSize')`);

    const empty = await evalIn(`(() => {
      const el = document.getElementById('emptyState');
      el.hidden = false; const shown = getComputedStyle(el).display; const align = getComputedStyle(el).alignItems;
      el.hidden = true;  const hidden = getComputedStyle(el).display;
      return { shown, align, hidden };
    })()`);
    check('显示时是 flex（居中依赖它；锁死 display:block 回归）', empty.shown === 'flex', empty.shown);
    check('align-items 仍为 center', empty.align === 'center', empty.align);
    check('hidden 能真正隐藏（作者样式会盖过 UA 的 [hidden]）', empty.hidden === 'none', empty.hidden);

    // ── 4. 标签转义（存储型 XSS 回归）─────────────────────────────────
    // 回归：dashboard.js 曾把标签未转义地拼进 innerHTML，
    // 而服务端只限制长度、不限制 <>"'，因此可存储 <svg onload=...>。
    const esc = await evalIn(`(() => {
      const fn = (typeof escapeHtml === 'function')
        ? escapeHtml
        : (window.commonUtils && window.commonUtils.escapeHtml);
      if (typeof fn !== 'function') return { missing: true };
      const payload = '<svg onload=alert(1)>';
      const out = fn(payload);
      const probe = document.createElement('div');
      probe.innerHTML = '<span data-tag="' + out + '">' + out + '</span>';
      return { out, svg: probe.querySelectorAll('svg').length, attr: probe.querySelector('span').getAttribute('data-tag') };
    })()`);
    check('escapeHtml 可用', !esc.missing);
    check('恶意标签不产生元素（XSS 被挡住）', esc.svg === 0 && !esc.out.includes('<svg'), esc.out);
    check('转义后属性仍能还原原值（筛选不受影响）', esc.attr === '<svg onload=alert(1)>', esc.attr);

    // ── 5. 剪贴板不重复绑定 ───────────────────────────────────────────
    // 回归：app.js 与 dashboard.js 都委托 .copy-btn，两个 success 回调互相覆盖，
    // 会把卡片按钮的图标永久换成文字。
    const clip = await evalIn(`(() => ({
      hasGrid: !!document.getElementById('imageGrid'),
      hasCopyEdit: !!document.getElementById('copyEditLink'),
      clipboardLoaded: typeof ClipboardJS !== 'undefined',
    }))()`);
    check('dashboard 上是图库页（#imageGrid 存在，app.js 据此跳过重复绑定）', clip.hasGrid, JSON.stringify(clip));

    console.log(`\n合计: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  } finally {
    if (!KEEP) {
      try { ws && ws.close(); } catch {}
      proc.kill();
      await sleep(300);
      try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}
    }
  }
}

main().catch((e) => {
  console.error('\n意外错误：', e && e.message ? e.message : e);
  process.exit(1);
});
