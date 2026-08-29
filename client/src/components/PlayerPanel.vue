<!--
  玩家信息面板：头像 + 名字 + 行动/先手标签 + HP/QI 进度条 + 兵法buff + 手牌数
  用于「对手面板」和「自己面板」
-->
<template>
  <div class="p-panel" :class="me ? 'me' : 'opp'" v-if="player">
    <div
      class="avatar-wrap"
      :class="{ 'no-click': aiOpponent }"
      @click="aiOpponent ? null : $emit('avatarClick', player?.pid)"
    >
      <div class="avatar" :class="[me ? '' : 'opp', avatarSizeClass]">
        {{ avatarText }}
      </div>
      <div class="score-badge" v-if="player">{{ combatScore }}</div>
      <!-- 头像旁手牌数徽章 -->
      <div class="hand-badge" :class="me ? 'me' : 'opp'">
        <span class="hand-badge-num">{{ player.handCount }}</span>
        <span class="hand-badge-label">牌</span>
      </div>
    </div>
    <div class="meta">
      <div class="row-name">
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
      <div style="margin-top:6px;font-size:11px;">
        <span v-if="player.usedNormalQi" style="color:#8C4A40">普补已用</span><br/>
        <span v-if="player.usedBigQi" style="color:#8C4A40">大补已用</span>
      </div>
    </div>
    <!-- 锦囊徽章（面板右下角 · 魏蜀吴三色 · 缺/残/急 · 自己可用的可点击随机使用） -->
    <div class="pouch-tokens" v-if="pouchTokenList.length > 0" @click.stop>
      <button
        v-for="tk in pouchTokenList"
        :key="tk.strategistId + tk.pouch"
        class="pouch-token"
        :class="[tk.faction, { usable: tk.usable, off: !tk.usable }]"
        :title="tk.tip"
        :disabled="!tk.usable"
        @click.stop="tk.usable && onUsePouch(tk.strategistId, tk.pouch)"
      >{{ tk.label }}</button>
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
  combatScores?: [number, number];
  /** 对手为 AI 时禁用头像点击(单机模式) */
  aiOpponent?: boolean;
}>();

defineEmits<{
  avatarClick: [pid: PlayerId | undefined];
}>();

const isFirst = computed(() => props.player?.pid === props.firstPlayerPid);
const avatarText = computed(() => {
  const n = props.player?.name || '';
  if (!n) return props.me ? '我' : String((props.player?.pid ?? 0) + 1);
  // 完整昵称放进圆圈，靠字号自适应
  return n;
});
// 按昵称长度自适应字号：中文字符比英文宽，按字符数分档
const avatarSizeClass = computed(() => {
  const len = avatarText.value.length;
  if (len <= 2) return 'len-2';
  if (len <= 4) return 'len-4';
  if (len <= 6) return 'len-6';
  return 'len-long';
});
const combatScore = computed(() => {
  if (!props.player || !props.combatScores) return 0;
  return props.combatScores[props.player.pid] ?? 0;
});
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
  const names: Record<string, string> = {
    sunzi: '孙子兵法',
    mengde: '孟德新书',
    qimen: '奇门遁甲',
    huoshao: '火烧连营',
  };
  return names[t] || t;
}

// ===== 锦囊徽章（头像下方）=====
import { usePouch } from '../store/gameStore';

/** 魏蜀吴势力配色：诸葛亮=蜀(红) 周瑜=吴(绿) 司马懿=魏(蓝) */
const POUCH_FACTION: Record<string, { name: string; cls: string }> = {
  zhuge:  { name: '蜀·诸葛亮', cls: 'shu' },
  zhouyu: { name: '吴·周瑜',   cls: 'wu' },
  simayi: { name: '魏·司马懿', cls: 'wei' },
};
const POUCH_CHAR: Record<string, string> = { que: '缺', can: '残', ji: '急' };
const POUCH_NAME: Record<string, string> = { que: '缺锦囊', can: '残锦囊', ji: '急锦囊' };

const pouchTokenList = computed(() => {
  const list: Array<{
    strategistId: string;
    pouch: 'que' | 'can' | 'ji';
    label: string;
    faction: string;
    tip: string;
    usable: boolean;
  }> = [];
  const pouches = props.player?.pouches || [];
  for (const p of pouches) {
    const f = POUCH_FACTION[p.strategistId];
    if (!f) continue;
    const marks: Array<['que' | 'can' | 'ji']> = [];
    if (p.que) marks.push(['que']);
    if (p.can) marks.push(['can']);
    if (p.ji) marks.push(['ji']);
    for (const [pouch] of marks) {
      const usable = props.me && !!p.options?.some(o => o.pouch === pouch);
      const choices = props.me ? p.options?.find(o => o.pouch === pouch)?.choices : undefined;
      const tip = `${f.name}·${POUCH_NAME[pouch]}` +
        (props.me
          ? (usable
            ? `：点击随机获得一张（${(choices || []).map(c => c.name).join('/')}）`
            : '（当前状态不可用）')
          : '');
      list.push({
        strategistId: p.strategistId,
        pouch,
        label: POUCH_CHAR[pouch],
        faction: f.cls,
        tip,
        usable,
      });
    }
  }
  return list;
});

function onUsePouch(strategistId: string, pouch: 'que' | 'can' | 'ji'): void {
  // 系统随机给出一张（choice 传空由引擎随机）；候选牌名用于轮盘动画
  const p = props.player?.pouches.find(x => x.strategistId === strategistId);
  const opt = p?.options?.find(o => o.pouch === pouch);
  const candidates = (opt?.choices || []).map(c => c.name);
  usePouch(strategistId, pouch, '', candidates);
}
</script>

<style scoped>
/* 锦囊徽章（面板右下角 · 魏蜀吴三色，不遮挡头像与点击） */
.pouch-tokens {
  position: absolute;
  right: 8px;
  bottom: 6px;
  display: flex;
  gap: 4px;
  z-index: 6;
}
.pouch-token {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.65);
  color: #FFF;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "STZhongsong", "SimSun", serif;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  cursor: default;
}
/* 蜀=红（诸葛亮）· 吴=绿（周瑜）· 魏=蓝（司马懿） */
.pouch-token.shu { background: radial-gradient(circle at 32% 30%, #C9604F, #8C3329); }
.pouch-token.wu  { background: radial-gradient(circle at 32% 30%, #4E9C74, #2E6B4C); }
.pouch-token.wei { background: radial-gradient(circle at 32% 30%, #5B86A6, #2F5672); }
/* 自己可用的锦囊：金色闪烁（亮→暗→亮）+ 可点击 */
.pouch-token.usable {
  cursor: pointer;
  animation: pouchBlink 0.9s ease-in-out infinite;
}
.pouch-token.usable:hover {
  transform: scale(1.18);
  filter: brightness(1.2);
}
.pouch-token.usable:active {
  transform: scale(0.94);
}
/* 不可用/对手的锦囊：保持原色（仅无闪烁，不置灰） */
.pouch-token.off {
  opacity: 1;
  filter: none;
}
@keyframes pouchBlink {
  0%, 100% {
    opacity: 1;
    filter: brightness(1.35);
    box-shadow: 0 0 12px rgba(255, 215, 100, 0.95), 0 0 4px rgba(255, 255, 255, 0.7);
  }
  50% {
    opacity: 0.35;
    filter: brightness(0.85);
    box-shadow: 0 0 2px rgba(255, 215, 100, 0.15);
  }
}
</style>
