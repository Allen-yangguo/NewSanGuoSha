"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminRouter = createAdminRouter;
exports.adminDashboardHandler = adminDashboardHandler;
/**
 * 管理后台 · /admin 页面 + /api/admin/* REST 接口
 *
 * 鉴权: 与流量监控统一,只配置 ADMIN_TOKEN 一个环境变量(见 ../auth/adminAuth)
 *  - 已配置   → 所有 /api/admin/* 必须携带有效 token
 *  - 未配置   → 生产环境直接禁用(403),开发环境放行(便于本地调试)
 *
 * 功能:
 *  - 用户管理: 列表/搜索、重置密码、删除用户
 *  - 等级设置: 查看/修改/新增/删除等级(存 data/levels.json,热加载)
 *  - 页面内提供「流量监控」入口链接
 */
const path = __importStar(require("path"));
const express_1 = require("express");
const bcrypt = require("bcryptjs");
const db_1 = require("../auth/db");
const levels_1 = require("../auth/levels");
const recordService_1 = require("../auth/recordService");
const adminAuth_1 = require("../auth/adminAuth");
const BCRYPT_ROUNDS = 10;
function createAdminRouter() {
    const router = (0, express_1.Router)();
    router.use(adminAuth_1.checkAdminAuth);
    // ===== 用户管理 =====
    // GET /api/admin/users?keyword=xxx  用户列表/搜索(含战绩摘要)
    router.get('/users', (req, res) => {
        const keyword = String(req.query.keyword || '');
        const users = (0, db_1.listUsers)(keyword).map(u => {
            const s = (0, recordService_1.getRecordSummary)(`u${u.id}`);
            return {
                id: u.id,
                uid: `u${u.id}`,
                phone: u.phone || '',
                username: u.username || '',
                nickname: u.nickname || '',
                createdAt: u.created_at,
                updatedAt: u.updated_at,
                record: {
                    totalGames: s.totalGames,
                    wins: s.wins,
                    losses: s.losses,
                    draws: s.draws,
                    totalScore: s.totalScore,
                    level: s.level,
                    levelName: s.levelName,
                    winRate: s.winRate,
                },
            };
        });
        res.json({ ok: true, total: users.length, users });
    });
    // PUT /api/admin/users/:uid/reset-password  { newPassword }
    router.put('/users/:uid/reset-password', (req, res) => {
        const uid = String(req.params.uid || '');
        if (!uid.startsWith('u'))
            return res.json({ ok: false, message: '无效用户标识' });
        const id = Number(uid.slice(1));
        if (!id || !(0, db_1.findUserById)(id))
            return res.json({ ok: false, message: '用户不存在' });
        const pwd = String((req.body || {}).newPassword || '');
        if (pwd.length < 8 || !/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) {
            return res.json({ ok: false, message: '密码至少 8 位,需含字母和数字' });
        }
        (0, db_1.updateUserPasswordById)(id, bcrypt.hashSync(pwd, BCRYPT_ROUNDS));
        res.json({ ok: true, message: '密码已重置' });
    });
    // DELETE /api/admin/users/:uid
    router.delete('/users/:uid', (req, res) => {
        const uid = String(req.params.uid || '');
        if (!uid.startsWith('u'))
            return res.json({ ok: false, message: '无效用户标识' });
        const id = Number(uid.slice(1));
        if (!id)
            return res.json({ ok: false, message: '无效用户标识' });
        const ok = (0, db_1.deleteUser)(id);
        res.json(ok ? { ok: true, message: '用户已删除' } : { ok: false, message: '用户不存在' });
    });
    // ===== 等级设置 =====
    // GET /api/admin/levels  当前配置 + 默认配置
    router.get('/levels', (_req, res) => {
        res.json({ ok: true, levels: (0, levels_1.getLevels)(), defaults: levels_1.DEFAULT_LEVELS });
    });
    // PUT /api/admin/levels  { levels: [{lv,name,min,max}] }
    router.put('/levels', (req, res) => {
        res.json((0, levels_1.saveLevels)((req.body || {}).levels));
    });
    // POST /api/admin/levels/reset  恢复默认
    router.post('/levels/reset', (_req, res) => {
        res.json((0, levels_1.resetLevels)());
    });
    return router;
}
/** 管理后台页面(数据走受保护的 /api/admin/*) */
function adminDashboardHandler(_req, res) {
    res.sendFile(path.join(__dirname, 'admin.html'), (err) => {
        if (err) {
            res.status(500).type('html').send('<h1>管理后台资源缺失</h1><p>请重新执行 npm run build:server</p>');
        }
    });
}
//# sourceMappingURL=admin.js.map