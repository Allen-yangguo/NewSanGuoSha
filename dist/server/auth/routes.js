"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = createAuthRouter;
/**
 * 用户认证 HTTP 路由 · 挂载到 /api/auth
 *
 * 接口:
 *   POST /api/auth/send-code      { phone, purpose: 'register'|'reset' }
 *   POST /api/auth/register        { phone, password, code }
 *   POST /api/auth/login           { phone, password }
 *   POST /api/auth/reset-password  { phone, code, newPassword }
 *   POST /api/auth/guest
 *   GET  /api/auth/me              (Authorization: Bearer <token>)
 */
const express_1 = require("express");
const authService_1 = require("./authService");
function createAuthRouter() {
    const router = (0, express_1.Router)();
    // 发送验证码
    router.post('/send-code', (req, res) => {
        const { phone, purpose } = req.body || {};
        if (!phone || (purpose !== 'register' && purpose !== 'reset')) {
            return res.json({ ok: false, message: '参数错误' });
        }
        return res.json((0, authService_1.requestCode)(phone, purpose));
    });
    // 注册
    router.post('/register', (req, res) => {
        const { phone, password, code } = req.body || {};
        if (!phone || !password || !code)
            return res.json({ ok: false, message: '参数错误' });
        return res.json((0, authService_1.register)(phone, password, code));
    });
    // 登录
    router.post('/login', (req, res) => {
        const { phone, password } = req.body || {};
        if (!phone || !password)
            return res.json({ ok: false, message: '参数错误' });
        return res.json((0, authService_1.login)(phone, password));
    });
    // 忘记密码
    router.post('/reset-password', (req, res) => {
        const { phone, code, newPassword } = req.body || {};
        if (!phone || !code || !newPassword)
            return res.json({ ok: false, message: '参数错误' });
        return res.json((0, authService_1.resetPassword)(phone, code, newPassword));
    });
    // 游客登录
    router.post('/guest', (_req, res) => {
        return res.json((0, authService_1.guestLogin)());
    });
    // 获取当前用户(需 Bearer token)
    router.get('/me', (req, res) => {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const payload = token ? (0, authService_1.verifyToken)(token) : null;
        if (!payload)
            return res.json({ ok: false, message: '未登录或登录已过期' });
        return res.json((0, authService_1.getUserByUid)(payload.uid));
    });
    return router;
}
//# sourceMappingURL=routes.js.map