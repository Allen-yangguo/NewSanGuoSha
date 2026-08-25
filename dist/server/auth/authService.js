"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
exports.requestCode = requestCode;
exports.register = register;
exports.login = login;
exports.resetPassword = resetPassword;
exports.guestLogin = guestLogin;
exports.getUserByUid = getUserByUid;
/**
 * 用户认证服务:注册 / 登录 / 忘记密码 / 游客 / Token 校验
 */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto_1 = require("crypto");
const db_1 = require("./db");
const sms_1 = require("./sms");
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-please-change-in-production';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_FAIL = 5;
const LOCK_MS = 5 * 60 * 1000;
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
function validPhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
}
function validPassword(pwd) {
    // >=8 位,含字母 + 数字
    return pwd.length >= 8 && /[a-zA-Z]/.test(pwd) && /\d/.test(pwd);
}
function userToInfo(row) {
    return { uid: `u${row.id}`, phone: row.phone, role: 'user' };
}
/** 发送验证码(注册/重置) */
function requestCode(phone, purpose) {
    if (!validPhone(phone))
        return { ok: false, message: '手机号格式不正确' };
    if (purpose === 'reset') {
        if (!(0, db_1.findUserByPhone)(phone))
            return { ok: false, message: '该手机号未注册' };
    }
    else {
        if ((0, db_1.findUserByPhone)(phone))
            return { ok: false, message: '该手机号已注册' };
    }
    const r = (0, sms_1.sendCode)(phone, purpose);
    return { ok: r.ok, message: r.message, debugCode: r.debugCode };
}
/** 注册 */
function register(phone, password, code) {
    if (!validPhone(phone))
        return { ok: false, message: '手机号格式不正确' };
    if (!validPassword(password))
        return { ok: false, message: '密码至少 8 位,需含字母和数字' };
    if ((0, db_1.findUserByPhone)(phone))
        return { ok: false, message: '该手机号已注册' };
    const v = (0, sms_1.verifyCode)(phone, 'register', code);
    if (!v.ok)
        return { ok: false, message: v.message };
    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    const row = (0, db_1.createUser)(phone, hash);
    const user = userToInfo(row);
    const token = signToken({ uid: user.uid, phone: user.phone, role: 'user' });
    return { ok: true, message: '注册成功', token, user };
}
// 登录失败计数(单进程内存)
const loginFailMap = new Map();
/** 登录 */
function login(phone, password) {
    if (!validPhone(phone))
        return { ok: false, message: '手机号格式不正确' };
    const rec = loginFailMap.get(phone);
    if (rec && rec.lockedUntil > Date.now()) {
        const remain = Math.ceil((rec.lockedUntil - Date.now()) / 1000 / 60);
        return { ok: false, message: `登录失败次数过多,请 ${remain} 分钟后再试` };
    }
    const row = (0, db_1.findUserByPhone)(phone);
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
        const r = loginFailMap.get(phone) || { count: 0, lockedUntil: 0 };
        r.count += 1;
        if (r.count >= MAX_LOGIN_FAIL) {
            r.lockedUntil = Date.now() + LOCK_MS;
            r.count = 0;
        }
        loginFailMap.set(phone, r);
        return { ok: false, message: '手机号或密码错误' };
    }
    loginFailMap.delete(phone);
    const user = userToInfo(row);
    const token = signToken({ uid: user.uid, phone: user.phone, role: 'user' });
    return { ok: true, message: '登录成功', token, user };
}
/** 忘记密码:校验验证码并重置 */
function resetPassword(phone, code, newPassword) {
    if (!validPhone(phone))
        return { ok: false, message: '手机号格式不正确' };
    if (!validPassword(newPassword))
        return { ok: false, message: '密码至少 8 位,需含字母和数字' };
    const row = (0, db_1.findUserByPhone)(phone);
    if (!row)
        return { ok: false, message: '该手机号未注册' };
    const v = (0, sms_1.verifyCode)(phone, 'reset', code);
    if (!v.ok)
        return { ok: false, message: v.message };
    const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
    (0, db_1.updateUserPassword)(phone, hash);
    return { ok: true, message: '密码重置成功,请用新密码登录' };
}
/** 游客登录 */
function guestLogin() {
    const guestId = 'g' + (0, crypto_1.randomBytes)(8).toString('hex');
    (0, db_1.touchGuest)(guestId);
    const token = signToken({ uid: guestId, role: 'guest' });
    return { ok: true, message: '游客登录成功', token, user: { uid: guestId, role: 'guest' } };
}
/** 根据 uid 获取用户信息(/api/auth/me 用) */
function getUserByUid(uid) {
    if (uid.startsWith('g')) {
        return { ok: true, message: 'ok', user: { uid, role: 'guest' } };
    }
    if (!uid.startsWith('u'))
        return { ok: false, message: '无效用户标识' };
    const id = Number(uid.slice(1));
    if (!id)
        return { ok: false, message: '无效用户标识' };
    const row = (0, db_1.findUserById)(id);
    if (!row)
        return { ok: false, message: '用户不存在' };
    return { ok: true, message: 'ok', user: userToInfo(row) };
}
//# sourceMappingURL=authService.js.map