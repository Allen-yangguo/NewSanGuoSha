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

    <!-- 认证页:未登录 -->
    <AuthScreen v-if="authReady && !authed" />
    <!-- 登录态恢复中 -->
    <div v-else-if="!authReady" style="flex:1;display:flex;align-items:center;justify-content:center;color:#8E734F;">加载中...</div>
    <!-- 已登录未选模式 → 入口选择页(带身份栏) -->
    <template v-else-if="gameMode === 'none'">
      <!-- 个人中心页（点击头像进入） -->
      <div v-if="showProfile" class="profile-page">
        <div class="profile-header">
          <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="showProfile = false">← 返回</button>
          <div class="profile-title">个人中心</div>
        </div>
        <div class="profile-card">
          <!-- 昵称编辑 -->
          <div class="profile-section">
            <div class="profile-section-title">我的昵称</div>
            <input v-model="editingNick" class="auth-input" placeholder="输入昵称(最多12字)" maxlength="12" style="margin:8px 0;" />
            <div v-if="nickErrMsg" class="profile-err">{{ nickErrMsg }}</div>
            <button class="btn primary" :disabled="nicknameSaving" @click="onSaveNickname" style="margin-top:8px;">{{ nicknameSaving ? '保存中...' : '保存昵称' }}</button>
          </div>
          <!-- 战绩详情 -->
          <div class="profile-section">
            <div class="profile-section-title">我的战绩</div>
            <template v-if="recordSummary">
              <div class="record-level">
                <span class="lv-badge">Lv{{ recordSummary.level }}</span>
                <span class="lv-name">{{ recordSummary.levelName }}</span>
              </div>
              <div class="record-score">累计积分：{{ recordSummary.totalScore }}</div>
              <div class="record-grid">
                <div class="record-item"><span class="label">对局</span><span class="val">{{ recordSummary.totalGames }}</span></div>
                <div class="record-item"><span class="label">胜</span><span class="val win">{{ recordSummary.wins }}</span></div>
                <div class="record-item"><span class="label">负</span><span class="val lose">{{ recordSummary.losses }}</span></div>
                <div class="record-item"><span class="label">平</span><span class="val">{{ recordSummary.draws }}</span></div>
                <div class="record-item"><span class="label">胜率</span><span class="val">{{ recordSummary.winRate }}%</span></div>
                <div class="record-item"><span class="label">一血</span><span class="val">{{ recordSummary.firstBloods }}</span></div>
              </div>
              <div class="record-next" v-if="recordSummary.nextLevelScore > 0">
                距离下个级别还需 {{ recordSummary.nextLevelScore }} 分
              </div>
            </template>
            <div v-else class="record-empty">暂无战绩记录</div>
          </div>
        </div>
      </div>
      <!-- 模式选择页 -->
      <template v-else>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;gap:8px;">
          <span
            style="font-size:12px;color:#8E734F;"
            :style="isGuest ? { cursor: 'not-allowed', opacity: '.5' } : { cursor: 'pointer' }"
            @click="onTopAvatarClick"
          >👤 {{ displayName }}</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <MusicButton />
            <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="onLogout">退出登录</button>
          </div>
        </div>
        <EntryScreen @select="onSelectMode" />
      </template>
    </template>

    <!-- 局域网大厅：未入座 → 选桌入座 -->
    <LobbyScreen v-else-if="gameMode === 'lan' && state.myTableId === null" @exit="exitToEntry" />

    <!-- 已入座(联机)/单机 → 对战界面(未开局显示准备状态,开局后战斗) -->
    <template v-else>
      <!-- 顶部：返回 + 静音 + 日志按钮（未开局返回=离开房间;旁观返回=退出旁观） -->
      <div style="display:flex;justify-content:space-between;gap:6px;">
        <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="onTopBack">← 返回</button>
        <div style="display:flex;gap:6px;">
          <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="showLogs = true">
            📜 ({{ state.logs.length }})
          </button>
          <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="toggleMute">
            {{ muted ? '🔇' : '🔊' }}
          </button>
          <MusicButton />
        </div>
      </div>

      <!-- 旁观模式横幅 -->
      <div class="spectator-bar" v-if="spectating">
        <span>👁 旁观中 · 正在观看 {{ state.yourSlot?.toUpperCase() }} 视角（不可出牌）</span>
        <button class="btn dark" style="font-size:12px;padding:4px 10px;" @click="onExitSpectate">退出旁观</button>
      </div>

      <!-- 对手面板 -->
      <PlayerPanel
        :player="state.started ? state.opponent : roomOppPlayer"
        :me="false"
        :ai-opponent="gameMode === 'single'"
        :interactive="!spectating"
        :first-player-pid="state.firstPlayerPid"
        :active-pid="state.activePid"
        :defense-pid="state.defensePid"
        :emergency-pid="state.emergencyHealPid"
        :combat-scores="state.combatScores"
        :gui-bei-protector-pid="state.guiBeiProtectorPid"
        :gui-bei-layers="state.guiBeiLayers"
        :gui-bei-remaining-turns="state.guiBeiRemainingTurns"
        @avatar-click="onAvatarClick"
      />

      <!-- 桌面展示区（出牌区） -->
      <PlayedCardsZone :cards="playedCards" />

      <!-- 中间：牌库 / 回合阶段 / 弃牌堆 -->
      <div class="center-strip">
        <div class="pile">
          <div class="label">牌库剩余</div>
          <div class="value">{{ state.started ? state.deckCount : '—' }}</div>
        </div>
        <div class="round-tag" :class="state.started ? roundTagClass : 'wait'">{{ state.started ? roundText : roomStatusText }}</div>
        <div class="pile">
          <div class="label">弃牌堆</div>
          <div class="value">{{ state.started ? state.discardCount : '—' }}</div>
        </div>
      </div>

        <!-- 操作按钮区: 未开局→准备; 开局→战斗(旁观模式隐藏) -->
        <div class="action-btns" v-if="!spectating">
          <!-- 未开局: 准备/取消准备/离开房间 -->
          <template v-if="!state.started">
            <button v-if="gameMode === 'lan' && !state.myReady" class="btn primary" style="flex:0 1 auto;" @click="onRoomReady">准备</button>
            <button v-if="gameMode === 'lan' && state.myReady" class="btn dark" style="flex:0 1 auto;" @click="onRoomCancelReady">取消准备</button>
            <button v-if="gameMode === 'lan'" class="btn dark" style="flex:0 1 auto;" @click="onRoomLeave">离开房间</button>
            <button v-else class="btn dark" style="flex:0 1 auto;" @click="exitToEntry">返回</button>
          </template>
          <!-- 开局: 对局结束过渡 + 战斗按钮 -->
          <template v-else>
          <!-- 对局结束过渡: 仅系统直接判负时显示结束语(白底) + 2s 倒计时,之后进入过场动画;玩家最后决策后判负则不显示,短延迟直接进动画 -->
          <div v-if="gameOverPending && gameOverShowHint" class="gameover-hint">
            {{ gameOverText }}
            <span v-if="gameOverCountdown > 0" class="go-countdown">（{{ gameOverCountdown }}s）</span>
          </div>
          <template v-else-if="!gameOverPending">
          <button
            class="btn qi"
            :disabled="!canUseNormalQi"
            @click="() => useBonus('normal')"
            :title="state.roundCount < 3 ? '第 4 回合后激活 · 整局限 1 次 · +2 气' : '整局限 1 次 · +2 气'"
          >普通补气 +2{{ state.roundCount < 3 ? ` (R${state.roundCount + 1}/4)` : '' }}</button>

          <button
            class="btn qi"
            :disabled="!canUseBigQi"
            @click="() => useBonus('big')"
            :title="state.roundCount < 6 ? '第 7 回合后激活 · 整局限 1 次 · +3 气' : '整局限 1 次 · +3 气'"
          >大补气 +3{{ state.roundCount < 6 ? ` (R${state.roundCount + 1}/7)` : '' }}</button>

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
          >确认防御（承受伤害）{{ decisionPhase === 'defend' && decisionCountdown > 0 ? `（${decisionCountdown}s）` : '' }}</button>

          <button
            v-if="isEmergencyHealing"
            class="btn dark"
            @click="giveUpHeal"
          >放弃救血（接受败北）{{ decisionPhase === 'emergency-heal' && decisionCountdown > 0 ? `（${decisionCountdown}s）` : '' }}</button>

          <button
            v-if="canEndTurn"
            class="btn primary"
            @click="endAction"
          >结束行动{{ decisionPhase === 'end-turn' && decisionCountdown > 0 ? `（${decisionCountdown}s）` : '' }}</button>

          <button
            v-if="state.gameOver"
            class="btn gold"
            @click="resetRoom"
          >再来一局（重置房间）</button>
          </template>
          </template>
        </div>

        <!-- 手牌区（只有自己能看到；旁观模式只读展示；未开局显示等待提示） -->
        <div class="hand-area" :class="{ spectator: spectating }">
          <template v-if="state.started">
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
          </template>
          <div v-else class="hand-empty">等待发牌...</div>
        </div>

        <!-- 自己面板 -->
        <PlayerPanel
          :player="state.started ? state.you : roomMyPlayer"
          me
          :interactive="!spectating"
          :first-player-pid="state.firstPlayerPid"
          :active-pid="state.activePid"
          :defense-pid="state.defensePid"
          :emergency-pid="state.emergencyHealPid"
          :combat-scores="state.combatScores"
          :gui-bei-protector-pid="state.guiBeiProtectorPid"
          :gui-bei-layers="state.guiBeiLayers"
          :gui-bei-remaining-turns="state.guiBeiRemainingTurns"
          @avatar-click="onAvatarClick"
        />

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

    <!-- 绝杀过场动画:剑劈屏幕 + 闪电闪烁 -->
    <div class="ultimate-overlay" v-if="ultimateAnimating">
      <svg class="ult-lightning" viewBox="0 0 400 600" preserveAspectRatio="none">
        <path class="bolt bolt1" d="M200 0 L168 150 L212 170 L156 320 L208 340 L140 600" />
        <path class="bolt bolt2" d="M270 0 L244 130 L284 150 L226 300 L266 320 L196 600" />
      </svg>
      <div class="ult-crack"></div>
      <div class="ult-slash"></div>
      <div class="ultimate-text">绝杀</div>
    </div>

    <!-- 锦囊使用过场动画:光圈轮转候选牌 → 停到所得牌 -->
    <div class="pouch-overlay" v-if="pouchAnimating">
      <div class="pouch-glow"></div>
      <div class="pouch-text">🎒 锦囊妙计</div>
      <div class="pouch-row">
        <div
          v-for="(c, i) in pouchAnimating.candidates"
          :key="i"
          class="pouch-candidate"
          :class="{ lit: i === pouchAnimating.current, won: pouchAnimating.done && i === pouchAnimating.current }"
        >{{ c }}</div>
      </div>
      <div
        class="pouch-ring"
        v-if="!pouchAnimating.done"
        :style="{ left: ringLeft + '%' }"
      ></div>
      <div class="pouch-card-name" v-if="pouchAnimating.done">获得 · {{ pouchAnimating.cardName }}</div>
    </div>

    <!-- 打出智者牌过场动画:获得锦囊标记 -->
    <div class="strategist-overlay" v-if="strategistAnimating">
      <div class="st-glow"></div>
      <div class="st-name">{{ strategistAnimating.name }}</div>
      <div class="st-text">获得锦囊</div>
      <div class="st-marks">
        <span
          v-for="(m, i) in strategistAnimating.marks"
          :key="m"
          class="st-mark"
          :class="[strategistAnimating.faction, 'm' + (i + 1)]"
        >{{ m }}</span>
      </div>
    </div>

    <!-- 胜负过场动画 -->
    <div class="go-transition" v-if="state.gameOver && gameOverAnimating" :class="gameOverClass">
      <VictoryAnim v-if="gameOverClass === 'win'" />
      <DefeatAnim v-else-if="gameOverClass === 'lose'" />
      <div v-else class="go-transition-text">{{ gameOverTitle }}</div>
    </div>

    <!-- 游戏结束遮罩（过场动画结束后显示；旁观模式不弹结算） -->
    <div class="gameover-mask" v-if="state.gameOver && !gameOverAnimating && !spectating">
      <div class="gameover-card">
        <div class="gameover-title" :class="gameOverClass">{{ gameOverTitle }}</div>
        <div class="gameover-desc">{{ state.gameOverDetail }}</div>
        <!-- 局末结算明细 -->
        <div class="settlement-box" v-if="settlement">
          <div class="settlement-row header">
            <span>项目</span><span>我方</span><span>对方</span>
          </div>
          <div class="settlement-row"><span>战斗分</span><span>{{ settlement.breakdown[state.yourPid ?? 0].combatScore }}</span><span>{{ settlement.breakdown[(state.yourPid ?? 0) === 0 ? 1 : 0].combatScore }}</span></div>
          <div class="settlement-row"><span>一血</span><span>{{ settlement.breakdown[state.yourPid ?? 0].firstBlood }}</span><span>{{ settlement.breakdown[(state.yourPid ?? 0) === 0 ? 1 : 0].firstBlood }}</span></div>
          <div class="settlement-row"><span>胜利分</span><span>{{ settlement.breakdown[state.yourPid ?? 0].victoryBonus }}</span><span>{{ settlement.breakdown[(state.yourPid ?? 0) === 0 ? 1 : 0].victoryBonus }}</span></div>
          <div class="settlement-row"><span>速胜奖励</span><span>{{ settlement.breakdown[state.yourPid ?? 0].speedBonus }}</span><span>{{ settlement.breakdown[(state.yourPid ?? 0) === 0 ? 1 : 0].speedBonus }}</span></div>
          <div class="settlement-row"><span>残血奖励</span><span>{{ settlement.breakdown[state.yourPid ?? 0].hpBonus }}</span><span>{{ settlement.breakdown[(state.yourPid ?? 0) === 0 ? 1 : 0].hpBonus }}</span></div>
          <div class="settlement-row"><span>失败扣分</span><span>{{ settlement.breakdown[state.yourPid ?? 0].lossPenalty }}</span><span>{{ settlement.breakdown[(state.yourPid ?? 0) === 0 ? 1 : 0].lossPenalty }}</span></div>
          <div class="settlement-row total"><span>合计</span><span class="my-score">{{ settlement.scores[state.yourPid ?? 0] }}</span><span>{{ settlement.scores[(state.yourPid ?? 0) === 0 ? 1 : 0] }}</span></div>
          <div class="settlement-round">回合数：{{ settlement.roundCount }}</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="btn primary" @click="resetRoom">再来一局</button>
          <button class="btn dark" @click="exitToEntry">休息去了</button>
        </div>
      </div>
    </div>

    <!-- 用户详情弹窗（点击头像） -->
    <div class="modal-overlay" v-if="showRecordDetail" @click.self="showRecordDetail = false">
      <div class="record-card">
        <div class="record-card-title">战绩详情</div>
        <template v-if="viewingRecord">
          <div class="record-level">
            <span class="lv-badge">Lv{{ viewingRecord.level }}</span>
            <span class="lv-name">{{ viewingRecord.levelName }}</span>
          </div>
          <div class="record-score">累计积分：{{ viewingRecord.totalScore }}</div>
          <div class="record-grid">
            <div class="record-item"><span class="label">对局</span><span class="val">{{ viewingRecord.totalGames }}</span></div>
            <div class="record-item"><span class="label">胜</span><span class="val win">{{ viewingRecord.wins }}</span></div>
            <div class="record-item"><span class="label">负</span><span class="val lose">{{ viewingRecord.losses }}</span></div>
            <div class="record-item"><span class="label">平</span><span class="val">{{ viewingRecord.draws }}</span></div>
            <div class="record-item"><span class="label">胜率</span><span class="val">{{ viewingRecord.winRate }}%</span></div>
            <div class="record-item"><span class="label">一血</span><span class="val">{{ viewingRecord.firstBloods }}</span></div>
          </div>
          <div class="record-next" v-if="viewingRecord.nextLevelScore > 0">
            距离下个级别还需 {{ viewingRecord.nextLevelScore }} 分
          </div>
        </template>
        <div v-else class="record-empty">暂无战绩记录</div>
        <button class="btn dark" @click="showRecordDetail = false" style="margin-top:12px;">关闭</button>
      </div>
    </div>

    <!-- 绝杀急救弹窗：被绝杀击杀,可选择是否使用急锦囊自救 -->
    <div v-if="isUltimateSaving && !state.gameOver" class="modal-overlay">
      <div class="confirm-box" style="border-color:#B5463A;box-shadow:0 0 24px rgba(181,70,58,.5);">
        <div class="confirm-title" style="color:#B5463A;">⚔ 你被绝杀击杀！</div>
        <div class="confirm-sub">
          你有急锦囊可用：使用后 <b>50% 抽到绝疗丹保留 1 血</b>，50% 抽到还魂丹直接死亡。<br/>
          是否使用急锦囊自救？
        </div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">
          <button class="btn dark" @click="onGiveUpUltimateSave">放弃（接受败北）{{ decisionPhase === 'ultimate-save' && decisionCountdown > 0 ? `（${decisionCountdown}s）` : '' }}</button>
          <button class="btn primary" @click="onUseUltimatePouch">使用急锦囊自救{{ decisionPhase === 'ultimate-save' && decisionCountdown > 0 ? `（${decisionCountdown}s）` : '' }}</button>
        </div>
      </div>
    </div>

    <!-- 退出确认弹窗 -->
    <div v-if="showExitConfirm" class="modal-overlay" @click.self="showExitConfirm = false">
      <div class="confirm-box">
        <div class="confirm-title">确定离开游戏吗？</div>
        <div class="confirm-sub">离开后将对局中断，需重新开始</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">
          <button class="btn dark" @click="showExitConfirm = false">取消</button>
          <button class="btn primary" @click="confirmExit">确认离开</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LobbyScreen from './components/LobbyScreen.vue';
