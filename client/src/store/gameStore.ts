/**
 * 全局响应式游戏状态 Store（Vue 3 reactive，无 Pinia 依赖，轻量）
 * 支持两种模式：
 *   - single: 单机 vs AI（本地引擎）
 *   - lan: 局域网联机（Socket.IO）
 */
import { reactive, ref, computed } from 'vue';
import { getSocket, emit, disconnectSocket } from '../api/socket';
import { soundManager, type SfxType } from '../audio/SoundManager';
import { LocalEngine } from '../engine/localEngine';
import type { RoomStateView, Slot, PlayerId, CardView } from '../types/protocol';

// ===== 游戏模式 =====
export type GameMode = 'none' | 'single' | 'lan';
export const gameMode = ref<GameMode>('none');
let localEngine: LocalEngine | null = null;

// ===== 连接状态 =====
export const connected = ref(false);
export const connecting = ref(false);
export const lastError = ref<string | null>(null);

const SLOT_KEY = 'sanguosha_slot';

// ===== 桌面出牌展示区 =====
export interface PlayedCard {
  key: string;
  card: CardView;
  isMine: boolean;
  actorPid: number;
  attackPower?: number;
}
export const playedCards = reactive<PlayedCard[]>([]);
const MAX_PLAYED = 8;

// ===== 过场动画状态 =====
/** 绝杀过场动画（触发后 1.5s 自动关闭） */
export const ultimateAnimating = ref(false);
let ultimateTimer: ReturnType<typeof setTimeout> | null = null;
function triggerUltimateAnim(): void {
  if (ultimateTimer) clearTimeout(ultimateTimer);
  ultimateAnimating.value = true;
  ultimateTimer = setTimeout(() => { ultimateAnimating.value = false; }, 2000);
}

/** 胜负过场动画（触发后 3s 自动关闭，给旗帜/跪地动画完整播放时间） */
export const gameOverAnimating = ref(false);
/** 游戏结束但延迟播放动画（让玩家看清最后一手出牌） */
export const gameOverPending = ref(false);
let gameOverTimer: ReturnType<typeof setTimeout> | null = null;
let gameOverDelayTimer: ReturnType<typeof setTimeout> | null = null;
function triggerGameOverAnim(): void {
  if (gameOverTimer) clearTimeout(gameOverTimer);
  gameOverAnimating.value = true;
  gameOverTimer = setTimeout(() => { gameOverAnimating.value = false; }, 5000);
}
/** 延迟触发胜负动画：先等 1.5s 让玩家看清最后出牌，再播动画 */
function triggerGameOverWithDelay(winner: number | null): void {
  gameOverPending.value = true;
  if (gameOverDelayTimer) clearTimeout(gameOverDelayTimer);
  gameOverDelayTimer = setTimeout(() => {
    gameOverPending.value = false;
    // 延迟结束后设置 gameOver，触发胜负弹窗显示
    state.gameOver = true;
    triggerGameOverAnim();
    if (winner === state.yourPid) playSfx('win');
    else if (winner === null) playSfx('draw');
    else playSfx('lose');
  }, 1800);
}

function addPlayedCard(card: any, actorPid: number, attackPower?: number): void {
  const isMine = actorPid === state.yourPid;
  // 构造一个 CardView 兼容对象
  const cv: CardView = {
    uid: 'played_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    id: card.id,
    name: card.name,
    category: card.category as any,
    value: card.value,
    cost: card.cost,
    desc: '',
  };
  playedCards.push({ key: cv.uid, card: cv, isMine, actorPid, attackPower });
  // 满 8 张 → 只保留最后一张，清空前 7 张
  if (playedCards.length > MAX_PLAYED) {
    playedCards.splice(0, playedCards.length - 1);
  }
}

function clearPlayedCards(): void {
  playedCards.splice(0, playedCards.length);
}

// ===== 音效播放 =====
function playSfx(type: SfxType): void {
  soundManager.play(type);
}

/** 根据卡牌类别选择对应音效 */
function sfxForCard(category: string): SfxType {
  switch (category) {
    case 'general':       return 'play';
    case 'armor':         return 'armorLight';
    case 'function_qi':   return 'qi';
    case 'function_hp':   return 'heal';
    case 'strategy':      return 'strategy';
    case 'formation':     return 'formation';
    case 'ultimate':      return 'ultimate';
    case 'charm':         return 'strategy';
    default:              return 'play';
  }
}

