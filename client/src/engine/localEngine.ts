/**
 * 单机模式 · 本地引擎适配层
 *
 * 功能：
 * 1. 实例化核心 GameEngine，在浏览器中直接跑
 * 2. 把引擎内部状态映射为 RoomStateView（复用前端 UI）
 * 3. 实现 AI 对手决策逻辑
 * 4. 模拟 Socket 事件回调（eventPlayCard / eventDamage 等），复用音效和 toast
 */
import {
  GameEngine,
} from '@core/GameEngine';
import {
  CardCategory,
  CardInstance,
  PlayerId,
  PlayerState,
  TurnPhase,
  StrategyType,
  UltimateType,
  FormationType,
  StrategyRecord,
} from '@core/types';
import {
  applyCardEffect,
  EffectResult,
} from '@core/CardEffect';
import type {
  RoomStateView,
  CardView,
  PlayerView,
  StrategyView,
  Slot,
} from '../types/protocol';
import { soundManager, type SfxType } from '../audio/SoundManager';

// ====== 单机模式事件回调（与局域网事件对齐） ======
export interface LocalEventCallbacks {
  onRoomState: (s: RoomStateView) => void;
  onEventPlayCard: (d: {
    actorPid: PlayerId;
    card: { id: string; name: string; category: string; value: number; cost: number };
    result: EffectResult;
    attackPower?: number;
  }) => void;
  onEventDamage: (d: { actorPid?: PlayerId; message: string }) => void;
  onEventBuffChange: (d: { actorPid: PlayerId; type: string; message: string }) => void;
  onEventGameOver: (d: { winner: PlayerId | null; reason: string | null; detail: string | null }) => void;
  onEventTurnEnd: (d: { nextRoundCount: number; nextFirstPid: PlayerId }) => void;
  onEventGameStart: (d: { firstPlayerPid: PlayerId }) => void;
  onEventRoomReset: () => void;
}

const HUMAN_PID: PlayerId = 0;
const AI_PID: PlayerId = 1;

export class LocalEngine {
  private engine: GameEngine;
  private cb: LocalEventCallbacks;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(cb: LocalEventCallbacks) {
    this.cb = cb;
    this.engine = new GameEngine();
  }

  /** 启动新对局 */
  startGame(): void {
    this.engine = new GameEngine();
    this.engine.initGame();
    this.cb.onEventGameStart({ firstPlayerPid: this.engine.state.firstPlayer });
    this.pushState();
    // 如果 AI 先手，延迟触发 AI 行动
    this.maybeScheduleAI();
  }

  /** 重置下一局 */
  resetRoom(): void {
    this.cb.onEventRoomReset();
    this.startGame();
  }

  // ====== 玩家操作（人类 = pid 0）======

  playCard(cardUid: string): { ok: boolean; message: string } {
    if (this.engine.state.gameOver) return { ok: false, message: '游戏已结束' };
    const card = this.findCardInHand(HUMAN_PID, cardUid);
    if (!card) return { ok: false, message: '找不到该卡牌' };

    // 紧急救血阶段：只能打出补血牌
    if (this.engine.emergencyHealPending === HUMAN_PID) {
      if (card.def.category !== CardCategory.FunctionHp) {
        return { ok: false, message: '紧急救血阶段只能打出补血牌' };
      }
    }

    // 防御阶段：只能打防具/八卦阵
    if (this.engine.turn.isAwaitingDefense()) {
      if (card.def.category !== CardCategory.Armor && card.def.category !== CardCategory.Formation) {
        return { ok: false, message: '防御阶段只能打出防具或八卦阵' };
      }
    }

    const result = applyCardEffect(this.engine, card, HUMAN_PID);
    if (result.ok) {
      this.firePlayCardEvent(HUMAN_PID, card, result);
      this.pushState();
      // 检查游戏结束
      if (this.engine.state.gameOver) {
        this.fireGameOver();
        return result;
      }
      // 尝试自动防御结算
      this.tryAutoDefendResolve();
      if (this.engine.state.gameOver) return result;
      // 行动阶段：无牌可出时自动结束行动
      this.tryAutoEndAction();
      // 调度 AI
      this.maybeScheduleAI();
    }
    return result;
  }

