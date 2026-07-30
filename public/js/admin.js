/**
 * 管理后台前端逻辑
 */

// 访问守卫：非管理员直接踢回首页
function guardAdmin() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!token || !user || user.role !== 'admin') {
        window.location.href = '/';
        return false;
    }
    return true;
}

function authHeaders(json) {
    const h = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

function notify(msg, type) {
    if (typeof showNotification === 'function') showNotification(msg, type || 'info');
    else alert(msg);
}

// 统一的后台请求封装：401/403 自愈（清登录态并跳登录页），其余错误抛出真实信息
async function adminFetch(url, opts = {}) {
    const res = await fetch(url, opts);

    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        alert('登录已失效或无管理员权限，请以管理员账户重新登录。');
        window.location.href = '/login.html';
        throw new Error('需要重新登录');
    }

    let data = null;
    try { data = await res.json(); } catch { /* 非 JSON */ }

    if (!res.ok) {
        const msg = (data && (data.error || data.detail)) || `HTTP ${res.status}`;
        const detail = (data && data.detail && data.error) ? `${data.error}: ${data.detail}` : msg;
        throw new Error(`${detail} (${res.status})`);
    }

    return data;
}

// 加载概览统计
async function loadStats() {
    try {
        const { stats } = await adminFetch('/api/admin/stats', { headers: authHeaders() });
        document.getElementById('statTotalUsers').textContent = stats.totalUsers;
        document.getElementById('statTotalImages').textContent = stats.totalImages;
        document.getElementById('statVerified').textContent = stats.verifiedUsers;
        document.getElementById('statBanned').textContent = stats.bannedUsers;
    } catch (e) {
        if (e.message === '需要重新登录') return;
        notify('加载统计失败：' + e.message, 'error');
    }
}

// 渲染单页用户行
function renderUserRows(users) {
    const now = Date.now();
    return users.map(u => {
        const regTime = u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-CN') : '-';
        const statusBadge = u.role === 'admin'
            ? '<span class="badge badge-admin">管理员</span>'
            : (u.status === 'banned'
                ? '<span class="badge badge-banned">已封禁</span>'
                : (u.emailVerified ? '<span class="badge badge-active">正常</span>' : '<span class="badge badge-unverified">未验证</span>'));
        const limitText = (u.uploadLimit === null || u.uploadLimit === undefined) ? '全局' : u.uploadLimit;
        const checkCell = u.role === 'admin'
            ? '<td></td>'
            : `<td><input type="checkbox" class="user-check" data-user="${u.username}" ${selectedUsers.has(u.username) ? 'checked' : ''}></td>`;

        // 违规提醒摘要：上次时间 / 截止 / 次数 / 是否已过期可封
        let warnHtml = '';
        if (u.lastWarnAt) {
            const at = new Date(u.lastWarnAt).toLocaleString('zh-CN');
            const dl = u.lastWarnDeadline ? new Date(u.lastWarnDeadline) : null;
            const dlText = dl ? dl.toLocaleDateString('zh-CN') : '';
            const expired = u.lastWarnDeadline && u.lastWarnDeadline < now;
            const count = u.warnCount || 1;
            const cls = expired ? 'warn-meta expired' : 'warn-meta';
            const tip = expired
                ? `已提醒 ${count} 次 · 截止 ${dlText} 已过期，可考虑封禁`
                : `已提醒 ${count} 次 · ${at} · 截止 ${dlText}`;
            warnHtml = `<div class="${cls}" title="${escAttr(tip)}">${expired ? '⚠️ 提醒已过期' : '📩 已提醒'} · ${count}次</div>`;
        }

        const actions = u.role === 'admin' ? '<span style="color:var(--text-light)">—</span>' : `
            <div class="row-actions">
                <button class="admin-btn btn-images" data-act="images" data-user="${u.username}">查看图片</button>
                <button class="admin-btn btn-warn" data-act="warn" data-user="${u.username}" title="${u.lastWarnAt ? '再次发送提醒（会刷新截止时间）' : '发送 3 天清理提醒'}">提醒${u.warnCount ? `(${u.warnCount})` : ''}</button>
                ${u.status === 'banned'
                    ? `<button class="admin-btn btn-unban" data-act="unban" data-user="${u.username}">解封</button>`
                    : `<button class="admin-btn btn-ban" data-act="ban" data-user="${u.username}">封禁</button>`}
                <button class="admin-btn btn-limit" data-act="limit" data-user="${u.username}" data-limit="${u.uploadLimit ?? ''}">设上限</button>
                <button class="admin-btn btn-del" data-act="del" data-user="${u.username}">删除</button>
            </div>
        `;

        return `<tr>
            ${checkCell}
            <td class="col-name" title="${escAttr(u.username || '')}">${u.username || '-'}${warnHtml}</td>
            <td class="col-email" title="${escAttr(u.email || '')}">${u.email || '-'}</td>
            <td class="col-date">${regTime}</td>
            <td class="col-status">${statusBadge}</td>
            <td class="col-images">${u.imageCount || 0}</td>
            <td class="col-limit">${limitText}</td>
            <td class="col-actions">${actions}</td>
        </tr>`;
    }).join('');
}

// 绑定行内操作按钮事件
function bindUserActions() {
    document.querySelectorAll('#userTableBody button[data-act]').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => handleUserAction(btn));
    });
}