// ===== 服务端推送的完整房间状态（严格按视角过滤） =====
export const state = reactive<RoomStateView>({
  roomId: '',
  started: false,
  yourSlot: null,
  yourPid: null,
  roundCount: 1,
  turnPhase: 'action',
  activePid: 0,
  defensePid: null,
  isReflect: false,
  emergencyHealPid: null,
  firstPlayerPid: 0,
  guiBeiProtectorPid: null,
  guiBeiRemainingTurns: 0,
  deckCount: 0,
  discardCount: 0,
  actionEnded: [false, false],
  you: emptyPlayer(0, '我'),
  opponent: emptyPlayer(1, '对手'),
  gameOver: false,
  winner: null,
  gameOverDetail: null,
  logs: [],
});

function emptyPlayer(pid: PlayerId, name: string): any {
  return {
    pid, name, hp: 8, hpMax: 12, qi: 6,
    handCount: 0, handCards: [], strategies: [],
    usedNormalQi: false, usedBigQi: false,
  };
}

// ===== 业务常用计算属性 =====
export const isMyTurn = computed(() => state.yourPid !== null && state.activePid === state.yourPid);
export const isAwaitingDefense = computed(() => state.defensePid !== null && state.defensePid === state.yourPid);
export const isEmergencyHealing = computed(() => state.emergencyHealPid !== null && state.emergencyHealPid === state.yourPid);
export const canEndTurn = computed(() => {
  if (!state.started || state.gameOver) return false;
  if (!isMyTurn.value) return false;
  if (state.defensePid !== null) return false;
  if (state.emergencyHealPid !== null) return false;
  if (state.yourPid !== null && state.actionEnded[state.yourPid]) return false;
  return true;
});
export const canConfirmDefend = computed(() => isAwaitingDefense.value);
export const canGiveUpHeal = computed(() => isEmergencyHealing.value);

// ===== 事件总线 =====
export const toastLogs = reactive<string[]>([]);
export function pushToast(msg: string): void {
  toastLogs.unshift(msg);
  if (toastLogs.length > 6) toastLogs.pop();
  setTimeout(() => { if (toastLogs.length) toastLogs.pop(); }, 3200);
}

/** 将服务端/本地引擎推送的 RoomStateView 应用到响应式 state */
function applyRoomState(s: RoomStateView): void {
  // 胜负动画延迟期间：暂缓设置 gameOver，让玩家看清最后一手出牌
  if (gameOverPending.value && s.gameOver) {
    const deferred = { ...s, gameOver: false };
    Object.assign(state, deferred);
  } else {
    Object.assign(state, s);
  }
  state.you = { ...s.you, handCards: [...(s.you?.handCards || [])], strategies: [...(s.you?.strategies || [])] };
  // 单机模式下对手手牌也可暴露给 AI 面板（但 UI 不显示），局域网模式永远为空
  state.opponent = { ...s.opponent, handCards: [], strategies: [...(s.opponent?.strategies || [])] };
  state.logs = [...(s.logs || [])];
}

