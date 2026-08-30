/**
 * 三国卡牌对战 · 主游戏引擎
 * 集成 GameState + TurnMachine + 战斗状态 + 卡牌效果实现 + 气量闭环 + 胜负判定
 *
 * 设计原则（按文档）：
 * 1. 业务逻辑与 UI 渲染彻底分开 — UI 只读取 state 做显示
 * 2. 严格按文档时序做状态机
 * 3. 兵法每条状态独立倒计时（不只记总层数）
 */
import {
  CardCategory,
  CardInstance,
  GameOverReason,
  PlayerId,
  PlayerState,
  TurnPhase,
  UltimateType,
  FormationType,
  StrategyType,
  CharmType,
  BattleState,
  ScoreTracker,
  GameSettlement,
  StrategistType,
  PouchType,
  HpTier,
} from './types';
import { GameState } from './GameState';
import { TurnMachine, ActionSubPhase } from './TurnMachine';
import {
  HP_MAX,
  addStrategy,
  calcGeneralCost,
  calcGeneralDamage,
  tickStrategies,
  totalStrategyLayers,
  removeStrategyLayer,
  getStateBonus,
  getBattleState,
} from './BattleState';
import { EffectResult } from './CardEffect';
import { getPouchChoices } from './cards';

/** 急锦囊丹药选项 id */
const DAN_HUANHUN = 'huanhun_dan';
const DAN_JUELIAO = 'jueliao_dan';

/** 待结算的攻击信息 */
interface PendingAttack {
  /** 武将攻击造成的最终伤害（已含兵法/状态加成） */
  damage: number;
  /** 攻击来源：武将 / 绝杀 */
  source: 'general' | 'ultimate';
  /** 是否为倚天剑击杀 */
  isYiTianJian: boolean;
  /** 攻击者 */
  attacker: PlayerId;
  /** 防御者 */
  defender: PlayerId;
  /** 来源卡牌 UID */
  sourceCardUid: string;
  /** 是否为八卦阵反弹（反弹受击：A 可出防具但不可再出八卦阵） */
  isReflect: boolean;
}

export class GameEngine {
  state: GameState;
  turn: TurnMachine = new TurnMachine();

  /** 当前待结算的攻击（武将攻击后进入受击响应时设置） */
  pendingAttack: PendingAttack | null = null;
  /** 当前防御响应中累积的防具总防御值 */
  defensePool: number = 0;
  /** 当前防御响应中是否已打出八卦阵 */
  baguaTriggered: boolean = false;
  /** 当前防御响应中已使用的防具卡（用于弃牌） */
  usedArmorCards: CardInstance[] = [];
  /** 当前防御响应中已使用的八卦阵卡（用于弃牌） */
  usedBaguaCards: CardInstance[] = [];
  /** 龟背阵保护方（该玩家受到武将攻击时伤害 -层数，持续3回合） */
  guiBeiProtector: PlayerId | null = null;
  /** 龟背阵减攻层数（1层=-1；坚壁清野直接施加2层） */
  guiBeiLayers: number = 0;
  /** 龟背阵剩余持续回合数（>0 时生效，每回合 -1，归 0 清除） */
  guiBeiRemainingTurns: number = 0;
  /** 紧急救血等待中（普通攻击打至 0 血，可补血续命） */
  emergencyHealPending: PlayerId | null = null;
  /** 绝杀急救等待中（绝杀打至 0 血，可手动选择使用急锦囊抽绝疗丹自救） */
  ultimateSavePending: PlayerId | null = null;
  /** 绝杀急救抽丹结果(等待客户端播放抽丹动画后再结算) */
  ultimateSaveResult: { saved: boolean } | null = null;
  /** 本次 gameOver 是否由系统直接判定(玩家无最后决策;UI 据此决定是否显示「惜乎」过渡文案) */
  gameOverInstant: boolean = false;
  /** 历史日志（用于 UI 显示与调试） */
  logs: string[] = [];
  /** 单局得分追踪 */
  scoreTracker: ScoreTracker = {
    firstBloodPid: null,
    attackHits: [0, 0],
    ultimateKills: [0, 0],
    combatScore: [0, 0],
  };

  constructor() {
    this.state = new GameState();
  }

  /** 日志 */
  log(msg: string): void {
    this.logs.push(`[回合${this.state.roundCount}] ${msg}`);
    if (this.logs.length > 200) this.logs.shift();
  }

  /** 初始化对局 */
  initGame(): void {
    this.state.initDeck();
    this.state.dealInitialHands();
    this.state.setFirstPlayerForRound();
    this.turn.setFirstPlayer(this.state.firstPlayer);
    this.turn.phase = TurnPhase.Action;
    this.turn.subPhase = ActionSubPhase.Idle;
    this.log(`对局开始 · 玩家 ${this.state.firstPlayer + 1} 先手`);
  }

  /** 局末结算：计算双方最终得分 */
  getSettlement(): GameSettlement {
    const winner = this.state.result?.winner ?? null;
    const rounds = this.state.roundCount;
    const st = this.scoreTracker;

    const breakdown = [0, 1].map(pid => {
      const isWinner = winner === pid as PlayerId;
      const isLoser = winner !== null && winner !== pid as PlayerId;
      const isDraw = winner === null;

      const combat = isLoser ? 0 : st.combatScore[pid]; // 失败方不计战斗分
      const firstBlood = st.firstBloodPid === pid as PlayerId ? 10 : 0;
      const victoryBonus = isWinner ? 50 : 0;
      const speedBonus = isWinner
        ? (rounds <= 5 ? 30 : rounds <= 10 ? 20 : rounds <= 15 ? 10 : 5)
        : 0;
      const hpBonus = isWinner
        ? Math.floor((this.state.players[pid as PlayerId].hp / HP_MAX) * 20)
        : 0;
      const lossPenalty = isLoser ? -20 : 0;

      return {
        combatScore: combat,
        firstBlood,
        victoryBonus,
        speedBonus,
        hpBonus,
        lossPenalty,
      };
    });

    const scores: [number, number] = [
      breakdown[0].combatScore + breakdown[0].firstBlood + breakdown[0].victoryBonus + breakdown[0].speedBonus + breakdown[0].hpBonus + breakdown[0].lossPenalty,
      breakdown[1].combatScore + breakdown[1].firstBlood + breakdown[1].victoryBonus + breakdown[1].speedBonus + breakdown[1].hpBonus + breakdown[1].lossPenalty,
    ];

    return { winner, scores, breakdown, roundCount: rounds };
  }

  /** 获取当前行动玩家 */
  get activePlayer(): PlayerState { return this.state.players[this.turn.activePlayer]; }
  /** 简写：获取玩家 */
  getPlayer(id: PlayerId): PlayerState { return this.state.players[id]; }
  /** 获取对手 */
  getOpponent(id: PlayerId): PlayerState { return this.state.players[(1 - id) as PlayerId]; }