  useBonus(type: 'normal' | 'big' | 'burst'): { ok: boolean; message: string } {
    let result: EffectResult;
    if (type === 'normal') result = this.engine.useNormalQiButton(HUMAN_PID);
    else if (type === 'big') result = this.engine.useBigQiButton(HUMAN_PID);
    else result = this.engine.useManualBurst(HUMAN_PID);

    if (result.ok) {
      this.cb.onEventBuffChange({
        actorPid: HUMAN_PID,
        type,
        message: result.message,
      });
      this.playSfx(type === 'burst' ? 'strategy' : 'qi');
      this.pushState();
      if (!this.engine.state.gameOver) {
        this.tryAutoEndAction();
      }
      this.maybeScheduleAI();
    }
    return { ok: result.ok, message: result.message };
  }

  confirmDefend(): { ok: boolean; message: string } {
    const result = this.engine.defenderPass();
    if (result.ok) {
      this.cb.onEventDamage({ message: result.message });
      this.playSfx('hitHeavy');
      this.pushState();
      if (this.engine.state.gameOver) {
        this.fireGameOver();
        return result;
      }
      this.maybeScheduleAI();
    }
    return result;
  }

  /**
   * 尝试自动防御结算：
   * 1. 防具累计 >= 攻击伤害 → 自动通过
   * 2. 防御方手中没有防具牌也没有八卦阵 → 自动承受伤害
   */
  private tryAutoDefendResolve(): void {
    if (!this.engine.turn.isAwaitingDefense()) return;
    if (this.engine.baguaTriggered) return; // 八卦阵已触发，等待反弹流程
    const atk = this.engine.pendingAttack;
    if (!atk) return;

    const defender = this.engine.state.players[atk.defender];
    // 条件1：防具已完全抵消
    if (this.engine.defensePool >= atk.damage) {
      this.doAutoDefendResolve();
      return;
    }
    // 条件2：防御方手中没有防具牌也没有八卦阵
    const hasArmor = defender.hand.some((c: CardInstance) => c.def.category === CardCategory.Armor);
    const hasBagua = defender.hand.some((c: CardInstance) =>
      c.def.category === CardCategory.Formation && c.def.subtype === FormationType.BaGua);
    if (!hasArmor && !hasBagua) {
      this.doAutoDefendResolve();
    }
  }

  private doAutoDefendResolve(): void {
    const dr = this.engine.defenderPass();
    if (dr.ok) {
      this.cb.onEventDamage({ message: dr.message });
      this.playSfx('hitHeavy');
      this.pushState();
      if (this.engine.state.gameOver) {
        this.fireGameOver();
      }
    }
  }

  /**
   * 行动阶段：当前行动玩家无牌可出时自动结束行动
   */
  private tryAutoEndAction(): void {
    if (this.engine.state.gameOver) return;
    if (!this.engine.turn.isInActionPhase()) return;
    const actor = this.engine.turn.activePlayer;
    if (this.engine.state.actionEnded[actor]) return;
    if (this.engine.canPlayAnyCard(actor)) return;
    // 无牌可出 → 自动结束行动
    this.endAction();
  }

  giveUpHeal(): { ok: boolean; message: string } {
    const result = this.engine.emergencyHealGiveUp();
    if (result.ok) {
      this.pushState();
      if (this.engine.state.gameOver) {
        this.fireGameOver();
      }
    }
    return result;
  }

  endAction(): { ok: boolean; message: string } {
    const result = this.engine.endActionPhase();
    if (result.ok) {
      this.pushState();
      // 如果触发了回合结束
      if (result.message.includes('回合结束')) {
        this.fireTurnEnd();
      }
      if (this.engine.state.gameOver) {
        this.fireGameOver();
        return result;
      }
      this.maybeScheduleAI();
    }
    return result;
  }

