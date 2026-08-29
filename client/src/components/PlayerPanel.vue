<!--
  玩家信息面板：头像 + 名字 + 行动/先手标签 + HP/QI 进度条 + 兵法buff + 手牌数
  用于「对手面板」和「自己面板」
-->
<template>
  <div class="p-panel" :class="me ? 'me' : 'opp'" v-if="player">
    <div
      class="avatar-wrap"
      :class="{ 'no-click': aiOpponent || interactive === false }"
      @click="(aiOpponent || interactive === false) ? null : $emit('avatarClick', player?.pid)"
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
      <!-- 持续效果徽章带（名字下方 · 不遮挡） -->
      <TransitionGroup name="fxbadge" tag="div" class="fx-badges">
        <span v-for="b in effectBadges" :key="b.key" class="fx-badge" :class="b.color" :title="b.tip">
          <span class="fx-badge-icon">{{ b.icon }}</span>
          <span class="fx-badge-label">{{ b.label }}</span>
          <span class="fx-badge-dots">
            <i v-for="d in 3" :key="d" :class="{ on: d <= b.remaining, warn: d === b.remaining && b.remaining > 0 }"></i>
          </span>
        </span>
      </TransitionGroup>
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
        :class="[tk.faction, { usable: tk.usable && interactive !== false, off: !tk.usable || interactive === false }]"
        :title="tk.tip"
        :disabled="!tk.usable || interactive === false"
        @click.stop="tk.usable && interactive !== false && onUsePouch(tk.strategistId, tk.pouch)"
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
  /** 是否可交互(旁观模式下禁止出牌/用锦囊等操作) */
  interactive?: boolean;
  /** 龟背阵保护方与层数/剩余回合（房间级，用于徽章归属） */
  guiBeiProtectorPid?: PlayerId | null;
  guiBeiLayers?: number;
  guiBeiRemainingTurns?: number;
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

// ===== 锦囊徽章（头像下方）=====

// ===== 持续效果徽章带（名字下方）=====
interface FxBadge {
  key: string;
  icon: string;
  label: string;
  color: string;
  remaining: number;
  tip: string;
}
const effectBadges = computed<FxBadge[]>(() => {
  const list: FxBadge[] = [];
  if (!props.player) return list;
  const pid = props.player.pid;
  // 龟背阵 / 坚壁清野（合并总层数）
  const gLayers = props.guiBeiLayers ?? 0;
  const gTurns = props.guiBeiRemainingTurns ?? 0;
  if (props.guiBeiProtectorPid === pid && gLayers > 0 && gTurns > 0) {
    list.push({
      key: 'guibei',
      icon: '御',
      label: `减攻-${gLayers}`,
      color: 'qing',
      remaining: gTurns,
      tip: `龟背阵 · 武将攻击 -${gLayers}（绝杀无效）· 持续 3 回合`,
    });
  }
  // 鱼鳞阵
  if (props.player.yulin && props.player.yulin.active) {
    list.push({
      key: 'yulin',
      icon: '鳞',
      label: '防具+1',
      color: 'teal',
      remaining: props.player.yulin.remainingTurns,
      tip: '鱼鳞阵 · 己方防具防御 +1 · 持续 3 回合',
    });
  }
  // 兵法增幅（孟德/孙子/奇门/火烧/爆气）
  const STRAT_META: Record<string, { icon: string; color: string; tip: string }> = {
    mengde:  { icon: '书', color: 'str', tip: '孟德新书' },
    sunzi:   { icon: '兵', color: 'str', tip: '孙子兵法' },
    qimen:   { icon: '奇', color: 'purple', tip: '奇门遁甲' },
    huoshao: { icon: '火', color: 'fire', tip: '火烧连营' },
  };
  for (const s of props.player.strategies || []) {
    const isBurst = s.sourceCardUid?.startsWith('manual_burst');
    const m = isBurst
      ? { icon: '气', color: 'str', tip: '手动爆气' }
      : STRAT_META[s.type] || { icon: '书', color: 'str', tip: s.type };
    list.push({
      key: 'strat_' + s.sourceCardUid + '_' + s.type,
      icon: m.icon,
      label: `+${s.layers}层`,
      color: m.color,
      remaining: s.remainingTurns,
      tip: `${m.tip} · 武将攻击 +${s.layers} · 剩 ${s.remainingTurns} 回合`,
    });
  }
  return list;
});

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
/* ===== 持续效果徽章带（名字下方）===== */
.fx-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 3px 0;
  min-height: 20px;
}
.fx-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px 1px 4px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}
.fx-badge-icon {
  width: 16px; height: 16px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 900;
  font-family: "STZhongsong", "SimSun", serif;
}
.fx-badge-dots { display: inline-flex; gap: 2px; }
.fx-badge-dots i {
  width: 4px; height: 4px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.18);
}
.fx-badge-dots i.on { background: currentColor; }
.fx-badge-dots i.warn {
  background: #E05B5B;
  animation: fxDotWarn 0.8s ease-in-out infinite;
}
@keyframes fxDotWarn {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.4); }
}
/* 配色 */
.fx-badge.qing  { background: #DAE3E1; border-color: #344240; color: #2F4644; }
.fx-badge.teal  { background: #D9EFE4; border-color: #2E6B4C; color: #1F4A35; }
.fx-badge.purple{ background: #E8E2F5; border-color: #5A4A8C; color: #3A2A6E; }
.fx-badge.fire  { background: #FBE6D8; border-color: #B5463A; color: #8C3329; }
.fx-badge.str   { background: #F3E9D7; border-color: #8C6232; color: #5C3A10; }

/* 弹入/淡出 */
.fxbadge-enter-active { transition: all 0.35s cubic-bezier(.34, 1.56, .64, 1); }
.fxbadge-enter-from { transform: scale(0) rotate(-90deg); opacity: 0; }
.fxbadge-leave-active { transition: all 0.4s ease; }
.fxbadge-leave-to { transform: scale(0.6); opacity: 0; }

/* 锦囊徽章（面板右下角 · 魏蜀吴三色，不遮挡头像与点击） */
.pouch-tokens {
  position: absolute;
  right: 8px;
  bottom: 5px; /* 配合面板底部 padding，落在气条下方的专用空间 */
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
/* 自己可用的锦囊：强闪烁（亮→暗→亮，缩放+光晕）+ 可点击 */
.pouch-token.usable {
  cursor: pointer;
  animation: pouchBlink 0.75s ease-in-out infinite;
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
    transform: scale(1.08);
    filter: brightness(1.6);
    box-shadow: 0 0 16px rgba(255, 215, 100, 1), 0 0 6px rgba(255, 255, 255, 0.9);
  }
  50% {
    opacity: 0.22;
    transform: scale(0.82);
    filter: brightness(0.6);
    box-shadow: 0 0 2px rgba(255, 215, 100, 0.1);
  }
}
</style>