// 客户端排序（对已加载的用户排序）
function sortUsers(arr, mode) {
    const a = [...arr];
    const byCreatedDesc = (x, y) => (y.createdAt || 0) - (x.createdAt || 0);
    switch (mode) {
        case 'created_asc': a.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)); break;
        case 'name_asc': a.sort((x, y) => (x.username || '').localeCompare(y.username || '')); break;
        case 'name_desc': a.sort((x, y) => (y.username || '').localeCompare(x.username || '')); break;
        case 'email_asc': a.sort((x, y) => (x.email || '').localeCompare(y.email || '')); break;
        case 'email_desc': a.sort((x, y) => (y.email || '').localeCompare(x.email || '')); break;
        case 'images_desc': a.sort((x, y) => (y.imageCount || 0) - (x.imageCount || 0)); break;
        case 'images_asc': a.sort((x, y) => (x.imageCount || 0) - (y.imageCount || 0)); break;
        case 'status': {
            const rank = (u) => u.role === 'admin' ? 3 : (u.status === 'banned' ? 0 : (!u.emailVerified ? 1 : 2));
            a.sort((x, y) => rank(x) - rank(y) || byCreatedDesc(x, y));
            break;
        }
        case 'status_desc': {
            const rank = (u) => u.role === 'admin' ? 3 : (u.status === 'banned' ? 0 : (!u.emailVerified ? 1 : 2));
            a.sort((x, y) => rank(y) - rank(x) || byCreatedDesc(x, y));
            break;
        }
        default: a.sort(byCreatedDesc); // created_desc
    }
    return a;
}

let allUsers = [];          // 后端一次返回的全部用户摘要
let userPage = 1;           // 当前页（1 起）
let userSearch = '';        // 用户名/邮箱搜索关键词（小写）
let userStatusFilter = 'all'; // 'all' | 'verified' | 'banned' | 'unverified_empty'
let currentSortMode = 'created_desc'; // 当前排序（下拉与表头点击共同驱动）
let selectedUsers = new Set(); // 批量选中的用户名（跨页保留）

// 未验证邮箱 且 图片数为 0（排除管理员）
function isUnverifiedEmpty(u) {
    if (!u || u.role === 'admin') return false;
    if (u.emailVerified) return false;
    return !(Number(u.imageCount) > 0);
}

// 按命中数量选合适每页条数（不无脑写死 50）
function pickPageSizeForCount(n) {
    if (n <= 0) return null;
    if (n <= 10) return '10';
    if (n <= 20) return '20';
    if (n <= 50) return '50';
    if (n <= 100) return '100';
    return 'all';
}

// 切换：未验证空户筛选+全选 ↔ 取消筛选/取消选中，回到全部
function selectUnverifiedEmptyUsers() {
    const btn = document.getElementById('selectUnverifiedEmptyBtn');
    const pageSizeSel = document.getElementById('userPageSize');

    // 再点一次：退出筛选 + 恢复原先每页数量
    if (userStatusFilter === 'unverified_empty') {
        selectedUsers.clear();
        userStatusFilter = 'all';
        userPage = 1;
        if (pageSizeSel && selectUnverifiedEmptyUsers._prevPageSize != null) {
            pageSizeSel.value = selectUnverifiedEmptyUsers._prevPageSize;
            selectUnverifiedEmptyUsers._prevPageSize = null;
        }
        if (btn) btn.classList.remove('is-active');
        renderUserTable();
        updateBatchBar();
        notify('已取消筛选与选中', 'info');
        return;
    }

    selectedUsers.clear();
    const matches = allUsers.filter((u) => isUnverifiedEmpty(u) && u.username);
    matches.forEach((u) => selectedUsers.add(u.username));
    const n = matches.length;

    userStatusFilter = 'unverified_empty';
    userPage = 1;

    if (pageSizeSel) {
        selectUnverifiedEmptyUsers._prevPageSize = pageSizeSel.value;
        // 仅有命中时才按数量调整每页；0 条保持原设置
        const next = pickPageSizeForCount(n);
        if (next) pageSizeSel.value = next;
    }

    if (btn) btn.classList.add('is-active');
    renderUserTable(); // n===0 时表格走「没有符合条件的用户（筛选：未验证空户）」
    updateBatchBar();

    if (n === 0) {
        notify('没有「未验证且图片数为 0」的用户', 'info');
    } else {
        notify(`已选中 ${n} 个未验证空户，可批量封禁或删除（再点按钮可取消）`, 'success');
    }
}
// 表头列 → [升序模式, 降序模式]
const sortMap = {
    name: ['name_asc', 'name_desc'],
    email: ['email_asc', 'email_desc'],
    created: ['created_asc', 'created_desc'],
    status: ['status', 'status_desc'],
    images: ['images_asc', 'images_desc'],
};

// 绑定本页复选框 + 更新全选/批量条状态
function bindUserChecks() {
    document.querySelectorAll('#userTableBody input.user-check').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedUsers.add(cb.dataset.user);
            else selectedUsers.delete(cb.dataset.user);
            updateBatchBar();
            syncSelectAll();
        });
    });
    syncSelectAll();
    updateBatchBar();
}

// 同步“全选本页”勾选态
function syncSelectAll() {
    const all = document.getElementById('selectAllUsers');
    if (!all) return;
    const boxes = Array.from(document.querySelectorAll('#userTableBody input.user-check'));
    all.checked = boxes.length > 0 && boxes.every(b => b.checked);
    all.indeterminate = boxes.some(b => b.checked) && !all.checked;
}

