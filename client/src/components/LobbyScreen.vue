<!--
  联机大厅 · 5 桌并行（参考 QQ 游戏大厅）
    - 顶部：标题 + 分享网址 + 返回
    - 5 个桌卡片网格：每桌 2 座，显示玩家名/准备/在线状态
    - 空座可点「入座」；坐下后显示「准备 / 取消准备 / 站起」
    - 双方准备 → 服务端开局 → 收到 eventGameStart 后 App 切到对战界面
-->
<template>
  <div class="lobby">
    <div class="lobby-box lobby-wide">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
        <div class="lobby-title">新三国杀 · 大厅</div>
        <div style="display:flex;gap:8px;">
          <button v-if="rejoinInfo" class="btn primary" style="font-size:13px;padding:6px 14px;" @click="onRejoin">🔗 重新进入</button>
          <button class="btn gold" style="font-size:13px;padding:6px 14px;" @click="openBoard">🏆 排行榜</button>
        </div>
      </div>
      <div class="lobby-sub">
        10 桌并行 · 选空座坐下 · 双方准备即开局<br/>
        好友打开同一网址进入同一大厅即可同桌
      </div>

      <div class="lobby-url">
        <input readonly :value="shareUrl" class="share-input" />
        <button class="btn" @click="copyShareUrl">复制网址</button>
      </div>

      <div v-if="lastError" class="lobby-err">⚠ {{ lastError }}</div>

      <!-- 5 桌网格 -->
      <div class="tables-grid">
        <div
          v-for="t in state.tables"
          :key="t.id"
          class="table-card"
          :class="{ mine: isMyTable(t), 'is-playing': t.started }"
        >
          <div class="table-head">
            <span class="table-no">桌 {{ t.id }}</span>
            <span class="table-state" :class="stateClass(t)">{{ stateText(t) }}</span>
          </div>

          <div class="seats">
            <!-- p1 -->
            <div class="seat" :class="seatClass(t, 'p1')">
              <template v-if="t.p1.name">
                <div class="seat-name">
                  {{ isMySeat(t, 'p1') ? '我' : t.p1.name }}
                  <span v-if="!t.p1.present" class="seat-off" title="掉线重连中">⌛</span>
                </div>
                <div class="seat-ready" :class="t.started ? (t.gameOver ? 'over' : 'fighting') : (t.p1.ready ? 'on' : '')">
                  {{ t.started ? (t.gameOver ? '🏁 已结束' : '⚔ 对局中') : (t.p1.ready ? '✓ 已准备' : '未准备') }}
                </div>
              </template>
              <button
                v-else
                class="btn seat-sit"
                :disabled="!canSit(t, 'p1')"
                @click="onSit(t.id, 'p1')"
              >＋ 入座</button>
            </div>

            <div class="vs">VS</div>

            <!-- p2 -->
            <div class="seat" :class="seatClass(t, 'p2')">
              <template v-if="t.p2.name">
                <div class="seat-name">
                  {{ isMySeat(t, 'p2') ? '我' : t.p2.name }}
                  <span v-if="!t.p2.present" class="seat-off" title="掉线重连中">⌛</span>
                </div>
                <div class="seat-ready" :class="t.started ? (t.gameOver ? 'over' : 'fighting') : (t.p2.ready ? 'on' : '')">
                  {{ t.started ? (t.gameOver ? '🏁 已结束' : '⚔ 对局中') : (t.p2.ready ? '✓ 已准备' : '未准备') }}
                </div>
              </template>
              <button
                v-else
                class="btn seat-sit"
                :disabled="!canSit(t, 'p2')"
                @click="onSit(t.id, 'p2')"
              >＋ 入座</button>
            </div>
          </div>

          <!-- 我的座位操作区 -->
          <div v-if="isMyTable(t) && !t.started" class="table-actions">
            <button
              v-if="!state.myReady"
              class="btn primary"
              :disabled="connecting"
              @click="onReady"
            >准备</button>
            <button
              v-else
              class="btn dark"
              :disabled="connecting"
              @click="onCancelReady"
            >取消准备</button>
            <button class="btn dark" :disabled="connecting" @click="onStandUp">站起</button>
          </div>
          <div v-else-if="isMyTable(t) && t.started" class="table-actions">
            <div class="playing-hint">{{ t.gameOver ? '对局已结束 · 在对战界面点「再来一局」' : '对局进行中 · 切换到对战界面' }}</div>
          </div>
          <!-- 对局进行中: 旁观入口(未入座此桌也可旁观;对局已结束不再提供旁观) -->
          <div v-if="t.started && !t.gameOver && !isMyTable(t)" class="table-actions">
            <template v-if="specMenu === t.id">
              <button class="btn" @click="onSpectate(t.id, 0)">👁 p1 视角</button>
              <button class="btn" @click="onSpectate(t.id, 1)">👁 p2 视角</button>
              <button class="btn dark" @click="specMenu = null">取消</button>
            </template>
            <button v-else class="btn" @click="specMenu = specMenu === t.id ? null : t.id">👁 旁观</button>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:4px;">
        <MusicButton />
        <button class="btn dark" @click="$emit('exit')">← 返回</button>
      </div>

      <div class="lobby-tip">
        <div v-if="state.myTableId !== null">
          你在：<b>桌{{ state.myTableId }} · {{ state.mySlot?.toUpperCase() }}</b>
          <template v-if="!state.myReady"> · 等待你准备</template>
        </div>
        <div v-else>点击任意空座即可入座</div>
        <div>规则：6 血 6 气 · 104 张牌库 · 兵法倒计时 · 掉血补气</div>
      </div>
    </div>

    <!-- 排行榜弹窗 -->
    <div v-if="showBoard" class="modal-overlay" @click.self="showBoard = false">
      <div class="confirm-box board-box">
        <div class="confirm-title">🏆 排行榜</div>
        <div style="display:flex;gap:8px;justify-content:center;margin:10px 0 4px;">
          <button class="btn" :class="{ 'board-tab-on': boardType === 'score' }" @click="switchBoard('score')">📊 积分榜</button>
          <button class="btn" :class="{ 'board-tab-on': boardType === 'active' }" @click="switchBoard('active')">🔥 今日活跃</button>
        </div>
        <table class="board-table">
          <thead>
            <tr>
              <th>名次</th>
              <th>玩家</th>
              <th>{{ boardType === 'score' ? '积分' : '今日对局' }}</th>
              <th v-if="boardType === 'score'">胜场</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in boardRows" :key="row.uid">
              <td><span class="board-rank" :class="'r' + row.rank">{{ row.rank }}</span></td>
              <td class="board-name">{{ row.nickname }}</td>
              <td class="board-val">{{ boardType === 'score' ? row.totalScore : row.todayGames }}</td>
              <td v-if="boardType === 'score'" class="board-val">{{ row.wins }}</td>
            </tr>
            <tr v-if="boardRows.length === 0">
              <td colspan="4" style="text-align:center;color:#8E734F;padding:18px 0;">暂无数据</td>
            </tr>
          </tbody>
        </table>
        <div style="text-align:center;margin-top:10px;">
          <button class="btn dark" @click="showBoard = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  connecting, lastError, state,
  sitDown, standUp, ready, cancelReady, fetchTableList,
  spectate, rejoinInfo, rejoinGame,
} from '../store/gameStore';
import { fetchLeaderboard, type LeaderboardRow } from '../api/leaderboard';
import { authUser } from '../store/authStore';
import type { Slot, TableSummary } from '../types/protocol';
import MusicButton from './MusicButton.vue';

