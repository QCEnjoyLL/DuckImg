-- DuckImg D1 schema：业务数据全进 D1；图片本体仍在 Telegram
-- 兼容旧 KV 字段语义，便于无缝导入

PRAGMA foreign_keys = ON;

-- —— 用户 ——
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password TEXT NOT NULL,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | banned
  email_verified INTEGER NOT NULL DEFAULT 0,
  upload_limit INTEGER,                  -- NULL = 用全局设置
  prefs TEXT,                            -- JSON
  created_at INTEGER,
  updated_at INTEGER,
  last_login_at INTEGER,
  warn_count INTEGER NOT NULL DEFAULT 0,
  last_warn_at INTEGER,
  last_warn_deadline INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != '';
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- —— 图库索引（核心；不存图片二进制）——
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,                   -- Telegram fileId + ext，如 xxx.jpg
  user_id TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  upload_time INTEGER NOT NULL,
  url TEXT,
  message_id INTEGER,
  tags TEXT,                             -- JSON array
  liked INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  label TEXT DEFAULT 'None',
  list_type TEXT DEFAULT 'None',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_user_time ON images(user_id, upload_time DESC);
CREATE INDEX IF NOT EXISTS idx_images_user_liked ON images(user_id, liked);
CREATE INDEX IF NOT EXISTS idx_images_blocked ON images(blocked);

-- —— 日上传计数 ——
CREATE TABLE IF NOT EXISTS upload_counts (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,                     -- YYYY-MM-DD (UTC)
  cnt INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- —— 站点级 KV 风格键值（settings / bans / admin logs / pending reg …）——
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER                     -- unix ms；NULL=永不过期
);
CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_store(expires_at) WHERE expires_at IS NOT NULL;

-- —— 限流（替代 users KV 的 rl:*）——
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
