-- 认证加固：可撤销会话 + 一次性验证码

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS verification_codes (
  code_key TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_expires
  ON verification_codes(expires_at);
