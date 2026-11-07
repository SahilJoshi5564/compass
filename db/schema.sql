-- Compass anonymous usage analytics (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  version TEXT,
  standalone INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS daily (
  day TEXT NOT NULL,
  id TEXT NOT NULL,
  event TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, id, event)
);
CREATE INDEX IF NOT EXISTS idx_daily_day ON daily(day);
CREATE INDEX IF NOT EXISTS idx_users_first ON users(first_seen);
