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
  | 'formation';

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
  emergencyHealPid: PlayerId | null;
  firstPlayerPid: PlayerId;
  deckCount: number;
  discardCount: number;
  /** 双方是否已结束行动 */
  actionEnded: [boolean, boolean];
  you: PlayerView;
  opponent: PlayerView;
  gameOver: boolean;
  winner: PlayerId | null;
  gameOverDetail: string | null;
  logs: string[];
}

// ====== 客户端 → 服务端（emit 带 ack）======
export interface ClientEvents {
  joinRoom: (payload: { roomId?: string; name?: string; preferSlot?: Slot }, ack?: (ok: boolean, data: any) => void) => void;
  playCard: (payload: { cardUid: string }, ack?: (ok: boolean, data: any) => void) => void;
  useBonus: (payload: { type: 'normal' | 'big' | 'burst' }, ack?: (ok: boolean, data: any) => void) => void;
  confirmDefend: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  giveUpEmergencyHeal: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  readyNextTurn: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
  resetRoom: (payload?: {}, ack?: (ok: boolean, data: any) => void) => void;
}

// ====== 服务端 → 客户端（on）======
export interface ServerEvents {
  roomState: (state: RoomStateView) => void;
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
    };
  }) => void;
  eventDamage: (data: { actorPid?: PlayerId; message: string }) => void;
  eventBuffChange: (data: { actorPid: PlayerId; type: string; message: string }) => void;
  eventGameOver: (data: { winner: PlayerId | null; reason: string | null; detail: string | null }) => void;
  eventTurnEnd: (data: { nextRoundCount: number; nextFirstPid: PlayerId }) => void;
  eventPlayerLeave: (data: { slot: Slot }) => void;
  eventRoomReset: () => void;
}
