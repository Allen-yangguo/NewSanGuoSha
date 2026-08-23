<!--
  三国卡牌对战 · 主容器
  四态：
    0) 未选模式 → 入口选择页（单机 / 局域网）
    1) 局域网未加入 → LobbyScreen 大厅
    2) 已加入但对局未开始 → 等待对手
    3) 对局进行中 → 对战主界面
-->
<template>
  <div class="app-wrap">
    <!-- Toast 提示层 -->
    <div class="toasts">
      <div v-for="(t, i) in toastLogs" :key="i" class="toast">{{ t }}</div>
    </div>

    <!-- 0) 入口选择页 -->
    <EntryScreen v-if="gameMode === 'none'" @select="onSelectMode" />

    <!-- 局域网大厅（选了局域网但还没加入房间） -->
    <LobbyScreen v-else-if="gameMode === 'lan' && !state.yourSlot" @exit="exitToEntry" />

    <!-- 局域网已加入但等待对手 / 单机模式直接进入对局 -->
    <template v-else-if="gameMode === 'single' || state.yourSlot">
      <!-- 等待对手 -->
      <div v-if="!state.started" class="lobby">
        <div class="lobby-box">
          <div class="lobby-title">等待对手</div>
          <div class="lobby-sub">
            你是：<b>{{ state.yourSlot?.toUpperCase() }} · 玩家 {{ (state.yourPid ?? 0) + 1 }}</b><br/>
            请让另一位玩家扫描二维码或访问 URL 加入
          </div>
          <div class="lobby-url" v-if="qrInfo?.url">{{ qrInfo.url }}</div>
          <div class="lobby-qr" v-if="qrInfo?.qr">
            <img :src="qrInfo.qr" alt="qr" />
          </div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn" @click="fetchQrInfo">刷新</button>
            <button class="btn dark" @click="exitToEntry">返回</button>
          </div>
        </div>
      </div>

      <!-- 对局主界面 -->
      <template v-else>
        <!-- 顶部：返回 + 静音 + 日志按钮 -->
        <div style="display:flex;justify-content:space-between;gap:6px;">
          <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="exitToEntry">← 返回</button>
          <div style="display:flex;gap:6px;">
            <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="showLogs = true">
              📜 ({{ state.logs.length }})
            </button>
            <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="toggleMute">
              {{ muted ? '🔇' : '🔊' }}
            </button>
          </div>
        </div>

        <!-- 对手面板 -->
        <PlayerPanel
          :player="state.opponent"
          :me="false"
          :first-player-pid="state.firstPlayerPid"
          :active-pid="state.activePid"
          :defense-pid="state.defensePid"
          :emergency-pid="state.emergencyHealPid"
        />

        <!-- 桌面展示区（出牌区） -->
        <PlayedCardsZone :cards="playedCards" />

        <!-- 中间：牌库 / 回合阶段 / 弃牌堆 -->
        <div class="center-strip">
          <div class="pile">
            <div class="label">牌库剩余</div>
            <div class="value">{{ state.deckCount }}</div>
          </div>
          <div class="round-tag" :class="roundTagClass">{{ roundText }}</div>
          <div class="pile">
            <div class="label">弃牌堆</div>
            <div class="value">{{ state.discardCount }}</div>
          </div>
        </div>

        <!-- 操作按钮区：补气按钮 / 结束回合 / 确认防御 / 放弃救血 -->
        <div class="action-btns">
          <button
            class="btn qi"
            :disabled="!canUseNormalQi"
            @click="() => useBonus('normal')"
            title="整局限 1 次，+2 气"
          >普通补气 +2</button>

          <button
            class="btn qi"
            :disabled="!canUseBigQi"
            @click="() => useBonus('big')"
            title="整局限 1 次，+3 气"
          >大补气 +3</button>

          <button
            class="btn gold"
            :disabled="!canUseBurst"
            @click="() => useBonus('burst')"
            title="消耗 6 气 → 兵法 +1 层，持续 3 回合"
          >爆气（-6气/+1兵法）</button>

          <button
            v-if="isAwaitingDefense"
            class="btn primary"
            :disabled="!canConfirmDefend"
            @click="confirmDefend"
          >确认防御（承受伤害）</button>

          <button
            v-if="isEmergencyHealing"
            class="btn dark"
            @click="giveUpHeal"
          >放弃救血（接受败北）</button>

          <button
            v-if="canEndTurn"
            class="btn primary"
            @click="endAction"
          >结束行动</button>

          <button
            v-if="state.gameOver"
            class="btn gold"
            @click="resetRoom"
          >再来一局（重置房间）</button>
        </div>

        <!-- 手牌区（只有自己能看到） -->
        <div class="hand-area">
          <GameCard
            v-for="c in state.you.handCards"
            :key="c.uid"
            :card="c"
            clickable
            :selected="selectedCardUid === c.uid"
            :disabled="!cardPlayable(c)"
            :preview-cost="previewCost(c)"
            :preview-damage="previewDamage(c)"
            :damage-boost-badge="boostBadge(c)"
            :cost-discount-badge="discountBadge(c)"
            @click="onCardClick"
          />
          <div v-if="state.you.handCards.length === 0" class="hand-empty">
            手牌空空如也... 点击「结束回合」补 3~4 张
          </div>
        </div>

        <!-- 自己面板 -->
        <PlayerPanel
          :player="state.you"
          me
          :first-player-pid="state.firstPlayerPid"
          :active-pid="state.activePid"
          :defense-pid="state.defensePid"
          :emergency-pid="state.emergencyHealPid"
        />

      </template>
    </template>

    <!-- 日志弹窗 -->
    <div class="gameover-mask" v-if="showLogs" @click.self="showLogs = false">
      <div class="logs-modal">
        <div class="logs-header">
          <span>对局日志</span>
          <button class="btn dark" style="font-size:11px;padding:2px 10px;" @click="showLogs = false">✕ 关闭</button>
        </div>
        <div class="logs-body">
          <div v-if="state.logs.length === 0" style="color:#8E734F;text-align:center;padding:20px;">暂无日志</div>
          <div v-for="(l, i) in state.logs.slice().reverse()" :key="i" class="log-line">{{ l }}</div>
        </div>
      </div>
    </div>

    <!-- 绝杀过场动画 -->
    <div class="ultimate-overlay" v-if="ultimateAnimating">
      <div class="ultimate-text">绝杀</div>
    </div>

    <!-- 胜负过场动画 -->
    <div class="go-transition" v-if="state.gameOver && gameOverAnimating" :class="gameOverClass">
      <VictoryAnim v-if="gameOverClass === 'win'" />
      <DefeatAnim v-else-if="gameOverClass === 'lose'" />
      <div v-else class="go-transition-text">{{ gameOverTitle }}</div>
    </div>

    <!-- 游戏结束遮罩（过场动画结束后显示） -->
    <div class="gameover-mask" v-if="state.gameOver && !gameOverAnimating">
      <div class="gameover-card">
        <div class="gameover-title" :class="gameOverClass">{{ gameOverTitle }}</div>
        <div class="gameover-desc">{{ state.gameOverDetail }}</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="btn primary" @click="resetRoom">再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import LobbyScreen from './components/LobbyScreen.vue';