defineEmits<{ exit: [] }>();

/** 当前展开旁观视角选择的桌 id */
const specMenu = ref<number | null>(null);

// ===== 排行榜 =====
const showBoard = ref(false);
const boardType = ref<'score' | 'active'>('score');
const boardRows = ref<LeaderboardRow[]>([]);
async function loadBoard(): Promise<void> {
  boardRows.value = await fetchLeaderboard(boardType.value);
}
async function openBoard(): Promise<void> {
  showBoard.value = true;
  await loadBoard();
}
function switchBoard(type: 'score' | 'active'): void {
  if (boardType.value === type) return;
  boardType.value = type;
  loadBoard();
}

/** 断线重连后重新进入未完成的对局 */
async function onRejoin(): Promise<void> {
  await rejoinGame();
}

async function onSpectate(tableId: number, pid: 0 | 1): Promise<void> {
  specMenu.value = null;
  const r = await spectate(tableId, pid);
  if (!r.ok) return;
  // 成功旁观 → 切到对战界面(由 App 根据 state.started 渲染)
}

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

// ===== 桌/座位判断 =====
function isMyTable(t: TableSummary): boolean {
  return state.myTableId === t.id;
}
function isMySeat(t: TableSummary, slot: Slot): boolean {
  return isMyTable(t) && state.mySlot === slot;
}
/** 该座是否可被「我」坐：空座且对局未开始 */
function canSit(t: TableSummary, slot: Slot): boolean {
  if (t.started) return false;
  const seat = slot === 'p1' ? t.p1 : t.p2;
  return seat.name === null;
}

