/**
 * 三国卡牌对战 · 战斗状态与伤害结算
 * 三大状态互斥：缺血(2血) / 残血(1血) / 残爆(1血+任意兵法层数)
 * 残爆覆盖缺血与普通残血效果，但保留残血 0 费出牌特权
 *
 * 最终伤害结算公式：
 *   真实伤害 = 武将基础攻击 + 全部兵法层数 + 状态增伤(0/1/2)
 */
import { BattleState, PlayerState, StrategyRecord, StrategyType } from './types';
import { CardCategory, CardDef } from './types';

/** 血量上限 */
export const HP_MAX = 12;
/** 初始血量 */
export const HP_INIT = 8;
/** 初始气量 */
export const QI_INIT = 6;
/** 兵法持续回合数 */
export const STRATEGY_DURATION_TURNS = 3;

/** 计算玩家兵法总层数 */
export function totalStrategyLayers(player: PlayerState): number {
  return player.strategies.reduce((sum, s) => sum + s.layers, 0);
}

/** 判定玩家当前战斗状态（互斥，残爆覆盖残血） */
export function getBattleState(player: PlayerState): BattleState {
  if (player.hp <= 0) return BattleState.Normal; // 已败，不再判定
  if (player.hp === 1) {
    // 残血 / 残爆
    if (totalStrategyLayers(player) > 0) {
      return BattleState.CriticalBurst; // 残爆
    }
    return BattleState.Critical; // 普通残血
  }
  if (player.hp === 2) {
    return BattleState.LowHp; // 缺血
  }
  return BattleState.Normal;
}

/** 获取状态增伤值（0/1/2） */
export function getStateBonus(player: PlayerState): number {
  switch (getBattleState(player)) {
    case BattleState.CriticalBurst: return 2;
    case BattleState.Critical:      return 1;
    case BattleState.LowHp:         return 1;
    default:                        return 0;
  }
}

/**
 * 计算武将牌实际耗气（残血状态下 -1，最低 0）
 * @param cardDef 武将卡牌定义
 * @param player 出牌玩家
 */
export function calcGeneralCost(cardDef: CardDef, player: PlayerState): number {
  if (cardDef.category !== CardCategory.General) return 0;
  let cost = cardDef.cost;
  const state = getBattleState(player);
  // 残血 / 残爆 都享有 0 费出牌特权（残爆覆盖残血但保留此特权）
  if (state === BattleState.Critical || state === BattleState.CriticalBurst) {
    cost = Math.max(0, cost - 1);
  }
  return cost;
}

/**
 * 计算武将攻击造成的最终真实伤害
 * 公式：真实伤害 = 武将基础攻击 + 全部兵法层数 + 状态增伤
 * 注：绝杀/倚天剑不吃任何状态加成，单独走 dealUltimateDamage
 */
export function calcGeneralDamage(cardDef: CardDef, attacker: PlayerState): number {
  if (cardDef.category !== CardCategory.General) return 0;
  const baseAtk = cardDef.value;
  const strategyLayers = totalStrategyLayers(attacker);
  const stateBonus = getStateBonus(attacker);
  return baseAtk + strategyLayers + stateBonus;
}

/**
 * 添加兵法层数（独立倒计时记录，不合并）
 */
export function addStrategy(
  player: PlayerState,
  sourceCardUid: string,
  type: StrategyType,
  layers: number,
): void {
  player.strategies.push({
    sourceCardUid,
    type,
    layers,
    remainingTurns: STRATEGY_DURATION_TURNS,
  });
}

/**
 * 回合终局结算：所有兵法状态倒计时 -1，到期清除
 */
export function tickStrategies(player: PlayerState): void {
  const remaining: StrategyRecord[] = [];
  for (const s of player.strategies) {
    s.remainingTurns -= 1;
    if (s.remainingTurns > 0) {
      remaining.push(s);
    }
  }
  player.strategies = remaining;
}

/**
 * 移除 1 层兵法（魅惑牌效果）：从最早记录开始扣，层数归零则移除该记录
 * @returns 实际移除的层数（0 或 1）
 */
export function removeStrategyLayer(player: PlayerState): number {
  for (const s of player.strategies) {
    if (s.layers > 0) {
      s.layers -= 1;
      if (s.layers === 0) {
        const idx = player.strategies.indexOf(s);
        if (idx >= 0) player.strategies.splice(idx, 1);
      }
      return 1;
    }
  }
  return 0;
}

/**
 * 判定玩家是否处于「绝杀击杀」状态（用于禁止补血）
 * 此函数仅返回玩家血量是否 ≤0，绝杀不可急救的逻辑在 GameEngine.applyDamage 中处理
 */
export function isDown(player: PlayerState): boolean {
  return player.hp <= 0;
}