import PlayerPanel from './components/PlayerPanel.vue';
import GameCard from './components/GameCard.vue';
import PlayedCardsZone from './components/PlayedCardsZone.vue';
import EntryScreen from './components/EntryScreen.vue';
import AuthScreen from './components/AuthScreen.vue';
import VictoryAnim from './components/VictoryAnim.vue';
import DefeatAnim from './components/DefeatAnim.vue';
import MusicButton from './components/MusicButton.vue';
import { soundManager } from './audio/SoundManager';
import {
  state, toastLogs, pushToast, isMyTurn, isAwaitingDefense, isEmergencyHealing, isUltimateSaving,
  canEndTurn, canConfirmDefend, canGiveUpHeal, playedCards, gameMode,
  initStore, startSingle, startLan, exitToEntry,
  useBonus, confirmDefend, giveUpHeal, endAction, playCard, resetRoom,
  useUltimatePouch, giveUpUltimateSave, leaveGameToLobby,
  ready as lanReady, cancelReady as lanCancelReady,
  ultimateAnimating, pouchAnimating, strategistAnimating, gameOverAnimating, gameOverPending, gameOverCountdown, gameOverShowHint, settlement, recordSummary, fetchRecord, submitSettlement, viewingRecord, fetchRecordByPid,
  spectating, exitSpectate, roomTick,
} from './store/gameStore';
import { authed, authUser, logout, restoreAuth, isGuest, updateNickname } from './store/authStore';
import type { CardView, CardCategory, PlayerId, Slot, PlayerView } from './types/protocol';

