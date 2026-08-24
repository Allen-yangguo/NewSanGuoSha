<!--
  用户认证页:登录 / 注册 / 忘记密码 + 游客入口
  登录成功后写入 authStore,App.vue 据 authed 自动切换到模式选择页
-->
<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-title">三国卡牌对战</div>
      <div class="auth-sub">请登录后开始对战</div>

      <div class="auth-tabs">
        <button :class="['auth-tab', { active: mode === 'login' }]" @click="switchMode('login')">登录</button>
        <button :class="['auth-tab', { active: mode === 'register' }]" @click="switchMode('register')">注册</button>
        <button :class="['auth-tab', { active: mode === 'reset' }]" @click="switchMode('reset')">忘记密码</button>
      </div>

      <!-- 手机号 -->
      <input v-model="phone" class="auth-input" placeholder="手机号" maxlength="11" inputmode="numeric" />

      <!-- 验证码(注册/重置) -->
      <div v-if="mode !== 'login'" class="auth-row">
        <input v-model="code" class="auth-input code-input" placeholder="短信验证码" maxlength="6" inputmode="numeric" />
        <button class="btn dark code-btn" :disabled="countdown > 0 || sending" @click="onSendCode">
          {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
        </button>
      </div>

      <!-- 登录密码 / 注册密码 -->
      <input v-if="mode !== 'reset'" v-model="password" type="password" class="auth-input" :placeholder="mode === 'register' ? '密码(≥8位,字母+数字)' : '密码'" />

      <!-- 确认密码(注册) -->
      <input v-if="mode === 'register'" v-model="confirm" type="password" class="auth-input" placeholder="确认密码" />

      <!-- 新密码(重置) -->
      <input v-if="mode === 'reset'" v-model="newPassword" type="password" class="auth-input" placeholder="新密码(≥8位,字母+数字)" />

      <!-- 提示 -->
      <div v-if="errMsg" class="auth-err">{{ errMsg }}</div>
      <div v-if="okMsg" class="auth-ok">{{ okMsg }}</div>
      <div v-if="hintCode" class="auth-hint">开发环境验证码:{{ hintCode }}</div>

      <!-- 提交 -->
      <button class="btn primary auth-submit" :disabled="loading" @click="onSubmit">
        {{ loading ? '处理中...' : submitText }}
      </button>

      <!-- 游客入口 -->
      <div class="auth-divider"><span>或</span></div>
      <button class="btn gold auth-guest" :disabled="loading" @click="onGuest">游客进入</button>

      <div class="auth-tip">开发环境验证码固定为 123456(控制台可见)</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import {
  sendCode, registerApi, loginApi, resetPasswordApi, guestLoginApi,
} from '../api/auth';
import { saveAuth } from '../store/authStore';

type Mode = 'login' | 'register' | 'reset';
const mode = ref<Mode>('login');
const phone = ref('');
const password = ref('');
const confirm = ref('');
const code = ref('');
const newPassword = ref('');

const errMsg = ref('');
const okMsg = ref('');
const hintCode = ref('');
const loading = ref(false);
const sending = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const submitText = computed(() => {
  if (mode.value === 'login') return '登录';
  if (mode.value === 'register') return '注册';
  return '重置密码';
});

function switchMode(m: Mode): void {
  mode.value = m;
  phone.value = '';
  password.value = '';
  confirm.value = '';
  code.value = '';
  newPassword.value = '';
  errMsg.value = '';
  okMsg.value = '';
  hintCode.value = '';
}

function startCountdown(): void {
  countdown.value = 60;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0 && timer) { clearInterval(timer); timer = null; }
  }, 1000);
}

async function onSendCode(): Promise<void> {
  errMsg.value = '';
  hintCode.value = '';
  if (!/^1[3-9]\d{9}$/.test(phone.value)) { errMsg.value = '手机号格式不正确'; return; }
  sending.value = true;
  const purpose = mode.value === 'register' ? 'register' : 'reset';
  const r = await sendCode(phone.value, purpose);
  sending.value = false;
  if (!r.ok) { errMsg.value = r.message; return; }
  startCountdown();
  if (r.debugCode) hintCode.value = r.debugCode;
}