import PlayerPanel from './components/PlayerPanel.vue';
import GameCard from './components/GameCard.vue';
import PlayedCardsZone from './components/PlayedCardsZone.vue';
import EntryScreen from './components/EntryScreen.vue';
import VictoryAnim from './components/VictoryAnim.vue';
import DefeatAnim from './components/DefeatAnim.vue';
import { soundManager } from './audio/SoundManager';
import {
  state, toastLogs, qrInfo, isMyTurn, isAwaitingDefense, isEmergencyHealing,
  canEndTurn, canConfirmDefend, canGiveUpHeal, playedCards, gameMode,
  initStore, startSingle, startLan, exitToEntry,
  useBonus, confirmDefend, giveUpHeal, endAction, playCard, resetRoom, fetchQrInfo,
  ultimateAnimating, gameOverAnimating,
} from './store/gameStore';
import type { CardView, CardCategory } from './types/protocol';

// ===== 模式选择 =====
function onSelectMode(mode: 'single' | 'lan'): void {
  soundManager.init();
  if (mode === 'single') {
    startSingle();
  } else {
    startLan();
  }
}

// ===== 音效控制 =====
const muted = ref(false);
function toggleMute(): void {
  muted.value = soundManager.toggleMute();
}

// ===== 日志弹窗 =====
const showLogs = ref(false);

// ===== 手牌选中状态（两次点击出牌）=====
const selectedCardUid = ref<string | null>(null);
function onCardClick(c: CardView): void {
  if (!cardPlayable(c)) return;
  if (selectedCardUid.value === c.uid) {
    // 第二次点击同一张牌 → 打出
    selectedCardUid.value = null;
    playCard(c.uid);
  } else {
    // 第一次点击 → 选中（弹起）
    selectedCardUid.value = c.uid;
  }
}

