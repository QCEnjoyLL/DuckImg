/**
 * 被封禁用户集合（用于在图片服务处屏蔽其图片公网访问，不删除原图）。
 * 单个 KV 键存放 userId 数组；带 per-isolate 内存缓存，尽量减少热路径 KV 读。
 */
const BANNED_KEY = 'banned_userids';
const TTL_MS = 30 * 1000;

let _cache = null;       // Set<string>
let _cacheAt = 0;

/**
 * 读取被封禁用户 Set（命中缓存几乎零成本；封禁低频，30s 滞后可接受）。
 */
export async function getBannedSet(env) {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < TTL_MS) return _cache;
  let arr = [];
  try {
    arr = await env.users.get(BANNED_KEY, { type: 'json' }) || [];
  } catch { arr = []; }
  _cache = new Set(Array.isArray(arr) ? arr.map(String) : []);
  _cacheAt = now;
  return _cache;
}

/**
 * 设置某用户的封禁态（true=加入封禁集合，false=移除），读改写单键并刷新本 isolate 缓存。
 */
export async function setUserBanned(env, userId, banned) {
  if (!userId) return;
  const id = String(userId);
  let arr = [];
  try { arr = await env.users.get(BANNED_KEY, { type: 'json' }) || []; } catch { arr = []; }
  const set = new Set(Array.isArray(arr) ? arr.map(String) : []);
  if (banned) set.add(id); else set.delete(id);
  try { await env.users.put(BANNED_KEY, JSON.stringify([...set])); } catch (e) { console.warn('更新封禁集合失败（忽略）:', e); }
  _cache = set;
  _cacheAt = Date.now();
}