// ===== 初始化 =====
let _inited = false;
export function initStore(): void {
  if (_inited) return;
  _inited = true;
  const socket = getSocket();
  socket.on('connect', () => {
    connected.value = true; connecting.value = false;
    const savedSlot = (typeof localStorage !== 'undefined' && localStorage.getItem(SLOT_KEY)) as Slot | null;
    if (savedSlot) {
      joinRoom().catch(() => {});
    }
  });
  socket.on('disconnect', () => {
    connected.value = false;
    pushToast('⚠ 断线，正在尝试重连...');
  });
  socket.on('connect_error', (e: any) => { lastError.value = e?.message || '连接失败'; connecting.value = false; });

  socket.on('roomState', (s) => { applyRoomState(s); });
  socket.on('eventGameStart', (d) => {
    pushToast(`🎮 对局开始 · 先手方：玩家${d.firstPlayerPid + 1}`);
    clearPlayedCards();
  });
  socket.on('eventPlayCard', (d: any) => {
    const who = d.actorPid === state.yourPid ? '你' : `玩家${d.actorPid + 1}`;
    pushToast(`${who} 打出【${d.card.name}】`);
    // 添加到桌面展示区
    addPlayedCard(d.card, d.actorPid, d.attackPower);
    // 播放音效
    playSfx(sfxForCard(d.card.category));
    // 武将攻击 → 追加攻击音效
    if (d.result?.triggeredDamage) {
      setTimeout(() => playSfx('hitLight'), 200);
    }
    if (d.result?.triggeredUltimate) {
      triggerUltimateAnim();
      playSfx('ultimate');
    }
  });
  socket.on('eventDamage', (d) => {
    if (d.message) pushToast('⚔ ' + d.message);
    playSfx('hitHeavy');
  });
  socket.on('eventBuffChange', (d) => {
    const who = d.actorPid === state.yourPid ? '你' : `玩家${d.actorPid + 1}`;
    pushToast(`✨ ${who} ${d.message}`);
    if (d.type === 'normal' || d.type === 'big') playSfx('qi');
    else if (d.type === 'burst') playSfx('strategy');
  });
  socket.on('eventGameOver', (d) => {
    // 延迟播放胜负动画：先等 1.8s 让玩家看清最后一手出牌
    triggerGameOverWithDelay(d.winner);
    if (d.winner === state.yourPid) {
      pushToast('🎉 恭喜你获胜！');
    } else if (d.winner === null) {
      pushToast('🤝 平局');
    } else {
      pushToast('💀 你输了，下次再战！');
    }
  });
  socket.on('eventTurnEnd', () => {
    pushToast('📜 回合结束 · 进入下一轮');
    // 回合结束时清空桌面展示区
    clearPlayedCards();
  });
  socket.on('eventPlayerLeave', (d) => {
    pushToast(`⚠ 玩家 ${d.slot === 'p1' ? '1' : '2'} 已断开连接`);
  });
  socket.on('eventRoomReset', () => {
    pushToast('♻ 房间已重置，等待重新加入');
    clearPlayedCards();
  });
}

// ===== 模式入口 =====

/** 启动单机模式 */
export function startSingle(): void {
  gameMode.value = 'single';
  clearPlayedCards();
  localEngine = new LocalEngine({
    onRoomState: (s) => { applyRoomState(s); },
    onEventPlayCard: (d) => {
      const who = d.actorPid === state.yourPid ? '你' : 'AI';
      pushToast(`${who} 打出【${d.card.name}】`);
      addPlayedCard(d.card, d.actorPid, d.attackPower);
      playSfx(sfxForCard(d.card.category));
      if (d.result?.triggeredDamage) setTimeout(() => playSfx('hitLight'), 200);
      if (d.result?.triggeredUltimate) { triggerUltimateAnim(); playSfx('ultimate'); }
    },
    onEventDamage: (d) => {
      if (d.message) pushToast('⚔ ' + d.message);
      playSfx('hitHeavy');
    },
    onEventBuffChange: (d) => {
      const who = d.actorPid === state.yourPid ? '你' : 'AI';
      pushToast(`✨ ${who} ${d.message}`);
      if (d.type === 'normal' || d.type === 'big') playSfx('qi');
      else if (d.type === 'burst') playSfx('strategy');
    },
    onEventGameOver: (d) => {
      triggerGameOverAnim();
      if (d.winner === state.yourPid) { pushToast('🎉 恭喜你获胜！'); playSfx('win'); }
      else if (d.winner === null) { pushToast('🤝 平局'); playSfx('draw'); }
      else { pushToast('💀 你输了，下次再战！'); playSfx('lose'); }
    },
    onEventTurnEnd: () => {
      pushToast('📜 回合结束 · 进入下一轮');
      clearPlayedCards();
    },
    onEventGameStart: (d) => {
      pushToast(`🎮 对局开始 · 先手方：${d.firstPlayerPid === state.yourPid ? '你' : 'AI'}`);
    },
    onEventRoomReset: () => {
      pushToast('♻ 新对局开始');
      clearPlayedCards();
    },
  });
  localEngine.startGame();
}

/** 启动局域网模式 */
export function startLan(): void {
  gameMode.value = 'lan';
  initStore();
  joinRoom().catch(() => {});
}

/** 返回入口页 */
export function exitToEntry(): void {
  if (localEngine) {
    localEngine.destroy();
    localEngine = null;
  }
  disconnectSocket();
  gameMode.value = 'none';
  // 清空状态
  state.started = false;
  state.yourSlot = null;
  state.yourPid = null;
  state.gameOver = false;
  ultimateAnimating.value = false;
  gameOverAnimating.value = false;
  gameOverPending.value = false;
  if (gameOverDelayTimer) { clearTimeout(gameOverDelayTimer); gameOverDelayTimer = null; }
  clearPlayedCards();
}