// 更新批量工具条显隐与计数
function updateBatchBar() {
    const bar = document.getElementById('batchBar');
    const count = document.getElementById('batchCount');
    if (!bar || !count) return;
    count.textContent = selectedUsers.size;
    bar.style.display = selectedUsers.size > 0 ? 'flex' : 'none';
}

function getPageSize() {
    const sel = document.getElementById('userPageSize');
    const v = sel ? sel.value : '10';
    return v === 'all' ? Infinity : (parseInt(v, 10) || 10);
}

// 表头点击排序（Excel 式：同列再点切换升/降）
function headerSort(key) {
    const pair = sortMap[key];
    if (!pair) return;
    const [asc, desc] = pair;
    currentSortMode = (currentSortMode === asc) ? desc : asc;
    const sel = document.getElementById('userSort');
    if (sel) sel.value = currentSortMode; // 同步下拉（无对应项则忽略）
    userPage = 1;
    renderUserTable();
}

// 更新表头排序箭头
function updateSortIndicators() {
    document.querySelectorAll('.admin-table th.sortable').forEach(th => {
        const ind = th.querySelector('.sort-ind');
        if (!ind) return;
        const pair = sortMap[th.dataset.sortkey] || [];
        ind.textContent = currentSortMode === pair[0] ? '▲' : (currentSortMode === pair[1] ? '▼' : '');
    });
}

// 高亮当前生效的筛选统计卡片
function highlightFilterCard() {
    document.querySelectorAll('.admin-stat-card[data-userfilter]').forEach(c => {
        c.classList.toggle('active', c.dataset.userfilter === userStatusFilter && userStatusFilter !== 'all');
    });
    // 同步「选未验证空户」按钮激活态
    const emptyBtn = document.getElementById('selectUnverifiedEmptyBtn');
    if (emptyBtn) emptyBtn.classList.toggle('is-active', userStatusFilter === 'unverified_empty');
}

// 渲染用户表（按当前排序 + 客户端分页）
function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    const pager = document.getElementById('userPagination');
    if (!allUsers.length) {
        tbody.innerHTML = '<tr><td colspan="8">暂无用户</td></tr>';
        if (pager) pager.innerHTML = '';
        return;
    }

    updateSortIndicators();
    highlightFilterCard();

    // 状态筛选（点统计卡片）+ 搜索过滤（用户名/邮箱）
    let base = allUsers;
    if (userStatusFilter === 'verified') base = base.filter(u => u.emailVerified);
    else if (userStatusFilter === 'banned') base = base.filter(u => u.status === 'banned');
    else if (userStatusFilter === 'unverified_empty') {
        base = base.filter(u => isUnverifiedEmpty(u));
    }
    const filtered = userSearch
        ? base.filter(u =>
            (u.username || '').toLowerCase().includes(userSearch) ||
            (u.email || '').toLowerCase().includes(userSearch))
        : base;
    const sorted = sortUsers(filtered, currentSortMode);

    if (!filtered.length) {
        const label = userStatusFilter === 'verified' ? '已验证'
            : (userStatusFilter === 'banned' ? '被封禁'
            : (userStatusFilter === 'unverified_empty' ? '未验证空户' : ''));
        tbody.innerHTML = `<tr><td colspan="8">没有符合条件的用户${label ? `（筛选：${label}）` : ''}${userSearch ? `（搜索：${escAttr(userSearch)}）` : ''}</td></tr>`;
        if (pager) pager.innerHTML = '';
        return;
    }

    const pageSize = getPageSize();
    const total = sorted.length;
    const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (userPage > totalPages) userPage = totalPages;

    const start = pageSize === Infinity ? 0 : (userPage - 1) * pageSize;
    const end = pageSize === Infinity ? total : Math.min(start + pageSize, total);
    const pageItems = sorted.slice(start, end);

    tbody.innerHTML = renderUserRows(pageItems);
    bindUserActions();
    bindUserChecks();
    renderPagination(total, totalPages, start, end);
}

