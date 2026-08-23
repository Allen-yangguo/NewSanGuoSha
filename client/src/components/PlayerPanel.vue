<!--
  玩家信息面板：头像 + 名字 + 行动/先手标签 + HP/QI 进度条 + 兵法buff + 手牌数
  用于「对手面板」和「自己面板」
-->
<template>
  <div class="p-panel" :class="me ? 'me' : 'opp'" v-if="player">
    <div class="avatar" :class="me ? '' : 'opp'">
      {{ me ? '我' : (player.pid + 1) }}
    </div>
    <div class="meta">
      <div class="row-name">
        <span class="name">{{ player.name }}</span>
        <span v-if="isFirst" class="tag">先手</span>
        <span v-if="isActiveTurn && !isDefendingMe" class="tag turn">行动中</span>
        <span v-if="isDefendingMe" class="tag turn">防御中</span>
        <span v-if="isEmergencyMe" class="tag heal">救血</span>
        <span v-if="battleState === 'low'" class="tag lowhp">缺血·攻+1</span>
        <span v-if="battleState === 'crit'" class="tag lowhp">残血·攻+1·耗气-1</span>
      </div>
      <!-- HP -->
      <div class="bar">
        <span class="bar-label">HP</span>
        <div class="bar-track">
          <div class="bar-fill hp" :style="{ width: hpPct + '%' }"></div>
        </div>
        <span class="bar-text">{{ player.hp }} / {{ player.hpMax }}</span>
      </div>
      <!-- QI -->
      <div class="bar">
        <span class="bar-label">气</span>
        <div class="bar-track">
          <div class="bar-fill qi" :style="{ width: qiPct + '%' }"></div>
        </div>
        <span class="bar-text">{{ player.qi }}</span>
      </div>
      <!-- Buff chips -->
      <div class="buffs" v-if="player.strategies?.length">
        <span
          v-for="(s, i) in player.strategies"
          :key="i"
          class="buff-chip"
          :class="s.sourceCardUid?.startsWith('manual_burst') ? 'manual-burst' : s.type"
        >
          {{ strategyLabel(s.type, s.sourceCardUid) }} +{{ s.layers }}层 · 剩{{ s.remainingTurns }}回合
        </span>
      </div>
      <div class="buffs" v-else>
        <span class="buff-chip" style="opacity:.6;">无兵法增幅</span>
      </div>
    </div>
    <div class="side-info">
      <div class="hand-count">{{ player.handCount }}</div>
      <div style="font-size:10px;color:#8E734F;">手牌</div>
      <div style="margin-top:6px;font-size:11px;">
        <span v-if="player.usedNormalQi" style="color:#8C4A40">普补已用</span><br/>
        <span v-if="player.usedBigQi" style="color:#8C4A40">大补已用</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerView, PlayerId } from '../types/protocol';

const props = defineProps<{
  player: PlayerView | null;
  me: boolean;
  firstPlayerPid: PlayerId;
  activePid: PlayerId;
  defensePid: PlayerId | null;
  emergencyPid: PlayerId | null;
}>();

const isFirst = computed(() => props.player?.pid === props.firstPlayerPid);
const isActiveTurn = computed(() => props.player?.pid === props.activePid);
const isDefendingMe = computed(() => props.defensePid !== null && props.player?.pid === props.defensePid);
const isEmergencyMe = computed(() => props.emergencyPid !== null && props.player?.pid === props.emergencyPid);

// 缺血/残血状态（hp=2 缺血·攻+1，hp=1 残血·攻+1·耗气-1）
const battleState = computed<'none' | 'low' | 'crit'>(() => {
  if (!props.player) return 'none';
  if (props.player.hp <= 0) return 'none';
  if (props.player.hp === 1) return 'crit';
  if (props.player.hp === 2) return 'low';
  return 'none';
});

const hpPct = computed(() => {
  if (!props.player) return 0;
  return Math.max(0, Math.min(100, (props.player.hp / props.player.hpMax) * 100));
});
const qiPct = computed(() => {
  if (!props.player) return 0;
  // 气理论上限 10+，这里用 12 作为参考显示
  return Math.max(0, Math.min(100, (props.player.qi / 12) * 100));
});

function strategyLabel(t: string, sourceCardUid?: string): string {
  if (sourceCardUid?.startsWith('manual_burst')) return '手动爆气';
  return t === 'sunzi' ? '孙子兵法' : (t === 'mengde' ? '孟德新书' : t);
}
</script>
