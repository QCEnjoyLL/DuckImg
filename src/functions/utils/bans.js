/**
 * 被封禁用户集合（D1 kv_store）
 *
 * 注意：这份集合是「尽力而为」的缓存，不是唯一真相来源。
 * - 读取失败时不缓存空集合（否则会在 30 秒内把所有人都当成未封禁）
 * - 写入失败必须让调用方知道（否则管理员会看到"已封禁"但其实没生效）
 * 图片侧真正的封禁判据请以 images.blocked（D1 里可靠的一列）为准。
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
  } catch (e) {
    // 读失败：返回上一次的缓存（可能为空），但**不刷新时间戳**，
    // 这样下一次请求会立即重试，而不是把"空集合"钉住 30 秒。
    console.warn('读取封禁集合失败（不缓存本次结果）:', e && e.message);
    return _cache || new Set();
  }

  _cache = new Set(Array.isArray(arr) ? arr.map(String) : []);
  _cacheAt = now;
  return _cache;
}

/**
 * 更新封禁集合。失败时抛错，让调用方把失败暴露给管理员。
 * @returns {Promise<boolean>} 是否写入成功
 */
export async function setUserBanned(env, userId, banned) {
  if (!userId) return false;
  const id = String(userId);
  let arr = [];
  try { arr = (await kvGet(env, BANNED_KEY, { type: 'json' })) || []; } catch { arr = []; }
  const set = new Set(Array.isArray(arr) ? arr.map(String) : []);
  if (banned) set.add(id); else set.delete(id);

  try {
    await kvPut(env, BANNED_KEY, [...set]);
  } catch (e) {
    // 写失败：不要污染本地缓存（避免本 isolate 与 D1 状态不一致）
    console.warn('更新封禁集合失败:', e && e.message);
    return false;
  }
  _cache = set;
  _cacheAt = Date.now();
  return true;
}