  // ====== AI 决策 ======

  private maybeScheduleAI(): void {
    if (this.engine.state.gameOver) return;

    // 如果人类玩家是防御方，先尝试自动防御结算（没有防具/八卦阵时直接承受）
    if (this.engine.turn.isAwaitingDefense()
      && !this.engine.baguaTriggered
      && this.engine.pendingAttack?.defender === HUMAN_PID) {
      this.tryAutoDefendResolve();
      if (this.engine.state.gameOver) return;
      // 如果自动结算后仍在防御阶段（玩家有防具可选），不调度 AI
      if (this.engine.turn.isAwaitingDefense()) return;
    }

    // AI 需要行动的情况：
    // 1. 行动阶段轮到 AI
    // 2. 防御阶段 AI 是防御方
    // 3. 紧急救血阶段 AI 需要补血
    const needAct =
      (this.engine.turn.isInActionPhase() && this.engine.turn.activePlayer === AI_PID && !this.engine.state.actionEnded[AI_PID]) ||
      (this.engine.turn.isAwaitingDefense() && this.engine.pendingAttack?.defender === AI_PID) ||
      (this.engine.emergencyHealPending === AI_PID);

    if (needAct) {
      this.aiTimer = setTimeout(() => this.aiAct(), 1500 + Math.random() * 1000);
    }
  }

  private aiAct(): void {
    if (this.engine.state.gameOver) return;

    // 紧急救血
    if (this.engine.emergencyHealPending === AI_PID) {
      const healCard = this.engine.state.players[AI_PID].hand.find(
        (c: CardInstance) => c.def.category === CardCategory.FunctionHp,
      );
      if (healCard) {
        const r = applyCardEffect(this.engine, healCard, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, healCard, r);
          this.pushState();
          if (this.engine.state.gameOver) { this.fireGameOver(); return; }
        }
      } else {
        // 没有补血牌 → 放弃
        this.engine.emergencyHealGiveUp();
        this.pushState();
        if (this.engine.state.gameOver) { this.fireGameOver(); return; }
      }
      this.maybeScheduleAI();
      return;
    }

    // 防御响应
    if (this.engine.turn.isAwaitingDefense() && this.engine.pendingAttack?.defender === AI_PID) {
      this.aiDefend();
      return;
    }

