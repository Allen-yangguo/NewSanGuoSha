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
  records: Record<string, RecordRow>;
  nextId: { users: number; sms_codes: number };
}

export interface UserRow {
  id: number;
  phone: string;
  /** 用户名(用户名注册模式填写;手机号注册用户为空字符串) */
  username: string;
  password_hash: string;
  nickname: string;
  created_at: string;
  updated_at: string;
  /** 是否为模拟玩家(机器人) */
  isBot?: boolean;
}

let _data: DBData | null = null;

function loadData(): DBData {
  if (_data) return _data;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const fresh: DBData = { users: [], sms_codes: [], guests: [], records: {}, nextId: { users: 1, sms_codes: 1 } };
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
    if (!parsed.records) parsed.records = {};
    // 兼容旧数据：为缺少 nickname/username 的用户补默认值
    for (const u of parsed.users) {
      if (!u.nickname) u.nickname = `玩家${u.id}`;
      if (u.username === undefined) u.username = '';
    }
  } catch {
    parsed = { users: [], sms_codes: [], guests: [], records: {}, nextId: { users: 1, sms_codes: 1 } };
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

export function findUserByUsername(username: string): UserRow | undefined {
  return loadData().users.find(u => u.username === username);
}

/** 按账号查找(手机号或用户名,用于登录) */
export function findUserByAccount(account: string): UserRow | undefined {
  return loadData().users.find(u => u.phone === account || u.username === account);
}

export function findUserById(id: number): UserRow | undefined {
  return loadData().users.find(u => u.id === id);
}

export function createUser(phone: string, passwordHash: string, nickname: string, username: string = ''): UserRow {
  const data = loadData();
  const now = new Date().toISOString();
  const row: UserRow = {
    id: data.nextId.users++,
    phone,
    username,
    password_hash: passwordHash,
    nickname: nickname || `玩家${data.nextId.users}`,
    created_at: now,
    updated_at: now,
  };
  data.users.push(row);
  saveData();
  return row;
}

// ===== 模拟玩家（机器人）=====
/** 创建模拟玩家（昵称由调用方生成；永不用于真实登录） */
export function createBotUser(nickname: string): UserRow {
  const data = loadData();
  const now = new Date().toISOString();
  const row: UserRow = {
    id: data.nextId.users++,
    phone: '',
    username: `bot_${Date.now()}_${data.nextId.users}`,
    password_hash: '$2b$10$botbotbotbotbotbotbotbotbotbotbotbotbotb', // 不可登录
    nickname,
    created_at: now,
    updated_at: now,
    isBot: true,
  };
  data.users.push(row);
  saveData();
  return row;
}

/** 所有模拟玩家 */
export function listBots(): UserRow[] {
  return loadData().users.filter(u => u.isBot);
}

/** 判断某用户是否为模拟玩家 */
export function isBotUser(uid: string): boolean {
  if (!uid.startsWith('u')) return false;
  const id = Number(uid.slice(1));
  const u = loadData().users.find(x => x.id === id);
  return !!u?.isBot;
}

export function updateUserNickname(id: number, nickname: string): void {
  const data = loadData();
  const user = data.users.find(u => u.id === id);
  if (user) {
    user.nickname = nickname;
    user.updated_at = new Date().toISOString();
    saveData();
  }
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

// ===== 用户管理（管理后台）=====
/** 用户列表/搜索: 关键词匹配 id / 手机号 / 用户名 / 昵称 */
export function listUsers(keyword: string): UserRow[] {
  const data = loadData();
  const kw = (keyword || '').trim().toLowerCase();
  if (!kw) return [...data.users];
  return data.users.filter(u =>
    String(u.id) === kw ||
    u.phone.toLowerCase().includes(kw) ||
    (u.username || '').toLowerCase().includes(kw) ||
    (u.nickname || '').toLowerCase().includes(kw),
  );
}

/** 按 id 重置密码 */
export function updateUserPasswordById(id: number, passwordHash: string): boolean {
  const data = loadData();
  const user = data.users.find(u => u.id === id);
  if (!user) return false;
  user.password_hash = passwordHash;
  user.updated_at = new Date().toISOString();
  saveData();
  return true;
}

/** 删除用户(同时删除其战绩) */
export function deleteUser(id: number): boolean {
  const data = loadData();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx < 0) return false;
  data.users.splice(idx, 1);
  delete data.records[`u${id}`];
  saveData();
  return true;
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

// ===== 用户战绩表 =====
export interface RecordRow {
  uid: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  totalScore: number;
  firstBloods: number;
  successfulAttacks: number;
  ultimateKills: number;
}

function emptyRecord(uid: string): RecordRow {
  return {
    uid, totalGames: 0, wins: 0, losses: 0, draws: 0,
    totalScore: 0, firstBloods: 0, successfulAttacks: 0, ultimateKills: 0,
  };
}

export function getRecord(uid: string): RecordRow {
  const data = loadData();
  if (!data.records[uid]) {
    data.records[uid] = emptyRecord(uid);
    saveData();
  }
  return data.records[uid];
}

export function updateRecord(uid: string, patch: Partial<RecordRow>): void {
  const data = loadData();
  if (!data.records[uid]) data.records[uid] = emptyRecord(uid);
  Object.assign(data.records[uid], patch);
  saveData();
}
