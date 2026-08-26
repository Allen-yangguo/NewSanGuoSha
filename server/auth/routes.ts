/**
 * 用户认证 HTTP 路由 · 挂载到 /api/auth
 *
 * 接口:
 *   POST /api/auth/send-code      { phone, purpose: 'register'|'reset' }
 *   POST /api/auth/register        { phone, password, code, nickname }        手机号注册
 *                                  或 { username, password, nickname }        用户名注册(无验证码)
 *   POST /api/auth/login           { account, password }   account 支持手机号或用户名
 *   POST /api/auth/reset-password  { phone, code, newPassword }
 *   POST /api/auth/guest
 *   GET  /api/auth/me              (Authorization: Bearer <token>)
 */
import { Router, Request, Response } from 'express';
import {
  requestCode,
  register,
  registerByUsername,
  login,
  resetPassword,
  guestLogin,
  verifyToken,
  getUserByUid,
  updateNickname,
} from './authService';

export function createAuthRouter(): Router {
  const router = Router();

  // 发送验证码
  router.post('/send-code', async (req: Request, res: Response) => {
    const { phone, purpose } = req.body || {};
    if (!phone || (purpose !== 'register' && purpose !== 'reset')) {
      return res.json({ ok: false, message: '参数错误' });
    }
    return res.json(await requestCode(phone, purpose));
  });

  // 注册(手机号模式需验证码;用户名模式只需用户名+密码)
  router.post('/register', (req: Request, res: Response) => {
    const body = req.body || {};
    // 用户名注册模式
    if (body.username) {
      const { username, password, nickname } = body;
      if (!username || !password) return res.json({ ok: false, message: '参数错误' });
      return res.json(registerByUsername(username, password, nickname));
    }
    // 手机号注册模式
    const { phone, password, code, nickname } = body;
    if (!phone || !password || !code) return res.json({ ok: false, message: '参数错误' });
    return res.json(register(phone, password, code, nickname));
  });

  // 登录(account 支持手机号或用户名)
  router.post('/login', (req: Request, res: Response) => {
    const { account, password } = req.body || {};
    if (!account || !password) return res.json({ ok: false, message: '参数错误' });
    return res.json(login(account, password));
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

  // 修改昵称(需 Bearer token)
  router.post('/nickname', (req: Request, res: Response) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = token ? verifyToken(token) : null;
    if (!payload) return res.json({ ok: false, message: '未登录或登录已过期' });
    const { nickname } = req.body || {};
    return res.json(updateNickname(payload.uid, nickname || ''));
  });

  return router;
}
