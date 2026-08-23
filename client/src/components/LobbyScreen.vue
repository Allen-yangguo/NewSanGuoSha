<!--
  等待大厅 / 连接界面
    - 显示本页 URL（可复制给好友）
    - 「加入房间」按钮
-->
<template>
  <div class="lobby">
    <div class="lobby-box">
      <div class="lobby-title">三国卡牌对战</div>
      <div class="lobby-sub">
        双人对战 · 联机模式 · 手牌严格隔离<br/>
        好友打开同一网址即可加入对战
      </div>

      <div class="lobby-url">
        <input readonly :value="shareUrl" class="share-input" />
        <button class="btn" @click="copyShareUrl">复制网址</button>
      </div>

      <div class="lobby-status">{{ statusText }}</div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px;">
        <button class="btn primary" :disabled="connecting" @click="onJoin">
          {{ connecting ? '连接中...' : (state.yourSlot ? '已加入 · 重新加入' : '加入房间') }}
        </button>
        <button class="btn dark" @click="$emit('exit')">← 返回</button>
      </div>

      <div style="font-size:12px;color:#8E734F;text-align:center;line-height:1.8;margin-top:4px;">
        <div v-if="lastError" style="color:#B5463A">⚠ {{ lastError }}</div>
        <div v-if="state.yourSlot">你已分配：<b>{{ state.yourSlot.toUpperCase() }}</b>（玩家 {{ (state.yourPid ?? 0) + 1 }}）</div>
        <div>对局规则：6 血 6 气 · 104 张牌库 · 兵法倒计时 · 掉血补气</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import {
  connecting, lastError, state,
  joinRoom,
} from '../store/gameStore';

defineEmits<{ exit: [] }>();

const shareUrl = computed(() => window.location.origin);

const statusText = computed(() => {
  if (state.started) return '对局进行中 · 点「加入」重连';
  if (state.yourSlot) return `已加入房间 · 等待对手...`;
  return '等待玩家加入房间...';
});

function copyShareUrl(): void {
  const url = window.location.origin;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      alert('网址已复制：' + url);
    }).catch(() => {
      alert('请手动复制：' + url);
    });
  } else {
    alert('请手动复制：' + url);
  }
}

async function onJoin(): Promise<void> { await joinRoom(); }

onMounted(async () => {
  // 自动尝试加入房间
  await joinRoom();
});
</script>
