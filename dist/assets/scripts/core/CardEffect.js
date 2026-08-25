"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCardEffect = applyCardEffect;
/**
 * 三国卡牌对战 · 卡牌效果分发表
 * 严格按文档架构：CardEffect 卡牌效果函数表，每一类卡牌对应执行函数
 * UI 不处理业务逻辑，仅读取 GameState 做显示
 *
 * 设计：分发表接收 GameEngine 引用，按卡牌类别调用对应引擎方法
 * 引擎方法内含校验（时机/资源/状态），返回结果供 UI 反馈
 */
const types_1 = require("./types");
/** 武将攻击：消耗气量 → 计算伤害 → 受击方进入防御响应 */
const handleGeneral = (engine, card, actor) => {
    return engine.playGeneralAttack(card, actor);
};
/** 防具：受击阶段打出，加入临时防御池 */
const handleArmor = (engine, card, actor) => {
    return engine.playArmor(card, actor);
};
/** 功能-补气：+气量 */
const handleFunctionQi = (engine, card, actor) => {
    return engine.playFunctionQi(card, actor);
};
/** 功能-补血：未满血回血/满血转气 */
const handleFunctionHp = (engine, card, actor) => {
    return engine.playFunctionHp(card, actor);
};
/** 兵法：获得兵法层数（独立倒计时） */
const handleStrategy = (engine, card, actor) => {
    return engine.playStrategy(card, actor);
};
/** 绝杀神兵：固定真实伤害，无视防具，击杀不可急救 */
const handleUltimate = (engine, card, actor) => {
    return engine.playUltimate(card, actor);
};
/** 阵法：八卦阵受击反弹 / 追风阵篡改先手 / 龟背阵减攻 */
const handleFormation = (engine, card, actor) => {
    return engine.playFormation(card, actor);
};
/** 魅惑：对方兵法层 -1，为 0 则对方 -3 气 */
const handleCharm = (engine, card, actor) => {
    return engine.playCharm(card, actor);
};
/** 分发表：按卡牌类别路由到对应处理函数 */
const dispatchTable = {
    [types_1.CardCategory.General]: handleGeneral,
    [types_1.CardCategory.Armor]: handleArmor,
    [types_1.CardCategory.FunctionQi]: handleFunctionQi,
    [types_1.CardCategory.FunctionHp]: handleFunctionHp,
    [types_1.CardCategory.Strategy]: handleStrategy,
    [types_1.CardCategory.Ultimate]: handleUltimate,
    [types_1.CardCategory.Formation]: handleFormation,
    [types_1.CardCategory.Charm]: handleCharm,
};
/**
 * 卡牌效果总入口
 * @param engine 游戏引擎
 * @param card 卡牌实例
 * @param actor 出牌玩家 ID
 */
function applyCardEffect(engine, card, actor) {
    const handler = dispatchTable[card.def.category];
    if (!handler) {
        return { ok: false, message: `未知卡牌类别：${card.def.category}` };
    }
    return handler(engine, card, actor);
}
//# sourceMappingURL=CardEffect.js.map