/**
 * 用户数据工具函数（D1）
 */
import {
  dbGetUserByUsername,
  dbGetUserById,
  dbGetUserByEmail,
  dbSaveUser,
  dbDeleteUser,
  dbLoadUserImages,
  dbUpsertImage,
  dbDeleteImage,
  dbCountUserImages,
  dbListUserSummaries,
  dbAdminStats,
} from './db.js';

export function isAdmin(username, env) {
  if (!username || !env || !env.ADMIN_USERNAME) return false;
  return username === env.ADMIN_USERNAME;
}

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
    status: user.status === 'banned' ? 'banned' : 'active',
    emailVerified: user.emailVerified === true,
    uploadLimit: (typeof user.uploadLimit === 'number' && user.uploadLimit >= 0)
      ? user.uploadLimit
      : null,
    lastLoginAt: user.lastLoginAt || null,
    lastWarnAt: user.lastWarnAt || null,
    lastWarnDeadline: user.lastWarnDeadline || null,
    warnCount: (typeof user.warnCount === 'number' && user.warnCount > 0) ? user.warnCount : 0,
    prefs: {
      loginNotify: !!(user.prefs && user.prefs.loginNotify),
      public: user.prefs && user.prefs.public === false ? false : true,
      language: (user.prefs && user.prefs.language) || 'zh-CN',
    },
  };
  normalized.role = isAdmin(normalized.username, env) ? 'admin' : 'user';
  return normalized;
}

export async function getUserByName(env, username) {
  if (!username) return null;
  const raw = await dbGetUserByUsername(env, username);
  return normalizeUser(raw, env);
}

export async function getUserById(env, userId) {
  if (!userId) return null;
  const raw = await dbGetUserById(env, userId);
  return normalizeUser(raw, env);
}

export async function getUserByEmail(env, email) {
  if (!email) return null;
  const raw = await dbGetUserByEmail(env, email);
  return normalizeUser(raw, env);
}

/** 兼容旧调用：KV 元数据已不需要，保留空对象形状 */
export function userMeta(user) {
  return {
    id: user.id || null,
    email: user.email || '',
    status: user.status === 'banned' ? 'banned' : 'active',
    emailVerified: user.emailVerified === true,
    createdAt: user.createdAt || null,
    uploadLimit: (typeof user.uploadLimit === 'number' && user.uploadLimit >= 0) ? user.uploadLimit : null,
    lastWarnAt: user.lastWarnAt || null,
    lastWarnDeadline: user.lastWarnDeadline || null,
    warnCount: (typeof user.warnCount === 'number' && user.warnCount > 0) ? user.warnCount : 0,
  };
}

export async function saveUser(env, user) {
  const { role, ...persisted } = user;
  persisted.updatedAt = Date.now();
  await dbSaveUser(env, persisted);
  return persisted;
}

export async function deleteUserRecord(env, user) {
  await dbDeleteUser(env, user);
}

export async function saveUserFiles(env, userId, files) {
  // 全量覆盖式写入（导入/恢复用）：逐条 upsert
  const list = Array.isArray(files) ? files : [];
  for (const f of list) {
    if (!f || !f.id) continue;
    await dbUpsertImage(env, {
      ...f,
      userId,
      url: f.url || `/file/${f.id}`,
    });
  }
}

export async function loadUserFiles(env, userId) {
  return dbLoadUserImages(env, userId);
}

/**
 * 对用户文件列表做读-改-写。
 * transform(files) → 新数组；返回 null 表示业务拒绝。
 */
export async function updateUserFiles(env, userId, transform) {
  if (!userId || typeof transform !== 'function') {
    return { ok: false, files: [], error: 'bad_args' };
  }
  try {
    const prev = await loadUserFiles(env, userId);
    const next = transform(prev.slice());
    if (next === null || next === undefined) {
      return { ok: false, files: prev, error: 'rejected' };
    }
    if (!Array.isArray(next)) {
      return { ok: false, files: prev, error: 'bad_transform' };
    }

    const prevIds = new Set(prev.map((f) => f && f.id).filter(Boolean));
    const nextIds = new Set(next.map((f) => f && f.id).filter(Boolean));

    // 删除少了的
    for (const id of prevIds) {
      if (!nextIds.has(id)) {
        await dbDeleteImage(env, id);
      }
    }
    // upsert 新的/变更的
    for (const f of next) {
      if (!f || !f.id) continue;
      await dbUpsertImage(env, { ...f, userId });
    }
    return { ok: true, files: next };
  } catch (e) {
    console.warn('updateUserFiles failed:', e && e.message);
    return { ok: false, files: [], error: (e && e.message) || 'write_failed', soft: true };
  }
}

export async function appendUserFiles(env, userId, newFiles) {
  const add = Array.isArray(newFiles) ? newFiles.filter((f) => f && f.id) : [];
  if (!add.length) {
    return { ok: true, files: await loadUserFiles(env, userId) };
  }
  try {
    for (const f of add) {
      await dbUpsertImage(env, { ...f, userId });
    }
    return { ok: true, files: await loadUserFiles(env, userId) };
  } catch (e) {
    console.warn('appendUserFiles failed:', e && e.message);
    return { ok: false, files: [], error: (e && e.message) || 'write_failed', soft: true };
  }
}

export function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

export async function getUserImageCount(env, userId) {
  return dbCountUserImages(env, userId);
}

export async function listUserSummaries(env) {
  return dbListUserSummaries(env, (username) => isAdmin(username, env));
}

export async function getAdminStats(env) {
  return dbAdminStats(env);
}
