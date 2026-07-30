/**
 * 被封禁用户集合（D1 kv_store）
 */
import { kvGet, kvPut } from './db.js';

const BANNED_KEY = 'banned_userids';
const TTL_MS = 30 * 1000;

let _cache = null;
let _cacheAt = 0;

export async function getBannedSet(env) {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < TTL_MS) return _cache;
  let arr = [];
  try {
    arr = (await kvGet(env, BANNED_KEY, { type: 'json' })) || [];
  } catch { arr = []; }
  _cache = new Set(Array.isArray(arr) ? arr.map(String) : []);
  _cacheAt = now;
  return _cache;
}

export async function setUserBanned(env, userId, banned) {
  if (!userId) return;
  const id = String(userId);
  let arr = [];
  try { arr = (await kvGet(env, BANNED_KEY, { type: 'json' })) || []; } catch { arr = []; }
  const set = new Set(Array.isArray(arr) ? arr.map(String) : []);
  if (banned) set.add(id); else set.delete(id);
  try { await kvPut(env, BANNED_KEY, [...set]); } catch (e) { console.warn('更新封禁集合失败（忽略）:', e); }
  _cache = set;
  _cacheAt = Date.now();
}
