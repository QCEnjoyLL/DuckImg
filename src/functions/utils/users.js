/**
 * 用户数据工具函数
 * 统一处理用户对象的读取、规范化（无感升级老数据）、角色判断与列举。
 */

/**
 * 判断某用户名是否为管理员（通过环境变量 ADMIN_USERNAME 指定）
 */
export function isAdmin(username, env) {
  if (!username || !env || !env.ADMIN_USERNAME) return false;
  return username === env.ADMIN_USERNAME;
}

/**
 * 规范化用户对象，为缺失字段填充默认值。
 * 用于兼容在新字段引入之前注册的老用户（绝不丢字段、绝不报错）。
 */
export function normalizeUser(user, env) {
  if (!user) return null;

  const normalized = {
    id: user.id,
    username: user.username,
    email: user.email || '',
    password: user.password,
    avatarUrl: user.avatarUrl || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || user.createdAt || null,
    // 新增字段：老用户读取时按默认值兜底
    status: user.status === 'banned' ? 'banned' : 'active',
    // 老用户没有该字段 -> 默认未验证，触发"重新登录需验证邮箱"
    emailVerified: user.emailVerified === true,
    // 个人每日上传上限覆盖（null 表示使用全局设置）
    uploadLimit: (typeof user.uploadLimit === 'number' && user.uploadLimit >= 0)
      ? user.uploadLimit
      : null,
    lastLoginAt: user.lastLoginAt || null,
    // 用户偏好（登录提醒、公开默认、语言等）
    prefs: {
      loginNotify: !!(user.prefs && user.prefs.loginNotify),
      public: user.prefs && user.prefs.public === false ? false : true,
      language: (user.prefs && user.prefs.language) || 'zh-CN',
    },
  };

  // 角色按环境变量实时计算，不持久化
  normalized.role = isAdmin(normalized.username, env) ? 'admin' : 'user';

  return normalized;
}

/**
 * 根据用户名读取并规范化用户对象
 */
export async function getUserByName(env, username) {
  if (!username) return null;
  const json = await env.users.get(`user:${username}`);
  if (!json) return null;
  try {
    return normalizeUser(JSON.parse(json), env);
  } catch {
    return null;
  }
}

/**
 * 根据用户ID读取并规范化用户对象
 */
export async function getUserById(env, userId) {
  if (!userId) return null;
  const username = await env.users.get(`userid:${userId}`);
  if (!username) return null;
  return getUserByName(env, username);
}

/**
 * 提取用于 KV 列表元数据的轻量字段（便于无 per-user 读取地统计/列表）。
 * 元数据上限 1024 字节，仅放必要的小字段。
 */
export function userMeta(user) {
  return {
    id: user.id || null,
    email: user.email || '',
    status: user.status === 'banned' ? 'banned' : 'active',
    emailVerified: user.emailVerified === true,
    createdAt: user.createdAt || null,
    uploadLimit: (typeof user.uploadLimit === 'number' && user.uploadLimit >= 0) ? user.uploadLimit : null,
  };
}

/**
 * 保存用户对象（写回完整对象，包含密码哈希）。
 * 同时写入 KV 列表元数据，供后台统计/列表低成本读取。
 */
export async function saveUser(env, user) {
  // 移除运行期计算字段，避免持久化 role
  const { role, ...persisted } = user;
  persisted.updatedAt = Date.now();
  await env.users.put(`user:${persisted.username}`, JSON.stringify(persisted), {
    metadata: userMeta(persisted),
  });
  return persisted;
}

/**
 * 写入用户文件列表，并在 KV 元数据记录数量（供 totalImages/列表 低成本汇总）。
 */
export async function saveUserFiles(env, userId, files) {
  await env.img_url.put(`user:${userId}:files`, JSON.stringify(files), {
    metadata: { count: Array.isArray(files) ? files.length : 0 },
  });
}

/**
 * 去除用户对象中的敏感字段（密码）
 */
