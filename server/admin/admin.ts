/**
 * 管理后台 · /admin 页面 + /api/admin/* REST 接口
 *
 * 鉴权: ADMIN_TOKEN 环境变量(Authorization: Bearer 或 ?token=)
 *  - 已配置   → 所有 /api/admin/* 必须携带有效 token
 *  - 未配置   → 生产环境直接禁用(403),开发环境放行(便于本地调试)
 *
 * 功能:
 *  - 用户管理: 列表/搜索、重置密码、删除用户
 *  - 等级设置: 查看/修改/恢复等级阈值(存 data/levels.json,热加载)
 *  - 页面内提供「流量监控」入口链接
 */
import * as path from 'path';
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt = require('bcryptjs');
import { listUsers, updateUserPasswordById, deleteUser, findUserById } from '../auth/db';
import { getLevels, saveLevels, resetLevels, DEFAULT_LEVELS } from '../auth/levels';
import { getRecordSummary } from '../auth/recordService';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const IS_PROD = process.env.NODE_ENV === 'production';
const BCRYPT_ROUNDS = 10;

/** 常量时间比较,避免时序攻击 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_TOKEN) {
    if (IS_PROD) {
      res.status(403).json({
        ok: false,
        code: 'ADMIN_DISABLED',
        message: '未配置 ADMIN_TOKEN,管理后台已禁用。请在 Zeabur 环境变量中添加 ADMIN_TOKEN。',
      });
      return;
    }
    return next(); // 开发环境无 token 放行
  }
  const bearer = req.headers.authorization || '';
  const fromHeader = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  const fromQuery = typeof req.query.token === 'string' ? req.query.token : '';
  const provided = fromHeader || fromQuery;
  if (provided && safeEqual(provided, ADMIN_TOKEN)) return next();
  res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '需要有效的 ADMIN_TOKEN' });
}

export function createAdminRouter(): Router {
  const router = Router();
  router.use(checkAdminAuth);

  // ===== 用户管理 =====
  // GET /api/admin/users?keyword=xxx  用户列表/搜索(含战绩摘要)
  router.get('/users', (req: Request, res: Response) => {
    const keyword = String(req.query.keyword || '');
    const users = listUsers(keyword).map(u => {
      const s = getRecordSummary(`u${u.id}`);
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
  router.put('/users/:uid/reset-password', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    if (!uid.startsWith('u')) return res.json({ ok: false, message: '无效用户标识' });
    const id = Number(uid.slice(1));
    if (!id || !findUserById(id)) return res.json({ ok: false, message: '用户不存在' });
    const pwd = String((req.body || {}).newPassword || '');
    if (pwd.length < 8 || !/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) {
      return res.json({ ok: false, message: '密码至少 8 位,需含字母和数字' });
    }
    updateUserPasswordById(id, bcrypt.hashSync(pwd, BCRYPT_ROUNDS));
    res.json({ ok: true, message: '密码已重置' });
  });

  // DELETE /api/admin/users/:uid
  router.delete('/users/:uid', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    if (!uid.startsWith('u')) return res.json({ ok: false, message: '无效用户标识' });
    const id = Number(uid.slice(1));
    if (!id) return res.json({ ok: false, message: '无效用户标识' });
    const ok = deleteUser(id);
    res.json(ok ? { ok: true, message: '用户已删除' } : { ok: false, message: '用户不存在' });
  });

  // ===== 等级设置 =====
  // GET /api/admin/levels  当前配置 + 默认配置
  router.get('/levels', (_req: Request, res: Response) => {
    res.json({ ok: true, levels: getLevels(), defaults: DEFAULT_LEVELS });
  });

  // PUT /api/admin/levels  { levels: [{lv,name,min,max}] }
  router.put('/levels', (req: Request, res: Response) => {
    res.json(saveLevels((req.body || {}).levels));
  });

  // POST /api/admin/levels/reset  恢复默认
  router.post('/levels/reset', (_req: Request, res: Response) => {
    res.json(resetLevels());
  });

  return router;
}

/** 管理后台页面(数据走受保护的 /api/admin/*) */
export function adminDashboardHandler(_req: Request, res: Response): void {
  res.sendFile(path.join(__dirname, 'admin.html'), (err) => {
    if (err) {
      res.status(500).type('html').send('<h1>管理后台资源缺失</h1><p>请重新执行 npm run build:server</p>');
    }
  });
}
