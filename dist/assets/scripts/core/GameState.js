"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = void 0;
/**
 * 三国卡牌对战 · 全局游戏状态对象
 * 严格按文档：业务逻辑与 UI 渲染彻底分开
 * UI 只读取 GameState 做显示，不处理业务
 */
const types_1 = require("./types");
const cards_1 = require("./cards");
const BattleState_1 = require("./BattleState");
/** 全局游戏状态 */
class GameState {
    constructor() {
        /** 公共牌库（剩余可抽） */
        this.deck = [];
        /** 弃牌堆 */
        this.discard = [];
        /** 当前回合数（从 1 开始） */
        this.roundCount = 1;
        /** 当前回合阶段 */
        this.phase = types_1.TurnPhase.Action;
        /** 本回合先手玩家 */
        this.firstPlayer = 0;
        /** 当前行动玩家（出牌方） */
        this.activePlayer = 0;
        /** 当前受击玩家（防御方） */
        this.defensePlayer = 1;
        /** 追风阵生效标记：若设置，则下回合不互换先手 */
        this.zhuiFengActive = false;
        /** 本回合双方是否已结束行动（双方都 true 时才触发回合终局） */
        this.actionEnded = [false, false];
        /** 牌库是否已耗尽 */
        this.deckDepleted = false;
        /** 游戏是否结束 */
        this.gameOver = false;
        /** 游戏结果 */
        this.result = null;
        /** 全局实例 ID 计数器 */
        this.uidCounter = 0;
        this.players = [
            this.createPlayer(0),
            this.createPlayer(1),
        ];
    }
    createPlayer(id) {
        return {
            id,
            hp: BattleState_1.HP_INIT,
            qi: BattleState_1.QI_INIT,
            hand: [],
            strategies: [],
            usedNormalQi: false,
            usedBigQi: false,
            hpLossQiThisTurn: 0,
            overkill: 0,
        };
    }
    /** 生成实例唯一 UID */
    genUid(prefix = 'c') {
        return `${prefix}_${this.uidCounter++}`;
    }
    /** 将 CardDef 转为 CardInstance */
    toInstance(def) {
        return { uid: this.genUid(def.id), def };
    }
    /** 初始化牌库：107 张彻底洗牌 */
    initDeck() {
        const defs = (0, cards_1.buildFullDeck)();
        (0, cards_1.assertDeckSize)(defs); // 数量自检
        const instances = defs.map(d => this.toInstance(d));
        this.shuffleInPlace(instances);
        this.deck = instances;
        this.discard = [];
    }
    /** Fisher-Yates 洗牌（原地） */
    shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
    /** 双方各抽 5 张初始手牌 */
    dealInitialHands() {
        for (let i = 0; i < 5; i++) {
            for (const p of this.players) {
                const c = this.deck.pop();
                if (c)
                    p.hand.push(c);
            }
        }
    }
    /** 从牌库顶抽 1 张（牌库空则返回 null 并标记耗尽） */
    drawOne() {
        const c = this.deck.pop();
        if (!c) {
            this.deckDepleted = true;
            return null;
        }
        return c;
    }
    /** 补牌阶段：手牌为空补 4 张，否则补 3 张 */
    drawForTurn(player) {
        const p = this.players[player];
        const drawCount = p.hand.length === 0 ? 4 : 3;
        let actual = 0;
        for (let i = 0; i < drawCount; i++) {
            const c = this.drawOne();
            if (!c)
                break;
            p.hand.push(c);
            actual++;
        }
        return actual;
    }
    /** 设置先手玩家（首回合随机，后续自动互换） */
    setFirstPlayerForRound() {
        if (this.roundCount === 1) {
            // 第一回合随机
            this.firstPlayer = Math.random() < 0.5 ? 0 : 1;
        }
        else {
            // 追风阵生效则保持当前先手不变
            if (this.zhuiFengActive) {
                this.zhuiFengActive = false; // 仅生效 1 回合
                // firstPlayer 不变
            }
            else {
                // 默认互换
                this.firstPlayer = (1 - this.firstPlayer);
            }
        }
        this.activePlayer = this.firstPlayer;
        this.defensePlayer = (1 - this.firstPlayer);
    }
    /** 切换行动玩家 */
    switchActivePlayer() {
        this.activePlayer = (1 - this.activePlayer);
        this.defensePlayer = (1 - this.activePlayer);
    }
    /** 获取玩家 */
    getPlayer(id) {
        return this.players[id];
    }
    /** 获取对手 */
    getOpponent(id) {
        return this.players[(1 - id)];
    }
    /** 判定游戏是否应结束（牌库耗尽或血量≤0） */
    checkGameOver() {
        // 血量判定
        for (const p of this.players) {
            if (p.hp <= 0) {
                this.gameOver = true;
                this.result = {
                    winner: (1 - p.id),
                    reason: types_1.GameOverReason.HpZero,
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
                this.result = { winner: 0, reason: types_1.GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血量高者胜' };
            }
            else if (b.hp > a.hp) {
                this.result = { winner: 1, reason: types_1.GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血量高者胜' };
            }
            else if (a.qi > b.qi) {
                this.result = { winner: 0, reason: types_1.GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血平气高者胜' };
            }
            else if (b.qi > a.qi) {
                this.result = { winner: 1, reason: types_1.GameOverReason.DeckEmpty, detail: '牌库耗尽 · 血平气高者胜' };
            }
            else {
                this.result = { winner: null, reason: types_1.GameOverReason.DeckEmpty, detail: '牌库耗尽 · 双方相同 · 平局' };
            }
            return true;
        }
        return false;
    }
    /** 重置回合内的临时计数（如掉血补气计数、行动结束标记） */
    resetTurnCounters() {
        for (const p of this.players) {
            p.hpLossQiThisTurn = 0;
        }
        this.actionEnded = [false, false];
    }
    /** 序列化为纯对象（供 UI 快照、调试、保存） */
    toSnapshot() {
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
exports.GameState = GameState;
//# sourceMappingURL=GameState.js.map