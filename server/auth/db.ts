/**
 * 用户管理 · JSON 文件数据访问层（纯 JS，无原生模块依赖）
 * 单文件 data/users.json，首次启动自动创建
 */
import * as path from 'path';
import * as fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'users.json');

interface SmsCodeRow {
  id: number;
  phone: string;
  code: string;
  purpose: string;
  expires_at: string;
  consumed: boolean;
  created_at: string;
}

interface DBData {
  users: UserRow[];
  sms_codes: SmsCodeRow[];
  guests: { guest_id: string; created_at: string; last_active: string }[];
  nextId: { users: number; sms_codes: number };
}

export interface UserRow {
  id: number;
  phone: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

let _data: DBData | null = null;

function loadData(): DBData {
  if (_data) return _data;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const fresh: DBData = { users: [], sms_codes: [], guests: [], nextId: { users: 1, sms_codes: 1 } };
    _data = fresh;
    saveData();
    return _data;
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  let parsed: DBData;
  try {
    parsed = JSON.parse(raw);
    if (!parsed.users) parsed.users = [];
    if (!parsed.sms_codes) parsed.sms_codes = [];
    if (!parsed.guests) parsed.guests = [];
    if (!parsed.nextId) parsed.nextId = { users: 1, sms_codes: 1 };
  } catch {
    parsed = { users: [], sms_codes: [], guests: [], nextId: { users: 1, sms_codes: 1 } };
  }
  _data = parsed;
  return _data;
}

function saveData(): void {
  if (!_data) return;
  fs.writeFileSync(DB_PATH, JSON.stringify(_data, null, 2), 'utf-8');
}

/** 初始化（兼容旧 getDb 调用，确保数据文件存在） */
export function getDb(): { ok: boolean } {
  loadData();
  return { ok: true };
}

// ===== 用户表 =====
export function findUserByPhone(phone: string): UserRow | undefined {
  return loadData().users.find(u => u.phone === phone);
}

export function findUserById(id: number): UserRow | undefined {
  return loadData().users.find(u => u.id === id);
}

export function createUser(phone: string, passwordHash: string): UserRow {
  const data = loadData();
  const now = new Date().toISOString();
  const row: UserRow = {
    id: data.nextId.users++,
    phone,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };
  data.users.push(row);
  saveData();
  return row;
}

export function updateUserPassword(phone: string, passwordHash: string): void {
  const data = loadData();
  const user = data.users.find(u => u.phone === phone);
  if (user) {
    user.password_hash = passwordHash;
    user.updated_at = new Date().toISOString();
    saveData();
  }
}

// ===== 游客表 =====
export function touchGuest(guestId: string): void {
  const data = loadData();
  const now = new Date().toISOString();
  const existing = data.guests.find(g => g.guest_id === guestId);
  if (existing) {
    existing.last_active = now;
  } else {
    data.guests.push({ guest_id: guestId, created_at: now, last_active: now });
  }
  saveData();
}

// ===== 短信验证码表 =====
export function insertSmsCode(phone: string, code: string, purpose: string, expiresAt: string): void {
  const data = loadData();
  const createdAt = new Date().toISOString();
  data.sms_codes.push({
    id: data.nextId.sms_codes++,
    phone, code, purpose, expires_at: expiresAt,
    consumed: false, created_at: createdAt,
  });
  saveData();
}

export function findLatestSmsCode(phone: string, purpose: string): { id: number; code: string; expires_at: string } | undefined {
  const data = loadData();
  // 倒序找最新一条未消费的
  for (let i = data.sms_codes.length - 1; i >= 0; i--) {
    const row = data.sms_codes[i];
    if (row.phone === phone && row.purpose === purpose && !row.consumed) {
      return { id: row.id, code: row.code, expires_at: row.expires_at };
    }
  }
  return undefined;
}

export function markSmsCodeConsumed(id: number): void {
  const data = loadData();
  const row = data.sms_codes.find(s => s.id === id);
  if (row) {
    row.consumed = true;
    saveData();
  }
}
