<!--
  背景音乐开关按钮（游戏统一风格：圆角矩形 + 国风配色，与顶部其他按钮一致）
  所有界面（入口/大厅/对局）共用，状态由 soundManager 单例维护
-->
<template>
  <button
    class="btn music-btn"
    :class="{ off: !bgmOn }"
    @click="toggle"
    :title="bgmOn ? '关闭背景音乐' : '开启背景音乐'"
  >{{ bgmOn ? '🎵 音乐' : '🎵 音乐' }}</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { soundManager } from '../audio/SoundManager';

const bgmOn = ref(soundManager.isBgmOn());

function toggle(): void {
  bgmOn.value = soundManager.toggleBgm();
}
</script>

<style scoped>
.music-btn {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
}
.music-btn.off {
  opacity: 0.55;
  filter: grayscale(0.7);
}
.music-btn.off::after {
  content: '已关';
  margin-left: 2px;
  font-size: 10px;
}
</style>
