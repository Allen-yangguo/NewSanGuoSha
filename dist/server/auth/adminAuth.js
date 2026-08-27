"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_TOKEN = void 0;
exports.safeEqual = safeEqual;
exports.isAdminAuthConfigured = isAdminAuthConfigured;
exports.checkAdminAuth = checkAdminAuth;
exports.ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const IS_PROD = process.env.NODE_ENV === 'production';
/** 常量时间比较,避免时序攻击 */
function safeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
/** 是否已配置后台 token(供汇总接口上报鉴权状态) */
function isAdminAuthConfigured() {
    return !!exports.ADMIN_TOKEN;
}
function checkAdminAuth(req, res, next) {
    if (!exports.ADMIN_TOKEN) {
        if (IS_PROD) {
            res.status(403).json({
                ok: false,
                code: 'ADMIN_DISABLED',
                message: '未配置 ADMIN_TOKEN,管理后台与流量监控接口已禁用。请在 Zeabur 环境变量中添加 ADMIN_TOKEN。',
            });
            return;
        }
        return next(); // 开发环境无 token 放行
    }
    const bearer = req.headers.authorization || '';
    const fromHeader = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    const fromQuery = typeof req.query.token === 'string' ? req.query.token : '';
    const provided = fromHeader || fromQuery;
    if (provided && safeEqual(provided, exports.ADMIN_TOKEN))
        return next();
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '需要有效的 ADMIN_TOKEN' });
}
//# sourceMappingURL=adminAuth.js.map