// 渲染翻页控件
function renderPagination(total, totalPages, start, end) {
    const pager = document.getElementById('userPagination');
    if (!pager) return;
    if (totalPages <= 1) {
        pager.innerHTML = `<span class="page-info">共 ${total} 个用户</span>`;
        return;
    }

    let html = `<button ${userPage === 1 ? 'disabled' : ''} data-page="${userPage - 1}">上一页</button>`;

    // 页码窗口（当前页 ±2）
    const win = 2;
    let from = Math.max(1, userPage - win);
    let to = Math.min(totalPages, userPage + win);
    if (from > 1) {
        html += `<button data-page="1">1</button>`;
        if (from > 2) html += `<span class="page-info">…</span>`;
    }
    for (let i = from; i <= to; i++) {
        html += `<button class="${i === userPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (to < totalPages) {
        if (to < totalPages - 1) html += `<span class="page-info">…</span>`;
        html += `<button data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button ${userPage === totalPages ? 'disabled' : ''} data-page="${userPage + 1}">下一页</button>`;
    html += `<span class="page-info">第 ${start + 1}-${end} / 共 ${total}</span>`;
    pager.innerHTML = html;

    pager.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.page, 10);
            if (p && p !== userPage) { userPage = p; renderUserTable(); }
        });
    });
}

// 加载用户列表（一次取全部摘要，前端翻页）
async function loadUsers() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="8">加载中...</td></tr>';
    try {
        const data = await adminFetch('/api/admin/users', { headers: authHeaders() });
        allUsers = data.users || [];
        userPage = 1;
        renderUserTable();
    } catch (e) {
        if (e.message === '需要重新登录') return;
        tbody.innerHTML = `<tr><td colspan="8">加载用户失败：${e.message}</td></tr>`;
    }
}

async function handleUserAction(btn) {
    const act = btn.dataset.act;
    const username = btn.dataset.user;

    try {
        if (act === 'images') {
            await showUserImages(username);
            return;
        }
        if (act === 'warn') {
            if (!confirm(`向用户 ${username} 发送提醒邮件？\n内容：发现违规图片，请于 3 天内清理，逾期将封禁账户。\n发送后会写入提醒历史。`)) return;
            const res = await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/warn`, { method: 'POST', headers: authHeaders() });
            notify((res && res.message) || '提醒邮件已发送', 'success');
            await Promise.all([loadUsers(), loadWarnHistory()]);
            return;
        }
        if (act === 'ban') {
            if (!confirm(`确定封禁用户 ${username}？`)) return;
            await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/ban`, { method: 'POST', headers: authHeaders() });
            notify('已封禁', 'success');
        } else if (act === 'unban') {
            await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/unban`, { method: 'POST', headers: authHeaders() });
            notify('已解封', 'success');
        } else if (act === 'del') {
            if (!confirm(`确定删除用户 ${username}？\n将同时清空该用户上传的图片（不可恢复）。`)) return;
            await adminFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE', headers: authHeaders() });
            notify('已删除用户及其图片', 'success');
        } else if (act === 'limit') {
            const current = btn.dataset.limit;
            const input = prompt(`设置 ${username} 的每日上传上限（留空=使用全局，0=禁止上传）：`, current);
            if (input === null) return;
            await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/limit`, {
                method: 'POST', headers: authHeaders(true),
                body: JSON.stringify({ uploadLimit: input.trim() === '' ? null : input.trim() })
            });
            notify('已更新上限', 'success');
        }
        await Promise.all([loadUsers(), loadStats()]);
    } catch (e) {
        if (e.message === '需要重新登录') return;
        notify(e.message, 'error');
    }
}

// 批量操作选中用户（自动分批，突破单次 100 限制）
async function runBatch(action) {
    if (action === 'cancel') {
        selectedUsers.clear();
        document.querySelectorAll('#userTableBody input.user-check').forEach(cb => { cb.checked = false; });
        syncSelectAll();
        updateBatchBar();
        return;
    }

    const usernames = Array.from(selectedUsers);
    if (usernames.length === 0) { notify('请先选择用户', 'error'); return; }

    let uploadLimit;
    if (action === 'delete') {
        if (!confirm(`确定删除选中的 ${usernames.length} 个用户？此操作不可恢复。`)) return;
    } else if (action === 'ban') {
        if (!confirm(`确定封禁选中的 ${usernames.length} 个用户？`)) return;
    } else if (action === 'limit') {
        const input = prompt(`为选中的 ${usernames.length} 个用户设置每日上传上限（留空=全局，0=禁止上传）：`, '');
        if (input === null) return;
        uploadLimit = input.trim() === '' ? null : input.trim();
    }

    // 后端单批上限 500；前端按 100 切块顺序请求，避免卡死 Worker
    const CHUNK = 100;
    let okTotal = 0;
    let failedTotal = 0;
    const chunks = [];
    for (let i = 0; i < usernames.length; i += CHUNK) {
        chunks.push(usernames.slice(i, i + CHUNK));
    }

    try {
        for (let i = 0; i < chunks.length; i++) {
            if (chunks.length > 1) {
                notify(`批量处理中… ${i + 1}/${chunks.length}（共 ${usernames.length} 人）`, 'info');
            }
            const body = { action, usernames: chunks[i] };
            if (action === 'limit') body.uploadLimit = uploadLimit;
            const res = await adminFetch('/api/admin/users/batch', {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify(body)
            });
            okTotal += res.ok || 0;
            failedTotal += (res.failed || []).length;
        }
        notify(
            `批量完成：成功 ${okTotal} 个${failedTotal ? `，失败 ${failedTotal} 个` : ''}`,
            failedTotal ? 'warning' : 'success'
        );
        selectedUsers.clear();
        await Promise.all([loadUsers(), loadStats()]);
    } catch (e) {
        if (e.message === '需要重新登录') return;
        notify(e.message, 'error');
        // 部分成功时也刷新
        await Promise.all([loadUsers(), loadStats()]);
    }
}

// 查看某用户上传的图片（弹层）
async function showUserImages(username) {
    await ensurePreviewTicket().catch(function(){});
    let data;
    try {
        data = await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/images`, { headers: authHeaders() });
    } catch (e) {
        if (e.message === '需要重新登录') return;
        notify('获取图片失败：' + e.message, 'error');
        return;
    }
    const files = data.files || [];
    const sizeMB = ((data.totalSize || 0) / (1024 * 1024)).toFixed(2);

    const overlay = document.createElement('div');
    overlay.className = 'admin-img-modal';
    overlay.innerHTML = `
      <div class="admin-img-box">
        <div class="admin-img-head">
          <span><b>${username}</b> 的图片 · 共 <span class="aimg-count">${data.totalImages || 0}</span> 张 · ${sizeMB} MB</span>
          <button class="admin-img-close" title="关闭">&times;</button>
        </div>
        <div class="admin-img-grid">
          ${files.length ? files.map(f => `
            <div class="admin-img-cell" data-id="${(f.id || '').replace(/"/g, '&quot;')}">
              <a href="${adminFileUrl(f.url)}" target="_blank" rel="noopener" title="${(f.fileName || '').replace(/"/g, '&quot;')}">
                <img src="${adminFileUrl(f.url)}" loading="lazy" alt="">
              </a>
              <button class="admin-img-del" title="删除该图片">删除</button>
            </div>`).join('') : '<p style="color:var(--text-light);padding:1rem;grid-column:1/-1;">该用户暂无图片</p>'}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('admin-img-close')) close();
    });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });

    // 缩略图点击 → 页面内大图预览（拦截直链，避免直接下载）
    overlay.querySelectorAll('.admin-img-cell a').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openImagePreview(a.getAttribute('href'), a.getAttribute('title') || '');
        });
    });

    // 定向删除单张图片
    overlay.querySelectorAll('.admin-img-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cell = btn.closest('.admin-img-cell');
            const id = cell && cell.dataset.id;
            if (!id) return;
            if (!confirm('确定删除该图片？此操作不可撤销。')) return;
            btn.disabled = true;
            try {
                await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/images/${encodeURIComponent(id)}`, {
                    method: 'DELETE', headers: authHeaders()
                });
                cell.remove();
                const cnt = overlay.querySelector('.aimg-count');
                if (cnt) cnt.textContent = Math.max(0, (parseInt(cnt.textContent, 10) || 1) - 1);
                notify('图片已删除', 'success');
                if (typeof loadStats === 'function') loadStats();
            } catch (err) {
                if (err.message !== '需要重新登录') notify('删除失败：' + err.message, 'error');
                btn.disabled = false;
            }
        });
    });
}

