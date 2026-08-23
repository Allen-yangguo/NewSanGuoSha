"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TurnMachine = exports.ActionSubPhase = void 0;
/**
 * 三国卡牌对战 · 回合时序状态机
 * 严格按文档时序：行动 → 受击防御 → 回合终局结算 → 补牌 → 互换先手
 *
 * 注：受击防御阶段是「行动阶段内的子状态」
 * 即先手玩家打出武将攻击后，后手玩家立即响应（防具/八卦阵/承受），
 * 结算完毕后回到行动阶段，先手玩家可继续连击或结束回合。
 */
const types_1 = require("./types");
/** 行动阶段内的子状态 */
var ActionSubPhase;
(function (ActionSubPhase) {
    ActionSubPhase["Idle"] = "idle";
    ActionSubPhase["AwaitingDefense"] = "awaiting_defense";
})(ActionSubPhase || (exports.ActionSubPhase = ActionSubPhase = {}));
class TurnMachine {
    constructor() {
        /** 当前回合阶段 */
        this.phase = types_1.TurnPhase.Action;
        /** 行动阶段子状态 */
        this.subPhase = ActionSubPhase.Idle;
        /** 当前先手玩家 */
        this.firstPlayer = 0;
        /** 当前行动玩家（出牌方） */
        this.activePlayer = 0;
    }
    /** 是否处于行动阶段 */
    isInActionPhase() {
        return this.phase === types_1.TurnPhase.Action;
    }
    /** 是否在等待防御响应 */
    isAwaitingDefense() {
        return this.phase === types_1.TurnPhase.Action && this.subPhase === ActionSubPhase.AwaitingDefense;
    }
    /** 进入等待防御子状态（先手打出武将攻击后调用） */
    enterDefenseResponse() {
        this.subPhase = ActionSubPhase.AwaitingDefense;
    }
    /** 退出防御子状态，回到行动阶段（伤害结算完毕） */
    exitDefenseResponse() {
        this.subPhase = ActionSubPhase.Idle;
    }
    /** 推进到下一阶段（回合终局 → 补牌 → 互换先手 → 行动） */
    advancePhase() {
        switch (this.phase) {
            case types_1.TurnPhase.Action:
                this.phase = types_1.TurnPhase.Settle;
                break;
            case types_1.TurnPhase.Settle:
                this.phase = types_1.TurnPhase.Draw;
                break;
            case types_1.TurnPhase.Draw:
                this.phase = types_1.TurnPhase.SwitchFirst;
                break;
            case types_1.TurnPhase.SwitchFirst:
                this.phase = types_1.TurnPhase.Action;
                this.subPhase = ActionSubPhase.Idle;
                break;
        }
        return this.phase;
    }
    /** 设置先手玩家 */
    setFirstPlayer(p) {
        this.firstPlayer = p;
        this.activePlayer = p;
    }
    /** 设置当前行动玩家 */
    setActivePlayer(p) {
        this.activePlayer = p;
    }
    /** 重置到行动阶段初始状态 */
    resetToAction() {
        this.phase = types_1.TurnPhase.Action;
        this.subPhase = ActionSubPhase.Idle;
        this.activePlayer = this.firstPlayer;
    }
}
exports.TurnMachine = TurnMachine;
//# sourceMappingURL=TurnMachine.js.map