// ===== 模式选择 =====
function onSelectMode(mode: 'single' | 'lan'): void {
  soundManager.init();
  if (mode === 'single') {
    startSingle();
  } else {
    startLan();
  }
}

// ===== 旁观 =====
function onExitSpectate(): void {
  exitSpectate();
}

// ===== 绝杀急救 =====
function onUseUltimatePouch(): void {
  useUltimatePouch();
}
function onGiveUpUltimateSave(): void {
  giveUpUltimateSave();
}

// ===== 分享网址给好友 =====
const shareUrl = computed(() => window.location.origin);
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

// ===== 音效控制 =====
const muted = ref(false);
function toggleMute(): void {
  muted.value = soundManager.toggleMute();
}

// ===== 日志弹窗 =====
const showLogs = ref(false);

// ===== 用户详情弹窗 =====
const showRecordDetail = ref(false);
const showProfile = ref(false);
const editingNick = ref('');
const nicknameSaving = ref(false);
const nickErrMsg = ref('');

function onAvatarClick(pid?: PlayerId): void {
  // 战斗界面头像点击：登录用户显示该玩家战绩，游客提示注册方可使用更多功能
  if (isGuest.value) {
    pushToast('注册登录后可使用更多功能');
    return;
  }
  // 点自己头像：直接复用已查询的 recordSummary（单机模式 room 无 userId，按 pid 查会失败）
  // 点对手头像：按 pid 查询对方战绩
  if (pid !== undefined && pid !== state.yourPid) {
    fetchRecordByPid(pid);
  } else {
    viewingRecord.value = recordSummary.value;
  }
  showRecordDetail.value = true;
}

