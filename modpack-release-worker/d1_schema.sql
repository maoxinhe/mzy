-- D1 schema for modpack-release worker
-- 错误报告记录（原 KV er:report:*）
CREATE TABLE IF NOT EXISTS error_reports (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_error_reports_createdAt ON error_reports (createdAt);

-- 工单数据（原 KV ticket:* + ticket:index）
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_createdAt ON tickets (createdAt);

-- 错误报告限流（原 KV er:rl:*）
CREATE TABLE IF NOT EXISTS er_rl (
  kind TEXT NOT NULL,
  k TEXT NOT NULL,
  ts TEXT NOT NULL,
  PRIMARY KEY (kind, k)
);

-- 错误报告队列 / 锁（原 KV er:queue / er:lock）
CREATE TABLE IF NOT EXISTS er_meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
