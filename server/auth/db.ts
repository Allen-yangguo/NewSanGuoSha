/**
 * 用户管理 · SQLite 数据访问层
 * 单文件 data/users.db,首次启动自动建表
 */
import Database = require('better-sqlite3');
import * as path from 'path';
import * as fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'users.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sms_phone_purpose ON sms_codes(phone, purpose);
    CREATE TABLE IF NOT EXISTS guests (
      guest_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      last_active TEXT NOT NULL
    );
  `);
}

export interface UserRow {
  id: number;
  phone: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export function findUserByPhone(phone: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function createUser(phone: string, passwordHash: string): UserRow {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare('INSERT INTO users (phone, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(phone, passwordHash, now, now);
  return { id: Number(info.lastInsertRowid), phone, password_hash: passwordHash, created_at: now, updated_at: now };
}

export function updateUserPassword(phone: string, passwordHash: string): void {
  const now = new Date().toISOString();
  getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE phone = ?').run(passwordHash, now, phone);
}

export function touchGuest(guestId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare('INSERT INTO guests (guest_id, created_at, last_active) VALUES (?, ?, ?) ON CONFLICT(guest_id) DO UPDATE SET last_active = ?')
    .run(guestId, now, now, now);
}
