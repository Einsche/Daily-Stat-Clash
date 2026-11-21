PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  username_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  last_failure INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  universe TEXT NOT NULL,
  portrait_url TEXT NOT NULL,
  strength INTEGER NOT NULL CHECK (strength BETWEEN 0 AND 100),
  dexterity INTEGER NOT NULL CHECK (dexterity BETWEEN 0 AND 100),
  battle_iq INTEGER NOT NULL CHECK (battle_iq BETWEEN 0 AND 100),
  endurance INTEGER NOT NULL CHECK (endurance BETWEEN 0 AND 100),
  hacks INTEGER NOT NULL CHECK (hacks BETWEEN 0 AND 100),
  iq INTEGER NOT NULL CHECK (iq BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS daily_runs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  current_character_id TEXT REFERENCES characters(id),
  submitted_at INTEGER,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS daily_picks (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  stat TEXT NOT NULL CHECK(stat IN ('strength','dexterity','battle_iq','endurance','hacks','iq')),
  character_id TEXT NOT NULL REFERENCES characters(id),
  picked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, stat),
  UNIQUE (user_id, day, character_id),
  FOREIGN KEY(user_id,day) REFERENCES daily_runs(user_id,day) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matchups (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  user_a TEXT NOT NULL REFERENCES users(id),
  user_b TEXT NOT NULL REFERENCES users(id),
  points_a INTEGER NOT NULL CHECK(points_a BETWEEN 0 AND 6),
  points_b INTEGER NOT NULL CHECK(points_b BETWEEN 0 AND 6),
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(day, user_a),
  UNIQUE(day, user_b),
  CHECK(user_a <> user_b)
);
CREATE INDEX IF NOT EXISTS idx_matchups_day ON matchups(day);
CREATE INDEX IF NOT EXISTS idx_matchups_user_a ON matchups(user_a,day);
CREATE INDEX IF NOT EXISTS idx_matchups_user_b ON matchups(user_b,day);

CREATE TABLE IF NOT EXISTS settled_days (
  day TEXT PRIMARY KEY,
  settled_at INTEGER NOT NULL
);
