/**
 * 用户认证 HTTP API 封装(/api/auth/*)
 * 开发环境 /api 由 vite 代理到服务端 3000,生产同源
 */
export type UserRole = 'user' | 'guest';

export interface UserInfo {
  uid: string;
  phone?: string;
  username?: string;
  nickname?: string;
  role: UserRole;
}

export interface AuthResponse {
  ok: boolean;
  message: string;
  token?: string;
  user?: UserInfo;
  /** 开发环境回显验证码 */
  debugCode?: string;
}

const TOKEN_KEY = 'sanguosha_token';

export function getToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

async function postJson(url: string, body: any): Promise<AuthResponse> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as AuthResponse;
  } catch (e: any) {
    return { ok: false, message: e?.message || '网络错误' };
  }
}

async function getJson(url: string): Promise<AuthResponse> {
  const token = getToken();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return (await res.json()) as AuthResponse;
  } catch (e: any) {
    return { ok: false, message: e?.message || '网络错误' };
  }
}

export function sendCode(phone: string, purpose: 'register' | 'reset'): Promise<AuthResponse> {
  return postJson('/api/auth/send-code', { phone, purpose });
}

/** 手机号注册(需短信验证码) */
export function registerApi(phone: string, password: string, code: string, nickname?: string): Promise<AuthResponse> {
  return postJson('/api/auth/register', { phone, password, code, nickname });
}

/** 用户名注册(无需验证码) */
export function registerByUsernameApi(username: string, password: string, nickname?: string): Promise<AuthResponse> {
  return postJson('/api/auth/register', { username, password, nickname });
}

export function updateNicknameApi(nickname: string): Promise<AuthResponse> {
  const token = getToken();
  return fetch('/api/auth/nickname', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ nickname }),
  }).then(r => r.json()).catch(() => ({ ok: false, message: '网络错误' }));
}

/** 登录(account 支持手机号或用户名) */
export function loginApi(account: string, password: string): Promise<AuthResponse> {
  return postJson('/api/auth/login', { account, password });
}

export function resetPasswordApi(phone: string, code: string, newPassword: string): Promise<AuthResponse> {
  return postJson('/api/auth/reset-password', { phone, code, newPassword });
}

export function guestLoginApi(): Promise<AuthResponse> {
  return postJson('/api/auth/guest', {});
}

export function fetchMe(): Promise<AuthResponse> {
  return getJson('/api/auth/me');
}
