"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTestMode = isTestMode;
exports.sendCode = sendCode;
exports.verifyCode = verifyCode;
/**
 * 短信验证码模块
 * - 开发环境(NODE_ENV !== 'production'):固定测试码 123456,控制台打印
 * - 生产环境:生成 6 位随机码,预留阿里云/腾讯云适配层接入点
 *
 * 限流:60s 重发间隔、同号同目的每日 5 次
 */
const db_1 = require("./db");
const CODE_VALID_MS = 5 * 60 * 1000; // 验证码 5 分钟有效
const RESEND_INTERVAL_MS = 60 * 1000; // 60s 重发限制
const DAILY_LIMIT = 5; // 同号同目的每日上限
const TEST_CODE = '123456';
// 内存限流计数(单进程,重启重置;验证码本身存数据库)
const lastSentMap = new Map();
const dailyCountMap = new Map();
function isTestMode() {
    return process.env.NODE_ENV !== 'production';
}
function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
function sendCode(phone, purpose) {
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
    (0, db_1.insertSmsCode)(phone, code, purpose, expiresAt);
    // ===== 生产环境短信适配层接入点 =====
    // if (!isTestMode()) { await sendViaAliyun(phone, code); }
    if (isTestMode()) {
        console.log(`[SMS][${purpose}] ${phone} 验证码: ${code}（开发固定码 ${TEST_CODE}）`);
    }
    return { ok: true, message: '验证码已发送', debugCode: isTestMode() ? code : undefined };
}
function verifyCode(phone, purpose, code) {
    const row = (0, db_1.findLatestSmsCode)(phone, purpose);
    if (!row)
        return { ok: false, message: '验证码不存在或已使用' };
    if (new Date(row.expires_at).getTime() < Date.now())
        return { ok: false, message: '验证码已过期' };
    if (row.code !== code)
        return { ok: false, message: '验证码错误' };
    (0, db_1.markSmsCodeConsumed)(row.id);
    return { ok: true, message: '验证成功' };
}
//# sourceMappingURL=sms.js.map