// 加载配置并填充表单
async function loadSettings() {
    try {
        const { settings } = await adminFetch('/api/admin/settings', { headers: authHeaders() });

        // 公告
        document.getElementById('annEnabled').checked = !!settings.announcement.enabled;
        document.getElementById('annTitle').value = settings.announcement.title || '';
        document.getElementById('annContent').value = settings.announcement.content || '';

        // 上传与验证
        document.getElementById('dailyLimit').value = settings.dailyUploadLimit || 0;
        document.getElementById('requireVerify').checked = settings.requireEmailVerify !== false;
        document.getElementById('allowSvg').checked = settings.allowSvg !== false;

        // 鉴黄（apiKey 已脱敏，留空表示保持不变）
        document.getElementById('nsfwEnabled').checked = !!settings.nsfw.enabled;
        document.getElementById('nsfwApiUrl').value = settings.nsfw.apiUrl || '';
        document.getElementById('nsfwMethod').value = settings.nsfw.method || 'POST';
        document.getElementById('nsfwApiKey').value = '';
        document.getElementById('nsfwApiKey').placeholder = settings.nsfw.apiKeySet ? '已配置，留空保持不变' : '可选';
        document.getElementById('nsfwExtraParams').value = settings.nsfw.extraParams || '';
        document.getElementById('nsfwImageParam').value = settings.nsfw.imageParam || 'url';
        document.getElementById('nsfwScorePath').value = settings.nsfw.scorePath || 'score';
        document.getElementById('nsfwThreshold').value = settings.nsfw.threshold ?? 0.8;

        // 邮件配置
        const email = settings.email || {};
        document.getElementById('emailProvider').value = email.provider || 'resend';
        document.getElementById('resendFrom').value = (email.resend && email.resend.from) || '';
        document.getElementById('resendApiKey').value = '';
        document.getElementById('resendApiKey').placeholder = (email.resend && email.resend.apiKeySet) ? '已配置，留空保持不变' : '留空回退环境变量';

        const smtp = email.smtp || {};
        document.getElementById('smtpHost').value = smtp.host || '';
        document.getElementById('smtpPort').value = smtp.port || 465;
        document.getElementById('smtpEncryption').value = smtp.encryption || 'ssl';
        document.getElementById('smtpUsername').value = smtp.username || '';
        document.getElementById('smtpPassword').value = '';
        document.getElementById('smtpPassword').placeholder = smtp.passwordSet ? '已配置，留空保持不变' : '密码 / 授权码';
        document.getElementById('smtpFromAddress').value = smtp.fromAddress || '';
        document.getElementById('smtpFromName').value = smtp.fromName || '鸭鸭图床';

        // 站点设置
        const site = settings.site || {};
        document.getElementById('siteName').value = site.siteName || '';
        document.getElementById('siteLogoUrl').value = site.logoUrl || '';
        document.getElementById('siteGithubUrl').value = site.githubUrl || '';
        document.getElementById('siteHelpUrl').value = site.helpUrl || '';
        document.getElementById('siteMenuFooter').value = site.menuFooter || '';
        document.getElementById('sitePageFooter').value = site.pageFooter || '';

        toggleEmailFields();
    } catch (e) {
        if (e.message === '需要重新登录') return;
        notify('加载配置失败：' + e.message, 'error');
    }
}

// 根据发信方式显隐字段
function toggleEmailFields() {
    const provider = document.getElementById('emailProvider').value;
    document.getElementById('resendFields').style.display = provider === 'resend' ? 'block' : 'none';
    document.getElementById('smtpFields').style.display = provider === 'smtp' ? 'block' : 'none';
}

async function saveSettings(patch, successMsg) {
    try {
        await adminFetch('/api/admin/settings', {
            method: 'PUT', headers: authHeaders(true), body: JSON.stringify(patch)
        });
        notify(successMsg || '已保存', 'success');
        await loadSettings();
    } catch (e) {
        if (e.message === '需要重新登录') return;
        notify(e.message, 'error');
    }
}

