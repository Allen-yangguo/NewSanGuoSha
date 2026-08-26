/**
 * 用户登录态 Store(Vue3 reactive)
 * 持久化 token 到 localStorage,刷新页面用 /api/auth/me 恢复
 */
import { ref, computed } from 'vue';
import {
  getToken, setToken, clearToken, fetchMe, updateNicknameApi,
  type UserInfo,
} from '../api/auth';

export const authUser = ref<UserInfo | null>(null);
export const authed = computed(() => authUser.value !== null);
export const isGuest = computed(() => authUser.value?.role === 'guest');
export const nickname = computed(() => authUser.value?.nickname || '');

/** 保存登录结果(token + user) */
export function saveAuth(token: string, user: UserInfo): void {
  setToken(token);
  authUser.value = user;
}

/** 清除登录态 */
export function clearAuth(): void {
  clearToken();
  authUser.value = null;
}

/** 退出登录 */
export function logout(): void {
  clearAuth();
}

/** 应用启动时用 localStorage token 恢复登录态 */
export async function restoreAuth(): Promise<void> {
  const token = getToken();
  if (!token) return;
  const r = await fetchMe();
  if (r.ok && r.user) {
    authUser.value = r.user;
  } else {
    clearAuth();
  }
}

/** 获取当前 token(socket 连接鉴权用) */
export function currentToken(): string | null {
  return getToken();
}

/** 修改昵称 */
export async function updateNickname(nick: string): Promise<boolean> {
  const r = await updateNicknameApi(nick);
  if (r.ok && r.user) {
    authUser.value = r.user;
    return true;
  }
  return false;
}