    // 行动阶段
    if (this.engine.turn.isInActionPhase() && this.engine.turn.activePlayer === AI_PID && !this.engine.state.actionEnded[AI_PID]) {
      this.aiAction();
      return;
    }
  }

  /** AI 行动决策 */
  private aiAction(): void {
    const ai = this.engine.state.players[AI_PID];
    const opp = this.engine.state.players[HUMAN_PID];
    const hand: CardInstance[] = ai.hand;

    // 1. 如果气量充足且手中有绝杀牌，对手 HP <= 3 时使用绝杀
    if (opp.hp <= 3) {
      const ult = hand.find((c: CardInstance) => c.def.category === CardCategory.Ultimate);
      if (ult) {
        const r = applyCardEffect(this.engine, ult, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, ult, r);
          this.pushState();
          if (this.engine.state.gameOver) { this.fireGameOver(); return; }
          this.maybeScheduleAI();
          return;
        }
      }
    }

    // 2. 如果 HP <= 2 且手中有补血牌 → 补血
    if (ai.hp <= 2) {
      const heal = hand.find((c: CardInstance) => c.def.category === CardCategory.FunctionHp);
      if (heal) {
        const r = applyCardEffect(this.engine, heal, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, heal, r);
          this.pushState();
          this.maybeScheduleAI();
          return;
        }
      }
    }

    // 3. 气量 < 3 且有补气牌 → 补气
    if (ai.qi < 3) {
      const qiCard = hand.find((c: CardInstance) => c.def.category === CardCategory.FunctionQi);
      if (qiCard) {
        const r = applyCardEffect(this.engine, qiCard, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, qiCard, r);
          this.pushState();
          this.maybeScheduleAI();
          return;
        }
      }
      // 没有补气牌但有补气按钮
      if (!ai.usedNormalQi) {
        const r = this.engine.useNormalQiButton(AI_PID);
        if (r.ok) {
          this.cb.onEventBuffChange({ actorPid: AI_PID, type: 'normal', message: r.message });
          this.playSfx('qi');
          this.pushState();
          this.maybeScheduleAI();
          return;
        }
      }
    }

    // 4. 有武将攻击牌且气量够 → 攻击（优先高攻）
    const generals = hand
      .filter((c: CardInstance) => c.def.category === CardCategory.General)
      .sort((a: CardInstance, b: CardInstance) => b.def.value - a.def.value);
    for (const g of generals) {
      const cost = this.calcGeneralCost(g, ai);
      if (ai.qi >= cost) {
        const r = applyCardEffect(this.engine, g, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, g, r);
          this.pushState();
          if (this.engine.state.gameOver) { this.fireGameOver(); return; }
          this.maybeScheduleAI();
          return;
        }
      }
    }

    // 5. 有魅惑牌 → 对方有兵法层时削弱，或对方气高时扣气
    const charm = hand.find((c: CardInstance) => c.def.category === CardCategory.Charm);
    if (charm) {
      const oppStratLayers = opp.strategies.reduce(
        (sum: number, s: StrategyRecord) => sum + s.layers, 0);
      if (oppStratLayers > 0 || opp.qi >= 4) {
        const r = applyCardEffect(this.engine, charm, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, charm, r);
          this.pushState();
          this.maybeScheduleAI();
          return;
        }
      }
    }

    // 6. 有龟背阵且对方有武将牌 → 打出减伤
    const guibei = hand.find((c: CardInstance) =>
      c.def.category === CardCategory.Formation && c.def.subtype === FormationType.GuiBei);
    if (guibei && this.engine.hasGeneralInHand(HUMAN_PID)) {
      const r = applyCardEffect(this.engine, guibei, AI_PID);
      if (r.ok) {
        this.firePlayCardEvent(AI_PID, guibei, r);
        this.pushState();
        this.maybeScheduleAI();
        return;
      }
    }

    // 7. 气量充足时打兵法牌
    if (ai.qi >= 3) {
      const strat = hand.find((c: CardInstance) => c.def.category === CardCategory.Strategy);
      if (strat) {
        const r = applyCardEffect(this.engine, strat, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, strat, r);
          this.pushState();
          this.maybeScheduleAI();
          return;
        }
      }
    }

    // 8. 气量不足但有补气按钮
    if (!ai.usedNormalQi) {
      const r = this.engine.useNormalQiButton(AI_PID);
      if (r.ok) {
        this.cb.onEventBuffChange({ actorPid: AI_PID, type: 'normal', message: r.message });
        this.playSfx('qi');
        this.pushState();
        this.maybeScheduleAI();
        return;
      }
    }
    if (!ai.usedBigQi) {
      const r = this.engine.useBigQiButton(AI_PID);
      if (r.ok) {
        this.cb.onEventBuffChange({ actorPid: AI_PID, type: 'big', message: r.message });
        this.playSfx('qi');
        this.pushState();
        this.maybeScheduleAI();
        return;
      }
    }

    // 9. 无法出牌 → 结束行动
    const r = this.engine.endActionPhase();
    if (r.ok) {
      this.pushState();
      if (r.message.includes('回合结束')) {
        this.fireTurnEnd();
      }
      if (this.engine.state.gameOver) { this.fireGameOver(); return; }
      this.maybeScheduleAI();
    }
  }

  /** AI 防御决策 */
  private aiDefend(): void {
    const atk = this.engine.pendingAttack;
    if (!atk) return;
    const ai = this.engine.state.players[AI_PID];
    const incoming = atk.damage;

    // 如果伤害致命（HP 会归零）→ 尽力防御
    const wouldDie = ai.hp - incoming <= 0;

    // 1. 有八卦阵且非反弹/绝杀 → 反弹
    const bagua = ai.hand.find((c: CardInstance) => c.def.category === CardCategory.Formation && c.def.subtype === FormationType.BaGua);
    if (bagua && !atk.isReflect && atk.source !== 'ultimate') {
      const r = applyCardEffect(this.engine, bagua, AI_PID);
      if (r.ok) {
        this.firePlayCardEvent(AI_PID, bagua, r);
        this.pushState();
        // 八卦阵后需继续防御（反弹后 A 可出防具，但这里 AI 简化：直接确认防御）
        setTimeout(() => this.aiDefendContinue(), 1000);
        return;
      }
    }

    // 2. 如果伤害 > 1 或致命 → 出防具
    if (incoming > 1 || wouldDie) {
      const armors = ai.hand
        .filter((c: CardInstance) => c.def.category === CardCategory.Armor)
        .sort((a: CardInstance, b: CardInstance) => b.def.value - a.def.value);
      for (const a of armors) {
        const r = applyCardEffect(this.engine, a, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, a, r);
          this.pushState();
          // 看是否需要继续出防具
          if (incoming - this.engine.defensePool > 0 && wouldDie) {
            setTimeout(() => this.aiDefendContinue(), 800);
            return;
          }
          break;
        }
      }
    }

    // 3. 确认防御
    this.aiConfirmDefend();
  }

  /** AI 防御后确认 */
  private aiDefendContinue(): void {
    // 再看是否需要出更多防具
    const atk = this.engine.pendingAttack;
    if (!atk) { this.aiConfirmDefend(); return; }
    const remaining = atk.damage - this.engine.defensePool;
    if (remaining > 0 && this.engine.state.players[AI_PID].hp - remaining <= 0) {
      // 还会死 → 再找防具
      const ai = this.engine.state.players[AI_PID];
      const armor = ai.hand.find((c: CardInstance) => c.def.category === CardCategory.Armor);
      if (armor) {
        const r = applyCardEffect(this.engine, armor, AI_PID);
        if (r.ok) {
          this.firePlayCardEvent(AI_PID, armor, r);
          this.pushState();
        }
      }
    }
    this.aiConfirmDefend();
  }

  private aiConfirmDefend(): void {
    const r = this.engine.defenderPass();
    if (r.ok) {
      this.cb.onEventDamage({ message: r.message });
      this.playSfx('hitHeavy');
      this.pushState();
      if (this.engine.state.gameOver) { this.fireGameOver(); return; }
      this.maybeScheduleAI();
    }
  }

  // ====== 工具方法 ======

  private calcGeneralCost(card: CardInstance, player: PlayerState): number {
    // 简化：直接用 card.def.cost，残血减 1 由引擎内部处理
    const cost = card.def.cost;
    return player.hp === 1 ? Math.max(0, cost - 1) : cost;
  }

  private findCardInHand(pid: PlayerId, uid: string): CardInstance | null {
    const p = this.engine.state.players[pid];
    return p.hand.find((c: CardInstance) => c.uid === uid) || null;
  }

  // ====== 状态映射 ======

  private pushState(): void {
    this.cb.onRoomState(this.buildView());
  }

  private buildView(): RoomStateView {
    const s = this.engine.state;
    const human = s.players[HUMAN_PID];
    const ai = s.players[AI_PID];

    return {
      roomId: 'local-single',
      started: true,
      yourSlot: 'p1' as Slot,
      yourPid: HUMAN_PID,
      roundCount: s.roundCount,
      turnPhase: this.mapPhase(s.phase),
      activePid: this.engine.turn.activePlayer,
      defensePid: this.engine.turn.isAwaitingDefense() ? this.engine.pendingAttack?.defender ?? null : null,
      isReflect: this.engine.turn.isAwaitingDefense() && this.engine.pendingAttack?.isReflect === true,
      emergencyHealPid: this.engine.emergencyHealPending,
      firstPlayerPid: s.firstPlayer,
      deckCount: s.deck.length,
      discardCount: s.discard.length,
      actionEnded: [s.actionEnded[0], s.actionEnded[1]],
      you: this.mapPlayer(human, true),
      opponent: this.mapPlayer(ai, false),
      gameOver: s.gameOver,
      winner: s.result?.winner ?? null,
      gameOverDetail: s.result?.detail ?? null,
      logs: [...this.engine.logs].slice(-50).reverse(),
    };
  }

  private mapPlayer(p: PlayerState, showHand: boolean): PlayerView {
    return {
      pid: p.id,
      name: p.id === HUMAN_PID ? '我' : 'AI 对手',
      hp: p.hp,
      hpMax: 12,
      qi: p.qi,
      handCount: p.hand.length,
      handCards: showHand ? p.hand.map(c => this.mapCard(c)) : [],
      strategies: p.strategies.map(s => this.mapStrategy(s)),
      usedNormalQi: p.usedNormalQi,
      usedBigQi: p.usedBigQi,
    };
  }

  private mapCard(c: CardInstance): CardView {
    return {
      uid: c.uid,
      id: c.def.id,
      name: c.def.name,
      category: c.def.category as any,
      subtype: c.def.subtype as any,
      value: c.def.value,
      cost: c.def.cost,
      desc: c.def.desc,
    };
  }

  private mapStrategy(s: StrategyRecord): StrategyView {
    return {
      type: s.type as string,
      layers: s.layers,
      remainingTurns: s.remainingTurns,
      sourceCardUid: s.sourceCardUid,
    };
  }

  private mapPhase(p: TurnPhase): RoomStateView['turnPhase'] {
    if (this.engine.turn.isAwaitingDefense()) return 'defense';
    switch (p) {
      case TurnPhase.Action: return 'action';
      case TurnPhase.Settle: return 'settle';
      case TurnPhase.Draw: return 'draw';
      case TurnPhase.SwitchFirst: return 'switch_first';
      default: return 'action';
    }
  }

  // ====== 事件触发 ======

  private firePlayCardEvent(actorPid: PlayerId, card: CardInstance, result: EffectResult): void {
    // 计算结算后攻击力（武将 → pendingAttack.damage，绝杀 → card.def.value）
    let attackPower: number | undefined;
    if (result.triggeredDamage && this.engine.pendingAttack) {
      attackPower = this.engine.pendingAttack.damage;
    } else if (result.triggeredUltimate) {
      attackPower = card.def.value;
    }
    this.cb.onEventPlayCard({
      actorPid,
      card: {
        id: card.def.id,
        name: card.def.name,
        category: card.def.category as string,
        value: card.def.value,
        cost: card.def.cost,
      },
      result,
      attackPower,
    });
    // 播放音效
    this.playSfx(this.sfxForCard(card.def.category as string));
    if (result.triggeredDamage) {
      setTimeout(() => this.playSfx('hitLight'), 200);
    }
  }

  private fireGameOver(): void {
    const s = this.engine.state;
    this.cb.onEventGameOver({
      winner: s.result?.winner ?? null,
      reason: s.result?.reason ?? null,
      detail: s.result?.detail ?? null,
    });
    const winner = s.result?.winner ?? null;
    if (winner === HUMAN_PID) this.playSfx('win');
    else if (winner === null) this.playSfx('draw');
    else this.playSfx('lose');
  }

  private fireTurnEnd(): void {
    this.cb.onEventTurnEnd({
      nextRoundCount: this.engine.state.roundCount,
      nextFirstPid: this.engine.state.firstPlayer,
    });
  }

  private playSfx(type: SfxType): void {
    soundManager.play(type);
  }

  private sfxForCard(category: string): SfxType {
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

  /** 清理定时器 */
  destroy(): void {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
  }
}
