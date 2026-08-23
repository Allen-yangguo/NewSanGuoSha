"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 引擎初始化与基础流程自检
 * 运行：npm run test:engine
 */
const GameEngine_1 = require("../assets/scripts/core/GameEngine");
const types_1 = require("../assets/scripts/core/types");
const CardEffect_1 = require("../assets/scripts/core/CardEffect");
let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) {
        passed++;
        console.log(`  ✓ ${msg}`);
    }
    else {
        failed++;
        console.log(`  ✗ ${msg}`);
    }
}
function main() {
    console.log('=== 引擎初始化测试 ===');
    const engine = new GameEngine_1.GameEngine();
    engine.initGame();
    assert(engine.state.deck.length === 104 - 10, `牌库剩余 94 张（104-10 初始手牌）实际 ${engine.state.deck.length}`);
    assert(engine.state.players[0].hand.length === 5, '玩家1 初始 5 张手牌');
    assert(engine.state.players[1].hand.length === 5, '玩家2 初始 5 张手牌');
    assert(engine.state.players[0].hp === 6, '玩家1 初始血量 6');
    assert(engine.state.players[1].hp === 6, '玩家2 初始血量 6');
    assert(engine.state.players[0].qi === 6, '玩家1 初始气量 6');
    assert(engine.state.players[1].qi === 6, '玩家2 初始气量 6');
    assert(engine.turn.phase === types_1.TurnPhase.Action, '初始阶段为行动');
    assert(engine.turn.activePlayer === engine.state.firstPlayer, '行动玩家为先手');
    console.log('\n=== 普通补气按钮测试 ===');
    // 使用独立 engine，避免回合推进污染后续测试
    const engineBtn = new GameEngine_1.GameEngine();
    engineBtn.initGame();
    const fp = engineBtn.state.firstPlayer;
    // 辅助：推进 roundCount 到目标值（直接修改 state，避免受 endActionPhase 副作用影响）
    function advanceToRound(engine, target) {
        engine.state.roundCount = target;
    }
    // 前置：第 1 回合（roundCount=0）应被锁
    const r0 = engineBtn.useNormalQiButton(fp);
    assert(!r0.ok, '第 1 回合普通补气未激活');
    // 推进到第 4 回合（roundCount=3）
    advanceToRound(engineBtn, 3);
    const before = engineBtn.state.players[fp].qi;
    const r1 = engineBtn.useNormalQiButton(fp);
    assert(r1.ok, '第 4 回合普通补气按钮可用');
    assert(engineBtn.state.players[fp].qi === before + 2, `+2 气 实际 ${engineBtn.state.players[fp].qi}`);
    const r2 = engineBtn.useNormalQiButton(fp);
    assert(!r2.ok, '普通补气按钮整局限 1 次');
    console.log('\n=== 大补气按钮测试 ===');
    // 前置：推进到第 7 回合（roundCount=6）
    advanceToRound(engineBtn, 6);
    const before2 = engineBtn.state.players[fp].qi;
    const r3 = engineBtn.useBigQiButton(fp);
    assert(r3.ok, '第 7 回合大补气按钮可用');
    assert(engineBtn.state.players[fp].qi === before2 + 3, `+3 气 实际 ${engineBtn.state.players[fp].qi}`);
    const r4 = engineBtn.useBigQiButton(fp);
    assert(!r4.ok, '大补气按钮整局限 1 次');
    console.log('\n=== 补气牌测试 ===');
    const fpMain = engine.state.firstPlayer;
    const fpHand = engine.state.players[fpMain].hand;
    const qiCard = fpHand.find(c => c.def.category === types_1.CardCategory.FunctionQi);
    if (qiCard) {
        const beforeQi = engine.state.players[fpMain].qi;
        const r = (0, CardEffect_1.applyCardEffect)(engine, qiCard, fpMain);
        assert(r.ok, `打出补气牌 ${qiCard.def.name}`);
        assert(engine.state.players[fpMain].qi === beforeQi + qiCard.def.value, `+${qiCard.def.value} 气`);
    }
    else {
        console.log('  ⚠ 本局未抽到补气牌，跳过');
    }
    console.log('\n=== 武将攻击 + 防御响应测试 ===');
    // 找一张武将牌
    const generalCard = engine.state.players[fpMain].hand.find(c => c.def.category === types_1.CardCategory.General);
    if (generalCard) {
        const cost = generalCard.def.cost; // 基础耗气
        // 确保气量足够
        while (engine.state.players[fpMain].qi < cost + 5) {
            engine.state.players[fpMain].qi += 5;
        }
        const atkBefore = engine.state.players[1 - fpMain].hp;
        const r = (0, CardEffect_1.applyCardEffect)(engine, generalCard, fpMain);
        assert(r.ok, `打出武将 ${generalCard.def.name}（攻${generalCard.def.value} 耗气${cost}）`);
        assert(engine.turn.isAwaitingDefense(), '进入防御响应阶段');
        // 防御方放弃防御
        const defR = engine.defenderPass();
        assert(defR.ok, '防御方放弃防御');
        const expectedDmg = generalCard.def.value; // 正常状态 +0
        assert(engine.state.players[1 - fpMain].hp === atkBefore - expectedDmg, `防御方扣血 ${expectedDmg} 实际扣 ${atkBefore - engine.state.players[1 - fpMain].hp}`);
        // 掉血补气
        assert(engine.state.players[1 - fpMain].qi === 6 + 1, // 初始6 + 掉血1 (回合结算的+1还未触发)
        `掉血补气 +1 实际 ${engine.state.players[1 - fpMain].qi}`);
    }
    else {
        console.log('  ⚠ 本局未抽到武将牌，跳过');
    }
    console.log('\n=== 兵法牌测试（攻击前打出）===');
    // 兵法属于辅助牌，应在武将攻击前打出
    const { buildFullDeck } = require('../assets/scripts/core/cards');
    const mengDe = buildFullDeck().find((c) => c.id === 'mengde_0');
    if (mengDe) {
        // 把 activePlayer 重置回先手，确保可行动
        engine.turn.setActivePlayer(fpMain);
        engine.state.players[fpMain].hand.push({ uid: 'test_mengde', def: mengDe });
        const beforeLayers = engine.state.players[fpMain].strategies.length;
        const r = (0, CardEffect_1.applyCardEffect)(engine, { uid: 'test_mengde', def: mengDe }, fpMain);
        assert(r.ok, '打出孟德新书');
        assert(engine.state.players[fpMain].strategies.length === beforeLayers + 1, '兵法记录 +1 条');
        assert(engine.state.players[fpMain].strategies[engine.state.players[fpMain].strategies.length - 1].remainingTurns === 3, '兵法持续 3 回合');
    }
    console.log('\n=== 手动爆气按钮测试 ===');
    // 手动爆气：消耗 6 气，获得 1 层兵法增幅，持续 3 回合
    const engineBurst = new GameEngine_1.GameEngine();
    engineBurst.initGame();
    const fpBurst = engineBurst.state.firstPlayer;
    // 设置足量气（12 气可用 2 次）
    engineBurst.state.players[fpBurst].qi = 12;
    const beforeStrat = engineBurst.state.players[fpBurst].strategies.length;
    const rBurst = engineBurst.useManualBurst(fpBurst);
    assert(rBurst.ok, '手动爆气成功');
    assert(engineBurst.state.players[fpBurst].qi === 6, `消耗 6 气 实际 ${engineBurst.state.players[fpBurst].qi}`);
    assert(engineBurst.state.players[fpBurst].strategies.length === beforeStrat + 1, '兵法记录 +1');
    const lastStrat = engineBurst.state.players[fpBurst].strategies[engineBurst.state.players[fpBurst].strategies.length - 1];
    assert(lastStrat.layers === 1, '兵法 +1 层');
    assert(lastStrat.remainingTurns === 3, '持续 3 回合');
    // 再次爆气（气够时可以多次使用，不限次数）
    const rBurst2 = engineBurst.useManualBurst(fpBurst);
    assert(rBurst2.ok, '手动爆气可多次使用');
    assert(engineBurst.state.players[fpBurst].qi === 0, `第二次爆气后气量 0 实际 ${engineBurst.state.players[fpBurst].qi}`);
    // 气不足时失败
    const rBurst3 = engineBurst.useManualBurst(fpBurst);
    assert(!rBurst3.ok, '气量不足时爆气失败');
    assert(rBurst3.message.includes('气量不足'), `错误消息含「气量不足」实际 "${rBurst3.message}"`);
    console.log('\n=== 回合结束流程测试 ===');
    const roundBefore = engine.state.roundCount;
    const qiBefore = engine.state.players[0].qi;
    // 新规则：双方都结束行动才触发回合终局
    const ap = engine.turn.activePlayer;
    const other = (1 - ap);
    engine.turn.setActivePlayer(ap);
    engine.endActionPhase(); // ap 结束行动 → 操作权交给 other
    assert(engine.turn.activePlayer === other, `操作权交给对方 实际玩家${engine.turn.activePlayer + 1}`);
    engine.endActionPhase(); // other 也结束行动 → 触发回合终局
    assert(engine.state.roundCount === roundBefore + 1, `回合数 +1 实际 ${engine.state.roundCount}`);
    // 全局回气改为每 2 回合补一次：第 1 回合结束(roundCount=1, 奇数)不补气
    assert(engine.state.players[0].qi === qiBefore, `第1回合不回气 实际 ${engine.state.players[0].qi - qiBefore}`);
    assert(engine.turn.phase === types_1.TurnPhase.Action, '回合结束后回到行动阶段');
    // 先手互换
    assert(engine.state.firstPlayer === (1 - fpMain), `先手互换 实际玩家${engine.state.firstPlayer + 1}`);
    console.log('\n=== 追风阵先手篡改测试 ===');
    const { buildFullDeck: bfdZf } = require('../assets/scripts/core/cards');
    const engineZf = new GameEngine_1.GameEngine();
    engineZf.initGame();
    const fpZf = engineZf.state.firstPlayer;
    // 给先手玩家一张追风阵
    const zhuifengDef = bfdZf().find((c) => c.id === 'zhuifeng_0');
    engineZf.state.players[fpZf].hand.push({ uid: 'zf_0', def: zhuifengDef });
    // 打出追风阵
    const rZf = (0, CardEffect_1.applyCardEffect)(engineZf, { uid: 'zf_0', def: zhuifengDef }, fpZf);
    assert(rZf.ok, '先手玩家打出追风阵');
    assert(engineZf.state.zhuiFengActive, '追风阵标记已设置');
    // 结束回合（新规则：双方都结束行动才触发）
    engineZf.endActionPhase(); // fpZf 结束 → 操作权交给对方
    engineZf.endActionPhase(); // 对方也结束 → 触发回合终局
    // 验证下回合先手仍是原先手（追风阵生效）
    assert(engineZf.state.firstPlayer === fpZf, `追风阵生效 · 下回合先手不变 实际玩家${engineZf.state.firstPlayer + 1}`);
    assert(!engineZf.state.zhuiFengActive, '追风阵标记已清除（仅生效 1 回合）');
    // 再结束一回合，验证先手恢复正常互换
    engineZf.endActionPhase();
    engineZf.endActionPhase();
    assert(engineZf.state.firstPlayer === (1 - fpZf), `追风阵失效后先手互换 实际玩家${engineZf.state.firstPlayer + 1}`);
    console.log('\n=== 攻击权交替切换规则测试（新规则）===');
    // 场景：先手 A 攻击 → 防御方 B 有武将牌 → 攻击权切换给 B
    const engineAlt = new GameEngine_1.GameEngine();
    engineAlt.initGame();
    const fpAlt = engineAlt.state.firstPlayer;
    const defAlt = (1 - fpAlt);
    // 清空双方手牌，精确构造场景
    engineAlt.state.players[fpAlt].hand = [];
    engineAlt.state.players[defAlt].hand = [];
    // A 拿一张士兵，B 拿一张士兵
    const soldierDef = buildFullDeck().find((c) => c.id === 'soldier_0');
    engineAlt.state.players[fpAlt].hand.push({ uid: 'sa', def: soldierDef });
    engineAlt.state.players[defAlt].hand.push({ uid: 'sb', def: soldierDef });
    engineAlt.state.players[fpAlt].qi = 10;
    // A 攻击
    let rAlt = (0, CardEffect_1.applyCardEffect)(engineAlt, { uid: 'sa', def: soldierDef }, fpAlt);
    assert(rAlt.ok, 'A 打出士兵攻击');
    assert(engineAlt.turn.isAwaitingDefense(), '进入防御响应');
    // B 放弃防御
    rAlt = engineAlt.defenderPass();
    assert(rAlt.ok, 'B 放弃防御 · 结算');
    // 新规则：B 有武将牌，攻击权应切换给 B
    assert(engineAlt.turn.activePlayer === defAlt, `攻击权切换给 B（玩家${defAlt + 1}）实际玩家${engineAlt.turn.activePlayer + 1}`);
    assert(engineAlt.hasGeneralInHand(defAlt), 'B 手中仍有武将牌');
    // 现在 B 攻击 A
    rAlt = (0, CardEffect_1.applyCardEffect)(engineAlt, { uid: 'sb', def: soldierDef }, defAlt);
    assert(rAlt.ok, 'B 打出士兵反击 A');
    engineAlt.defenderPass();
    // B 攻击后，A 已无武将牌，B 应继续 activePlayer（但 B 也无武将牌了，所以 B 继续 activePlayer）
    assert(!engineAlt.hasGeneralInHand(fpAlt), 'A 已无武将牌');
    assert(!engineAlt.hasGeneralInHand(defAlt), 'B 也无武将牌');
    // 双方都无武将牌时，B（最后攻击者）保持 activePlayer
    assert(engineAlt.turn.activePlayer === defAlt, `双方都无武将牌时 B 保持 activePlayer 实际玩家${engineAlt.turn.activePlayer + 1}`);
    console.log('\n=== 无武将牌时连击测试 ===');
    const engineChain = new GameEngine_1.GameEngine();
    engineChain.initGame();
    const fpC = engineChain.state.firstPlayer;
    const defC = (1 - fpC);
    engineChain.state.players[fpC].hand = [];
    engineChain.state.players[defC].hand = []; // 防御方无武将牌
    // A 拿两张士兵
    engineChain.state.players[fpC].hand.push({ uid: 'c1', def: soldierDef });
    engineChain.state.players[fpC].hand.push({ uid: 'c2', def: soldierDef });
    engineChain.state.players[fpC].qi = 10;
    // A 第一次攻击
    (0, CardEffect_1.applyCardEffect)(engineChain, { uid: 'c1', def: soldierDef }, fpC);
    engineChain.defenderPass();
    // 防御方无武将牌，A 应保持 activePlayer 可连击
    assert(engineChain.turn.activePlayer === fpC, `防御方无武将牌 · A 保持攻击权 实际玩家${engineChain.turn.activePlayer + 1}`);
    // A 第二次连击
    const rChain = (0, CardEffect_1.applyCardEffect)(engineChain, { uid: 'c2', def: soldierDef }, fpC);
    assert(rChain.ok, 'A 连击第二次');
    engineChain.defenderPass();
    assert(engineChain.turn.activePlayer === fpC, 'A 第二次连击后仍保持攻击权');
    console.log('\n=== 八卦阵反弹 · A 可出防具抵消并继续操作测试（新规则）===');
    // 场景：A 攻击 B → B 出八卦阵 → 反弹给 A → A 可出防具抵消 → 结算后 A 继续行动
    const engineBg = new GameEngine_1.GameEngine();
    engineBg.initGame();
    const fpBg = engineBg.state.firstPlayer;
    const defBg = (1 - fpBg);
    // 清空双方手牌，精确构造
    engineBg.state.players[fpBg].hand = [];
    engineBg.state.players[defBg].hand = [];
    // A 拿一张士兵，B 拿一张八卦阵 + 一张皮甲（防御 1）
    const soldierDefBg = buildFullDeck().find((c) => c.id === 'soldier_0');
    const baguaDef = buildFullDeck().find((c) => c.id === 'bagua_0');
    const leatherDef = buildFullDeck().find((c) => c.id === 'leather_0');
    engineBg.state.players[fpBg].hand.push({ uid: 'sa', def: soldierDefBg });
    engineBg.state.players[defBg].hand.push({ uid: 'bg', def: baguaDef });
    engineBg.state.players[fpBg].hand.push({ uid: 'la', def: leatherDef }); // A 自己也拿一张皮甲，用于抵消反弹
    engineBg.state.players[fpBg].qi = 10;
    // A 攻击 B
    let rBg = (0, CardEffect_1.applyCardEffect)(engineBg, { uid: 'sa', def: soldierDefBg }, fpBg);
    assert(rBg.ok, 'A 打出士兵攻击 B');
    assert(engineBg.turn.isAwaitingDefense(), '进入防御响应');
    // B 打出八卦阵（打出后立即触发反弹结算，A 自动进入受击阶段）
    rBg = (0, CardEffect_1.applyCardEffect)(engineBg, { uid: 'bg', def: baguaDef }, defBg);
    assert(rBg.ok, 'B 打出八卦阵');
    assert(rBg.triggeredReflect === true, '八卦阵生效');
    // 八卦阵已自动结算：A 进入反弹受击阶段（无需 B 再点确认防御）
    assert(engineBg.turn.isAwaitingDefense(), '八卦阵反弹 · A 进入受击阶段');
    assert(engineBg.pendingAttack?.isReflect === true, '反弹受击标记为 isReflect');
    assert(engineBg.pendingAttack?.defender === fpBg, '反弹受击方为 A');
    assert(engineBg.pendingAttack?.attacker === defBg, '反弹攻击者为 B');
    assert(engineBg.turn.activePlayer === fpBg, 'activePlayer 为 A（可出防具）');
    // A 打出皮甲抵消 1 点反弹伤害
    rBg = (0, CardEffect_1.applyCardEffect)(engineBg, { uid: 'la', def: leatherDef }, fpBg);
    assert(rBg.ok, 'A 打出皮甲抵消反弹伤害');
    assert(engineBg.defensePool === 1, '防具池 = 1');
    // A 放弃防御，触发结算
    const hpBefore = engineBg.state.players[fpBg].hp;
    rBg = engineBg.defenderPass();
    // 反弹伤害 1 - 防御 1 = 0，A 不扣血
    assert(engineBg.state.players[fpBg].hp === hpBefore, `反弹伤害被皮甲完全抵消 实际 hp ${engineBg.state.players[fpBg].hp} vs ${hpBefore}`);
    // 结算后攻击权交给 A（原攻击方），可继续行动
    assert(engineBg.turn.activePlayer === fpBg, `反弹结算后攻击权交回 A 实际玩家${engineBg.turn.activePlayer + 1}`);
    assert(!engineBg.turn.isAwaitingDefense(), '已退出防御响应');
    console.log('\n=== 反弹受击不可再出八卦阵测试 ===');
    const engineBg2 = new GameEngine_1.GameEngine();
    engineBg2.initGame();
    const fp2 = engineBg2.state.firstPlayer;
    const def2 = (1 - fp2);
    engineBg2.state.players[fp2].hand = [];
    engineBg2.state.players[def2].hand = [];
    engineBg2.state.players[fp2].hand.push({ uid: 'sa2', def: soldierDefBg });
    engineBg2.state.players[def2].hand.push({ uid: 'bg2', def: baguaDef });
    engineBg2.state.players[fp2].hand.push({ uid: 'bg3', def: baguaDef }); // A 自己也拿一张八卦阵
    engineBg2.state.players[fp2].qi = 10;
    (0, CardEffect_1.applyCardEffect)(engineBg2, { uid: 'sa2', def: soldierDefBg }, fp2);
    (0, CardEffect_1.applyCardEffect)(engineBg2, { uid: 'bg2', def: baguaDef }, def2);
    // 八卦阵打出后立即自动结算，A 进入反弹受击阶段（无需 defenderPass）
    // A 在反弹受击中尝试出八卦阵，应失败
    const rBg2 = (0, CardEffect_1.applyCardEffect)(engineBg2, { uid: 'bg3', def: baguaDef }, fp2);
    assert(!rBg2.ok, '反弹受击不可再出八卦阵');
    assert(rBg2.message.includes('反弹'), `错误消息含「反弹」实际 "${rBg2.message}"`);
    console.log('\n=== 绝杀击杀不可急救测试 ===');
    const engine2 = new GameEngine_1.GameEngine();
    engine2.initGame();
    const atk = engine2.state.firstPlayer;
    const def = (1 - atk);
    // 把防御方血量调到 1
    engine2.state.players[def].hp = 1;
    // 给攻击方一张倚天剑
    const { buildFullDeck: bfd2 } = require('../assets/scripts/core/cards');
    const yitian = bfd2().find((c) => c.id === 'yitianjian');
    if (yitian) {
        engine2.state.players[atk].hand.push({ uid: 'test_yitian', def: yitian });
        const r = (0, CardEffect_1.applyCardEffect)(engine2, { uid: 'test_yitian', def: yitian }, atk);
        assert(r.ok, '打出倚天剑');
        assert(engine2.state.players[def].hp <= 0, '防御方血量归零');
        assert(engine2.state.gameOver, '绝杀击杀触发游戏结束');
        assert(engine2.state.result?.winner === atk, `胜者为攻击方 玩家${atk + 1}`);
        // 紧急救血阶段不应触发
        assert(engine2.emergencyHealPending === null, '绝杀击杀不进入紧急救血');
    }
    console.log('\n=== 普通攻击打至 0 血可急救测试 ===');
    const engine3 = new GameEngine_1.GameEngine();
    engine3.initGame();
    const atk3 = engine3.state.firstPlayer;
    const def3 = (1 - atk3);
    engine3.state.players[def3].hp = 2;
    // 攻击方有足够气打出一张 3 攻武将
    const { buildFullDeck: bfd3 } = require('../assets/scripts/core/cards');
    const general3def = bfd3().find((c) => c.id === 'weiyan');
    if (general3def) {
        engine3.state.players[atk3].qi = 10;
        engine3.state.players[atk3].hand.push({ uid: 'test_g3', def: general3def });
        // 防御方手牌中放入补血牌（+2），overkill=1，2>1 可救
        const healDef = bfd3().find((c) => c.id === 'medicine_0');
        engine3.state.players[def3].hand.push({ uid: 'test_heal3', def: healDef });
        const r = (0, CardEffect_1.applyCardEffect)(engine3, { uid: 'test_g3', def: general3def }, atk3);
        assert(r.ok, '打出魏延（攻3）');
        engine3.defenderPass();
        assert(engine3.state.players[def3].hp <= 0, '防御方被打至 0 血');
        assert(engine3.emergencyHealPending === def3, '进入紧急救血阶段');
        assert(!engine3.state.gameOver, '游戏未结束（可救血）');
        // 救血方放弃
        engine3.emergencyHealGiveUp();
        assert(engine3.state.gameOver, '放弃救血后游戏结束');
    }
    console.log('\n=== 补血不足无法挽救直接判负测试 ===');
    const engine4 = new GameEngine_1.GameEngine();
    engine4.initGame();
    const atk4 = engine4.state.firstPlayer;
    const def4 = (1 - atk4);
    engine4.state.players[def4].hp = 2;
    // 清空防御方手牌，确保 totalHealInHand=0
    engine4.state.players[def4].hand = [];
    const general4def = bfd3().find((c) => c.id === 'weiyan');
    if (general4def) {
        engine4.state.players[atk4].qi = 10;
        engine4.state.players[atk4].hand.push({ uid: 'test_g4', def: general4def });
        // 防御方无补血牌 → overkill=1，无法挽救 → 直接判负
        const r = (0, CardEffect_1.applyCardEffect)(engine4, { uid: 'test_g4', def: general4def }, atk4);
        assert(r.ok, '打出魏延（攻3）');
        engine4.defenderPass();
        assert(engine4.state.players[def4].hp <= 0, '防御方被打至 0 血');
        assert(engine4.state.gameOver, '无补血牌 · 直接判负');
        assert(engine4.emergencyHealPending === null, '不进入紧急救血');
    }
    console.log(`\n=== 测试结果 ===`);
    console.log(`通过：${passed} · 失败：${failed}`);
    if (failed > 0)
        process.exit(1);
    console.log('🎉 引擎核心逻辑测试通过！');
}
main();
//# sourceMappingURL=verify-engine.js.map