// ===== 回合阶段显示 =====
const roundText = computed(() => {
  if (state.gameOver) return '对局结束';
  if (state.emergencyHealPid !== null) {
    return `紧急救血 · 玩家${state.emergencyHealPid + 1}`;
  }
  if (state.defensePid !== null) {
    return `回合${state.roundCount} · 防御响应`;
  }
  // 当前行动玩家是否已结束行动
  const myPid = state.yourPid;
  if (myPid !== null && state.actionEnded[myPid] && state.activePid !== myPid) {
    return `回合${state.roundCount} · 等待对方行动`;
  }
  return `回合 ${state.roundCount} · 玩家${state.activePid + 1}行动`;
});
const roundTagClass = computed(() => {
  if (state.gameOver) return 'over';
  if (state.emergencyHealPid !== null) return 'heal';
  if (state.defensePid !== null) return 'def';
  if (!state.started) return 'wait';
  return '';
});

// ===== 游戏结束文案 =====
const gameOverTitle = computed(() => {
  if (state.winner === null) return '平局';
  return state.winner === state.yourPid ? '胜利' : '败北';
});
const gameOverClass = computed(() => {
  if (state.winner === null) return 'draw';
  return state.winner === state.yourPid ? 'win' : 'lose';
});

// ===== 补气按钮可用性 =====
const canUseNormalQi = computed(() =>
  isMyTurn.value && !state.you.usedNormalQi && !state.gameOver && state.defensePid === null,
);
const canUseBigQi = computed(() =>
  isMyTurn.value && !state.you.usedBigQi && !state.gameOver && state.defensePid === null,
);
const canUseBurst = computed(() =>
  isMyTurn.value && state.you.qi >= 6 && !state.gameOver && state.defensePid === null,
);

// ===== 卡牌可用性预览 =====
/** 服务端最终判定；这里仅做前端提示性可点（灰掉不可点的） */
function cardPlayable(c: CardView): boolean {
  if (state.gameOver) return false;
  const myPid = state.yourPid;
  if (myPid === null) return false;
  const cat = c.category as CardCategory;

  // 防御阶段：只有防御者可出防具 / 八卦阵
  if (state.defensePid === myPid) {
    if (cat === ('armor' as any)) return true;
    if (cat === ('formation' as any) && c.id.startsWith('bagua')) return true;
    return false;
  }

  // 紧急救血阶段：只有被击杀方可打补血
  if (state.emergencyHealPid === myPid) {
    return cat === ('function_hp' as any);
  }

  // 行动阶段：必须是当前行动玩家
  if (!isMyTurn.value) return false;

  // 武将牌：气量足够（含残血-1 优惠）
  if (cat === ('general' as any)) {
    return state.you.qi >= previewCost(c);
  }
  // 追风阵：行动阶段可出
  if (cat === ('formation' as any) && c.id.startsWith('zhuifeng')) return true;
  // 其余（补气/补血/兵法/绝杀）：行动阶段可出
  return true;
}

/** 武将牌预览真实耗气（残血 -1，最低 0） */
function previewCost(c: CardView): number {
  let cost = c.cost;
  if (c.category !== ('general' as any)) return cost;
  const hp = state.you.hp;
  if (hp === 1) cost = Math.max(0, cost - 1);
  return cost;
}
/** 残血 → 显示 0 费徽章 */
function discountBadge(c: CardView): boolean {
  if (c.category !== ('general' as any)) return false;
  return previewCost(c) === 0 && c.cost > 0;
}
/** 武将牌最终伤害预览（基础 + 兵法总层数 + 状态增伤） */
function previewDamage(c: CardView): number {
  if (c.category !== ('general' as any)) return c.value;
  const layers = state.you.strategies.reduce((sum, s) => sum + s.layers, 0);
  const hp = state.you.hp;
  const hasStrat = layers > 0;
  let stateBonus = 0;
  if (hp === 2) stateBonus = 1;
  else if (hp === 1) stateBonus = hasStrat ? 2 : 1;
  return c.value + layers + stateBonus;
}
function boostBadge(c: CardView): number | undefined {
  if (c.category !== ('general' as any)) return undefined;
  const delta = previewDamage(c) - c.value;
  return delta > 0 ? delta : undefined;
}

// 出牌函数已在 onCardClick 中调用

onMounted(() => {
  // 首次用户交互时初始化音效（浏览器自动播放策略要求）
  const initAudioOnce = () => {
    soundManager.init();
    document.removeEventListener('click', initAudioOnce);
    document.removeEventListener('touchstart', initAudioOnce);
  };
  document.addEventListener('click', initAudioOnce);
  document.addEventListener('touchstart', initAudioOnce);
});
</script>
