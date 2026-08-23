"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRATEGY_DURATION_TURNS = exports.QI_INIT = exports.HP_INIT = exports.HP_MAX = void 0;
exports.totalStrategyLayers = totalStrategyLayers;
exports.getBattleState = getBattleState;
exports.getStateBonus = getStateBonus;
exports.calcGeneralCost = calcGeneralCost;
exports.calcGeneralDamage = calcGeneralDamage;
exports.addStrategy = addStrategy;
exports.tickStrategies = tickStrategies;
exports.isDown = isDown;
/**
 * 三国卡牌对战 · 战斗状态与伤害结算
 * 三大状态互斥：缺血(2血) / 残血(1血) / 残爆(1血+任意兵法层数)
 * 残爆覆盖缺血与普通残血效果，但保留残血 0 费出牌特权
 *
 * 最终伤害结算公式：
 *   真实伤害 = 武将基础攻击 + 全部兵法层数 + 状态增伤(0/1/2)
 */
const types_1 = require("./types");
const types_2 = require("./types");
/** 血量上限 */
exports.HP_MAX = 10;
/** 初始血量 */
exports.HP_INIT = 6;
/** 初始气量 */
exports.QI_INIT = 6;
/** 兵法持续回合数 */
exports.STRATEGY_DURATION_TURNS = 3;
/** 计算玩家兵法总层数 */
function totalStrategyLayers(player) {
    return player.strategies.reduce((sum, s) => sum + s.layers, 0);
}
/** 判定玩家当前战斗状态（互斥，残爆覆盖残血） */
function getBattleState(player) {
    if (player.hp <= 0)
        return types_1.BattleState.Normal; // 已败，不再判定
    if (player.hp === 1) {
        // 残血 / 残爆
        if (totalStrategyLayers(player) > 0) {
            return types_1.BattleState.CriticalBurst; // 残爆
        }
        return types_1.BattleState.Critical; // 普通残血
    }
    if (player.hp === 2) {
        return types_1.BattleState.LowHp; // 缺血
    }
    return types_1.BattleState.Normal;
}
/** 获取状态增伤值（0/1/2） */
function getStateBonus(player) {
    switch (getBattleState(player)) {
        case types_1.BattleState.CriticalBurst: return 2;
        case types_1.BattleState.Critical: return 1;
        case types_1.BattleState.LowHp: return 1;
        default: return 0;
    }
}
/**
 * 计算武将牌实际耗气（残血状态下 -1，最低 0）
 * @param cardDef 武将卡牌定义
 * @param player 出牌玩家
 */
function calcGeneralCost(cardDef, player) {
    if (cardDef.category !== types_2.CardCategory.General)
        return 0;
    let cost = cardDef.cost;
    const state = getBattleState(player);
    // 残血 / 残爆 都享有 0 费出牌特权（残爆覆盖残血但保留此特权）
    if (state === types_1.BattleState.Critical || state === types_1.BattleState.CriticalBurst) {
        cost = Math.max(0, cost - 1);
    }
    return cost;
}
/**
 * 计算武将攻击造成的最终真实伤害
 * 公式：真实伤害 = 武将基础攻击 + 全部兵法层数 + 状态增伤
 * 注：绝杀/倚天剑不吃任何状态加成，单独走 dealUltimateDamage
 */
function calcGeneralDamage(cardDef, attacker) {
    if (cardDef.category !== types_2.CardCategory.General)
        return 0;
    const baseAtk = cardDef.value;
    const strategyLayers = totalStrategyLayers(attacker);
    const stateBonus = getStateBonus(attacker);
    return baseAtk + strategyLayers + stateBonus;
}
/**
 * 添加兵法层数（独立倒计时记录，不合并）
 */
function addStrategy(player, sourceCardUid, type, layers) {
    player.strategies.push({
        sourceCardUid,
        type,
        layers,
        remainingTurns: exports.STRATEGY_DURATION_TURNS,
    });
}
/**
 * 回合终局结算：所有兵法状态倒计时 -1，到期清除
 */
function tickStrategies(player) {
    const remaining = [];
    for (const s of player.strategies) {
        s.remainingTurns -= 1;
        if (s.remainingTurns > 0) {
            remaining.push(s);
        }
    }
    player.strategies = remaining;
}
/**
 * 判定玩家是否处于「绝杀击杀」状态（用于禁止补血）
 * 此函数仅返回玩家血量是否 ≤0，绝杀不可急救的逻辑在 GameEngine.applyDamage 中处理
 */
function isDown(player) {
    return player.hp <= 0;
}
//# sourceMappingURL=BattleState.js.map