function onTopAvatarClick(): void {
  // 左上角头像点击：进入个人中心（含昵称编辑 + 战绩），游客提示注册
  if (isGuest.value) {
    pushToast('注册登录后可使用更多功能');
    return;
  }
  editingNick.value = authUser.value?.nickname || '';
  nickErrMsg.value = '';
  fetchRecord(); // 进入个人中心时刷新自己战绩
  showProfile.value = true;
}

async function onSaveNickname(): Promise<void> {
  const nick = editingNick.value.trim();
  if (!nick) { nickErrMsg.value = '昵称不能为空'; return; }
  if (nick.length > 12) { nickErrMsg.value = '昵称最多 12 字'; return; }
  nicknameSaving.value = true;
  const ok = await updateNickname(nick);
  nicknameSaving.value = false;
  if (ok) {
    pushToast('昵称修改成功');
  } else {
    nickErrMsg.value = '修改失败，请重试';
  }
}

// ===== 对局室(对战界面未开局时的准备区)=====
const roomOppSlot = computed<Slot | null>(() => {
  if (state.mySlot !== 'p1' && state.mySlot !== 'p2') return null;
  return state.mySlot === 'p1' ? 'p2' : 'p1';
});
const roomTable = computed(() => state.tables.find(t => t.id === state.myTableId) || null);
const roomOppSeat = computed(() => (roomOppSlot.value ? roomTable.value?.[roomOppSlot.value] : null));
const roomOppName = computed(() => roomOppSeat.value?.name || '');
const roomOppReady = computed(() => !!roomOppSeat.value?.ready);
const roomOppPresent = computed(() => !!roomOppSeat.value?.present);
const roomMyName = computed(() => authUser.value?.nickname || '我');
async function onRoomReady(): Promise<void> {
  await lanReady();
}
async function onRoomCancelReady(): Promise<void> {
  await lanCancelReady();
}
function onRoomLeave(): void {
  leaveGameToLobby();
}