  /** 校验是否轮到该玩家行动 */
  canAct(actor: PlayerId): boolean {
    if (this.state.gameOver) return false;
    if (this.turn.isAwaitingDefense()) {
      // 防御响应阶段：防御者可打防具/八卦阵；攻击者不可行动
      return actor === this.pendingAttack?.defender;
    }
    if (this.emergencyHealPending !== null) {
      // 紧急救血阶段：被击杀方可打补血牌
      return actor === this.emergencyHealPending;
    }
    if (this.ultimateSavePending !== null) {
      // 绝杀急救阶段：被绝杀方选择是否使用急锦囊
      return actor === this.ultimateSavePending;
    }
    // 行动阶段：仅当前行动玩家且未结束行动方可出牌
    return this.turn.isInActionPhase()
      && actor === this.turn.activePlayer
      && !this.state.actionEnded[actor];
  }

  /** 判断行动阶段玩家是否还有牌可出（手牌为空或气量不足以打出任何牌时返回 false） */
  canPlayAnyCard(actor: PlayerId): boolean {
    const p = this.state.players[actor];
    if (p.hand.length === 0) return false;
    // 防御阶段：只需检查有无防具/八卦阵
    if (this.turn.isAwaitingDefense()) {
      return p.hand.some(c =>
        c.def.category === CardCategory.Armor
        || (c.def.category === CardCategory.Formation && c.def.subtype === FormationType.BaGua),
      );
    }
    // 紧急救血阶段：只需检查有无补血牌
    if (this.emergencyHealPending === actor) {
      return p.hand.some(c => c.def.category === CardCategory.FunctionHp);
    }
    // 行动阶段：武将牌需消耗气量，其他牌无消耗
    if (!this.canAct(actor)) return false;
    return p.hand.some(c => {
      // 武将牌：检查气量是否足够
      if (c.def.category === CardCategory.General) {
        return p.qi >= calcGeneralCost(c.def, p);
      }
      // 其他牌（补气/补血/兵法/阵法/绝杀）无气耗，均可打出
      return true;
    });
  }

  /** 从手牌中移除一张卡并放到桌面（回合结束统一进弃牌堆） */
  private consumeCard(actor: PlayerId, card: CardInstance): void {
    const p = this.state.players[actor];
    const idx = p.hand.findIndex(c => c.uid === card.uid);
    if (idx >= 0) p.hand.splice(idx, 1);
    this.state.table.push(card);
  }

  /** 龟背阵总减攻层数（保护方生效层数） */
  private guiBeiTotalLayers(): number {
    return this.guiBeiProtector !== null ? this.guiBeiLayers : 0;
  }

  /**
   * 锦囊产出选卡：有指定 choice 则精确/前缀匹配；否则（choice 为空）系统随机给出一张
   */
  private pickPouchDef(defs: Array<{ id: string; name: string; desc: string }>, choice: string): any {
    if (choice) {
      const hit = defs.find(d => d.id === choice || d.id.startsWith(choice + '_'));
      if (hit) return hit;
    }
    if (defs.length > 0) return defs[Math.floor(Math.random() * defs.length)];
    return undefined;
  }

  /** 玩家是否持有任意急锦囊 */
  private hasJiPouch(player: PlayerState): boolean {
    return Object.keys(player.pouches).some(k => player.pouches[k].ji);
  }

  /** 玩家手牌中是否持有绝疗丹（唯一可应对绝杀致死的丹药） */
  private hasJueLiaoDanInHand(player: PlayerState): boolean {
    return player.hand.some(c =>
      c.def.category === CardCategory.FunctionHp && c.def.subtype === HpTier.JueLiaoDan,
    );
  }

  // ============ 卡牌效果实现 ============

  /** 武将攻击：消耗气量 → 计算伤害 → 进入受击响应 */
  playGeneralAttack(card: CardInstance, actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (card.def.category !== CardCategory.General) return { ok: false, message: '非武将牌' };
    if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };

    const attacker = this.state.players[actor];
    const defender = this.state.players[(1 - actor) as PlayerId];
    const cost = calcGeneralCost(card.def, attacker);
    if (attacker.qi < cost) {
      return { ok: false, message: `气量不足：需要 ${cost}，当前 ${attacker.qi}` };
    }
    attacker.qi -= cost;
    const baseDamage = calcGeneralDamage(card.def, attacker);
    const stateBonus = getStateBonus(attacker);
    const stratLayers = totalStrategyLayers(attacker);
    // 龟背阵：若防御方有龟背保护，武将攻击伤害 -层数（最低 0），绝杀不受影响
    const defenderId = (1 - actor) as PlayerId;
    let damage = baseDamage;
    if (this.guiBeiProtector === defenderId) {
      const reduce = this.guiBeiTotalLayers();
      damage = Math.max(0, damage - reduce);
      this.log(`龟背阵生效 · 武将攻击伤害 -${reduce} → ${damage}`);
    }
    this.log(
      `玩家${actor + 1} 打出【${card.def.name}】耗气 ${cost} → 伤害 ${damage} ` +
      `(基础${card.def.value}+兵法${stratLayers}+状态${stateBonus})`,
    );
    this.consumeCard(actor, card);

