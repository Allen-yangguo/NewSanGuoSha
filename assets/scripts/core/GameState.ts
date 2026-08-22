/**
 * 三国卡牌对战 · 全局游戏状态对象
 * 严格按文档：业务逻辑与 UI 渲染彻底分开
 * UI 只读取 GameState 做显示，不处理业务
 */
import {
  CardDef,
  CardInstance,
  GameOverReason,
  GameResult,
  PlayerId,
  PlayerState,
  TurnPhase,
} from './types';
import { buildFullDeck, assertDeckSize } from './cards';
import { HP_INIT, HP_MAX, QI_INIT } from './BattleState';

/** 全局游戏状态 */
export class GameState {
  /** 双方玩家 */
  players: [PlayerState, PlayerState];
  /** 公共牌库（剩余可抽） */
  deck: CardInstance[] = [];
  /** 弃牌堆 */
  discard: CardInstance[] = [];
  /** 当前回合数（从 1 开始） */
  roundCount: number = 1;
  /** 当前回合阶段 */
  phase: TurnPhase = TurnPhase.Action;
  /** 本回合先手玩家 */
  firstPlayer: PlayerId = 0;
  /** 当前行动玩家（出牌方） */
  activePlayer: PlayerId = 0;
  /** 当前受击玩家（防御方） */
  defensePlayer: PlayerId = 1;
  /** 追风阵生效标记：若设置，则下回合不互换先手 */
  zhuiFengActive: boolean = false;
  /** 牌库是否已耗尽 */
  deckDepleted: boolean = false;
  /** 游戏是否结束 */
  gameOver: boolean = false;
  /** 游戏结果 */
  result: GameResult | null = null;
  /** 全局实例 ID 计数器 */
  private uidCounter: number = 0;

  constructor() {
    this.players = [
      this.createPlayer(0),
      this.createPlayer(1),
    ];
  }

  private createPlayer(id: PlayerId): PlayerState {
    return {
      id,
      hp: HP_INIT,
      qi: QI_INIT,
      hand: [],
      strategies: [],
      usedNormalQi: false,
      usedBigQi: false,
      hpLossQiThisTurn: 0,
    };
  }

  /** 生成实例唯一 UID */
  genUid(prefix: string = 'c'): string {
    return `${prefix}_${this.uidCounter++}`;
  }

  /** 将 CardDef 转为 CardInstance */
  toInstance(def: CardDef): CardInstance {
    return { uid: this.genUid(def.id), def };
  }

  /** 初始化牌库：107 张彻底洗牌 */
  initDeck(): void {
    const defs = buildFullDeck();
    assertDeckSize(defs); // 数量自检
    const instances = defs.map(d => this.toInstance(d));
    this.shuffleInPlace(instances);
    this.deck = instances;
    this.discard = [];
  }

  /** Fisher-Yates 洗牌（原地） */
  shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /** 双方各抽 5 张初始手牌 */
  dealInitialHands(): void {
    for (let i = 0; i < 5; i++) {
      for (const p of this.players) {
        const c = this.deck.pop();
        if (c) p.hand.push(c);
      }
    }
  }

  /** 从牌库顶抽 1 张（牌库空则返回 null 并标记耗尽） */
  drawOne(): CardInstance | null {
    const c = this.deck.pop();
    if (!c) {
      this.deckDepleted = true;
      return null;
    }
    return c;
  }

  /** 补牌阶段：手牌为空补 4 张，否则补 3 张 */
  drawForTurn(player: PlayerId): number {
    const p = this.players[player];
    const drawCount = p.hand.length === 0 ? 4 : 3;
    let actual = 0;
    for (let i = 0; i < drawCount; i++) {
      const c = this.drawOne();
      if (!c) break;
      p.hand.push(c);
      actual++;
    }
    return actual;
  }

  /** 设置先手玩家（首回合随机，后续自动互换） */
  setFirstPlayerForRound(): void {
    if (this.roundCount === 1) {
      // 第一回合随机
      this.firstPlayer = Math.random() < 0.5 ? 0 : 1;
    } else {
      // 追风阵生效则保持当前先手不变
      if (this.zhuiFengActive) {
        this.zhuiFengActive = false; // 仅生效 1 回合
        // firstPlayer 不变
      } else {
        // 默认互换
        this.firstPlayer = (1 - this.firstPlayer) as PlayerId;
      }
    }
    this.activePlayer = this.firstPlayer;
    this.defensePlayer = (1 - this.firstPlayer) as PlayerId;
  }

  /** 切换行动玩家 */
  switchActivePlayer(): void {
    this.activePlayer = (1 - this.activePlayer) as PlayerId;
    this.defensePlayer = (1 - this.activePlayer) as PlayerId;
  }

  /** 获取玩家 */
  getPlayer(id: PlayerId): PlayerState {
    return this.players[id];
  }

  /** 获取对手 */
  getOpponent(id: PlayerId): PlayerState {
    return this.players[(1 - id) as PlayerId];
  }

  /** 判定游戏是否应结束（牌库耗尽或血量≤0） */
  checkGameOver(): boolean {
    // 血量判定
    for (const p of this.players) {
      if (p.hp <= 0) {
        this.gameOver = true;
        this.result = {
          winner: (1 - p.id) as PlayerId,
          reason: GameOverReason.HpZero,
          detail: `玩家 ${p.id + 1} 血量归零，玩家 ${(1 - p.id) + 1} 获胜`,
        };
        return true;
      }
    }
    // 牌库耗尽判定
    if (this.deckDepleted || this.deck.length === 0) {
      this.gameOver = true;
      const [a, b] = this.players;
      if (a.hp > b.hp) {
        this.result = { winner: 0, reason: GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血量高者胜' };
      } else if (b.hp > a.hp) {
        this.result = { winner: 1, reason: GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血量高者胜' };
      } else if (a.qi > b.qi) {
        this.result = { winner: 0, reason: GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血平气高者胜' };
      } else if (b.qi > a.qi) {
        this.result = { winner: 1, reason: GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血平气高者胜' };
      } else {
        this.result = { winner: null, reason: GameOverReason.DeckEmpty, detail: '牌库耗尽 · 双方相同 · 平局' };
      }
      return true;
    }
    return false;
  }

  /** 重置回合内的临时计数（如掉血补气计数） */
  resetTurnCounters(): void {
    for (const p of this.players) {
      p.hpLossQiThisTurn = 0;
    }
  }

  /** 序列化为纯对象（供 UI 快照、调试、保存） */
  toSnapshot(): object {
    return {
      round: this.roundCount,
      phase: this.phase,
      firstPlayer: this.firstPlayer,
      activePlayer: this.activePlayer,
      deckLeft: this.deck.length,
      discardCount: this.discard.length,
      zhuiFengActive: this.zhuiFengActive,
      deckDepleted: this.deckDepleted,
      gameOver: this.gameOver,
      result: this.result,
      players: this.players.map(p => ({
        id: p.id,
        hp: p.hp,
        qi: p.qi,
        handCount: p.hand.length,
        strategies: p.strategies.map(s => ({
          type: s.type,
          layers: s.layers,
          remainingTurns: s.remainingTurns,
        })),
        usedNormalQi: p.usedNormalQi,
        usedBigQi: p.usedBigQi,
        hpLossQiThisTurn: p.hpLossQiThisTurn,
      })),
    };
  }
}