export function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

/**
 * 获取某用户的图片数量（只读：优先用 count 元数据，缺失则读取值计数，绝不写回）。
 * 写额度紧张，故不在读路径回填元数据；count 由上传/删除（saveUserFiles）正常写入。
 */
export async function getUserImageCount(env, userId) {
  if (!userId) return 0;
  try {
    const rec = await env.img_url.getWithMetadata(`user:${userId}:files`, { type: 'json' });
    if (rec && rec.metadata && typeof rec.metadata.count === 'number') return rec.metadata.count;
    return (rec && Array.isArray(rec.value)) ? rec.value.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 列举全部用户摘要（KV 元数据 join，零 per-user 读取）：
 * - users 命名空间 user: 键的元数据 → 账户字段
 * - img_url 命名空间 user:*:files 键的 count 元数据 → 图片数
 * 老数据缺元数据时做「只读」补齐（仅读、绝不写、带上限），保证信息完整且不耗写额度。
 * 一次请求内 KV 操作受上限约束（list 每次 1000 键 + 有限补读），守住单请求上限。
 */
export async function listUserSummaries(env) {
  const users = [];
  const needFill = [];

  // 1) 读取所有 user: 键的元数据
  let cursor;
  do {
    const list = await env.users.list({ prefix: 'user:', limit: 1000, cursor });
    for (const k of list.keys) {
      const username = k.name.slice('user:'.length);
      const m = k.metadata;
      if (m && m.id) {
        users.push({
          username,
          id: m.id,
          email: m.email || '',
          status: m.status === 'banned' ? 'banned' : 'active',
          emailVerified: m.emailVerified === true,
          createdAt: m.createdAt || null,
          uploadLimit: (typeof m.uploadLimit === 'number') ? m.uploadLimit : null,
          role: isAdmin(username, env) ? 'admin' : 'user',
          imageCount: 0,
        });
      } else {
        needFill.push(username);
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  // 2) 老用户（无元数据）只读补齐，封顶避免超限
  const MAX_FILL = 300;
  for (let i = 0; i < needFill.length && i < MAX_FILL; i++) {
    const u = await getUserByName(env, needFill[i]);
    if (!u) continue;
    users.push({
      username: u.username, id: u.id, email: u.email, status: u.status,
      emailVerified: u.emailVerified, createdAt: u.createdAt,
      uploadLimit: u.uploadLimit, role: u.role, imageCount: 0,
    });
  }

  // 3) 图片数：img_url 的 user:*:files 键 count 元数据；缺失则只读取值计数（封顶）
  const countById = new Map();
  let reads = 0;
  const MAX_READ = 800;
  let c2;
  do {
    const list = await env.img_url.list({ prefix: 'user:', limit: 1000, cursor: c2 });
    for (const k of list.keys) {
      const name = k.name; // user:${userId}:files
      if (!name.endsWith(':files')) continue;
      const uid = name.slice('user:'.length, name.length - ':files'.length);
      const m = k.metadata;
      if (m && typeof m.count === 'number') {
        countById.set(uid, m.count);
      } else if (reads < MAX_READ) {
        reads++;
        try {
          const v = await env.img_url.get(name, { type: 'json' });
          countById.set(uid, Array.isArray(v) ? v.length : 0);
        } catch {}
      }
    }
    c2 = list.list_complete ? undefined : list.cursor;
  } while (c2);

  users.forEach(u => { u.imageCount = countById.get(u.id) || 0; });
  return users;
}

/**
 * 低成本后台概览统计：复用 listUserSummaries（同源一次扫描，零回填写）。
 */
export async function getAdminStats(env) {
  const users = await listUserSummaries(env);
  return {
    totalUsers: users.length,
    verifiedUsers: users.filter(u => u.emailVerified).length,
    bannedUsers: users.filter(u => u.status === 'banned').length,
    totalImages: users.reduce((s, u) => s + (u.imageCount || 0), 0),
  };
}