    // 设置待结算攻击，进入防御响应
    this.pendingAttack = {
      damage,
      source: 'general',
      isYiTianJian: false,
      attacker: actor,
      defender: defenderId,
      sourceCardUid: card.uid,
      isReflect: false,
    };
    // 被攻击方重获操作权（即使之前已结束行动，被攻击后可反击）
    this.state.actionEnded[defenderId] = false;
    this.defensePool = 0;
    this.baguaTriggered = false;
    this.usedArmorCards = [];
    this.usedBaguaCards = [];
    this.turn.enterDefenseResponse();
    return {
      ok: true,
      message: `打出 ${card.def.name} · 造成 ${damage} 点伤害 · 等待防御响应`,
      triggeredDamage: true,
    };
  }

  /** 防具：受击阶段打出，加入临时防御池 */
  playArmor(card: CardInstance, actor: PlayerId): EffectResult {
    if (!this.turn.isAwaitingDefense()) return { ok: false, message: '非受击阶段' };
    if (card.def.category !== CardCategory.Armor) return { ok: false, message: '非防具牌' };
    if (this.baguaTriggered) return { ok: false, message: '已打出八卦阵，不可再用防具' };
    if (this.pendingAttack?.defender !== actor) return { ok: false, message: '非防御方' };

    const p = this.state.players[actor];
    let def = card.def.value;
    // 鱼鳞阵：己方防具防御 +1
    if (p.yulin.active) {
      def += 1;
      this.log(`鱼鳞阵生效 · 防具防御 +1`);
    }
    this.defensePool += def;
    this.usedArmorCards.push(card);
    this.consumeCard(actor, card);
    this.log(`玩家${actor + 1} 打出【${card.def.name}】防 ${def} · 累计防御 ${this.defensePool}`);
    return { ok: true, message: `防具累计防御 ${this.defensePool}` };
  }

  /** 大乔（限定魅惑）：打出直接清空敌方当前气量（不改上限、不清状态标记） */
  private playDaQiao(card: CardInstance, actor: PlayerId): EffectResult {
    const enemy = this.state.players[(1 - actor) as PlayerId];
    const before = enemy.qi;
    enemy.qi = 0;
    this.consumeCard(actor, card);
    this.log(`玩家${actor + 1} 打出【大乔】· 清空敌方气量 ${before} → 0`);
    return { ok: true, message: `大乔 · 敌方气量清空（${before} → 0）` };
  }

  /** 孙尚香（限定魅惑）：偷取敌方【急】锦囊标记；敌方无急锦囊则出牌完全无效（但牌正常打出消耗） */
  private playSunShangXiang(card: CardInstance, actor: PlayerId): EffectResult {
    const me = this.state.players[actor];
    const enemy = this.state.players[(1 - actor) as PlayerId];
    const targetKey = Object.keys(enemy.pouches).find(k => enemy.pouches[k].ji);
    this.consumeCard(actor, card);
    if (!targetKey) {
      this.log(`玩家${actor + 1} 打出【孙尚香】· 敌方无急锦囊 · 出牌完全无效（牌已打出消耗）`);
      return { ok: true, message: '孙尚香 · 敌方无急锦囊 · 出牌完全无效', triggeredCharm: true };
    }
    enemy.pouches[targetKey].ji = false;
    if (!me.pouches[targetKey]) me.pouches[targetKey] = { que: false, can: false, ji: false };
    me.pouches[targetKey].ji = true;
    this.log(`玩家${actor + 1} 打出【孙尚香】· 偷取敌方急锦囊`);
    return { ok: true, message: '孙尚香 · 成功偷取敌方【急】锦囊', triggeredCharm: true };
  }

  /** 功能-补气：+气量 */
  playFunctionQi(card: CardInstance, actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (card.def.category !== CardCategory.FunctionQi) return { ok: false, message: '非补气牌' };
    const p = this.state.players[actor];
    p.qi += card.def.value;
    this.log(`玩家${actor + 1} 打出【${card.def.name}】+${card.def.value} 气 → 当前 ${p.qi}`);
    this.consumeCard(actor, card);
    return { ok: true, message: `+${card.def.value} 气`, triggeredQi: true };
  }

  /** 功能-补血：未满血回血 / 满血转气；紧急救血时需先抵消溢出伤害 */
  playFunctionHp(card: CardInstance, actor: PlayerId): EffectResult {
    if (card.def.category !== CardCategory.FunctionHp) return { ok: false, message: '非补血牌' };
    const p = this.state.players[actor];

    // 紧急救血阶段：补血需先抵消 overkill
    if (this.emergencyHealPending === actor) {
      // 丹药（还魂丹/绝疗丹）：直接保 1 血，无视溢出
      if (card.def.subtype === HpTier.HuanHunDan || card.def.subtype === HpTier.JueLiaoDan) {
        this.consumeCard(actor, card);
        p.hp = 1;
        p.overkill = 0;
        this.emergencyHealPending = null;
        this.log(`玩家${actor + 1} 使用【${card.def.name}】· 保 1 血 · 紧急救血成功`);
        return { ok: true, message: `${card.def.name} · 保 1 血`, triggeredHeal: true };
      }
      const overkill = p.overkill;
      const effective = card.def.value - overkill;
      this.consumeCard(actor, card);
      if (effective > 0) {
        // 补血量 > 溢出 → 救活，剩余回血
        p.hp = Math.min(HP_MAX, p.hp + effective);
        p.overkill = 0;
        this.emergencyHealPending = null;
        this.log(`玩家${actor + 1} 紧急救血成功 +${effective} 血 → HP ${p.hp}`);
        return { ok: true, message: `紧急救血 +${effective}`, triggeredHeal: true };
      } else {
        // 补血量 <= 溢出 → 抵扣部分溢出，仍未救活
        p.overkill = overkill - card.def.value;
        this.log(`玩家${actor + 1} 补血 ${card.def.value} 抵扣溢出 · 剩余溢出 ${p.overkill}`);
        // 检查剩余手牌是否还能救
        const remaining = this.totalHealInHand(actor);
        if (remaining <= p.overkill) {
          this.emergencyHealPending = null;
          p.overkill = 0;
          this.log(`玩家${actor + 1} 剩余补血 ${remaining} 不足 · 无法挽救`);
          this.gameOverInstant = false; // 玩家最后决策(补血)后判负
          this.state.checkGameOver();
          return { ok: true, message: '补血不足 · 无法挽救', triggeredHeal: true };
        }
        return { ok: true, message: `抵扣溢出 ${card.def.value} · 剩余溢出 ${p.overkill}`, triggeredHeal: true };
      }
    }

    if (!this.canAct(actor)) {
      return { ok: false, message: '非己方行动阶段' };
    }

    if (p.hp < HP_MAX) {
      const before = p.hp;
      p.hp = Math.min(HP_MAX, p.hp + card.def.value);
      const healed = p.hp - before;
      this.log(`玩家${actor + 1} 打出【${card.def.name}】回 ${healed} 血 → 当前 ${p.hp}/${HP_MAX}`);
      this.consumeCard(actor, card);
      return { ok: true, message: `回 ${healed} 血`, triggeredHeal: true };
    } else {
      // 满血时 1:1 转化为气量
      p.qi += card.def.value;
      this.log(`玩家${actor + 1} 打出【${card.def.name}】满血转气 +${card.def.value} → 气 ${p.qi}`);
      this.consumeCard(actor, card);
      return { ok: true, message: `满血转气 +${card.def.value}`, triggeredQi: true };
    }
  }

  /** 兵法：获得兵法层数（独立倒计时） */
  playStrategy(card: CardInstance, actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (card.def.category !== CardCategory.Strategy) return { ok: false, message: '非兵法牌' };
    const p = this.state.players[actor];
    const layers = card.def.value;
    addStrategy(p, card.uid, card.def.subtype as StrategyType, layers);
    const total = totalStrategyLayers(p);
    this.log(
      `玩家${actor + 1} 打出【${card.def.name}】+${layers} 层兵法 · 持续 3 回合 · 总层数 ${total}`,
    );
    this.consumeCard(actor, card);
    return { ok: true, message: `+${layers} 层兵法 · 总层数 ${total}` };
  }

  /** 绝杀神兵：固定真实伤害，无视防具，击杀不可急救 */
  playUltimate(card: CardInstance, actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (card.def.category !== CardCategory.Ultimate) return { ok: false, message: '非绝杀牌' };
    if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };

    const target = (1 - actor) as PlayerId;
    const damage = card.def.value;
    const isYiTianJian = card.def.subtype === UltimateType.YiTianJian;
    this.log(
      `玩家${actor + 1} 打出【${card.def.name}】绝杀 · ${damage} 点真实伤害 · 无视防具`,
    );
    this.consumeCard(actor, card);

    // 直接结算（不进入防御响应，八卦阵无法反弹绝杀）
    this.applyDamage(target, damage, {
      source: 'ultimate',
      isYiTianJian,
      ignoreArmor: true,
      ignoreBagua: true,
    });
    // 得分追踪：绝杀 +15
    this.scoreTracker.ultimateKills[actor] += 1;
    this.scoreTracker.combatScore[actor] += 15;

    if (this.state.gameOver) {
      return { ok: true, message: `绝杀击杀 · 游戏结束`, triggeredUltimate: true, triggeredDamage: true };
    }
    return {
      ok: true,
      message: `绝杀 · ${damage} 真实伤害`,
      triggeredUltimate: true,
      triggeredDamage: true,
    };
  }

  /** 阵法：八卦阵（受击反弹）/ 追风阵（篡改先手） */
  playFormation(card: CardInstance, actor: PlayerId): EffectResult {
    if (card.def.category !== CardCategory.Formation) return { ok: false, message: '非阵法牌' };
    const type = card.def.subtype as FormationType;

    if (type === FormationType.BaGua) {
      // 八卦阵：受击阶段打出
      if (!this.turn.isAwaitingDefense()) return { ok: false, message: '八卦阵需在受击时打出' };
      if (this.pendingAttack?.defender !== actor) return { ok: false, message: '非防御方' };
      if (this.baguaTriggered) return { ok: false, message: '本防御阶段已打出八卦阵' };
      // 无法反弹绝杀/倚天剑
      if (this.pendingAttack?.source === 'ultimate') {
        return { ok: false, message: '八卦阵无法反弹绝杀' };
      }
      // 注意：八卦阵允许嵌套反弹（A→B 八卦阵→A 还能再八卦阵→B）
      this.baguaTriggered = true;
      this.usedBaguaCards.push(card);
      this.consumeCard(actor, card);
      this.log(`玩家${actor + 1} 打出【八卦阵】· 将反弹剩余伤害`);
      // 立即结算反弹（不再需要防御方点「确认防御」）
      const r = this.resolvePendingAttack();
      return { ok: true, message: r.message || '八卦阵反弹生效', triggeredReflect: true };
    }

    if (type === FormationType.ZhuiFeng) {
      // 追风阵：自身回合打出
      if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
      if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };
      this.state.zhuiFengActive = true;
      this.log(`玩家${actor + 1} 打出【追风阵】· 下回合仍为己方先手`);
      this.consumeCard(actor, card);
      return { ok: true, message: '追风阵生效 · 下回合仍为先手' };
    }

    if (type === FormationType.GuiBei) {
      // 龟背阵：自身回合打出，持续3回合对方武将攻击 -1（可叠加）
      if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
      if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };
      this.guiBeiProtector = actor;
      this.guiBeiLayers += 1;
      this.guiBeiRemainingTurns = 3;
      this.log(`玩家${actor + 1} 打出【龟背阵】· 减攻 +1 层（共 ${this.guiBeiLayers} 层）· 持续3回合 · 绝杀不受影响`);
      this.consumeCard(actor, card);
      return { ok: true, message: `龟背阵生效 · 对方武将攻击 -${this.guiBeiLayers} · 持续3回合` };
    }

    if (type === FormationType.JianBiQingYe) {
      // 坚壁清野：直接施加 2 层龟背阵，对方武将攻击 -2，持续3回合（仅锦囊产出）
      if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
      if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };
      this.guiBeiProtector = actor;
      this.guiBeiLayers += 2;
      this.guiBeiRemainingTurns = 3;
      this.log(`玩家${actor + 1} 打出【坚壁清野】· 减攻 +2 层（共 ${this.guiBeiLayers} 层）· 持续3回合 · 绝杀不受影响`);
      this.consumeCard(actor, card);
      return { ok: true, message: `坚壁清野生效 · 对方武将攻击 -${this.guiBeiLayers} · 持续3回合` };
    }

    if (type === FormationType.YuLin) {
      // 鱼鳞阵：己方防具防御 +1，持续3回合
      if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
      if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };
      const p = this.state.players[actor];
      p.yulin = { active: true, remainingTurns: 3 };
      this.log(`玩家${actor + 1} 打出【鱼鳞阵】· 己方防具防御 +1 · 持续3回合`);
      this.consumeCard(actor, card);
      return { ok: true, message: '鱼鳞阵生效 · 己方防具防御 +1 · 持续3回合' };
    }

    if (type === FormationType.QiMenDunJia || type === FormationType.HuoShaoLianYing) {
      // 奇门遁甲 / 火烧连营：兵法 +3，持续3回合（仅锦囊产出）
      if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
      if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };
      const p = this.state.players[actor];
      const sType = type === FormationType.QiMenDunJia ? StrategyType.QiMenDunJia : StrategyType.HuoShaoLianYing;
      addStrategy(p, card.uid, sType, 3);
      const total = totalStrategyLayers(p);
      this.log(`玩家${actor + 1} 打出【${card.def.name}】· 兵法 +3 层 · 持续3回合 · 总层数 ${total}`);
      this.consumeCard(actor, card);
      return { ok: true, message: `兵法 +3 层 · 总层数 ${total}` };
    }

    return { ok: false, message: '未知阵法' };
  }

  /** 魅惑：貂蝉/小乔削兵法；大乔清敌方气；孙尚香偷敌方急锦囊 */
  playCharm(card: CardInstance, actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (card.def.category !== CardCategory.Charm) return { ok: false, message: '非魅惑牌' };
    if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };

    // 大乔 / 孙尚香：限定魅惑（仅锦囊产出，打出触发特殊效果）
    if (card.def.id === 'daqiao') return this.playDaQiao(card, actor);
    if (card.def.id === 'sunshangxiang') return this.playSunShangXiang(card, actor);

    const targetId = (1 - actor) as PlayerId;
    const target = this.state.players[targetId];
    const totalLayers = totalStrategyLayers(target);
    this.consumeCard(actor, card);
    if (totalLayers > 0) {
      removeStrategyLayer(target);
      const remain = totalStrategyLayers(target);
      this.log(`玩家${actor + 1} 打出【${card.def.name}】· 对方兵法 -1 层 → 剩余 ${remain}`);
      return { ok: true, message: `对方兵法 -1 层 · 剩余 ${remain}`, triggeredCharm: true };
    } else {
      target.qi = Math.max(0, target.qi - 3);
      this.log(`玩家${actor + 1} 打出【${card.def.name}】· 对方兵法为 0 · 对方 -3 气 → ${target.qi}`);
      return { ok: true, message: `对方兵法为 0 · 对方 -3 气`, triggeredCharm: true, triggeredQi: true };
    }
  }

  // ============ 智者牌 & 锦囊 ============

  /** 智者牌可授予的锦囊组合 */
  private static STRATEGIST_POUCHES: Record<string, Partial<Record<PouchType, boolean>>> = {
    zhuge: { que: true, can: true, ji: true },   // 诸葛亮：缺/残/急
    zhouyu: { que: true, can: true, ji: false },  // 周瑜：缺/残
    simayi: { que: true, can: true, ji: false },  // 司马懿：缺/残
  };

  /** 打出智者牌：0 耗气，获得对应锦囊标记（使用才消耗，跨回合保留） */
  playStrategist(card: CardInstance, actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (card.def.category !== CardCategory.Strategist) return { ok: false, message: '非智者牌' };
    if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };
    const sid = card.def.id;
    const grants = GameEngine.STRATEGIST_POUCHES[sid];
    if (!grants) return { ok: false, message: '未知智者' };

    const p = this.state.players[actor];
    const cur = p.pouches[sid] || { que: false, can: false, ji: false };
    if (grants.que) cur.que = true;
    if (grants.can) cur.can = true;
    if (grants.ji) cur.ji = true;
    p.pouches[sid] = cur;
    this.consumeCard(actor, card);
    this.log(
      `玩家${actor + 1} 打出【${card.def.name}】· 获得锦囊` +
      `${cur.que ? '缺' : ''}${cur.can ? '残' : ''}${cur.ji ? '急' : ''}（使用才消耗）`,
    );
    return { ok: true, message: `获得${card.def.name}锦囊标记（缺/残/急）` };
  }

  /**
   * 使用锦囊：产出的卡牌为实体手牌
   * @param actor 玩家
   * @param strategistId 智者牌 id（zhuge/zhouyu/simayi）
   * @param pouch 锦囊种类 que/can/ji
   * @param choice 选项 id；传空字符串则系统随机给出一张
   */
  usePouch(actor: PlayerId, strategistId: string, pouch: PouchType, choice: string): EffectResult {
    if (this.state.gameOver) return { ok: false, message: '游戏已结束' };
    const p = this.state.players[actor];
    const st = p.pouches[strategistId];
    if (!st || !st[pouch]) return { ok: false, message: '没有可用的该锦囊标记' };

    if (pouch === PouchType.Ji) {
      // 急锦囊：击杀急救结算阶段可用（普通攻击致死时手动触发）
      if (this.emergencyHealPending !== actor) return { ok: false, message: '仅击杀急救结算阶段可用' };
      const defs = getPouchChoices(strategistId, PouchType.Ji);
      const def = this.pickPouchDef(defs, choice);
      if (!def) return { ok: false, message: '无效的丹药选择' };
      // 普通攻击致死：还魂丹/绝疗丹均可保 1 血 → 丹药实体卡入手牌
      const inst = this.state.toInstance(def);
      p.hand.push(inst);
      st.ji = false;
      this.log(`玩家${actor + 1} 使用急锦囊 · 随机获得【${def.name}】实体手牌`);
      return { ok: true, message: `获得【${def.name}】`, pouchUsed: true, card: inst };
    }

    // 缺/残锦囊：行动阶段使用；缺锦囊缺血(hp=2)或残血(hp=1)均可用
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (this.turn.isAwaitingDefense()) return { ok: false, message: '当前正在等待防御响应' };
    if (pouch === PouchType.Que && p.hp !== 2 && p.hp !== 1) return { ok: false, message: '缺锦囊需缺血(血量=2)或残血(血量=1)才可用' };
    if (pouch === PouchType.Can && p.hp !== 1) return { ok: false, message: '残锦囊需残血状态（血量=1）才可用' };

    const defs = getPouchChoices(strategistId, pouch);
    const def = this.pickPouchDef(defs, choice);
    if (!def) return { ok: false, message: '无效的选择' };

    // 锦囊产出的卡牌均为实体手牌（大乔/孙尚香等特殊武将也是先入手牌，打出时再触发效果）
    const inst = this.state.toInstance(def);
    p.hand.push(inst);
    st[pouch] = false;
    const pouchName = pouch === PouchType.Que ? '缺锦囊' : '残锦囊';
    this.log(`玩家${actor + 1} 使用${pouchName} · 随机获得【${def.name}】实体手牌`);
    return { ok: true, message: `获得【${def.name}】`, pouchUsed: true, card: inst };
  }

  /**
   * 获取玩家当前可用的锦囊选项（UI 展示用）
   */
  getPouchOptions(playerId: PlayerId): Array<{
    strategistId: string;
    strategistName: string;
    pouch: PouchType;
    pouchName: string;
    choices: Array<{ choice: string; name: string; desc: string }>;
  }> {
    const p = this.state.players[playerId];
    const out: Array<{
      strategistId: string; strategistName: string; pouch: PouchType; pouchName: string;
      choices: Array<{ choice: string; name: string; desc: string }>;
    }> = [];
    const names: Record<string, string> = { zhuge: '诸葛亮', zhouyu: '周瑜', simayi: '司马懿' };
    const pouchNames: Record<string, string> = { que: '缺锦囊', can: '残锦囊', ji: '急锦囊' };
    for (const sid of Object.keys(p.pouches)) {
      const st = p.pouches[sid];
      if (!st) continue;
      const pouches: PouchType[] = [];
      // 缺锦囊：缺血(hp=2)或残血(hp=1)可用
      if (st.que && (p.hp === 2 || p.hp === 1)) pouches.push(PouchType.Que);
      if (st.can && p.hp === 1) pouches.push(PouchType.Can);
      if (st.ji && this.emergencyHealPending === playerId) pouches.push(PouchType.Ji);
      for (const pouch of pouches) {
        const defs = getPouchChoices(sid, pouch);
        if (defs.length === 0) continue;
        out.push({
          strategistId: sid,
          strategistName: names[sid] || sid,
          pouch,
          pouchName: pouchNames[pouch] || pouch,
          choices: defs.map(d => ({ choice: d.id, name: d.name, desc: d.desc })),
        });
      }
    }
    return out;
  }

  // ============ 防御响应 ============

  /** 防御方主动结束防御响应（不再出防具/八卦阵），进入伤害结算 */
  defenderPass(): EffectResult {
    if (!this.turn.isAwaitingDefense()) return { ok: false, message: '非受击阶段' };
    return this.resolvePendingAttack();
  }

  /** 结算待处理的攻击 */
  private resolvePendingAttack(): EffectResult {
    if (!this.pendingAttack) return { ok: false, message: '无待结算攻击' };
    const atk = this.pendingAttack;
    this.pendingAttack = null;
    this.turn.exitDefenseResponse();

    if (this.baguaTriggered) {
      // 八卦阵反弹：防具先抵消，再将剩余伤害反弹回原攻击者
      // 例：A 攻 3，B 出防具-1 再八卦阵 → 反弹 2 点给 A
      const reflectDamage = Math.max(0, atk.damage - this.defensePool);
      this.log(
        `八卦阵反弹：${atk.damage} - 防具 ${this.defensePool} = 剩余 ${reflectDamage} → 反弹至玩家${atk.attacker + 1}`,
      );
      this.usedBaguaCards = [];
      this.usedArmorCards = [];
      this.baguaTriggered = false;
      this.defensePool = 0;
      if (reflectDamage <= 0) {
        // 防具已完全抵消，反弹 0 伤害 = 无事发生，直接结束防御
        this.log(`反弹伤害为 0 · 无需结算`);
        if (atk.isReflect) {
          this.turn.setActivePlayer(atk.defender);
          this.log(`嵌套反弹结算完成 · 攻击权交回玩家${atk.defender + 1}`);
        } else {
          this.switchActiveAfterAttackResolve(atk.attacker, atk.defender);
        }
        return { ok: true, message: `防具完全抵消 · 反弹 0 伤害`, triggeredReflect: true };
      }
      // 构造反弹 pendingAttack：攻击者为原防御方，防御者为原攻击方；标记为反弹
      // 八卦阵允许嵌套反弹（A 可以再出八卦阵反击回 B），所以 isReflect 仅用于结算后攻击权切换判断
      this.pendingAttack = {
        damage: reflectDamage,
        source: 'general',
        isYiTianJian: false,
        attacker: atk.defender,
        defender: atk.attacker,
        sourceCardUid: atk.sourceCardUid,
        isReflect: true,
      };
      // 切换 activePlayer 为受击方，进入防御响应阶段
      this.turn.setActivePlayer(atk.attacker);
      this.turn.enterDefenseResponse();
      return { ok: true, message: `八卦阵反弹 ${reflectDamage} 伤害 · 玩家${atk.attacker + 1} 可出防具/八卦阵`, triggeredReflect: true };
    }

    // 普通结算：伤害 - 防御池
    const finalDamage = Math.max(0, atk.damage - this.defensePool);
    this.log(
      `伤害结算：${atk.damage} - 防具 ${this.defensePool} = ${finalDamage} → 玩家${atk.defender + 1}`,
    );
    this.usedArmorCards = [];
    this.defensePool = 0;
    if (finalDamage > 0) {
      // 得分追踪：攻击命中 +5，一血额外 +10
      const atkPid = atk.attacker;
      this.scoreTracker.attackHits[atkPid] += 1;
      if (this.scoreTracker.firstBloodPid === null) {
        this.scoreTracker.firstBloodPid = atkPid;
        this.scoreTracker.combatScore[atkPid] += 10;
      }
      this.scoreTracker.combatScore[atkPid] += 5;
      this.applyDamage(atk.defender, finalDamage, {
        source: atk.source,
        isYiTianJian: atk.isYiTianJian,
        ignoreArmor: false,
        ignoreBagua: false,
      });
    }
    if (this.state.gameOver) return { ok: true, message: '击杀 · 游戏结束', triggeredDamage: true };
    if (this.emergencyHealPending !== null) {
      return { ok: true, message: '玩家被打至 0 血 · 可紧急救血', triggeredDamage: true };
    }
    // 攻击权切换：
    // - 反弹结算：攻击权交给 A（原攻击方，即 atk.defender），A 可继续行动/继续攻击
    // - 普通结算：防御方有武将牌则轮到防御方，否则攻击方继续
    if (atk.isReflect) {
      this.turn.setActivePlayer(atk.defender);
      this.log(`反弹结算完成 · 攻击权交回玩家${atk.defender + 1}`);
    } else {
      this.switchActiveAfterAttackResolve(atk.attacker, atk.defender);
    }
    return { ok: true, message: `造成 ${finalDamage} 伤害`, triggeredDamage: true };
  }

  /**
   * 攻击结算后的攻击权切换：
   * 规则修正 — 一方攻击结束后轮到另一方攻击，除非另一方没有武将攻击牌
   * @param attacker 本次攻击的攻击方
   * @param defender 本次攻击的防御方
   */
  private switchActiveAfterAttackResolve(attacker: PlayerId, defender: PlayerId): void {
    const defenderHasGeneral = this.hasGeneralInHand(defender);
    const defenderCanAct = !this.state.actionEnded[defender];
    if (defenderHasGeneral && defenderCanAct) {
      // 防御方有武将牌且未结束行动：轮到防御方攻击
      this.turn.setActivePlayer(defender);
      this.log(`攻击权切换 · 轮到玩家${defender + 1} 攻击`);
    } else {
      // 防御方没有武将牌或已结束行动：攻击方继续行动（连击）
      this.turn.setActivePlayer(attacker);
      this.log(`玩家${defender + 1} 无武将牌或已结束行动 · 玩家${attacker + 1} 可继续连击`);
    }
  }

  /** 判断玩家手牌中是否还有武将攻击牌 */
  hasGeneralInHand(playerId: PlayerId): boolean {
    return this.state.players[playerId].hand.some(c => c.def.category === CardCategory.General);
  }

  /**
   * 伤害结算核心
   * @param targetId 受击方
   * @param amount 实际扣血量（已扣除防具）
   * @param opts 来源信息
   */
  private applyDamage(
    targetId: PlayerId,
    amount: number,
    opts: { source: 'general' | 'ultimate'; isYiTianJian: boolean; ignoreArmor: boolean; ignoreBagua: boolean },
  ): void {
    if (amount <= 0) return;
    const target = this.state.players[targetId];
    const before = target.hp;
    target.hp = Math.max(0, target.hp - amount);
    const actualLoss = before - target.hp;
    this.log(`玩家${targetId + 1} 扣血 ${actualLoss} → HP ${target.hp}/${HP_MAX}`);

    // 掉血补气：每一次有效扣血事件 +1 气（无伤格挡/反弹不补气）
    if (actualLoss > 0) {
      target.qi += 1;
      target.hpLossQiThisTurn += 1;
      this.log(`玩家${targetId + 1} 掉血补气 +1 → 气 ${target.qi}`);
    }

    if (target.hp <= 0) {
      const overkill = amount - before;
      if (opts.source === 'ultimate') {
        // 绝杀击杀：手牌绝疗丹自动保命；有急锦囊则进入「绝杀急救等待」由玩家手动选择是否使用
        if (this.useJueLiaoDanFromHand(targetId)) {
          return; // 手牌绝疗丹自动保命
        }
        if (this.hasJiPouch(target)) {
          this.ultimateSavePending = targetId;
          this.log(`玩家${targetId + 1} 被绝杀击至 0 血 · 有急锦囊可自救（等待选择）`);
          return;
        }
        this.log(`玩家${targetId + 1} 被绝杀击杀 · 不可急救`);
        this.gameOverInstant = true; // 系统直接判定(无最后决策)
        this.state.checkGameOver();
      } else {
        // 普通攻击打至 0 血：检查能否通过补血/丹药/急锦囊救活
        const totalHeal = this.totalHealInHand(targetId);
        const hasDan = this.hasJueLiaoDanInHand(target) || this.hasHuanHunDanInHand(target);
        const canUseJi = this.hasJiPouch(target);
        if (totalHeal > overkill || hasDan || canUseJi) {
          // 有救 → 进入紧急救血
          target.overkill = overkill;
          this.emergencyHealPending = targetId;
          this.log(
            `玩家${targetId + 1} 被打至 0 血 · 溢出 ${overkill} · 可救血` +
            `${canUseJi ? '（有急锦囊）' : ''}${hasDan ? '（有丹药）' : ''}`,
          );
        } else {
          // 无救 → 直接判负
          this.log(`玩家${targetId + 1} 补血量 ${totalHeal} 不足覆盖溢出 ${overkill} · 无法挽救`);
          this.gameOverInstant = true; // 系统直接判定(无救)
          this.state.checkGameOver();
        }
      }
    }
  }

  /** 手牌是否持有还魂丹 */
  private hasHuanHunDanInHand(player: PlayerState): boolean {
    return player.hand.some(c =>
      c.def.category === CardCategory.FunctionHp && c.def.subtype === HpTier.HuanHunDan,
    );
  }

  /**
   * 手牌已有绝疗丹：绝杀击杀时自动使用保 1 血（无需玩家操作）
   * @returns true = 已保命
   */
  private useJueLiaoDanFromHand(targetId: PlayerId): boolean {
    const target = this.state.players[targetId];
    const idx = target.hand.findIndex(c =>
      c.def.category === CardCategory.FunctionHp && c.def.subtype === HpTier.JueLiaoDan,
    );
    if (idx < 0) return false;
    const dan = target.hand.splice(idx, 1)[0];
    this.state.table.push(dan);
    target.hp = 1;
    target.overkill = 0;
    this.log(`玩家${targetId + 1} 使用手牌【绝疗丹】· 绝杀下保 1 血`);
    return true;
  }

  /**
   * 绝杀急救阶段：玩家选择使用急锦囊
   * 50% 抽到绝疗丹保 1 血 / 50% 抽到还魂丹直接死亡（消耗急锦囊标记）
   * 仅抽丹并记录结果；实际结算由 settleUltimateSave 在客户端抽丹动画结束后触发
   */
  useUltimatePouch(pid: PlayerId): EffectResult {
    if (this.ultimateSavePending !== pid) return { ok: false, message: '非绝杀急救阶段' };
    const target = this.state.players[pid];
    if (!this.hasJiPouch(target)) return { ok: false, message: '没有急锦囊' };
    const jiKey = Object.keys(target.pouches).find(k => target.pouches[k].ji);
    if (!jiKey) return { ok: false, message: '没有急锦囊' };
    target.pouches[jiKey].ji = false;
    this.ultimateSavePending = null;
    const gotJueLiao = Math.random() < 0.5;
    this.ultimateSaveResult = { saved: gotJueLiao };
    const danName = gotJueLiao ? '绝疗丹' : '还魂丹';
    this.log(`玩家${pid + 1} 使用急锦囊 · 抽中【${danName}】`);
    return { ok: true, message: `抽中【${danName}】`, saved: gotJueLiao };
  }

  /** 绝杀急救抽丹结算(客户端抽丹动画播完后调用): 绝疗丹保 1 血 / 还魂丹死亡 */
  settleUltimateSave(pid: PlayerId): EffectResult {
    const res = this.ultimateSaveResult;
    if (!res) return { ok: false, message: '非绝杀急救结算阶段' };
    this.ultimateSaveResult = null;
    const target = this.state.players[pid];
    if (res.saved) {
      target.hp = 1;
      target.overkill = 0;
      this.log(`玩家${pid + 1} 【绝疗丹】生效 · 绝杀下保 1 血`);
      return { ok: true, message: '绝疗丹保命', saved: true };
    }
    this.gameOverInstant = false; // 玩家最后决策(使用急锦囊)后判负
    this.state.checkGameOver();
    this.log(`玩家${pid + 1} 【还魂丹】无效 · 绝杀下死亡`);
    return { ok: true, message: '还魂丹无效 · 死亡', saved: false };
  }

  /** 绝杀急救阶段：玩家放弃使用急锦囊，直接判负 */
  giveUpUltimateSave(pid: PlayerId): EffectResult {
    if (this.ultimateSavePending !== pid) return { ok: false, message: '非绝杀急救阶段' };
    this.ultimateSavePending = null;
    this.log(`玩家${pid + 1} 放弃急锦囊自救 · 接受败北`);
    this.gameOverInstant = false; // 玩家最后决策(放弃)后判负
    this.state.checkGameOver();
    return { ok: true, message: '游戏结束' };
  }

  /** 计算手牌中所有补血牌的总补血量 */
  private totalHealInHand(pid: PlayerId): number {
    return this.state.players[pid].hand
      .filter(c => c.def.category === CardCategory.FunctionHp)
      .reduce((sum, c) => sum + c.def.value, 0);
  }

  /** 紧急救血阶段：被击杀方放弃补血，接受败北 */
  emergencyHealGiveUp(): EffectResult {
    if (this.emergencyHealPending === null) return { ok: false, message: '非紧急救血阶段' };
    const id = this.emergencyHealPending;
    this.emergencyHealPending = null;
    this.log(`玩家${id + 1} 放弃补血 · 接受败北`);
    this.gameOverInstant = false; // 玩家最后决策(放弃救血)后判负
    this.state.checkGameOver();
    return { ok: true, message: '游戏结束' };
  }

  // ============ 玩家本局专属固有能力按钮 ============

  /** 普通补气按钮：+2 气，整局限 1 次，第 4 回合（roundCount >= 3）后激活 */
  useNormalQiButton(actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (this.state.roundCount < 3) return { ok: false, message: `普通补气第 4 回合后激活（当前第 ${this.state.roundCount + 1} 回合）` };
    const p = this.state.players[actor];
    if (p.usedNormalQi) return { ok: false, message: '本局已使用普通补气' };
    p.usedNormalQi = true;
    p.qi += 2;
    this.log(`玩家${actor + 1} 使用普通补气按钮 +2 气 → ${p.qi}`);
    return { ok: true, message: '+2 气', triggeredQi: true };
  }

  /** 大补气按钮：+3 气，整局限 1 次，第 7 回合（roundCount >= 6）后激活 */
  useBigQiButton(actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    if (this.state.roundCount < 6) return { ok: false, message: `大补气第 7 回合后激活（当前第 ${this.state.roundCount + 1} 回合）` };
    const p = this.state.players[actor];
    if (p.usedBigQi) return { ok: false, message: '本局已使用大补气' };
    p.usedBigQi = true;
    p.qi += 3;
    this.log(`玩家${actor + 1} 使用大补气按钮 +3 气 → ${p.qi}`);
    return { ok: true, message: '+3 气', triggeredQi: true };
  }

  /** 手动爆气：消耗 6 气，获得 1 层兵法增幅（武将攻击 +1），持续 3 回合 */
  useManualBurst(actor: PlayerId): EffectResult {
    if (!this.canAct(actor)) return { ok: false, message: '非己方行动阶段' };
    const p = this.state.players[actor];
    const MANUAL_BURST_COST = 6;
    if (p.qi < MANUAL_BURST_COST) return { ok: false, message: `气量不足（需 ${MANUAL_BURST_COST} 气，当前 ${p.qi}）` };
    p.qi -= MANUAL_BURST_COST;
    addStrategy(p, `manual_burst_${this.state.roundCount}_${actor}`, StrategyType.MengDe, 1);
    const total = totalStrategyLayers(p);
    this.log(
      `玩家${actor + 1} 手动爆气 · 消耗 ${MANUAL_BURST_COST} 气 → 兵法 +1 层 · 总层数 ${total} · 剩余气 ${p.qi}`,
    );
    return { ok: true, message: `消耗 6 气 · 兵法 +1 层（总 ${total}）` };
  }

  // ============ 回合终局流程 ============

  /** 当前行动玩家主动结束行动：标记已结束，操作权交给对方；双方都结束后才触发回合终局 */
  endActionPhase(): EffectResult {
    if (this.turn.isAwaitingDefense()) return { ok: false, message: '请先完成防御响应' };
    if (this.emergencyHealPending !== null) return { ok: false, message: '等待紧急救血' };
    if (this.ultimateSavePending !== null) return { ok: false, message: '等待绝杀急救选择' };
    if (!this.turn.isInActionPhase()) return { ok: false, message: '非行动阶段' };
    const actor = this.turn.activePlayer;
    if (this.state.actionEnded[actor]) return { ok: false, message: '你已结束行动' };

    this.state.actionEnded[actor] = true;
    const other = (1 - actor) as PlayerId;
    this.log(`玩家${actor + 1} 结束行动`);

    if (!this.state.actionEnded[other]) {
      // 对方还没结束行动 → 操作权交给对方
      this.turn.setActivePlayer(other);
      this.log(`操作权交给玩家${other + 1}`);
      return { ok: true, message: '结束行动 · 等待对方行动' };
    }
    // 双方都已结束行动 → 触发回合终局
    this.log(`双方均已结束行动 · 回合终局`);
    this.endTurn();
    return { ok: true, message: '回合结束' };
  }

  /** 完整回合结束流程：清桌 → 终局结算 → 补牌 → 互换先手 → 下一回合 */
  endTurn(): void {
    // 0. 回合结束：桌面所有已打出实体卡牌统一进弃牌堆（手牌保留；状态标记跨回合保留）
    if (this.state.table.length > 0) {
      this.state.discard.push(...this.state.table);
      this.log(`回合结束 · 桌面清牌 ${this.state.table.length} 张 → 弃牌堆`);
      this.state.table = [];
    }

    // 1. 回合终局结算
    this.turn.phase = TurnPhase.Settle;
    const qiRecovery = this.state.roundCount % 2 === 0; // 每 2 回合补一次气
    for (const p of this.state.players) {
      // 全局回气：每 2 回合双方各 +1
      if (qiRecovery) p.qi += 1;
      // 兵法倒计时 -1（状态标记跨回合保留，仅按回合计时衰减）
      tickStrategies(p);
      // 鱼鳞阵倒计时 -1
      if (p.yulin.active) {
        p.yulin.remainingTurns -= 1;
        if (p.yulin.remainingTurns <= 0) {
          p.yulin = { active: false, remainingTurns: 0 };
          this.log(`玩家${p.id + 1} 鱼鳞阵到期消失`);
        }
      }
    }
    // 龟背阵效果倒计时 -1，归 0 清除
    if (this.guiBeiRemainingTurns > 0) {
      this.guiBeiRemainingTurns -= 1;
      if (this.guiBeiRemainingTurns === 0) {
        this.guiBeiProtector = null;
        this.guiBeiLayers = 0;
        this.log(`龟背阵效果到期消失`);
      }
    }
    this.log(`回合结算 · ${qiRecovery ? '双方各 +1 气 · ' : ''}兵法倒计时 -1`);
    this.gameOverInstant = true; // 回合终局系统判定(牌库耗尽等)
    if (this.state.checkGameOver()) return;

    // 2. 补牌阶段
    this.turn.phase = TurnPhase.Draw;
    for (let i = 0; i < 2; i++) {
      const pid = i as PlayerId;
      const drawn = this.state.drawForTurn(pid);
      this.log(`玩家${pid + 1} 补牌 ${drawn} 张 · 手牌 ${this.state.players[pid].hand.length}`);
    }
    if (this.state.checkGameOver()) return;

    // 3. 互换先手
    this.turn.phase = TurnPhase.SwitchFirst;
    this.state.roundCount += 1;
    this.state.setFirstPlayerForRound();
    this.turn.setFirstPlayer(this.state.firstPlayer);
    this.state.resetTurnCounters();
    this.log(`回合 ${this.state.roundCount} · 玩家 ${this.state.firstPlayer + 1} 先手`);

    // 4. 进入下一回合行动阶段
    this.turn.resetToAction();
  }

  /** 获取当前战斗状态描述（UI 用） */
  getBattleStateLabel(player: PlayerId): string {
    const p = this.state.players[player];
    const state = getBattleState(p);
    switch (state) {
      case BattleState.Normal: return '正常';
      case BattleState.LowHp: return '缺血·攻+1';
      case BattleState.Critical: return '残血·攻+1·耗气-1';
      case BattleState.CriticalBurst: return '残爆·攻+2·耗气-1';
    }
    return '正常';
  }
}
