/**
 * 短信验证码模块
 *
 * 开关(环境变量 SMS_MODE):
 *   - "dev"     (默认) 固定测试码 123456,控制台打印,不调用外部服务
 *   - "tencent"        调用腾讯云短信服务真实下发
 *
 * 腾讯云配置(仅 SMS_MODE=tencent 时需要):
 *   TX_SMS_SECRET_ID        访问密钥 ID
 *   TX_SMS_SECRET_KEY       访问密钥 Secret
 *   TX_SMS_SDK_APP_ID       短信应用 SdkAppId(1400 开头)
 *   TX_SMS_SIGN             短信签名内容(需在腾讯云审核通过)
 *   TX_SMS_TPL              通用短信模板 ID
 *   TX_SMS_TPL_REGISTER     注册专用模板 ID(可选,缺省回退 TX_SMS_TPL)
 *   TX_SMS_TPL_RESET        重置密码专用模板 ID(可选,缺省回退 TX_SMS_TPL)
 *
 * 限流:60s 重发间隔、同号同目的每日 5 次
 * 验证码 5 分钟有效,一次性消费
 */
import { insertSmsCode, findLatestSmsCode, markSmsCodeConsumed } from './db';

export type SmsPurpose = 'register' | 'reset';

export interface SmsResult {
  ok: boolean;
  message: string;
  /** dev 模式返回验证码便于调试;tencent 模式不返回 */
  debugCode?: string;
}

const CODE_VALID_MS = 5 * 60 * 1000;   // 验证码 5 分钟有效
const RESEND_INTERVAL_MS = 60 * 1000;  // 60s 重发限制
const DAILY_LIMIT = 5;                  // 同号同目的每日上限
const TEST_CODE = '123456';

// 内存限流计数(单进程,重启重置;验证码本身存数据库)
const lastSentMap = new Map<string, number>();
const dailyCountMap = new Map<string, number>();

// 腾讯云 SDK 客户端懒加载(避免 dev 模式强依赖)
let tencentClient: any = null;

export function getSmsMode(): 'dev' | 'tencent' {
  return process.env.SMS_MODE === 'tencent' ? 'tencent' : 'dev';
}

export function isTestMode(): boolean {
  return getSmsMode() === 'dev';
}

function genCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTencentClient(): any {
  if (tencentClient) return tencentClient;
  // 动态 require,避免 dev 模式下强依赖该包
  const pkg: any = require('tencentcloud-sdk-nodejs-sms');
  const Client = pkg.sms.v20210111.Client;
  tencentClient = new Client({
    credential: {
      secretId: process.env.TX_SMS_SECRET_ID!,
      secretKey: process.env.TX_SMS_SECRET_KEY!,
    },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } },
  });
  return tencentClient;
}

function getTemplateId(purpose: SmsPurpose): string {
  if (purpose === 'register') {
    return process.env.TX_SMS_TPL_REGISTER || process.env.TX_SMS_TPL || '';
  }
  return process.env.TX_SMS_TPL_RESET || process.env.TX_SMS_TPL || '';
}

async function sendViaTencent(phone: string, code: string, purpose: SmsPurpose): Promise<void> {
  const sdkAppId = process.env.TX_SMS_SDK_APP_ID;
  const signName = process.env.TX_SMS_SIGN;
  const tplId = getTemplateId(purpose);
  if (!sdkAppId || !signName || !tplId) {
    throw new Error('腾讯云短信配置不完整(需 TX_SMS_SDK_APP_ID / TX_SMS_SIGN / TX_SMS_TPL)');
  }
  const client = getTencentClient();
  const res = await client.SendSms({
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: tplId,
    PhoneNumberSet: ['+86' + phone],
    TemplateParamSet: [code],
  });
  // 腾讯云返回结构: SendStatusSet[0].Code === 'Ok' 表示成功
  const status = res?.SendStatusSet?.[0];
  if (!status || status.Code !== 'Ok') {
    throw new Error(status?.Message || '腾讯云短信发送失败');
  }
}

export async function sendCode(phone: string, purpose: SmsPurpose): Promise<SmsResult> {
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

  const mode = getSmsMode();
  const code = mode === 'dev' ? TEST_CODE : genCode();
  lastSentMap.set(key, now);

  // 持久化验证码记录(用于校验与一次性消费)
  const expiresAt = new Date(now + CODE_VALID_MS).toISOString();
  insertSmsCode(phone, code, purpose, expiresAt);

  if (mode === 'dev') {
    console.log(`[SMS][${purpose}] ${phone} 验证码: ${code}（dev 模式固定码）`);
    return { ok: true, message: '验证码已发送', debugCode: code };
  }

  // tencent 模式:调用腾讯云真实下发
  try {
    await sendViaTencent(phone, code, purpose);
    return { ok: true, message: '验证码已发送' };
  } catch (e: any) {
    console.error('[SMS] 腾讯云发送失败:', e?.message || e);
    return { ok: false, message: '验证码发送失败,请稍后重试' };
  }
}

export function verifyCode(phone: string, purpose: SmsPurpose, code: string): { ok: boolean; message: string } {
  const row = findLatestSmsCode(phone, purpose);
  if (!row) return { ok: false, message: '验证码不存在或已使用' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, message: '验证码已过期' };
  if (row.code !== code) return { ok: false, message: '验证码错误' };
  markSmsCodeConsumed(row.id);
  return { ok: true, message: '验证成功' };
}
