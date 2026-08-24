/**
 * 短信验证码模块
 * - 开发环境(NODE_ENV !== 'production'):固定测试码 123456,控制台打印
 * - 生产环境:生成 6 位随机码,预留阿里云/腾讯云适配层接入点
 *
 * 限流:60s 重发间隔、同号同目的每日 5 次
 */
import { getDb } from './db';

export type SmsPurpose = 'register' | 'reset';

export interface SmsResult {
  ok: boolean;
  message: string;
  /** 开发环境返回验证码便于调试 */
  debugCode?: string;
}

const CODE_VALID_MS = 5 * 60 * 1000;   // 验证码 5 分钟有效
const RESEND_INTERVAL_MS = 60 * 1000;  // 60s 重发限制
const DAILY_LIMIT = 5;                  // 同号同目的每日上限
const TEST_CODE = '123456';

// 内存限流计数(单进程,重启重置;验证码本身存数据库)
const lastSentMap = new Map<string, number>();
const dailyCountMap = new Map<string, number>();

export function isTestMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function genCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sendCode(phone: string, purpose: SmsPurpose): SmsResult {
  const key = `${phone}|${purpose}`;
  const now = Date.now();

  // 60s 重发限制
  const last = lastSentMap.get(key) || 0;
  if (now - last < RESEND_INTERVAL_MS) {
    const remain = Math.ceil((RESEND_INTERVAL_MS - (now - last)) / 1000);
    return { ok: false, message: `请 ${remain} 秒后再试` };
  }

  // 每日次数限制
  const dayKey = `${key}|${today()}`;
  const cnt = dailyCountMap.get(dayKey) || 0;
  if (cnt >= DAILY_LIMIT) {
    return { ok: false, message: '今日验证码发送次数已达上限' };
  }
  dailyCountMap.set(dayKey, cnt + 1);

  const code = isTestMode() ? TEST_CODE : genCode();
  lastSentMap.set(key, now);

  // 持久化验证码记录(用于校验与一次性消费)
  const expiresAt = new Date(now + CODE_VALID_MS).toISOString();
  const createdAt = new Date(now).toISOString();
  getDb()
    .prepare('INSERT INTO sms_codes (phone, code, purpose, expires_at, consumed, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(phone, code, purpose, expiresAt, createdAt);

  // ===== 生产环境短信适配层接入点 =====
  // if (!isTestMode()) { await sendViaAliyun(phone, code); }
  if (isTestMode()) {
    console.log(`[SMS][${purpose}] ${phone} 验证码: ${code}（开发固定码 ${TEST_CODE}）`);
  }

  return { ok: true, message: '验证码已发送', debugCode: isTestMode() ? code : undefined };
}

export function verifyCode(phone: string, purpose: SmsPurpose, code: string): { ok: boolean; message: string } {
  const row = getDb()
    .prepare('SELECT * FROM sms_codes WHERE phone = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1')
    .get(phone, purpose) as { id: number; code: string; expires_at: string } | undefined;
  if (!row) return { ok: false, message: '验证码不存在或已使用' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, message: '验证码已过期' };
  if (row.code !== code) return { ok: false, message: '验证码错误' };
  getDb().prepare('UPDATE sms_codes SET consumed = 1 WHERE id = ?').run(row.id);
  return { ok: true, message: '验证成功' };
}
