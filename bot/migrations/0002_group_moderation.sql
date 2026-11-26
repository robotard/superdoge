CREATE TABLE IF NOT EXISTS group_members (
  chat_id INTEGER NOT NULL,
  telegram_user_id INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, telegram_user_id)
);

CREATE TABLE IF NOT EXISTS message_windows (
  chat_id INTEGER NOT NULL,
  telegram_user_id INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  PRIMARY KEY (chat_id, telegram_user_id)
);