function initSettingButtons() {
    document.getElementById('saveAnnouncement').addEventListener('click', () => {
        saveSettings({
            announcement: {
                enabled: document.getElementById('annEnabled').checked,
                title: document.getElementById('annTitle').value.trim(),
                content: document.getElementById('annContent').value.trim(),
            }
        }, '公告已保存');
    });

    document.getElementById('saveUploadSettings').addEventListener('click', () => {
        saveSettings({
            dailyUploadLimit: parseInt(document.getElementById('dailyLimit').value || '0', 10),
            requireEmailVerify: document.getElementById('requireVerify').checked,
            allowSvg: document.getElementById('allowSvg').checked,
        }, '设置已保存');
    });

    document.getElementById('saveNsfw').addEventListener('click', () => {
        saveSettings({
            nsfw: {
                enabled: document.getElementById('nsfwEnabled').checked,
                apiUrl: document.getElementById('nsfwApiUrl').value.trim(),
                method: document.getElementById('nsfwMethod').value,
                apiKey: document.getElementById('nsfwApiKey').value,  // 留空=保持不变
                extraParams: document.getElementById('nsfwExtraParams').value.trim(),
                imageParam: document.getElementById('nsfwImageParam').value.trim() || 'url',
                scorePath: document.getElementById('nsfwScorePath').value.trim() || 'score',
                threshold: parseFloat(document.getElementById('nsfwThreshold').value || '0.8'),
            }
        }, '鉴黄配置已保存');
    });

    // 邮件配置
    document.getElementById('emailProvider').addEventListener('change', toggleEmailFields);

    document.getElementById('saveEmail').addEventListener('click', () => {
        saveSettings({
            email: {
                provider: document.getElementById('emailProvider').value,
                resend: {
                    apiKey: document.getElementById('resendApiKey').value,  // 留空=保持不变
                    from: document.getElementById('resendFrom').value.trim(),
                },
                smtp: {
                    host: document.getElementById('smtpHost').value.trim(),
                    port: parseInt(document.getElementById('smtpPort').value || '465', 10),
                    username: document.getElementById('smtpUsername').value.trim(),
                    password: document.getElementById('smtpPassword').value,  // 留空=保持不变
                    encryption: document.getElementById('smtpEncryption').value,
                    fromAddress: document.getElementById('smtpFromAddress').value.trim(),
                    fromName: document.getElementById('smtpFromName').value.trim() || '鸭鸭图床',
                },
            }
        }, '邮件配置已保存');
    });

    // 测试发信
    document.getElementById('sendTestEmail').addEventListener('click', async () => {
        const to = document.getElementById('testEmailTo').value.trim();
        if (!to) { notify('请填写收件邮箱', 'warning'); return; }
        const btn = document.getElementById('sendTestEmail');
        btn.disabled = true; btn.textContent = '发送中...';
        try {
            await adminFetch('/api/admin/test-email', {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify({ to })
            });
            notify('测试邮件已发送，请查收', 'success');
        } catch (e) {
            if (e.message !== '需要重新登录') notify('测试发信失败：' + e.message, 'error');
        } finally {
            btn.disabled = false; btn.textContent = '发送测试邮件';
        }
    });

    // 用户列表排序 / 每页数量（客户端，改变后回到第 1 页）
    const userSort = document.getElementById('userSort');
    if (userSort) {
        userSort.addEventListener('change', () => { currentSortMode = userSort.value; userPage = 1; renderUserTable(); });
    }
    // 表头点击排序（Excel 式）
    document.querySelectorAll('.admin-table th.sortable').forEach(th => {
        th.addEventListener('click', () => headerSort(th.dataset.sortkey));
    });
    // 统计卡片点击 → 筛选用户列表（不滚动页面）
    document.querySelectorAll('.admin-stat-card[data-userfilter]').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            // 再点同一筛选项则回到全部
            const next = card.dataset.userfilter;
            userStatusFilter = (userStatusFilter === next && next !== 'all') ? 'all' : next;
            userPage = 1;
            const y = window.scrollY;
            renderUserTable();
            // 防止焦点/重排导致页面跳动
            requestAnimationFrame(() => {
                window.scrollTo({ top: y, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
            });
        });
    });
    const userPageSize = document.getElementById('userPageSize');
    if (userPageSize) {
        userPageSize.addEventListener('change', () => { userPage = 1; renderUserTable(); });
    }
    const userSearchInput = document.getElementById('userSearch');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', () => {
            userSearch = userSearchInput.value.trim().toLowerCase();
            userPage = 1;
            renderUserTable();
        });
    }

    // 全选本页
    const selectAll = document.getElementById('selectAllUsers');
    if (selectAll) {
        selectAll.addEventListener('change', () => {
            document.querySelectorAll('#userTableBody input.user-check').forEach(cb => {
                cb.checked = selectAll.checked;
                if (selectAll.checked) selectedUsers.add(cb.dataset.user);
                else selectedUsers.delete(cb.dataset.user);
            });
            updateBatchBar();
        });
    }

    // 一键选中：未验证 + 图片数 0
    const selectEmptyBtn = document.getElementById('selectUnverifiedEmptyBtn');
    if (selectEmptyBtn) {
        selectEmptyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            selectUnverifiedEmptyUsers();
        });
    }

    // 批量操作按钮
    document.querySelectorAll('#batchBar button[data-batch]').forEach(btn => {
        btn.addEventListener('click', () => runBatch(btn.dataset.batch));
    });

    // 站点设置
    document.getElementById('saveSite').addEventListener('click', () => {
        saveSettings({
            site: {
                siteName: document.getElementById('siteName').value.trim(),
                logoUrl: document.getElementById('siteLogoUrl').value.trim(),
                githubUrl: document.getElementById('siteGithubUrl').value.trim(),
                helpUrl: document.getElementById('siteHelpUrl').value.trim(),
                menuFooter: document.getElementById('siteMenuFooter').value.trim(),
                pageFooter: document.getElementById('sitePageFooter').value.trim(),
            }
        }, '站点设置已保存');
    });

    // 退出登录
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    if (logoutMenuItem) {
        logoutMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        });
    }
}