/** 未开局时对战界面中间的提示文字 */
const roomStatusText = computed(() => {
  if (gameMode.value === 'single') return '正在为 AI 准备...';
  if (state.myReady && roomOppReady.value) return '双方已准备 · 即将开始';
  if (state.myReady) return '已准备 · 等待对方准备';
  return roomOppName.value ? '等待双方准备' : '等待玩家入座';
});

/** 未开局时玩家面板的占位数据(显示名字/座位,血气为占位) */
const roomOppPlayer = computed<PlayerView>(() => ({
  pid: (roomOppSlot.value === 'p2' ? 1 : 0) as PlayerId,
  name: roomOppName.value || (gameMode.value === 'single' ? 'AI 对手' : '等待玩家入座…'),
  hp: 0, hpMax: 12, qi: 0,
  handCount: 0, handCards: [], strategies: [],
  usedNormalQi: false, usedBigQi: false,
  pouches: [], yulin: { active: false, remainingTurns: 0 },
}));
const roomMyPlayer = computed<PlayerView>(() => ({
  pid: (state.mySlot === 'p2' ? 1 : 0) as PlayerId,
  name: roomMyName.value,
  hp: 0, hpMax: 12, qi: 0,
  handCount: 0, handCards: [], strategies: [],
  usedNormalQi: false, usedBigQi: false,
  pouches: [], yulin: { active: false, remainingTurns: 0 },
}));

