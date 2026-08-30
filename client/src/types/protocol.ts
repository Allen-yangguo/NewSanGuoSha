/**
 * 前后端 Socket.IO 协议类型（与 server/server.ts 严格对齐）
 *
 * 设计原则：
 *  - 客户端仅订阅事件 + 调用 action（不做任何业务规则判断）
 *  - 「是否我能出牌」只看 state.activePid + state.turnPhase
 *  - 「能否出牌」合法性由服务端判定，客户端只显示 ok/error
 */

// ====== 公共基础 ======
export type PlayerId = 0 | 1;
export type Slot = 'p1' | 'p2';

// TurnPhase 与 types.ts 保持一致
export type TurnPhase = 'action' | 'defense' | 'settle' | 'draw' | 'switch_first';

export interface StrategyView {
  type: string; // 'mengde' | 'sunzi'
  layers: number;
  remainingTurns: number;
  sourceCardUid?: string; // 用于区分手动爆气
}

export interface CardView {
  uid: string;
  id: string;
  name: string;
  category: CardCategory;
  subtype?: string;
  value: number;
  cost: number;
  desc: string;
}

export type CardCategory =
  | 'general'
  | 'armor'
  | 'function_qi'
  | 'function_hp'
  | 'strategy'
  | 'ultimate'
  | 'formation'
  | 'charm'
  | 'strategist';

/** 锦囊标记视图 */
export interface PouchView {
  strategistId: string;
  strategistName: string;
  que: boolean;
  can: boolean;
  ji: boolean;
  /** 仅本人视角：当前可用的锦囊选项 */
  options?: Array<{
    pouch: 'que' | 'can' | 'ji';
    pouchName: string;
    choices: Array<{ choice: string; name: string; desc: string }>;
  }>;
}

export interface PlayerView {
  pid: PlayerId;
  name: string;
  hp: number;
  hpMax: number;
  qi: number;
  handCount: number;
  /** 只有自己视角才会有，对手永远为 [] */
  handCards: CardView[];
  strategies: StrategyView[];
  usedNormalQi: boolean;
  usedBigQi: boolean;
  pouches: PouchView[];
  yulin: { active: boolean; remainingTurns: number };
}

export interface RoomStateView {
  roomId: string;
  started: boolean;
  yourSlot: Slot | null;
  yourPid: PlayerId | null;
  roundCount: number;
  turnPhase: TurnPhase;
  activePid: PlayerId;
  defensePid: PlayerId | null;
  /** 当前防御响应是否为八卦阵反弹受击（true 时仅允许出防具，不可再出八卦阵） */
  isReflect: boolean;
  emergencyHealPid: PlayerId | null;
  /** 绝杀急救等待中的玩家 pid（null=无），该玩家可选择是否使用急锦囊自救 */
  ultimateSavePid: PlayerId | null;
  firstPlayerPid: PlayerId;
  /** 龟背阵保护方 pid（null=未激活） */
  guiBeiProtectorPid: PlayerId | null;
  /** 龟背阵减攻层数 */
  guiBeiLayers: number;
  /** 龟背阵剩余持续回合数 */
  guiBeiRemainingTurns: number;
  /** 双方实时战斗分（攻击命中累计） */
  combatScores: [number, number];
  deckCount: number;
  discardCount: number;
  /** 桌面已打出卡牌数（回合结束清入弃牌堆） */
  tableCount: number;
  /** 双方是否已结束行动 */
  actionEnded: [boolean, boolean];
  you: PlayerView;
  opponent: PlayerView;
  gameOver: boolean;
  winner: PlayerId | null;
  gameOverDetail: string | null;
  logs: string[];
}

// ====== 大厅：5 桌并行 ======
/** 单个座位在大厅的视图 */
export interface TableSeatView {
  /** null=空座；有玩家时显示昵称 */
  name: string | null;
  ready: boolean;
  /** 在线(true)/掉线重连中(false) */
  present: boolean;
}
/** 单桌摘要（大厅列表用） */
export interface TableSummary {
  id: number;
  started: boolean;
  /** 对局是否已结束(gameOver,等待「再来一局」) */
  gameOver: boolean;
  p1: TableSeatView;
  p2: TableSeatView;
}

// ===== 局末结算 =====
export interface SettlementBreakdown {
  combatScore: number;
  firstBlood: number;
  victoryBonus: number;
  speedBonus: number;
  hpBonus: number;
  lossPenalty: number;
}

