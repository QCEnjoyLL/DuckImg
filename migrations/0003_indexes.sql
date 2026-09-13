-- 索引补齐与清理效率（对应体检清单 P1-2 / P2）
--
-- 背景（已用 EXPLAIN QUERY PLAN 在真实 schema 上实测）：
--   dbRecentImages（管理端"最近上传"）与 adminSearchImage 都是
--   `SCAN images + USE TEMP B-TREE FOR ORDER BY` —— 扫全表只为了取最新 100 条。
--   images 上此前只有 (user_id, upload_time) 组合索引，没有单独的 upload_time 索引。
--
--   定时清理 rate_limits 也是全表扫（无 reset_at 索引）。
--
-- 另：idx_images_blocked 没有任何查询使用（只有 UPDATE ... WHERE user_id=?），
-- 属于纯写入放大，这里一并删除。

CREATE INDEX IF NOT EXISTS idx_images_time ON images(upload_time DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

DROP INDEX IF EXISTS idx_images_blocked;
