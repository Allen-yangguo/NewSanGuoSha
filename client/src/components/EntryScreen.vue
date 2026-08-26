<!--
  入口选择页：单机对战 / 联机对战
-->
<template>
  <div class="entry-wrap">
    <div class="entry-title">新三国杀</div>
    <div class="entry-sub">选择对战模式</div>
    <div class="entry-cards">
      <button class="entry-card single" @click="$emit('select', 'single')">
        <div class="ec-icon">⚔</div>
        <div class="ec-name">单机对战</div>
        <div class="ec-desc">与 AI 对战<br/>无需联网</div>
      </button>
      <button class="entry-card lan" @click="$emit('select', 'lan')">
        <div class="ec-icon">🌐</div>
        <div class="ec-name">联机对战</div>
        <div class="ec-desc">两台设备联机<br/>公网/局域网通用</div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ select: [mode: 'single' | 'lan'] }>();
</script>

<style scoped>
.entry-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
}
.entry-title {
  font-size: 28px;
  font-weight: 900;
  color: #3A2E22;
  letter-spacing: 6px;
}
.entry-sub {
  font-size: 13px;
  color: #8E734F;
  margin-bottom: 20px;
}
.entry-cards {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}
.entry-card {
  width: 140px;
  height: 180px;
  border-radius: 16px;
  border: 2px solid;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.entry-card:active { transform: scale(0.95); }
.entry-card.single {
  background: linear-gradient(180deg, #FFFBEE 0%, #E8D5B0 100%);
  border-color: #B5463A;
  color: #5C2A24;
}
.entry-card.lan {
  background: linear-gradient(180deg, #F0F4F1 0%, #CFDFD7 100%);
  border-color: #344240;
  color: #2F4644;
}
.ec-icon { font-size: 36px; }
.ec-name { font-size: 18px; font-weight: 800; letter-spacing: 2px; }
.ec-desc { font-size: 11px; opacity: 0.7; text-align: center; line-height: 1.5; }
</style>
