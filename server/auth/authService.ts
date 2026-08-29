/**
 * 用户认证服务:注册 / 登录 / 忘记密码 / 游客 / Token 校验
 */
import bcrypt = require('bcryptjs');
import jwt = require('jsonwebtoken');
import { randomBytes } from 'crypto';
import { findUserByPhone, findUserByUsername, findUserByAccount, findUserById, createUser, updateUserPassword, updateUserNickname, touchGuest } from './db';
import { sendCode, verifyCode } from './sms';
import type { SmsPurpose } from './sms';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-please-change-in-production';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_FAIL = 5;
const LOCK_MS = 5 * 60 * 1000;

export type UserRole = 'user' | 'guest';

export interface JwtPayload {
  /** 正式用户: u<id>,游客: g<hex> */
  uid: string;
  /** 仅正式用户有 */
  phone?: string;
  role: UserRole;
  /** 模拟玩家标记（机器人） */
  isBot?: boolean;
}

export interface UserInfo {
  uid: string;
  phone?: string;
  username?: string;
  nickname?: string;
  role: UserRole;
  isBot?: boolean;
}

export interface AuthResult {
  ok: boolean;
  message: string;
  token?: string;
  user?: UserInfo;
  /** 开发环境回显验证码,便于联调 */
  debugCode?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload as any, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** 生成模拟玩家连接 token（机器人专用） */
export function createBotToken(uid: string): string {
  return signToken({ uid, role: 'user', isBot: true });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function validPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

function validPassword(pwd: string): boolean {
  // >=8 位,含字母 + 数字
  return pwd.length >= 8 && /[a-zA-Z]/.test(pwd) && /\d/.test(pwd);
}

function userToInfo(row: { id: number; phone: string; username?: string; nickname: string }): UserInfo {
  return { uid: `u${row.id}`, phone: row.phone, username: row.username || undefined, nickname: row.nickname, role: 'user' };
}

/** 发送验证码(注册/重置) */
export async function requestCode(phone: string, purpose: SmsPurpose): Promise<AuthResult> {
  if (!validPhone(phone)) return { ok: false, message: '手机号格式不正确' };
  if (purpose === 'reset') {
    if (!findUserByPhone(phone)) return { ok: false, message: '该手机号未注册' };
  } else {
    if (findUserByPhone(phone)) return { ok: false, message: '该手机号已注册' };
  }
  const r = await sendCode(phone, purpose);
  return { ok: r.ok, message: r.message, debugCode: r.debugCode };
}

/** 注册(手机号 + 短信验证码) */
export function register(phone: string, password: string, code: string, nickname?: string): AuthResult {
  if (!validPhone(phone)) return { ok: false, message: '手机号格式不正确' };
  if (!validPassword(password)) return { ok: false, message: '密码至少 8 位,需含字母和数字' };
  if (findUserByPhone(phone)) return { ok: false, message: '该手机号已注册' };
  const v = verifyCode(phone, 'register', code);
  if (!v.ok) return { ok: false, message: v.message };
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const row = createUser(phone, hash, nickname || '');
  const user = userToInfo(row);
  const token = signToken({ uid: user.uid, phone: user.phone, role: 'user' });
  return { ok: true, message: '注册成功', token, user };
}

/** 用户名格式校验:3-16 位,字母/数字/下划线,首字符为字母 */
function validUsername(username: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{2,15}$/.test(username);
}

/** 用户名注册(无需验证码,用户名排重) */
export function registerByUsername(username: string, password: string, nickname?: string): AuthResult {
  if (!validUsername(username)) return { ok: false, message: '用户名需 3-16 位,字母/数字/下划线,首字符为字母' };
  if (!validPassword(password)) return { ok: false, message: '密码至少 8 位,需含字母和数字' };
  if (findUserByUsername(username)) return { ok: false, message: '该用户名已被注册' };
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const row = createUser('', hash, nickname || '', username);
  const user = userToInfo(row);
  const token = signToken({ uid: user.uid, phone: user.phone, role: 'user' });
  return { ok: true, message: '注册成功', token, user };
}

// 登录失败计数(单进程内存)
const loginFailMap = new Map<string, { count: number; lockedUntil: number }>();

/** 登录(account 支持手机号或用户名) */
export function login(account: string, password: string): AuthResult {
  if (!account) return { ok: false, message: '账号不能为空' };
  const rec = loginFailMap.get(account);
  if (rec && rec.lockedUntil > Date.now()) {
    const remain = Math.ceil((rec.lockedUntil - Date.now()) / 1000 / 60);
    return { ok: false, message: `登录失败次数过多,请 ${remain} 分钟后再试` };
  }
  const row = findUserByAccount(account);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    const r = loginFailMap.get(account) || { count: 0, lockedUntil: 0 };
    r.count += 1;
    if (r.count >= MAX_LOGIN_FAIL) {
      r.lockedUntil = Date.now() + LOCK_MS;
      r.count = 0;
    }
    loginFailMap.set(account, r);
    return { ok: false, message: '账号或密码错误' };
  }
  loginFailMap.delete(account);
  const user = userToInfo(row);
  const token = signToken({ uid: user.uid, phone: user.phone, role: 'user' });
  return { ok: true, message: '登录成功', token, user };
}

/** 忘记密码:校验验证码并重置 */
export function resetPassword(phone: string, code: string, newPassword: string): AuthResult {
  if (!validPhone(phone)) return { ok: false, message: '手机号格式不正确' };
  if (!validPassword(newPassword)) return { ok: false, message: '密码至少 8 位,需含字母和数字' };
  const row = findUserByPhone(phone);
  if (!row) return { ok: false, message: '该手机号未注册' };
  const v = verifyCode(phone, 'reset', code);
  if (!v.ok) return { ok: false, message: v.message };
  const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  updateUserPassword(phone, hash);
  return { ok: true, message: '密码重置成功,请用新密码登录' };
}

/** 游客登录 */
export function guestLogin(): AuthResult {
  const guestId = 'g' + randomBytes(8).toString('hex');
  touchGuest(guestId);
  const token = signToken({ uid: guestId, role: 'guest' });
  return { ok: true, message: '游客登录成功', token, user: { uid: guestId, role: 'guest' } };
}

/** 根据 uid 获取用户信息(/api/auth/me 用) */
export function getUserByUid(uid: string): AuthResult {
  if (uid.startsWith('g')) {
    return { ok: true, message: 'ok', user: { uid, role: 'guest' } };
  }
  if (!uid.startsWith('u')) return { ok: false, message: '无效用户标识' };
  const id = Number(uid.slice(1));
  if (!id) return { ok: false, message: '无效用户标识' };
  const row = findUserById(id);
  if (!row) return { ok: false, message: '用户不存在' };
  return { ok: true, message: 'ok', user: userToInfo(row) };
}

/** 修改昵称 */
export function updateNickname(uid: string, nickname: string): AuthResult {
  if (!uid || !uid.startsWith('u')) return { ok: false, message: '游客无法修改昵称' };
  if (!nickname || nickname.trim().length === 0) return { ok: false, message: '昵称不能为空' };
  if (nickname.length > 12) return { ok: false, message: '昵称最多 12 字' };
  const id = Number(uid.slice(1));
  const row = findUserById(id);
  if (!row) return { ok: false, message: '用户不存在' };
  updateUserNickname(id, nickname.trim());
  return { ok: true, message: '昵称修改成功', user: userToInfo({ ...row, nickname: nickname.trim() }) };
}