/** 顶部返回: 旁观→退出旁观; 未开局→离开房间; 对局中→退出确认 */
function onTopBack(): void {
  if (spectating.value) onExitSpectate();
  else if (!state.started) onRoomLeave();
  else showExitConfirm.value = true;
}

// ===== 退出确认 =====
const showExitConfirm = ref(false);
function confirmExit(): void {
  showExitConfirm.value = false;
  if (gameMode.value === 'lan' && state.started && !state.gameOver) {
    // 联机对局进行中离开 = 强退(服务端扣 50 分、模拟玩家留桌、桌重置未准备)
    leaveGameToLobby();
  } else {
    exitToEntry();
  }
}

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

// ===== 决策倒计时（10s 无操作自动执行安全默认动作,确保游戏不会因玩家不操作而卡住）=====
const DECISION_SECONDS = 10;
const decisionCountdown = ref(DECISION_SECONDS);
let decisionTimer: ReturnType<typeof setInterval> | null = null;

/** 当前需要玩家决策的阶段(互斥;旁观模式不参与) */
const decisionPhase = computed(() => {
  if (spectating.value) return null;
  if (isUltimateSaving.value) return 'ultimate-save';
  if (isEmergencyHealing.value) return 'emergency-heal';
  if (isAwaitingDefense.value) return 'defend';
  if (canEndTurn.value) return 'end-turn';
  return null;
});

