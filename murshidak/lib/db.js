import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','family','business')),
  lang TEXT NOT NULL DEFAULT 'ar',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('self','spouse','child','parent','domestic_worker','employee','other')),
  nationality TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('civil_id','passport','residency','driving_license','car_registration','other')),
  label TEXT NOT NULL DEFAULT '',
  number_enc TEXT,
  expiry_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  file_key TEXT,
  file_mime TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS procedures (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('online','in_person','mixed')),
  popular INTEGER NOT NULL DEFAULT 0,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  summary_ar TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '',
  fees_ar TEXT NOT NULL DEFAULT '', fees_en TEXT NOT NULL DEFAULT '',
  duration_ar TEXT NOT NULL DEFAULT '', duration_en TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '{}',
  steps TEXT NOT NULL DEFAULT '[]',
  documents TEXT NOT NULL DEFAULT '[]',
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  phone TEXT NOT NULL,
  bio_ar TEXT NOT NULL DEFAULT '', bio_en TEXT NOT NULL DEFAULT '',
  categories TEXT NOT NULL DEFAULT '[]',
  areas_ar TEXT NOT NULL DEFAULT '', areas_en TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  price_kwd REAL NOT NULL,
  years INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  procedure_id INTEGER REFERENCES procedures(id) ON DELETE SET NULL,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','in_progress','done','cancelled')),
  preferred_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  price_kwd REAL NOT NULL,
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key TEXT UNIQUE,
  kind TEXT NOT NULL,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  body_ar TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
`;

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'murshidak.db'));
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
