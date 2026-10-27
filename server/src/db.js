import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = path.join(root, "data");
export const uploadDir = path.join(dataDir, "uploads");

mkdirSync(uploadDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "umbral.sqlite"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS homes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    user_id TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    protection_armed INTEGER NOT NULL DEFAULT 0,
    last_lat REAL,
    last_lng REAL,
    last_accuracy REAL,
    last_seen TEXT,
    sensor_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    lat REAL,
    lng REAL,
    detail TEXT,
    audio_path TEXT,
    audio_expires_at TEXT,
    clip_stored INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    stream_url TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    home_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    last4 TEXT,
    current_period_end TEXT,
    provider TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS events_home ON events (home_id, created_at DESC);
`);

const eventColumns = db.prepare("PRAGMA table_info(events)").all();
if (!eventColumns.some((column) => column.name === "video_path")) {
  db.exec("ALTER TABLE events ADD COLUMN video_path TEXT");
}

const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((column) => column.name === "photo_path")) {
  db.exec("ALTER TABLE users ADD COLUMN photo_path TEXT");
}

const homeColumns = db.prepare("PRAGMA table_info(homes)").all();
for (const column of ["zone_lat", "zone_lng", "zone_radius"]) {
  if (!homeColumns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE homes ADD COLUMN ${column} REAL`);
  }
}

const subscriptionColumns = db.prepare("PRAGMA table_info(subscriptions)").all();
for (const [column, type] of [
  ["billing_mode", "TEXT"],
  ["amount", "INTEGER"],
  ["auth_code", "TEXT"],
  ["payer_user_id", "TEXT"],
  ["mail_sent", "INTEGER"],
]) {
  if (!subscriptionColumns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE subscriptions ADD COLUMN ${column} ${type}`);
  }
}