// ===== 图片审核 / 最近上传 =====
function auditFmtTime(ms) {
    if (!ms) return '-';
    try { return new Date(ms).toLocaleString('zh-CN'); } catch { return '-'; }
}

function auditFmtSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(2) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// 后台看图：短时预览票（非登录 JWT），降低 token 进 URL/日志的风险
let _previewTicket = '';
let _previewTicketExp = 0;
async function ensurePreviewTicket() {
    const now = Date.now();
    if (_previewTicket && _previewTicketExp > now + 30000) return _previewTicket;
    try {
        const data = await adminFetch('/api/admin/preview-ticket', { headers: authHeaders() });
        if (data && data.ticket) {
            _previewTicket = data.ticket;
            _previewTicketExp = now + ((data.expiresIn || 600) * 1000);
            return _previewTicket;
        }
    } catch (e) {
        console.warn('获取预览票失败，回退登录 token:', e);
    }
    return localStorage.getItem('token') || '';
}
function adminFileUrl(u, ticket) {
    if (!u) return u;
    const tk = ticket || _previewTicket || '';
    if (!tk) return escAttr(u);
    return escAttr(u + (u.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(tk));
}

// 页面内大图预览灯箱：用 <img> 渲染（不受 Content-Type 影响，不会触发下载）
function openImagePreview(url, name) {
    if (!url) return;
    const ov = document.createElement('div');
    ov.className = 'admin-preview-modal';
    ov.innerHTML = `
      <div class="admin-preview-inner"><img src="${escAttr(url)}" alt="${escAttr(name || '')}"></div>
      <div class="admin-preview-bar">
        <span title="${escAttr(name || '')}">${escAttr(name || '')}</span>
        <a href="${escAttr(url)}" target="_blank" rel="noopener">在新标签打开原图</a>
        <button type="button">关闭</button>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => {
        // 点击空白处或关闭按钮关闭；点“原图链接”正常跳转
        if (e.target === ov || e.target.tagName === 'BUTTON' || e.target.classList.contains('admin-preview-inner')) close();
    });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
}

// 缩略图加载失败（图片已删除/无法预览）→ 占位提示，避免显示裂图
function auditThumbFail(img) {
    img.onerror = null;
    const d = document.createElement('div');
    d.className = 'audit-thumb-fail';
    d.textContent = '图片已失效';
    img.replaceWith(d);
}

function renderAuditCell(item) {
    const name = escAttr(item.fileName || item.fileKey || '');
    const uploader = item.username
        ? `<span class="af-user" data-user="${escAttr(item.username)}" title="查看该用户全部图片">👤 ${escAttr(item.username)}</span>`
        : '<span class="af-time">👤 未知用户</span>';
    const delBtn = item.username
        ? `<button class="audit-del" data-user="${escAttr(item.username)}" data-id="${escAttr(item.fileKey)}">删除</button>`
        : '';
    return `
      <div class="audit-cell" data-id="${escAttr(item.fileKey)}">
        <a class="audit-thumb" href="${adminFileUrl(item.url)}" target="_blank" rel="noopener" title="${name}">
          <img src="${adminFileUrl(item.url)}" loading="lazy" alt="" onerror="auditThumbFail(this)">
        </a>
        <div class="audit-meta" title="${name}">
          ${uploader}
          <span class="af-time">${auditFmtTime(item.time)}</span>
          <span class="af-size">${auditFmtSize(item.fileSize)}</span>
        </div>
        <div class="audit-actions">
          <a class="audit-view" href="${adminFileUrl(item.url)}" target="_blank" rel="noopener">查看</a>
          ${delBtn}
        </div>
      </div>`;
}

function bindAuditActions(container) {
    // 缩略图 / 查看 → 页面内大图预览（拦截直链，避免下载）
    container.querySelectorAll('.audit-thumb, .audit-view').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const cell = a.closest('.audit-cell');
            const nameEl = cell && cell.querySelector('.af-name');
            openImagePreview(a.getAttribute('href'), nameEl ? nameEl.textContent : '');
        });
    });
    container.querySelectorAll('.af-user').forEach(el => {
        el.addEventListener('click', () => { if (el.dataset.user) showUserImages(el.dataset.user); });
    });
    container.querySelectorAll('.audit-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            const username = btn.dataset.user, id = btn.dataset.id;
            if (!username || !id) return;
            if (!confirm(`确定删除该图片？将从「${username}」的图库移除（不可撤销）。`)) return;
            btn.disabled = true;
            try {
                await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/images/${encodeURIComponent(id)}`, {
                    method: 'DELETE', headers: authHeaders()
                });
                const cell = btn.closest('.audit-cell');
                if (cell) cell.remove();
                notify('图片已删除', 'success');
                if (typeof loadStats === 'function') loadStats();
            } catch (e) {
                if (e.message !== '需要重新登录') notify('删除失败：' + e.message, 'error');
                btn.disabled = false;
            }
        });
    });
}