function stateText(t: TableSummary): string {
  if (t.started && t.gameOver) return '已结束';
  if (t.started) return '对战中';
  const occ = (t.p1.name !== null ? 1 : 0) + (t.p2.name !== null ? 1 : 0);
  if (occ === 0) return '空桌';
  if (occ === 1) return '等待加入';
  return '准备中';
}
function stateClass(t: TableSummary): string {
  if (t.started && t.gameOver) return 'over';
  if (t.started) return 'playing';
  const occ = (t.p1.name !== null ? 1 : 0) + (t.p2.name !== null ? 1 : 0);
  if (occ === 0) return 'empty';
  if (occ === 1) return 'wait';
  return 'ready';
}

function seatClass(t: TableSummary, slot: Slot): Record<string, boolean> {
  const seat = slot === 'p1' ? t.p1 : t.p2;
  return {
    occupied: seat.name !== null,
    mine: isMySeat(t, slot),
    offline: seat.name !== null && !seat.present,
  };
}

// ===== 动作 =====
async function onSit(tableId: number, slot: Slot): Promise<void> {
  // 若已在别桌入座，服务端会先清旧座（这里直接 sitDown 即可）
  await sitDown(tableId, slot, authUser.value?.nickname);
}
async function onStandUp(): Promise<void> {
  await standUp();
}
async function onReady(): Promise<void> {
  await ready();
}
async function onCancelReady(): Promise<void> {
  await cancelReady();
}

onMounted(() => {
  // 兜底拉取一次桌列表（startLan / 重连已触发，这里确保 LobbyScreen 单独挂载时也有数据）
  fetchTableList();
});
</script>

