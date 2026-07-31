/**
 * D1 访问封装（DuckImg 全业务数据）
 * 图片二进制仍在 Telegram；此处仅索引 / 用户 / 设置。
 */

function db(env) {
  if (!env || !env.DB) throw new Error('D1 binding DB missing');
  return env.DB;
}

/** 读 kv_store（自动忽略过期） */
export async function kvGet(env, key, { type } = {}) {
  const row = await db(env)
    .prepare('SELECT value, expires_at FROM kv_store WHERE key = ?')
    .bind(key)
    .first();
  if (!row) return null;
  if (row.expires_at && Number(row.expires_at) > 0 && Number(row.expires_at) < Date.now()) {
    try {
      await db(env).prepare('DELETE FROM kv_store WHERE key = ?').bind(key).run();
    } catch { /* ignore */ }
    return null;
  }
  if (type === 'json') {
    try { return JSON.parse(row.value); } catch { return null; }
  }
  return row.value;
}

/** 写 kv_store；expiresAtMs 为 unix ms，或 expirationTtl 秒 */
export async function kvPut(env, key, value, opts = {}) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  let expiresAt = null;
  if (typeof opts.expiresAt === 'number') expiresAt = opts.expiresAt;
  else if (typeof opts.expirationTtl === 'number' && opts.expirationTtl > 0) {
    expiresAt = Date.now() + opts.expirationTtl * 1000;
  }
  await db(env)
    .prepare(
      `INSERT INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
    )
    .bind(key, raw, expiresAt)
    .run();
}

export async function kvDelete(env, key) {
  await db(env).prepare('DELETE FROM kv_store WHERE key = ?').bind(key).run();
}

// —— users ——

export function rowToUser(row) {
  if (!row) return null;
  let prefs = {};
  try { prefs = row.prefs ? JSON.parse(row.prefs) : {}; } catch { prefs = {}; }
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    password: row.password,
    avatarUrl: row.avatar_url || null,
    status: row.status === 'banned' ? 'banned' : 'active',
    emailVerified: !!row.email_verified,
    uploadLimit: row.upload_limit == null ? null : Number(row.upload_limit),
    prefs,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastLoginAt: row.last_login_at || null,
    warnCount: row.warn_count || 0,
    lastWarnAt: row.last_warn_at || null,
    lastWarnDeadline: row.last_warn_deadline || null,
  };
}

export async function dbGetUserByUsername(env, username) {
  if (!username) return null;
  const raw = String(username);
  const trimmed = raw.trim() || raw;
  // 兼容历史尾空格/大小写用户名：单条查询按精确度排序取最佳匹配（users 表很小，scan 无所谓）
  const row = await db(env)
    .prepare(
      `SELECT * FROM users
       WHERE username = ?1 OR username = ?2
          OR lower(username) = lower(?2) OR lower(trim(username)) = lower(?2)
       ORDER BY CASE
         WHEN username = ?1 THEN 0
         WHEN username = ?2 THEN 1
         WHEN lower(username) = lower(?2) THEN 2
         ELSE 3 END
       LIMIT 1`
    )
    .bind(raw, trimmed)
    .first();
  return rowToUser(row);
}

export async function dbGetUserById(env, userId) {
  if (!userId) return null;
  const row = await db(env).prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return rowToUser(row);
}

export async function dbGetUserByEmail(env, email) {
  if (!email) return null;
  const row = await db(env)
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
    .bind(String(email).trim())
    .first();
  return rowToUser(row);
}

export async function dbSaveUser(env, user) {
  const prefs = JSON.stringify(user.prefs || {});
  await db(env)
    .prepare(
      `INSERT INTO users (
        id, username, email, password, avatar_url, status, email_verified, upload_limit, prefs,
        created_at, updated_at, last_login_at, warn_count, last_warn_at, last_warn_deadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        email = excluded.email,
        password = excluded.password,
        avatar_url = excluded.avatar_url,
        status = excluded.status,
        email_verified = excluded.email_verified,
        upload_limit = excluded.upload_limit,
        prefs = excluded.prefs,
        updated_at = excluded.updated_at,
        last_login_at = excluded.last_login_at,
        warn_count = excluded.warn_count,
        last_warn_at = excluded.last_warn_at,
        last_warn_deadline = excluded.last_warn_deadline`
    )
    .bind(
      user.id,
      user.username,
      user.email || '',
      user.password,
      user.avatarUrl || null,
      user.status === 'banned' ? 'banned' : 'active',
      user.emailVerified ? 1 : 0,
      user.uploadLimit == null ? null : user.uploadLimit,
      prefs,
      user.createdAt || Date.now(),
      user.updatedAt || Date.now(),
      user.lastLoginAt || null,
      user.warnCount || 0,
      user.lastWarnAt || null,
      user.lastWarnDeadline || null,
    )
    .run();
}

export async function dbDeleteUser(env, user) {
  if (!user) return;
  if (user.id) {
    await db(env).prepare('DELETE FROM images WHERE user_id = ?').bind(user.id).run();
    await db(env).prepare('DELETE FROM upload_counts WHERE user_id = ?').bind(user.id).run();
    await db(env).prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  } else if (user.username) {
    await db(env).prepare('DELETE FROM users WHERE username = ?').bind(user.username).run();
  }
}

export async function dbListUsers(env) {
  const res = await db(env).prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  return (res.results || []).map(rowToUser);
}

export async function dbCountUsers(env) {
  const row = await db(env).prepare('SELECT COUNT(*) AS c FROM users').first();
  return (row && row.c) || 0;
}

// —— images ——

export function rowToImage(row) {
  if (!row) return null;
  let tags = [];
  try { tags = row.tags ? JSON.parse(row.tags) : []; } catch { tags = []; }
  if (!Array.isArray(tags)) tags = [];
  return {
    id: row.id,
    fileName: row.file_name || '',
    fileSize: row.file_size || 0,
    uploadTime: row.upload_time || 0,
    url: row.url || `/file/${row.id}`,
    messageId: row.message_id || undefined,
    tags,
    liked: !!row.liked,
    blocked: !!row.blocked,
    userId: row.user_id,
    Label: row.label || 'None',
    ListType: row.list_type || 'None',
    TimeStamp: row.upload_time || 0,
  };
}

export async function dbLoadUserImages(env, userId) {
  if (!userId) return [];
  const res = await db(env)
    .prepare('SELECT * FROM images WHERE user_id = ? ORDER BY upload_time DESC')
    .bind(userId)
    .all();
  return (res.results || []).map(rowToImage);
}

function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, (m) => '\\' + m);
}

function imageFilterSql({ q, tag, liked }) {
  let sql = '';
  const binds = [];
  if (q) {
    sql += " AND lower(file_name) LIKE ? ESCAPE '\\'";
    binds.push('%' + likeEscape(String(q).toLowerCase()) + '%');
  }
  if (tag) {
    // tags 列是 JSON.stringify 的数组，元素在文本中恰好是 JSON.stringify(tag)
    sql += " AND tags LIKE ? ESCAPE '\\'";
    binds.push('%' + likeEscape(JSON.stringify(String(tag))) + '%');
  }
  if (liked) sql += ' AND liked = 1';
  return { sql, binds };
}

/**
 * 图库分页查询：页数据 + 过滤后总数（可选全量统计/30 天趋势/类型分布），单次 batch 往返。
 * 走 idx_images_user_time 索引，不再全量拉表。
 */
export async function dbUserImagesPage(env, userId, { q, tag, liked, limit = 20, offset = 0, withStats = false } = {}) {
  const f = imageFilterSql({ q, tag, liked });
  const where = 'user_id = ?' + f.sql;
  const stmts = [
    db(env)
      .prepare(`SELECT * FROM images WHERE ${where} ORDER BY upload_time DESC LIMIT ? OFFSET ?`)
      .bind(userId, ...f.binds, limit, offset),
    db(env).prepare(`SELECT COUNT(*) AS c FROM images WHERE ${where}`).bind(userId, ...f.binds),
  ];
  if (withStats) {
    const now = Date.now();
    const since7d = now - 7 * 24 * 60 * 60 * 1000;
    const since30d = now - 30 * 24 * 60 * 60 * 1000;
    stmts.push(
      db(env)
        .prepare(
          'SELECT COUNT(*) AS c, COALESCE(SUM(file_size),0) AS s, COALESCE(SUM(CASE WHEN upload_time >= ? THEN 1 ELSE 0 END),0) AS recent FROM images WHERE user_id = ?'
        )
        .bind(since7d, userId),
      db(env)
        .prepare(
          `SELECT strftime('%Y-%m-%d', upload_time/1000, 'unixepoch') AS day, COUNT(*) AS c
           FROM images WHERE user_id = ? AND upload_time >= ? GROUP BY day ORDER BY day`
        )
        .bind(userId, since30d),
      db(env)
        .prepare(
          `SELECT CASE WHEN instr(id, '.') > 0 THEN lower(substr(id, instr(id, '.') + 1)) ELSE 'other' END AS ext,
                  COUNT(*) AS c
           FROM images WHERE user_id = ? GROUP BY ext ORDER BY c DESC`
        )
        .bind(userId),
    );
  }
  const res = await db(env).batch(stmts);
  const out = {
    files: (res[0].results || []).map(rowToImage),
    total: Number(res[1].results?.[0]?.c) || 0,
  };
  if (withStats) {
    const st = (res[2].results && res[2].results[0]) || {};
    const cnt = Number(st.c) || 0;
    const size = Number(st.s) || 0;
    out.stats = {
      totalImages: cnt,
      totalSize: size,
      recentUploads: Number(st.recent) || 0,
      averageFileSize: cnt > 0 ? Math.round(size / cnt) : 0,
    };
    out.trend = (res[3].results || []).map((r) => ({ day: r.day, count: Number(r.c) || 0 }));
    out.types = (res[4].results || []).map((r) => ({ ext: r.ext || 'other', count: Number(r.c) || 0 }));
  }
  return out;
}

export async function dbGetImage(env, id) {
  if (!id) return null;
  const row = await db(env).prepare('SELECT * FROM images WHERE id = ?').bind(id).first();
  return rowToImage(row);
}

export async function dbUpsertImage(env, img) {
  if (!img || !img.id) return false;
  const tags = JSON.stringify(Array.isArray(img.tags) ? img.tags : []);
  const uploadTime = img.uploadTime || img.TimeStamp || Date.now();
  await db(env)
    .prepare(
      `INSERT INTO images (
        id, user_id, file_name, file_size, upload_time, url, message_id, tags, liked, blocked, label, list_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = COALESCE(excluded.user_id, images.user_id),
        file_name = COALESCE(excluded.file_name, images.file_name),
        file_size = COALESCE(excluded.file_size, images.file_size),
        upload_time = COALESCE(excluded.upload_time, images.upload_time),
        url = COALESCE(excluded.url, images.url),
        message_id = COALESCE(excluded.message_id, images.message_id),
        tags = excluded.tags,
        liked = excluded.liked,
        blocked = excluded.blocked,
        label = excluded.label,
        list_type = excluded.list_type`
    )
    .bind(
      img.id,
      img.userId || img.user_id,
      img.fileName || img.file_name || '',
      img.fileSize || img.file_size || 0,
      uploadTime,
      img.url || `/file/${img.id}`,
      img.messageId || img.message_id || null,
      tags,
      img.liked ? 1 : 0,
      img.blocked ? 1 : 0,
      img.Label || img.label || 'None',
      img.ListType || img.list_type || 'None',
      img.createdAt || Date.now(),
    )
    .run();
  return true;
}

export async function dbDeleteImage(env, id) {
  if (!id) return;
  await db(env).prepare('DELETE FROM images WHERE id = ?').bind(id).run();
}

// —— 批量操作（调用方需保证 ids ≤ 40，受 D1 每语句 100 绑定参数限制）——

export async function dbBatchImagesByIds(env, userId, ids) {
  if (!ids || !ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const res = await db(env)
    .prepare(`SELECT id, message_id, tags FROM images WHERE user_id = ? AND id IN (${ph})`)
    .bind(userId, ...ids)
    .all();
  return res.results || [];
}

export async function dbDeleteImagesByIds(env, userId, ids) {
  if (!ids || !ids.length) return;
  const ph = ids.map(() => '?').join(',');
  await db(env)
    .prepare(`DELETE FROM images WHERE user_id = ? AND id IN (${ph})`)
    .bind(userId, ...ids)
    .run();
}

/** entries: [{ id, tags: string[] }]，一次 batch 往返 */
export async function dbUpdateImageTags(env, userId, entries) {
  if (!entries || !entries.length) return;
  const stmts = entries.map((e) =>
    db(env)
      .prepare('UPDATE images SET tags = ? WHERE user_id = ? AND id = ?')
      .bind(JSON.stringify(e.tags), userId, e.id)
  );
  await db(env).batch(stmts);
}

export async function dbCountUserImages(env, userId) {
  if (!userId) return 0;
  const row = await db(env)
    .prepare('SELECT COUNT(*) AS c FROM images WHERE user_id = ?')
    .bind(userId)
    .first();
  return (row && row.c) || 0;
}

/** 张数 + 总字节，单条聚合（个人资料页用） */
export async function dbUserImageTotals(env, userId) {
  if (!userId) return { totalImages: 0, totalSize: 0 };
  const row = await db(env)
    .prepare('SELECT COUNT(*) AS c, COALESCE(SUM(file_size), 0) AS s FROM images WHERE user_id = ?')
    .bind(userId)
    .first();
  return { totalImages: Number(row && row.c) || 0, totalSize: Number(row && row.s) || 0 };
}

export async function dbSetUserImagesBlocked(env, userId, blocked) {
  if (!userId) return;
  await db(env)
    .prepare('UPDATE images SET blocked = ? WHERE user_id = ?')
    .bind(blocked ? 1 : 0, userId)
    .run();
}

export async function dbRecentImages(env, limit = 100) {
  const res = await db(env)
    .prepare(
      `SELECT i.*, u.username AS username
       FROM images i
       LEFT JOIN users u ON u.id = i.user_id
       ORDER BY i.upload_time DESC
       LIMIT ?`
    )
    .bind(Math.min(500, Math.max(1, limit)))
    .all();
  return (res.results || []).map((row) => ({
    fileKey: row.id,
    fileName: row.file_name || '',
    fileSize: row.file_size || 0,
    userId: row.user_id,
    username: row.username || '',
    time: row.upload_time || 0,
    url: row.url || `/file/${row.id}`,
    messageId: row.message_id || undefined,
  }));
}

// —— upload counts ——

export async function dbGetUploadCount(env, userId, day) {
  const row = await db(env)
    .prepare('SELECT cnt FROM upload_counts WHERE user_id = ? AND day = ?')
    .bind(userId, day)
    .first();
  return row ? Number(row.cnt) || 0 : 0;
}

export async function dbSetUploadCount(env, userId, day, cnt) {
  await db(env)
    .prepare(
      `INSERT INTO upload_counts (user_id, day, cnt) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET cnt = excluded.cnt`
    )
    .bind(userId, day, cnt)
    .run();
}

export async function dbIncrUploadCount(env, userId, day, by = 1) {
  await db(env)
    .prepare(
      `INSERT INTO upload_counts (user_id, day, cnt) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET cnt = cnt + excluded.cnt`
    )
    .bind(userId, day, by)
    .run();
}

// —— admin stats ——

export async function dbAdminStats(env) {
  const totalUsers = (await db(env).prepare('SELECT COUNT(*) AS c FROM users').first())?.c || 0;
  const bannedUsers = (await db(env).prepare(`SELECT COUNT(*) AS c FROM users WHERE status = 'banned'`).first())?.c || 0;
  const verifiedUsers = (await db(env).prepare('SELECT COUNT(*) AS c FROM users WHERE email_verified = 1').first())?.c || 0;
  const totalImages = (await db(env).prepare('SELECT COUNT(*) AS c FROM images').first())?.c || 0;
  return {
    totalUsers: Number(totalUsers),
    bannedUsers: Number(bannedUsers),
    verifiedUsers: Number(verifiedUsers),
    totalImages: Number(totalImages),
  };
}

export async function dbListUserSummaries(env, isAdminFn) {
  const res = await db(env)
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM images i WHERE i.user_id = u.id) AS image_count
       FROM users u
       ORDER BY u.created_at DESC`
    )
    .all();
  return (res.results || []).map((row) => {
    const u = rowToUser(row);
    return {
      username: u.username,
      id: u.id,
      email: u.email,
      status: u.status,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      uploadLimit: u.uploadLimit,
      role: isAdminFn(u.username) ? 'admin' : 'user',
      imageCount: Number(row.image_count) || 0,
      lastWarnAt: u.lastWarnAt,
      lastWarnDeadline: u.lastWarnDeadline,
      warnCount: u.warnCount,
    };
  });
}