async function loadRecentUploads() {
    const box = document.getElementById('recentUploads');
    if (!box) return;
    box.innerHTML = '<p style="color:var(--text-light);">加载中...</p>';
    try {
        const data = await adminFetch('/api/admin/recent?limit=60', { headers: authHeaders() });
        const items = data.items || [];
        if (!items.length) { box.innerHTML = '<p style="color:var(--text-light);">暂无最近上传记录（仅记录本功能上线后的新上传）。</p>'; return; }
        box.innerHTML = items.map(renderAuditCell).join('');
        bindAuditActions(box);
    } catch (e) {
        if (e.message === '需要重新登录') return;
        box.innerHTML = `<p style="color:var(--error-color,#ef4444);">加载失败：${e.message}</p>`;
    }
}

async function searchImagesByName(q) {
    const box = document.getElementById('imgSearchResult');
    if (!box) return;
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<p style="color:var(--text-light);">查询中...</p>';
    try {
        const data = await adminFetch(`/api/admin/search-image?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
        const items = data.items || [];
        if (!items.length) { box.innerHTML = '<p style="color:var(--text-light);">未找到匹配该文件名的图片。</p>'; return; }
        const tip = data.truncated ? '<p style="color:var(--text-light);font-size:0.8rem;">结果较多，仅显示前 100 条，请使用更精确的文件名。</p>' : '';
        box.innerHTML = `<p style="color:var(--text-light);font-size:0.85rem;margin:0.3rem 0;">找到 ${items.length} 条匹配：</p>${tip}<div class="audit-grid">${items.map(renderAuditCell).join('')}</div>`;
        bindAuditActions(box);
    } catch (e) {
        if (e.message === '需要重新登录') return;
        box.innerHTML = `<p style="color:var(--error-color,#ef4444);">查询失败：${e.message}</p>`;
    }
}

function initAuditSection() {
    ensurePreviewTicket().catch(function(){});
    const btn = document.getElementById('imgSearchBtn');
    const input = document.getElementById('imgSearchInput');
    const refresh = document.getElementById('recentRefreshBtn');
    if (btn && input) {
        btn.addEventListener('click', () => searchImagesByName(input.value.trim()));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchImagesByName(input.value.trim()); });
    }
    if (refresh) refresh.addEventListener('click', () => loadRecentUploads());
    loadRecentUploads();
}

// ===== 违规提醒历史 =====
function fmtDateTime(ms) {
    if (!ms) return '-';
    try { return new Date(ms).toLocaleString('zh-CN'); } catch { return '-'; }
}
function fmtDate(ms) {
    if (!ms) return '-';
    try { return new Date(ms).toLocaleDateString('zh-CN'); } catch { return '-'; }
}

async function loadWarnHistory() {
    const tbody = document.getElementById('warnHistoryBody');
    if (!tbody) return;
    try {
        const data = await adminFetch('/api/admin/warns?limit=200', { headers: authHeaders() });
        const items = data.items || [];
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-light);">暂无提醒记录（功能上线后发送的才会出现）</td></tr>';
            return;
        }
        const now = Date.now();
        tbody.innerHTML = items.map((it) => {
            const expired = it.deadline && it.deadline < now;
            const status = expired
                ? '<span class="expired">已过期</span>'
                : '<span class="ok">等待清理中</span>';
            const uname = escAttr(it.username || '');
            return `<tr>
                <td>${fmtDateTime(it.at)}</td>
                <td title="${uname}">${uname || '-'}</td>
                <td title="${escAttr(it.email || '')}">${escAttr(it.email || '-')}</td>
                <td>${fmtDate(it.deadline)}</td>
                <td>${status}</td>
                <td>${escAttr(it.by || '-')}</td>
                <td>
                    <button type="button" class="admin-btn btn-images" data-warn-act="images" data-user="${uname}" style="height:28px;min-width:auto;padding:0 8px;">图片</button>
                    <button type="button" class="admin-btn btn-ban" data-warn-act="ban" data-user="${uname}" style="height:28px;min-width:auto;padding:0 8px;">封禁</button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('button[data-warn-act]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const act = btn.dataset.warnAct;
                const username = btn.dataset.user;
                if (!username) return;
                try {
                    if (act === 'images') {
                        await showUserImages(username);
                        return;
                    }
                    if (act === 'ban') {
                        if (!confirm(`确定封禁用户 ${username}？`)) return;
                        await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/ban`, { method: 'POST', headers: authHeaders() });
                        notify('已封禁', 'success');
                        await Promise.all([loadUsers(), loadStats(), loadWarnHistory()]);
                    }
                } catch (e) {
                    if (e.message === '需要重新登录') return;
                    notify(e.message, 'error');
                }
            });
        });
    } catch (e) {
        if (e.message === '需要重新登录') return;
        tbody.innerHTML = `<tr><td colspan="7">加载失败：${escAttr(e.message)}</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!guardAdmin()) return;
    loadStats();
    loadUsers();
    loadSettings();
    loadWarnHistory();
    initSettingButtons();
    initAuditSection();
    const refreshWarn = document.getElementById('refreshWarnHistoryBtn');
    if (refreshWarn) refreshWarn.addEventListener('click', () => loadWarnHistory());
});
