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

export async function saveUser(env, user) {
  const { role, ...persisted } = user;
  persisted.updatedAt = Date.now();
  await dbSaveUser(env, persisted);
  return persisted;
}

export async function deleteUserRecord(env, user) {
  await dbDeleteUser(env, user);
}

export async function loadUserFiles(env, userId) {
  return dbLoadUserImages(env, userId);
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
