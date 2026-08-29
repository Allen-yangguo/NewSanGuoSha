/**
 * 三国卡牌对战 · 卡牌效果分发表
 * 严格按文档架构：CardEffect 卡牌效果函数表，每一类卡牌对应执行函数
 * UI 不处理业务逻辑，仅读取 GameState 做显示
 *
 * 设计：分发表接收 GameEngine 引用，按卡牌类别调用对应引擎方法
 * 引擎方法内含校验（时机/资源/状态），返回结果供 UI 反馈
 */
import { CardCategory, CardInstance, ActionContext } from './types';
import type { GameEngine } from './GameEngine';

/** 卡牌效果执行结果 */
export interface EffectResult {
  ok: boolean;
  message: string;
  /** 是否触发了伤害结算（用于 UI 触发动画） */
  triggeredDamage?: boolean;
  /** 是否触发了反弹 */
  triggeredReflect?: boolean;
  /** 是否触发了补血 */
  triggeredHeal?: boolean;
  /** 是否触发了补气 */
  triggeredQi?: boolean;
  /** 是否打出了绝杀 */
  triggeredUltimate?: boolean;
  /** 是否打出了魅惑牌 */
  triggeredCharm?: boolean;
  /** 是否使用了锦囊 */
  pouchUsed?: boolean;
  /** 锦囊产出的实体手牌 */
  card?: CardInstance;
}

/** 单卡效果函数签名 */
type EffectHandler = (engine: GameEngine, card: CardInstance, actor: 0 | 1) => EffectResult;

/** 武将攻击：消耗气量 → 计算伤害 → 受击方进入防御响应 */
const handleGeneral: EffectHandler = (engine, card, actor) => {
  return engine.playGeneralAttack(card, actor);
};

/** 防具：受击阶段打出，加入临时防御池 */
const handleArmor: EffectHandler = (engine, card, actor) => {
  return engine.playArmor(card, actor);
};

/** 功能-补气：+气量 */
const handleFunctionQi: EffectHandler = (engine, card, actor) => {
  return engine.playFunctionQi(card, actor);
};

/** 功能-补血：未满血回血/满血转气 */
const handleFunctionHp: EffectHandler = (engine, card, actor) => {
  return engine.playFunctionHp(card, actor);
};

/** 兵法：获得兵法层数（独立倒计时） */
const handleStrategy: EffectHandler = (engine, card, actor) => {
  return engine.playStrategy(card, actor);
};

/** 绝杀神兵：固定真实伤害，无视防具，击杀不可急救 */
const handleUltimate: EffectHandler = (engine, card, actor) => {
  return engine.playUltimate(card, actor);
};

/** 阵法：八卦阵受击反弹 / 追风阵篡改先手 / 龟背阵减攻 */
const handleFormation: EffectHandler = (engine, card, actor) => {
  return engine.playFormation(card, actor);
};

/** 魅惑：对方兵法层 -1，为 0 则对方 -3 气 */
const handleCharm: EffectHandler = (engine, card, actor) => {
  return engine.playCharm(card, actor);
};

/** 智者：打出获得锦囊状态标记（缺/残/急） */
const handleStrategist: EffectHandler = (engine, card, actor) => {
  return engine.playStrategist(card, actor);
};

/** 分发表：按卡牌类别路由到对应处理函数 */
const dispatchTable: Record<CardCategory, EffectHandler> = {
  [CardCategory.General]:    handleGeneral,
  [CardCategory.Armor]:      handleArmor,
  [CardCategory.FunctionQi]: handleFunctionQi,
  [CardCategory.FunctionHp]: handleFunctionHp,
  [CardCategory.Strategy]:   handleStrategy,
  [CardCategory.Ultimate]:   handleUltimate,
  [CardCategory.Formation]:  handleFormation,
  [CardCategory.Charm]:      handleCharm,
  [CardCategory.Strategist]: handleStrategist,
};

/**
 * 卡牌效果总入口
 * @param engine 游戏引擎
 * @param card 卡牌实例
 * @param actor 出牌玩家 ID
 */
export function applyCardEffect(
  engine: GameEngine,
  card: CardInstance,
  actor: 0 | 1,
): EffectResult {
  const handler = dispatchTable[card.def.category];
  if (!handler) {
    return { ok: false, message: `未知卡牌类别：${card.def.category}` };
  }
  return handler(engine, card, actor);
}
