<!--
  等待大厅 / 连接界面
  - 显示服务端生成的二维码（手机同 WiFi 扫码加入）
  - 显示当前本机访问 URL
  - 「加入房间」按钮（浏览器直接点击）
-->
<template>
  <div class="lobby">
    <div class="lobby-box">
      <div class="lobby-title">三国卡牌对战</div>
      <div class="lobby-sub">
        双人对战 · 局域网联机 · 手牌严格隔离<br/>
        两台手机连接同一 WiFi，扫码或打开下方地址
      </div>

      <div class="lobby-url" v-if="qrInfo">{{ qrInfo.url }}</div>
      <div class="lobby-url" v-else>加载中...</div>

      <div class="lobby-qr" v-if="qrInfo?.qr">
        <img :src="qrInfo.qr" alt="join qr" />
      </div>

      <div class="lobby-status" v-if="qrInfo">{{ qrInfo.status }}</div>
      <div class="lobby-status" v-else>正在获取服务端信息...</div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px;">
        <button class="btn primary" :disabled="connecting" @click="onJoin">
          {{ connecting ? '连接中...' : (state.yourSlot ? '已加入 · 重新加入' : '加入房间（本机浏览器）') }}
        </button>
        <button class="btn" @click="refreshQr">刷新二维码</button>
        <button class="btn dark" @click="$emit('exit')">← 返回</button>
      </div>

      <div style="font-size:12px;color:#8E734F;text-align:center;line-height:1.8;margin-top:4px;">
        <div v-if="lastError" style="color:#B5463A">⚠ {{ lastError }}</div>
        <div v-if="state.yourSlot">你已分配：<b>{{ state.yourSlot.toUpperCase() }}</b>（玩家 {{ (state.yourPid ?? 0) + 1 }}）</div>
        <div>对局规则：6 血 6 气 · 107 张牌库 · 兵法倒计时 · 掉血补气</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import {
  qrInfo, connecting, lastError, state,
  joinRoom, fetchQrInfo,
} from '../store/gameStore';

defineEmits<{ exit: [] }>();

async function refreshQr(): Promise<void> { await fetchQrInfo(); }
async function onJoin(): Promise<void> { await joinRoom(); }

onMounted(async () => {
  await fetchQrInfo();
  // 每 2 秒刷新一次连接状态显示（方便扫码人看到实时状态）
  setInterval(() => { fetchQrInfo(); }, 2500);
});
</script>