async function onSubmit(): Promise<void> {
  errMsg.value = '';
  okMsg.value = '';
  loading.value = true;
  try {
    if (mode.value === 'login') {
      const r = await loginApi(phone.value, password.value);
      if (!r.ok || !r.token || !r.user) { errMsg.value = r.message; return; }
      saveAuth(r.token, r.user);
    } else if (mode.value === 'register') {
      if (password.value !== confirm.value) { errMsg.value = '两次密码不一致'; return; }
      const r = await registerApi(phone.value, password.value, code.value);
      if (!r.ok || !r.token || !r.user) { errMsg.value = r.message; return; }
      saveAuth(r.token, r.user);
    } else {
      const r = await resetPasswordApi(phone.value, code.value, newPassword.value);
      if (!r.ok) { errMsg.value = r.message; return; }
      okMsg.value = r.message + ' · 即将跳转登录';
      setTimeout(() => switchMode('login'), 1500);
    }
  } finally {
    loading.value = false;
  }
}

async function onGuest(): Promise<void> {
  errMsg.value = '';
  okMsg.value = '';
  loading.value = true;
  try {
    const r = await guestLoginApi();
    if (!r.ok || !r.token || !r.user) { errMsg.value = r.message; return; }
    saveAuth(r.token, r.user);
  } finally {
    loading.value = false;
  }
}

onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.auth-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.auth-card {
  width: 320px;
  background: linear-gradient(180deg, #FFFBEE 0%, #F3E4C6 100%);
  border: 2px solid #B5463A;
  border-radius: 16px;
  padding: 22px 22px 18px;
  box-shadow: 0 8px 30px rgba(92, 42, 36, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.auth-title {
  font-size: 24px;
  font-weight: 900;
  color: #3A2E22;
  letter-spacing: 4px;
  text-align: center;
}
.auth-sub {
  font-size: 12px;
  color: #8E734F;
  text-align: center;
  margin-top: -4px;
  margin-bottom: 4px;
}
.auth-tabs {
  display: flex;
  gap: 6px;
  background: #E8D5B0;
  border-radius: 8px;
  padding: 3px;
}
.auth-tab {
  flex: 1;
  border: none;
  background: transparent;
  color: #8E734F;
  font-size: 13px;
  font-weight: 700;
  padding: 7px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.auth-tab.active {
  background: #B5463A;
  color: #fff;
}
.auth-input {
  width: 100%;
  box-sizing: border-box;
  border: 1.5px solid #C9B68A;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  color: #3A2E22;
  background: #fff;
  outline: none;
}
.auth-input:focus { border-color: #B5463A; }
.auth-row {
  display: flex;
  gap: 8px;
}
.auth-row .code-input { flex: 1; }
.code-btn {
  white-space: nowrap;
  font-size: 12px;
  padding: 0 12px;
}
.code-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.auth-err {
  color: #B5463A;
  font-size: 12px;
  text-align: center;
  min-height: 14px;
}
.auth-ok {
  color: #4a7c3f;
  font-size: 12px;
  text-align: center;
}
.auth-hint {
  color: #8E734F;
  font-size: 11px;
  text-align: center;
  background: #FFF6D9;
  border-radius: 6px;
  padding: 4px;
}
.auth-submit {
  margin-top: 4px;
  font-size: 15px;
  padding: 11px 0;
}
.auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: #8E734F;
  font-size: 11px;
  margin: 4px 0 0;
}
.auth-divider::before, .auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #C9B68A;
}
.auth-divider span { padding: 0 8px; }
.auth-guest {
  font-size: 14px;
  padding: 9px 0;
}
.auth-guest:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-tip {
  font-size: 10px;
  color: #A89060;
  text-align: center;
  margin-top: 2px;
}
</style>