// ===== Action 封装（根据模式分流） =====

export async function playCard(cardUid: string): Promise<{ ok: boolean; msg: string }> {
  if (gameMode.value === 'single' && localEngine) {
    const r = localEngine.playCard(cardUid);
    if (!r.ok) pushToast('❌ ' + r.message);
    return { ok: r.ok, msg: r.message };
  }
  const { ok, data } = await emit('playCard', { cardUid });
  if (!ok) pushToast('❌ ' + (data?.error || '出牌失败'));
  return { ok, msg: data?.message || data?.error || '' };
}

export async function useBonus(type: 'normal' | 'big' | 'burst'): Promise<{ ok: boolean; msg: string }> {
  if (gameMode.value === 'single' && localEngine) {
    const r = localEngine.useBonus(type);
    if (!r.ok) pushToast('❌ ' + r.message);
    return { ok: r.ok, msg: r.message };
  }
  const { ok, data } = await emit('useBonus', { type });
  if (!ok) pushToast('❌ ' + (data?.error || '使用失败'));
  return { ok, msg: data?.message || data?.error || '' };
}

export async function confirmDefend(): Promise<{ ok: boolean; msg: string }> {
  if (gameMode.value === 'single' && localEngine) {
    const r = localEngine.confirmDefend();
    if (!r.ok) pushToast('❌ ' + r.message);
    return { ok: r.ok, msg: r.message };
  }
  const { ok, data } = await emit('confirmDefend', {});
  if (!ok) pushToast('❌ ' + (data?.error || '操作失败'));
  return { ok, msg: data?.message || data?.error || '' };
}

export async function giveUpHeal(): Promise<{ ok: boolean; msg: string }> {
  if (gameMode.value === 'single' && localEngine) {
    const r = localEngine.giveUpHeal();
    if (!r.ok) pushToast('❌ ' + r.message);
    return { ok: r.ok, msg: r.message };
  }
  const { ok, data } = await emit('giveUpEmergencyHeal', {});
  if (!ok) pushToast('❌ ' + (data?.error || '操作失败'));
  return { ok, msg: data?.message || data?.error || '' };
}

export async function endAction(): Promise<{ ok: boolean; msg: string }> {
  if (gameMode.value === 'single' && localEngine) {
    const r = localEngine.endAction();
    if (!r.ok) pushToast('❌ ' + r.message);
    return { ok: r.ok, msg: r.message };
  }
  const { ok, data } = await emit('readyNextTurn', {});
  if (!ok) pushToast('❌ ' + (data?.error || '操作失败'));
  return { ok, msg: data?.message || data?.error || '' };
}

export async function resetRoom(): Promise<{ ok: boolean; msg: string }> {
  if (gameMode.value === 'single' && localEngine) {
    localEngine.resetRoom();
    return { ok: true, msg: '新对局已开始' };
  }
  const { ok, data } = await emit('resetRoom', {});
  if (!ok) pushToast('❌ ' + (data?.error || '重置失败'));
  return { ok, msg: data?.message || '' };
}

/** 加入房间（局域网模式） */
export async function joinRoom(name?: string): Promise<{ ok: boolean; msg: string }> {
  connecting.value = true;
  try {
    const s = getSocket();
    if (!s.connected) await new Promise<void>((resolve) => {
      s.once('connect', () => resolve());
      setTimeout(() => resolve(), 3500);
    });
    const preferSlot = (typeof localStorage !== 'undefined' && localStorage.getItem(SLOT_KEY)) as Slot | null;
    const { ok, data } = await emit('joinRoom', { name, preferSlot: preferSlot || undefined });
    if (!ok) { lastError.value = data?.error || '加入房间失败'; return { ok: false, msg: data?.error || '加入房间失败' }; }
    if (typeof localStorage !== 'undefined' && data.slot) {
      localStorage.setItem(SLOT_KEY, data.slot);
    }
    pushToast(`已加入房间：你是 ${data.slot.toUpperCase()}（玩家${(data.pid as number) + 1}）${preferSlot ? ' · 重连' : ''}`);
    return { ok: true, msg: '已加入' };
  } finally {
    connecting.value = false;
  }
}