function startDecisionCountdown(): void {
  stopDecisionCountdown();
  decisionCountdown.value = DECISION_SECONDS;
  decisionTimer = setInterval(() => {
    decisionCountdown.value -= 1;
    if (decisionCountdown.value <= 0) {
      stopDecisionCountdown();
      const phase = decisionPhase.value;
      if (phase === 'end-turn') endAction();
      else if (phase === 'defend') confirmDefend(); // 自动承受伤害
      else if (phase === 'emergency-heal') {
        // 有补血牌自动打出,否则放弃
        const heal = state.you?.handCards?.find((c: any) => c.category === 'function_hp');
        if (heal) playCard(heal.uid);
        else giveUpHeal();
      } else if (phase === 'ultimate-save') {
        useUltimatePouch(); // 自动使用急锦囊自救(50% 绝疗丹)
      }
    }
  }, 1000);
}
function stopDecisionCountdown(): void {
  if (decisionTimer) { clearInterval(decisionTimer); decisionTimer = null; }
}
// 决策阶段变化 → 启动/停止倒计时; 出牌/补气等任何状态刷新(roomTick) → 重新计时
watch(decisionPhase, (p) => {
  if (p) startDecisionCountdown();
  else stopDecisionCountdown();
});
watch(roomTick, () => {
  if (decisionPhase.value) startDecisionCountdown();
  else stopDecisionCountdown();
});
onBeforeUnmount(stopDecisionCountdown);

// ===== 对局结束过渡文案(按钮位置,白底,倒计时后进动画) =====
const gameOverText = computed(() => {
  if (state.winner === state.yourPid) return '🎉 大获全胜！';
  if (state.winner === null) return '不分胜负 · 握手言和';
  return '惜乎！你已无力回天。';
});

// ===== 锦囊轮盘动画：光圈位置（等宽候选牌，取第 i 张中心）=====
const ringLeft = computed(() => {
  const a = pouchAnimating.value;
  if (!a) return 50;
  const n = a.candidates.length;
  if (n <= 1) return 50;
  return ((a.current + 0.5) / n) * 100;
});

// ===== 回合阶段显示 =====
const roundText = computed(() => {  if (state.gameOver) return '对局结束';
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
  isMyTurn.value && !state.you.usedNormalQi && !state.gameOver && state.defensePid === null && state.roundCount >= 3,
);
const canUseBigQi = computed(() =>
  isMyTurn.value && !state.you.usedBigQi && !state.gameOver && state.defensePid === null && state.roundCount >= 6,
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

  // 防御阶段：只有防御者可出防具 / 八卦阵（允许嵌套反弹，八卦阵可反复出在来回反弹中）
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

// ===== 用户认证态 =====
const authReady = ref(false);
const displayName = computed(() => {
  const u = authUser.value;
  if (!u) return '';
  if (u.role === 'guest') return u.nickname || '游客';
  return u.nickname || u.phone || '用户';
});

function onLogout(): void {
  logout();
  exitToEntry();
}

// ===== 无牌自动结束行动(免点结束按钮) =====
const autoEndedFlag = ref(false);
watch(() => state.you.handCards.length, (n) => {
  // 轮到我行动且手牌空 → 自动结束行动
  if (n === 0 && canEndTurn.value && !autoEndedFlag.value) {
    autoEndedFlag.value = true;
    endAction();
  } else if (n > 0) {
    autoEndedFlag.value = false;
  }
});

// ===== 战绩系统：单机结算提交 + 进入游戏查询战绩 =====
watch(settlement, (s) => {
  if (s && gameMode.value === 'single' && state.yourPid !== null) {
    submitSettlement(s, state.yourPid);
  }
});

watch(gameMode, (mode) => {
  if (mode === 'single' || mode === 'lan') {
    fetchRecord();
  }
});

onMounted(async () => {
  await restoreAuth();
  authReady.value = true;
  // 首次用户交互时初始化音效并启动背景音乐（浏览器自动播放策略要求）
  const initAudioOnce = () => {
    soundManager.init();
    soundManager.startBgm();
    document.removeEventListener('click', initAudioOnce);
    document.removeEventListener('touchstart', initAudioOnce);
  };
  document.addEventListener('click', initAudioOnce);
  document.addEventListener('touchstart', initAudioOnce);
});
</script>
