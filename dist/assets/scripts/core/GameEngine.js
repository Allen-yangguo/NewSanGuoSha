"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEngine = void 0;
/**
 * 三国卡牌对战 · 主游戏引擎
 * 集成 GameState + TurnMachine + 战斗状态 + 卡牌效果实现 + 气量闭环 + 胜负判定
 *
 * 设计原则（按文档）：
 * 1. 业务逻辑与 UI 渲染彻底分开 — UI 只读取 state 做显示
 * 2. 严格按文档时序做状态机
 * 3. 兵法每条状态独立倒计时（不只记总层数）
 */
const types_1 = require("./types");
const GameState_1 = require("./GameState");
const TurnMachine_1 = require("./TurnMachine");
const BattleState_1 = require("./BattleState");
class GameEngine {
    constructor() {
        this.turn = new TurnMachine_1.TurnMachine();
        /** 当前待结算的攻击（武将攻击后进入受击响应时设置） */
        this.pendingAttack = null;
        /** 当前防御响应中累积的防具总防御值 */
        this.defensePool = 0;
        /** 当前防御响应中是否已打出八卦阵 */
        this.baguaTriggered = false;
        /** 当前防御响应中已使用的防具卡（用于弃牌） */
        this.usedArmorCards = [];
        /** 当前防御响应中已使用的八卦阵卡（用于弃牌） */
        this.usedBaguaCards = [];
        /** 紧急救血等待中（普通攻击打至 0 血，可补血续命） */
        this.emergencyHealPending = null;
        /** 历史日志（用于 UI 显示与调试） */
        this.logs = [];
        this.state = new GameState_1.GameState();
    }
    /** 日志 */
    log(msg) {
        this.logs.push(`[回合${this.state.roundCount}] ${msg}`);
        if (this.logs.length > 200)
            this.logs.shift();
    }
    /** 初始化对局 */
    initGame() {
        this.state.initDeck();
        this.state.dealInitialHands();
        this.state.setFirstPlayerForRound();
        this.turn.setFirstPlayer(this.state.firstPlayer);
        this.turn.phase = types_1.TurnPhase.Action;
        this.turn.subPhase = TurnMachine_1.ActionSubPhase.Idle;
        this.log(`对局开始 · 玩家 ${this.state.firstPlayer + 1} 先手`);
    }
    /** 获取当前行动玩家 */
    get activePlayer() { return this.state.players[this.turn.activePlayer]; }
    /** 简写：获取玩家 */
    getPlayer(id) { return this.state.players[id]; }
    /** 获取对手 */
    getOpponent(id) { return this.state.players[(1 - id)]; }
    /** 校验是否轮到该玩家行动 */
    canAct(actor) {
        if (this.state.gameOver)
            return false;
        if (this.turn.isAwaitingDefense()) {
            // 防御响应阶段：防御者可打防具/八卦阵；攻击者不可行动
            return actor === this.pendingAttack?.defender;
        }
        if (this.emergencyHealPending !== null) {
            // 紧急救血阶段：被击杀方可打补血牌
            return actor === this.emergencyHealPending;
        }
        // 行动阶段：仅当前行动玩家且未结束行动方可出牌
        return this.turn.isInActionPhase()
            && actor === this.turn.activePlayer
            && !this.state.actionEnded[actor];
    }
    /** 判断行动阶段玩家是否还有牌可出（手牌为空或气量不足以打出任何牌时返回 false） */
    canPlayAnyCard(actor) {
        const p = this.state.players[actor];
        if (p.hand.length === 0)
            return false;
        // 防御阶段：只需检查有无防具/八卦阵
        if (this.turn.isAwaitingDefense()) {
            return p.hand.some(c => c.def.category === types_1.CardCategory.Armor
                || (c.def.category === types_1.CardCategory.Formation && c.def.subtype === types_1.FormationType.BaGua));
        }
        // 紧急救血阶段：只需检查有无补血牌
        if (this.emergencyHealPending === actor) {
            return p.hand.some(c => c.def.category === types_1.CardCategory.FunctionHp);
        }
        // 行动阶段：武将牌需消耗气量，其他牌无消耗
        if (!this.canAct(actor))
            return false;
        return p.hand.some(c => {
            // 武将牌：检查气量是否足够
            if (c.def.category === types_1.CardCategory.General) {
                return p.qi >= (0, BattleState_1.calcGeneralCost)(c.def, p);
            }
            // 其他牌（补气/补血/兵法/阵法/绝杀）无气耗，均可打出
            return true;
        });
    }
    /** 从手牌中移除一张卡并放入弃牌堆 */
    consumeCard(actor, card) {
        const p = this.state.players[actor];
        const idx = p.hand.findIndex(c => c.uid === card.uid);
        if (idx >= 0)
            p.hand.splice(idx, 1);
        this.state.discard.push(card);
    }
    // ============ 卡牌效果实现 ============
    /** 武将攻击：消耗气量 → 计算伤害 → 进入受击响应 */
    playGeneralAttack(card, actor) {
        if (!this.canAct(actor))
            return { ok: false, message: '非己方行动阶段' };
        if (card.def.category !== types_1.CardCategory.General)
            return { ok: false, message: '非武将牌' };
        if (this.turn.isAwaitingDefense())
            return { ok: false, message: '当前正在等待防御响应' };
        const attacker = this.state.players[actor];
        const defender = this.state.players[(1 - actor)];
        const cost = (0, BattleState_1.calcGeneralCost)(card.def, attacker);
        if (attacker.qi < cost) {
            return { ok: false, message: `气量不足：需要 ${cost}，当前 ${attacker.qi}` };
        }
        attacker.qi -= cost;
        const damage = (0, BattleState_1.calcGeneralDamage)(card.def, attacker);
        const stateBonus = (0, BattleState_1.getStateBonus)(attacker);
        const stratLayers = (0, BattleState_1.totalStrategyLayers)(attacker);
        this.log(`玩家${actor + 1} 打出【${card.def.name}】耗气 ${cost} → 伤害 ${damage} ` +
            `(基础${card.def.value}+兵法${stratLayers}+状态${stateBonus})`);
        this.consumeCard(actor, card);
        // 设置待结算攻击，进入防御响应
        const defenderId = (1 - actor);
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
    playArmor(card, actor) {
        if (!this.turn.isAwaitingDefense())
            return { ok: false, message: '非受击阶段' };
        if (card.def.category !== types_1.CardCategory.Armor)
            return { ok: false, message: '非防具牌' };
        if (this.baguaTriggered)
            return { ok: false, message: '已打出八卦阵，不可再用防具' };
        if (this.pendingAttack?.defender !== actor)
            return { ok: false, message: '非防御方' };
        this.defensePool += card.def.value;
        this.usedArmorCards.push(card);
        this.consumeCard(actor, card);
        this.log(`玩家${actor + 1} 打出【${card.def.name}】防 ${card.def.value} · 累计防御 ${this.defensePool}`);
        return { ok: true, message: `防具累计防御 ${this.defensePool}` };
    }
    /** 功能-补气：+气量 */
    playFunctionQi(card, actor) {
        if (!this.canAct(actor))
            return { ok: false, message: '非己方行动阶段' };
        if (card.def.category !== types_1.CardCategory.FunctionQi)
            return { ok: false, message: '非补气牌' };
        const p = this.state.players[actor];
        p.qi += card.def.value;
        this.log(`玩家${actor + 1} 打出【${card.def.name}】+${card.def.value} 气 → 当前 ${p.qi}`);
        this.consumeCard(actor, card);
        return { ok: true, message: `+${card.def.value} 气`, triggeredQi: true };
    }
    /** 功能-补血：未满血回血 / 满血转气；紧急救血时需先抵消溢出伤害 */
    playFunctionHp(card, actor) {
        if (card.def.category !== types_1.CardCategory.FunctionHp)
            return { ok: false, message: '非补血牌' };
        const p = this.state.players[actor];
        // 紧急救血阶段：补血需先抵消 overkill
        if (this.emergencyHealPending === actor) {
            const overkill = p.overkill;
            const effective = card.def.value - overkill;
            this.consumeCard(actor, card);
            if (effective > 0) {
                // 补血量 > 溢出 → 救活，剩余回血
                p.hp = Math.min(BattleState_1.HP_MAX, p.hp + effective);
                p.overkill = 0;
                this.emergencyHealPending = null;
                this.log(`玩家${actor + 1} 紧急救血成功 +${effective} 血 → HP ${p.hp}`);
                return { ok: true, message: `紧急救血 +${effective}`, triggeredHeal: true };
            }
            else {
                // 补血量 <= 溢出 → 抵扣部分溢出，仍未救活
                p.overkill = overkill - card.def.value;
                this.log(`玩家${actor + 1} 补血 ${card.def.value} 抵扣溢出 · 剩余溢出 ${p.overkill}`);
                // 检查剩余手牌是否还能救
                const remaining = this.totalHealInHand(actor);
                if (remaining <= p.overkill) {
                    this.emergencyHealPending = null;
                    p.overkill = 0;
                    this.log(`玩家${actor + 1} 剩余补血 ${remaining} 不足 · 无法挽救`);
                    this.state.checkGameOver();
                    return { ok: true, message: '补血不足 · 无法挽救', triggeredHeal: true };
                }
                return { ok: true, message: `抵扣溢出 ${card.def.value} · 剩余溢出 ${p.overkill}`, triggeredHeal: true };
            }
        }
        if (!this.canAct(actor)) {
            return { ok: false, message: '非己方行动阶段' };
        }
        if (p.hp < BattleState_1.HP_MAX) {
            const before = p.hp;
            p.hp = Math.min(BattleState_1.HP_MAX, p.hp + card.def.value);
            const healed = p.hp - before;
            this.log(`玩家${actor + 1} 打出【${card.def.name}】回 ${healed} 血 → 当前 ${p.hp}/${BattleState_1.HP_MAX}`);
            this.consumeCard(actor, card);
            return { ok: true, message: `回 ${healed} 血`, triggeredHeal: true };
        }
        else {
            // 满血时 1:1 转化为气量
            p.qi += card.def.value;
            this.log(`玩家${actor + 1} 打出【${card.def.name}】满血转气 +${card.def.value} → 气 ${p.qi}`);
            this.consumeCard(actor, card);
            return { ok: true, message: `满血转气 +${card.def.value}`, triggeredQi: true };
        }
    }
    /** 兵法：获得兵法层数（独立倒计时） */
    playStrategy(card, actor) {
        if (!this.canAct(actor))
            return { ok: false, message: '非己方行动阶段' };
        if (card.def.category !== types_1.CardCategory.Strategy)
            return { ok: false, message: '非兵法牌' };
        const p = this.state.players[actor];
        const layers = card.def.value;
        (0, BattleState_1.addStrategy)(p, card.uid, card.def.subtype, layers);
        const total = (0, BattleState_1.totalStrategyLayers)(p);
        this.log(`玩家${actor + 1} 打出【${card.def.name}】+${layers} 层兵法 · 持续 3 回合 · 总层数 ${total}`);
        this.consumeCard(actor, card);
        return { ok: true, message: `+${layers} 层兵法 · 总层数 ${total}` };
    }
    /** 绝杀神兵：固定真实伤害，无视防具，击杀不可急救 */
    playUltimate(card, actor) {
        if (!this.canAct(actor))
            return { ok: false, message: '非己方行动阶段' };
        if (card.def.category !== types_1.CardCategory.Ultimate)
            return { ok: false, message: '非绝杀牌' };
        if (this.turn.isAwaitingDefense())
            return { ok: false, message: '当前正在等待防御响应' };
        const target = (1 - actor);
        const damage = card.def.value;
        const isYiTianJian = card.def.subtype === types_1.UltimateType.YiTianJian;
        this.log(`玩家${actor + 1} 打出【${card.def.name}】绝杀 · ${damage} 点真实伤害 · 无视防具`);
        this.consumeCard(actor, card);
        // 直接结算（不进入防御响应，八卦阵无法反弹绝杀）
        this.applyDamage(target, damage, {
            source: 'ultimate',
            isYiTianJian,
            ignoreArmor: true,
            ignoreBagua: true,
        });
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
    playFormation(card, actor) {
        if (card.def.category !== types_1.CardCategory.Formation)
            return { ok: false, message: '非阵法牌' };
        const type = card.def.subtype;
        if (type === types_1.FormationType.BaGua) {
            // 八卦阵：受击阶段打出
            if (!this.turn.isAwaitingDefense())
                return { ok: false, message: '八卦阵需在受击时打出' };
            if (this.pendingAttack?.defender !== actor)
                return { ok: false, message: '非防御方' };
            if (this.baguaTriggered)
                return { ok: false, message: '本回合已打出八卦阵' };
            // 无法反弹绝杀/倚天剑
            if (this.pendingAttack?.source === 'ultimate') {
                return { ok: false, message: '八卦阵无法反弹绝杀' };
            }
            // 反弹受击不可再出八卦阵（八卦阵不可嵌套反弹）
            if (this.pendingAttack?.isReflect) {
                return { ok: false, message: '反弹伤害不可再出八卦阵' };
            }
            this.baguaTriggered = true;
            this.usedBaguaCards.push(card);
            this.consumeCard(actor, card);
            this.log(`玩家${actor + 1} 打出【八卦阵】· 将全额反弹武将伤害`);
            return { ok: true, message: '八卦阵生效 · 待结算时反弹', triggeredReflect: true };
        }
        if (type === types_1.FormationType.ZhuiFeng) {
            // 追风阵：自身回合打出
            if (!this.canAct(actor))
                return { ok: false, message: '非己方行动阶段' };
            if (this.turn.isAwaitingDefense())
                return { ok: false, message: '当前正在等待防御响应' };
            this.state.zhuiFengActive = true;
            this.log(`玩家${actor + 1} 打出【追风阵】· 下回合仍为己方先手`);
            this.consumeCard(actor, card);
            return { ok: true, message: '追风阵生效 · 下回合仍为先手' };
        }
        return { ok: false, message: '未知阵法' };
    }
    // ============ 防御响应 ============
    /** 防御方主动结束防御响应（不再出防具/八卦阵），进入伤害结算 */
    defenderPass() {
        if (!this.turn.isAwaitingDefense())
            return { ok: false, message: '非受击阶段' };
        return this.resolvePendingAttack();
    }
    /** 结算待处理的攻击 */
    resolvePendingAttack() {
        if (!this.pendingAttack)
            return { ok: false, message: '无待结算攻击' };
        const atk = this.pendingAttack;
        this.pendingAttack = null;
        this.turn.exitDefenseResponse();
        if (this.baguaTriggered) {
            // 八卦阵反弹：将原攻击者转为受击方，A 可出防具抵消（但不可再出八卦阵）
            this.log(`八卦阵反弹 ${atk.damage} 点伤害至玩家${atk.attacker + 1} · A 可出防具抵消`);
            this.usedBaguaCards = [];
            this.usedArmorCards = [];
            this.baguaTriggered = false;
            this.defensePool = 0;
            // 构造反弹 pendingAttack：攻击者为 B（原防御方），防御者为 A（原攻击方），标记为反弹
            // 反弹伤害仍视为 general 来源（武将伤害），便于急救规则
            this.pendingAttack = {
                damage: atk.damage,
                source: 'general',
                isYiTianJian: false,
                attacker: atk.defender,
                defender: atk.attacker,
                sourceCardUid: atk.sourceCardUid,
                isReflect: true,
            };
            // 切换 activePlayer 为 A（受击方），A 进入防御响应阶段
            this.turn.setActivePlayer(atk.attacker);
            this.turn.enterDefenseResponse();
            return { ok: true, message: `八卦阵反弹 ${atk.damage} 伤害 · 玩家${atk.attacker + 1} 可出防具`, triggeredReflect: true };
        }
        // 普通结算：伤害 - 防御池
        const finalDamage = Math.max(0, atk.damage - this.defensePool);
        this.log(`伤害结算：${atk.damage} - 防具 ${this.defensePool} = ${finalDamage} → 玩家${atk.defender + 1}`);
        this.usedArmorCards = [];
        this.defensePool = 0;
        if (finalDamage > 0) {
            this.applyDamage(atk.defender, finalDamage, {
                source: atk.source,
                isYiTianJian: atk.isYiTianJian,
                ignoreArmor: false,
                ignoreBagua: false,
            });
        }
        if (this.state.gameOver)
            return { ok: true, message: '击杀 · 游戏结束', triggeredDamage: true };
        if (this.emergencyHealPending !== null) {
            return { ok: true, message: '玩家被打至 0 血 · 可紧急救血', triggeredDamage: true };
        }
        // 攻击权切换：
        // - 反弹结算：攻击权交给 A（原攻击方，即 atk.defender），A 可继续行动/继续攻击
        // - 普通结算：防御方有武将牌则轮到防御方，否则攻击方继续
        if (atk.isReflect) {
            this.turn.setActivePlayer(atk.defender);
            this.log(`反弹结算完成 · 攻击权交回玩家${atk.defender + 1}`);
        }
        else {
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
    switchActiveAfterAttackResolve(attacker, defender) {
        const defenderHasGeneral = this.hasGeneralInHand(defender);
        const defenderCanAct = !this.state.actionEnded[defender];
        if (defenderHasGeneral && defenderCanAct) {
            // 防御方有武将牌且未结束行动：轮到防御方攻击
            this.turn.setActivePlayer(defender);
            this.log(`攻击权切换 · 轮到玩家${defender + 1} 攻击`);
        }
        else {
            // 防御方没有武将牌或已结束行动：攻击方继续行动（连击）
            this.turn.setActivePlayer(attacker);
            this.log(`玩家${defender + 1} 无武将牌或已结束行动 · 玩家${attacker + 1} 可继续连击`);
        }
    }
    /** 判断玩家手牌中是否还有武将攻击牌 */
    hasGeneralInHand(playerId) {
        return this.state.players[playerId].hand.some(c => c.def.category === types_1.CardCategory.General);
    }
    /**
     * 伤害结算核心
     * @param targetId 受击方
     * @param amount 实际扣血量（已扣除防具）
     * @param opts 来源信息
     */
    applyDamage(targetId, amount, opts) {
        if (amount <= 0)
            return;
        const target = this.state.players[targetId];
        const before = target.hp;
        target.hp = Math.max(0, target.hp - amount);
        const actualLoss = before - target.hp;
        this.log(`玩家${targetId + 1} 扣血 ${actualLoss} → HP ${target.hp}/${BattleState_1.HP_MAX}`);
        // 掉血补气：每一次有效扣血事件 +1 气（无伤格挡/反弹不补气）
        if (actualLoss > 0) {
            target.qi += 1;
            target.hpLossQiThisTurn += 1;
            this.log(`玩家${targetId + 1} 掉血补气 +1 → 气 ${target.qi}`);
        }
        if (target.hp <= 0) {
            const overkill = amount - before;
            if (opts.source === 'ultimate') {
                // 绝杀击杀：直接判负
                this.log(`玩家${targetId + 1} 被绝杀击杀 · 不可急救`);
                this.state.checkGameOver();
            }
            else {
                // 普通攻击打至 0 血：检查能否通过补血救活
                const totalHeal = this.totalHealInHand(targetId);
                if (totalHeal > overkill) {
                    // 有救 → 进入紧急救血
                    target.overkill = overkill;
                    this.emergencyHealPending = targetId;
                    this.log(`玩家${targetId + 1} 被打至 0 血 · 溢出 ${overkill} · 可救血（手牌补血 ${totalHeal}）`);
                }
                else {
                    // 无救 → 直接判负
                    this.log(`玩家${targetId + 1} 补血量 ${totalHeal} 不足覆盖溢出 ${overkill} · 无法挽救`);
                    this.state.checkGameOver();
                }
            }
        }
    }
    /** 计算手牌中所有补血牌的总补血量 */
    totalHealInHand(pid) {
        return this.state.players[pid].hand
            .filter(c => c.def.category === types_1.CardCategory.FunctionHp)
            .reduce((sum, c) => sum + c.def.value, 0);
    }
    /** 紧急救血阶段：被击杀方放弃补血，接受败北 */
    emergencyHealGiveUp() {
        if (this.emergencyHealPending === null)
            return { ok: false, message: '非紧急救血阶段' };
        const id = this.emergencyHealPending;
        this.emergencyHealPending = null;
        this.log(`玩家${id + 1} 放弃补血 · 接受败北`);
        this.state.checkGameOver();
        return { ok: true, message: '游戏结束' };
    }
    // ============ 玩家本局专属固有能力按钮 ============
    /** 普通补气按钮：+2 气，整局限 1 次，第 4 回合（roundCount >= 3）后激活 */
    useNormalQiButton(actor) {
        if (!this.canAct(actor))
            return { ok: false, message: '非己方行动阶段' };
        if (this.state.roundCount < 3)
            return { ok: false, message: `普通补气第 4 回合后激活（当前第 ${this.state.roundCount + 1} 回合）` };
        const p = this.state.players[actor];
        if (p.usedNormalQi)
            return { ok: false, message: '本局已使用普通补气' };
        p.usedNormalQi = true;
        p.qi += 2;
        this.log(`玩家${actor + 1} 使用普通补气按钮 +2 气 → ${p.qi}`);
        return { ok: true, message: '+2 气', triggeredQi: true };
    }
    /** 大补气按钮：+3 气，整局限 1 次，第 7 回合（roundCount >= 6）后激活 */
    useBigQiButton(actor) {
        if (!this.canAct(actor))
            return { ok: false, message: '非己方行动阶段' };
        if (this.state.roundCount < 6)
            return { ok: false, message: `大补气第 7 回合后激活（当前第 ${this.state.roundCount + 1} 回合）` };
        const p = this.state.players[actor];
        if (p.usedBigQi)
            return { ok: false, message: '本局已使用大补气' };
        p.usedBigQi = true;
        p.qi += 3;
        this.log(`玩家${actor + 1} 使用大补气按钮 +3 气 → ${p.qi}`);
        return { ok: true, message: '+3 气', triggeredQi: true };
    }
    /** 手动爆气：消耗 6 气，获得 1 层兵法增幅（武将攻击 +1），持续 3 回合 */
    useManualBurst(actor) {
        if (!this.canAct(actor))
            return { ok: false, message: '非己方行动阶段' };
        const p = this.state.players[actor];
        const MANUAL_BURST_COST = 6;
        if (p.qi < MANUAL_BURST_COST)
            return { ok: false, message: `气量不足（需 ${MANUAL_BURST_COST} 气，当前 ${p.qi}）` };
        p.qi -= MANUAL_BURST_COST;
        (0, BattleState_1.addStrategy)(p, `manual_burst_${this.state.roundCount}_${actor}`, types_1.StrategyType.MengDe, 1);
        const total = (0, BattleState_1.totalStrategyLayers)(p);
        this.log(`玩家${actor + 1} 手动爆气 · 消耗 ${MANUAL_BURST_COST} 气 → 兵法 +1 层 · 总层数 ${total} · 剩余气 ${p.qi}`);
        return { ok: true, message: `消耗 6 气 · 兵法 +1 层（总 ${total}）` };
    }
    // ============ 回合终局流程 ============
    /** 当前行动玩家主动结束行动：标记已结束，操作权交给对方；双方都结束后才触发回合终局 */
    endActionPhase() {
        if (this.turn.isAwaitingDefense())
            return { ok: false, message: '请先完成防御响应' };
        if (this.emergencyHealPending !== null)
            return { ok: false, message: '等待紧急救血' };
        if (!this.turn.isInActionPhase())
            return { ok: false, message: '非行动阶段' };
        const actor = this.turn.activePlayer;
        if (this.state.actionEnded[actor])
            return { ok: false, message: '你已结束行动' };
        this.state.actionEnded[actor] = true;
        const other = (1 - actor);
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
    /** 完整回合结束流程：终局结算 → 补牌 → 互换先手 → 下一回合 */
    endTurn() {
        // 1. 回合终局结算
        this.turn.phase = types_1.TurnPhase.Settle;
        const qiRecovery = this.state.roundCount % 2 === 0; // 每 2 回合补一次气
        for (const p of this.state.players) {
            // 全局回气：每 2 回合双方各 +1
            if (qiRecovery)
                p.qi += 1;
            // 兵法倒计时 -1
            (0, BattleState_1.tickStrategies)(p);
        }
        this.log(`回合结算 · ${qiRecovery ? '双方各 +1 气 · ' : ''}兵法倒计时 -1`);
        if (this.state.checkGameOver())
            return;
        // 2. 补牌阶段
        this.turn.phase = types_1.TurnPhase.Draw;
        for (let i = 0; i < 2; i++) {
            const pid = i;
            const drawn = this.state.drawForTurn(pid);
            this.log(`玩家${pid + 1} 补牌 ${drawn} 张 · 手牌 ${this.state.players[pid].hand.length}`);
        }
        if (this.state.checkGameOver())
            return;
        // 3. 互换先手
        this.turn.phase = types_1.TurnPhase.SwitchFirst;
        this.state.roundCount += 1;
        this.state.setFirstPlayerForRound();
        this.turn.setFirstPlayer(this.state.firstPlayer);
        this.state.resetTurnCounters();
        this.log(`回合 ${this.state.roundCount} · 玩家 ${this.state.firstPlayer + 1} 先手`);
        // 4. 进入下一回合行动阶段
        this.turn.resetToAction();
    }
    /** 获取当前战斗状态描述（UI 用） */
    getBattleStateLabel(player) {
        const p = this.state.players[player];
        const state = (0, BattleState_1.getBattleState)(p);
        switch (state) {
            case types_1.BattleState.Normal: return '正常';
            case types_1.BattleState.LowHp: return '缺血·攻+1';
            case types_1.BattleState.Critical: return '残血·攻+1·耗气-1';
            case types_1.BattleState.CriticalBurst: return '残爆·攻+2·耗气-1';
        }
        return '正常';
    }
}
exports.GameEngine = GameEngine;
//# sourceMappingURL=GameEngine.js.map