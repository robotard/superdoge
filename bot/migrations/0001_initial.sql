CREATE TABLE IF NOT EXISTS entries (
  telegram_user_id INTEGER PRIMARY KEY,
  wallet TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending (
  telegram_user_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
