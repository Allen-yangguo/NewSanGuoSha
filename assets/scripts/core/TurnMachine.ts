/**
 * 三国卡牌对战 · 回合时序状态机
 * 严格按文档时序：行动 → 受击防御 → 回合终局结算 → 补牌 → 互换先手
 *
 * 注：受击防御阶段是「行动阶段内的子状态」
 * 即先手玩家打出武将攻击后，后手玩家立即响应（防具/八卦阵/承受），
 * 结算完毕后回到行动阶段，先手玩家可继续连击或结束回合。
 */
import { TurnPhase, PlayerId } from './types';

/** 行动阶段内的子状态 */
export enum ActionSubPhase {
  Idle = 'idle',                 // 等待先手玩家出牌
  AwaitingDefense = 'awaiting_defense', // 等待后手玩家防御响应
}

export class TurnMachine {
  /** 当前回合阶段 */
  phase: TurnPhase = TurnPhase.Action;
  /** 行动阶段子状态 */
  subPhase: ActionSubPhase = ActionSubPhase.Idle;
  /** 当前先手玩家 */
  firstPlayer: PlayerId = 0;
  /** 当前行动玩家（出牌方） */
  activePlayer: PlayerId = 0;

  /** 是否处于行动阶段 */
  isInActionPhase(): boolean {
    return this.phase === TurnPhase.Action;
  }

  /** 是否在等待防御响应 */
  isAwaitingDefense(): boolean {
    return this.phase === TurnPhase.Action && this.subPhase === ActionSubPhase.AwaitingDefense;
  }

  /** 进入等待防御子状态（先手打出武将攻击后调用） */
  enterDefenseResponse(): void {
    this.subPhase = ActionSubPhase.AwaitingDefense;
  }

  /** 退出防御子状态，回到行动阶段（伤害结算完毕） */
  exitDefenseResponse(): void {
    this.subPhase = ActionSubPhase.Idle;
  }

  /** 推进到下一阶段（回合终局 → 补牌 → 互换先手 → 行动） */
  advancePhase(): TurnPhase {
    switch (this.phase) {
      case TurnPhase.Action:
        this.phase = TurnPhase.Settle;
        break;
      case TurnPhase.Settle:
        this.phase = TurnPhase.Draw;
        break;
      case TurnPhase.Draw:
        this.phase = TurnPhase.SwitchFirst;
        break;
      case TurnPhase.SwitchFirst:
        this.phase = TurnPhase.Action;
        this.subPhase = ActionSubPhase.Idle;
        break;
    }
    return this.phase;
  }

  /** 设置先手玩家 */
  setFirstPlayer(p: PlayerId): void {
    this.firstPlayer = p;
    this.activePlayer = p;
  }

  /** 设置当前行动玩家 */
  setActivePlayer(p: PlayerId): void {
    this.activePlayer = p;
  }

  /** 重置到行动阶段初始状态 */
  resetToAction(): void {
    this.phase = TurnPhase.Action;
    this.subPhase = ActionSubPhase.Idle;
    this.activePlayer = this.firstPlayer;
  }
}