export interface GameSettlementView {
  winner: PlayerId | null;
  scores: [number, number];
  breakdown: [SettlementBreakdown, SettlementBreakdown];
  roundCount: number;
}

// ===== 用户战绩 =====
export interface RecordView {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  totalScore: number;
  level: number;
  levelName: string;
  winRate: number;
  nextLevelScore: number;
}

// ====== 客户端 → 服务端（emit 带 ack）======
export interface ClientEvents {
  joinRoom: (payload: { roomId?: string; name?: string; preferSlot?: Slot }, ack?: (ok: boolean, data: any) => void) => void;
  /** 大厅：在指定桌的指定座位坐下 */
  sitDown: (payload: { tableId: number; slot: Slot; name?: string }, ack?: (ok: boolean, data: { tableId: number; slot: Slot; pid: PlayerId; started: boolean } | { error: string }) => void) => void;
  /** 大厅：站起（离开座位）*/
  standUp: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  /** 大厅：准备（双方都准备才开局）*/
  ready: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  /** 大厅：取消准备 */
  cancelReady: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  /** 大厅：拉取所有桌摘要 */
  getTableList: (payload?: {}, ack?: (ok: boolean, data: TableSummary[]) => void) => void;
  playCard: (payload: { cardUid: string }, ack?: (ok: boolean, data: any) => void) => void;
  /** 使用智者锦囊 */
  usePouch: (payload: { strategistId: string; pouch: 'que' | 'can' | 'ji'; choice: string }, ack?: (ok: boolean, data: any) => void) => void;
  /** 旁观对局: 选择任意一方视角 */
  spectate: (payload: { tableId: number; pid: 0 | 1 }, ack?: (ok: boolean, data: any) => void) => void;
  /** 退出旁观 */
  spectateExit: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  useBonus: (payload: { type: 'normal' | 'big' | 'burst' }, ack?: (ok: boolean, data: any) => void) => void;
  confirmDefend: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  giveUpEmergencyHeal: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  useUltimatePouch: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  giveUpUltimateSave: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  /** 对局中主动离开(强退: 扣 50 分;模拟玩家留桌,桌重置为未准备) */
  leaveGame: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  readyNextTurn: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  resetRoom: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  getRecord: (payload?: {}, ack?: (ok: boolean, data: RecordView | null) => void) => void;
  submitSettlement: (payload: { settlement: GameSettlementView; myPid: PlayerId }, ack?: (ok: boolean, data: any) => void) => void;
}

// ====== 服务端 → 客户端（on）======
export interface ServerEvents {
  roomState: (state: RoomStateView) => void;
  /** 大厅：全桌列表更新 */
  tableList: (data: TableSummary[]) => void;
  /** 大厅：单桌状态更新 */
  tableUpdate: (data: TableSummary) => void;
  eventGameStart: (data: { firstPlayerPid: PlayerId }) => void;
  eventPlayCard: (data: {
    actorPid: PlayerId;
    card: { id: string; name: string; category: string; value: number; cost: number };
    result: {
      triggeredDamage: boolean;
      triggeredReflect: boolean;
      triggeredHeal: boolean;
      triggeredQi: boolean;
      triggeredUltimate: boolean;
      triggeredCharm: boolean;
    };
  }) => void;
  eventPouchUsed: (data: { actorPid: PlayerId; message: string }) => void;
  eventDamage: (data: { actorPid?: PlayerId; message: string }) => void;
  eventBuffChange: (data: { actorPid: PlayerId; type: string; message: string }) => void;
  eventGameOver: (data: { winner: PlayerId | null; reason: string | null; detail: string | null; instant?: boolean }) => void;
  eventGameSettlement: (data: GameSettlementView) => void;
  eventTurnEnd: (data: { nextRoundCount?: number; nextFirstPid?: PlayerId; message?: string; gameOver?: boolean }) => void;
  eventUltimateSave: (data: { actorPid: PlayerId; saved: boolean; message: string }) => void;
  /** 对局被终止(真人强退/离线超时): 桌重置为未准备 */
  eventGameAborted: (data: { bySlot: Slot; byName: string }) => void;
  /** 对方请求「再来一局」 */
  eventRematchRequest: (data: { slot: Slot }) => void;
  eventPlayerLeave: (data: { slot: Slot }) => void;
  eventRoomReset: () => void;
}