<style scoped>
.lobby-wide {
  width: min(96vw, 920px);
  max-height: 92vh;
  overflow-y: auto;
}
.lobby-err {
  width: 100%; text-align: center; color: #B5463A; font-size: 13px;
}
.tables-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.table-card {
  background: linear-gradient(180deg, #FFFBEE 0%, #F2E4C2 100%);
  border: 1px solid #C9A975;
  border-radius: 12px;
  padding: 10px 12px 12px;
  display: flex; flex-direction: column; gap: 8px;
  box-shadow: 0 4px 12px rgba(75, 59, 42, 0.12);
}
.table-card.mine {
  border-color: #B5463A;
  box-shadow: 0 0 0 2px rgba(181, 70, 58, 0.25), 0 4px 12px rgba(75, 59, 42, 0.18);
}
.table-card.is-playing {
  background: linear-gradient(180deg, #EDE0C2 0%, #D9C190 100%);
}
.table-head {
  display: flex; justify-content: space-between; align-items: center;
}
.table-no {
  font-size: 15px; font-weight: 800; color: #4B3B2A; letter-spacing: 1px;
}
.table-state {
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  background: #B49769; color: #FFF8E4;
}
.table-state.playing { background: linear-gradient(#B5463A, #8C3329); }
.table-state.over    { background: linear-gradient(#8A6A3B, #6B4A2B); }
.table-state.ready   { background: linear-gradient(#3E6E7A, #2D5460); }
.table-state.wait    { background: linear-gradient(#8A6D29, #6A521E); }
.table-state.empty   { background: linear-gradient(#999, #666); }

.seats {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 6px;
}
.seat {
  min-height: 56px;
  border: 1px dashed #A8864F;
  border-radius: 8px;
  background: rgba(255, 251, 238, 0.7);
  padding: 6px 8px;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  gap: 2px;
}
.seat.occupied { border-style: solid; border-color: #8A7254; }
.seat.mine { background: rgba(181, 70, 58, 0.10); border-color: #B5463A; }
.seat.offline { opacity: 0.7; }
.seat-name {
  font-size: 13px; font-weight: 800; color: #FFF8E4;
  background: linear-gradient(180deg, #8A6A3B, #6B4A2B);
  padding: 2px 10px;
  border-radius: 999px;
  display: inline-flex; align-items: center; gap: 4px;
  box-shadow: 0 1px 3px rgba(75, 59, 42, 0.35);
  max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.seat.mine .seat-name {
  background: linear-gradient(180deg, #C05347, #A03A30);
  box-shadow: 0 1px 3px rgba(160, 58, 48, 0.45);
}
.seat-off { font-size: 11px; }
.seat-ready {
  font-size: 11px; color: #8E734F;
}
.seat-ready.on { color: #2D5460; font-weight: 700; }
.seat-ready.fighting { color: #B5463A; font-weight: 800; }
.seat-ready.over { color: #8A6A3B; font-weight: 800; }
.seat-sit {
  width: 100%; font-size: 13px; padding: 8px 0;
}
.vs {
  font-size: 11px; color: #8E734F; font-weight: 700; text-align: center;
}
.table-actions {
  display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;
}
.table-actions .btn { font-size: 13px; padding: 6px 12px; }
.playing-hint {
  width: 100%; text-align: center; font-size: 12px; color: #8C3329; font-weight: 700;
}
.lobby-tip {
  font-size: 12px; color: #8E734F; text-align: center; line-height: 1.8;
  margin-top: 2px;
}

/* ===== 排行榜弹窗 ===== */
.board-box {
  width: min(92vw, 420px);
  max-height: 82vh;
  overflow-y: auto;
}
.board-tab-on {
  background: linear-gradient(180deg, #B49769, #9A7B3F) !important;
  color: #FFF8E4 !important;
  border-color: #8A6A3B !important;
  font-weight: 700;
}
.board-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
  font-size: 13px;
}
.board-table th {
  color: #8E734F;
  font-weight: 700;
  padding: 6px 4px;
  border-bottom: 1px solid #D9C190;
  text-align: center;
}
.board-table td {
  padding: 7px 4px;
  border-bottom: 1px dashed #E5D5AE;
  text-align: center;
}
.board-table tbody tr:nth-child(1) td { background: rgba(201, 162, 39, 0.10); }
.board-table tbody tr:nth-child(2) td { background: rgba(160, 160, 160, 0.08); }
.board-table tbody tr:nth-child(3) td { background: rgba(160, 92, 46, 0.08); }
.board-rank {
  display: inline-block;
  min-width: 22px;
  height: 22px;
  line-height: 22px;
  border-radius: 50%;
  background: #8A6A3B;
  color: #FFF8E4;
  font-size: 12px;
  font-weight: 800;
}
.board-rank.r1 { background: linear-gradient(180deg, #E9C55C, #C9A227); color: #5A3E00; }
.board-rank.r2 { background: linear-gradient(180deg, #C9CDD4, #9AA0A8); color: #3A3F45; }
.board-rank.r3 { background: linear-gradient(180deg, #D9A06B, #B5753A); color: #4A2500; }
.board-name {
  font-weight: 700;
  color: #4B3B2A;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.board-val { font-weight: 800; color: #B5463A; }
</style>
