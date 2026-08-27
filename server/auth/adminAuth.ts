/**
 * 管理后台统一鉴权 · 供管理后台(/api/admin)与流量监控(/api/monitor)共用
 *
 * 只配置一个环境变量 ADMIN_TOKEN:
 *  - 已配置   → /api/admin/* 与 /api/monitor/* 均需携带该 token
 *  - 未配置   → 生产环境两者都返回 403 禁用;开发环境放行(便于本地调试)
 *
 * 鉴权方式: Authorization: Bearer <token> 或查询参数 ?token=<token>
 */
import { Request, Response, NextFunction } from 'express';

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const IS_PROD = process.env.NODE_ENV === 'production';

/** 常量时间比较,避免时序攻击 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 是否已配置后台 token(供汇总接口上报鉴权状态) */
export function isAdminAuthConfigured(): boolean {
  return !!ADMIN_TOKEN;
}

export function checkAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_TOKEN) {
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
  if (provided && safeEqual(provided, ADMIN_TOKEN)) return next();
  res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '需要有效的 ADMIN_TOKEN' });
}
