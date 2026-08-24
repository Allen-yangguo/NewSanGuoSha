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
import { Router, Request, Response } from 'express';
import {
  requestCode,
  register,
  login,
  resetPassword,
  guestLogin,
  verifyToken,
  getUserByUid,
} from './authService';

export function createAuthRouter(): Router {
  const router = Router();

  // 发送验证码
  router.post('/send-code', (req: Request, res: Response) => {
    const { phone, purpose } = req.body || {};
    if (!phone || (purpose !== 'register' && purpose !== 'reset')) {
      return res.json({ ok: false, message: '参数错误' });
    }
    return res.json(requestCode(phone, purpose));
  });

  // 注册
  router.post('/register', (req: Request, res: Response) => {
    const { phone, password, code } = req.body || {};
    if (!phone || !password || !code) return res.json({ ok: false, message: '参数错误' });
    return res.json(register(phone, password, code));
  });

  // 登录
  router.post('/login', (req: Request, res: Response) => {
    const { phone, password } = req.body || {};
    if (!phone || !password) return res.json({ ok: false, message: '参数错误' });
    return res.json(login(phone, password));
  });

  // 忘记密码
  router.post('/reset-password', (req: Request, res: Response) => {
    const { phone, code, newPassword } = req.body || {};
    if (!phone || !code || !newPassword) return res.json({ ok: false, message: '参数错误' });
    return res.json(resetPassword(phone, code, newPassword));
  });

  // 游客登录
  router.post('/guest', (_req: Request, res: Response) => {
    return res.json(guestLogin());
  });

  // 获取当前用户(需 Bearer token)
  router.get('/me', (req: Request, res: Response) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = token ? verifyToken(token) : null;
    if (!payload) return res.json({ ok: false, message: '未登录或登录已过期' });
    return res.json(getUserByUid(payload.uid));
  });

  return router;
}
