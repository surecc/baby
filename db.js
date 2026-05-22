const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS babies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    birthday TEXT,
    gender TEXT,
    emoji TEXT DEFAULT '👶',
    invite_code TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    baby_id TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    note TEXT,
    recorded_at TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS timers (
    id TEXT PRIMARY KEY,
    baby_id TEXT NOT NULL,
    type TEXT NOT NULL,
    sub_type TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    created_by TEXT,
    FOREIGN KEY (baby_id) REFERENCES babies(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_records_baby_date ON records(baby_id, recorded_at);
  CREATE INDEX IF NOT EXISTS idx_timers_baby ON timers(baby_id, ended_at);
`);

module.exports = db;
