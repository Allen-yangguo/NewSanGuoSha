"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * v4.3 新机制自检：智者/锦囊/盾防具/龟背分层/鱼鳞阵/丹药/绝杀自救/回合清桌
 * 运行：npm run test:v43
 */
const GameEngine_1 = require("../assets/scripts/core/GameEngine");
const types_1 = require("../assets/scripts/core/types");
const CardEffect_1 = require("../assets/scripts/core/CardEffect");
const cards_1 = require("../assets/scripts/core/cards");
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
const DECK = (0, cards_1.buildFullDeck)();
const LIMITED = (0, cards_1.buildLimitedCards)();
function defById(id) {
    return DECK.find(d => d.id.startsWith(id)) || LIMITED.find(d => d.id === id);
}
function inst(id, uid) {
    return { uid, def: defById(id) };
}
function freshEngine() {
    const e = new GameEngine_1.GameEngine();
    e.initGame();
    e.turn.setActivePlayer(0);
    e.state.actionEnded = [false, false];
    return e;
}
function main() {
    console.log('=== 智者牌：打出获得锦囊标记 ===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].hand.push(inst('zhuge', 't_zhuge'));
        const r = (0, CardEffect_1.applyCardEffect)(e, inst('zhuge', 't_zhuge'), fp);
        assert(r.ok, '诸葛亮可打出（0 耗气）');
        const p = e.state.players[fp];
        assert(p.pouches.zhuge && p.pouches.zhuge.que, '诸葛亮获得缺锦囊');
        assert(p.pouches.zhuge && p.pouches.zhuge.can, '诸葛亮获得残锦囊');
        assert(p.pouches.zhuge && p.pouches.zhuge.ji, '诸葛亮获得急锦囊');
        assert(e.state.table.some(c => c.def.id === 'zhuge'), '诸葛亮进入桌面（回合结束进弃牌）');
    }
    {
        const e = freshEngine();
        e.state.players[0].hand.push(inst('zhouyu', 't_zhouyu'));
        (0, CardEffect_1.applyCardEffect)(e, inst('zhouyu', 't_zhouyu'), 0);
        const p = e.state.players[0];
        assert(p.pouches.zhouyu && p.pouches.zhouyu.que && !p.pouches.zhouyu.ji, '周瑜获得缺/残（无急）');
    }
    {
        const e = freshEngine();
        e.state.players[0].hand.push(inst('simayi', 't_simayi'));
        (0, CardEffect_1.applyCardEffect)(e, inst('simayi', 't_simayi'), 0);
        const p = e.state.players[0];
        assert(p.pouches.simayi && p.pouches.simayi.que && !p.pouches.simayi.ji, '司马懿获得缺/残（无急）');
    }
    console.log('\n=== 缺锦囊（缺血 hp=2 / 残血 hp=1 可用）===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].pouches.zhuge = { que: true, can: true, ji: true };
        e.state.players[fp].hp = 8;
        const r1 = e.usePouch(fp, 'zhuge', types_1.PouchType.Que, 'qimen');
        assert(!r1.ok, '血量正常时缺锦囊不可用');
        e.state.players[fp].hp = 2;
        const r2 = e.usePouch(fp, 'zhuge', types_1.PouchType.Que, 'qimen');
        assert(r2.ok && r2.card != null, '缺血时缺锦囊可用');
        assert(e.state.players[fp].hand.some(c => c.def.id === 'qimen'), '奇门遁甲入手牌（实体卡）');
        assert(!e.state.players[fp].pouches.zhuge.que, '使用后缺锦囊标记消耗');
        // 标记消耗后再次使用应失败
        const r3 = e.usePouch(fp, 'zhuge', types_1.PouchType.Que, 'bagua');
        assert(!r3.ok, '标记已消耗不可重复使用');
        // 残血(hp=1)也可用缺锦囊
        e.state.players[fp].pouches.zhuge = { que: true, can: false, ji: false };
        e.state.players[fp].hp = 1;
        const r4 = e.usePouch(fp, 'zhuge', types_1.PouchType.Que, 'guibei');
        assert(r4.ok, '残血(hp=1)可用缺锦囊');
        assert(e.state.players[fp].hand.some(c => c.def.name === '龟背阵'), '残血使用缺锦囊获得龟背阵');
    }
    console.log('\n=== 锦囊随机出牌（choice 空 → 系统随机）===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].pouches.zhuge = { que: true, can: false, ji: false };
        e.state.players[fp].hp = 2;
        const r = e.usePouch(fp, 'zhuge', types_1.PouchType.Que, '');
        assert(r.ok && r.card != null, `随机缺锦囊成功：${r.card?.def.name}`);
        assert(['八卦阵', '龟背阵', '奇门遁甲'].includes(r.card.def.name), '随机结果是缺锦囊选项之一');
        e.state.players[fp].pouches.zhuge = { que: true, can: true, ji: false };
        e.state.players[fp].hp = 1;
        const r2 = e.usePouch(fp, 'zhuge', types_1.PouchType.Can, '');
        assert(r2.ok && r2.card != null, `随机残锦囊成功：${r2.card?.def.name}`);
    }
    console.log('\n=== 残锦囊（残血 hp=1 可用）===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].pouches.zhuge = { que: false, can: true, ji: false };
        e.state.players[fp].hp = 1;
        const r = e.usePouch(fp, 'zhuge', types_1.PouchType.Can, 'zhangfei_shemiao');
        assert(r.ok, '残锦囊可用');
        assert(e.state.players[fp].hand.some(c => c.def.id === 'zhangfei_shemiao'), '蛇矛张飞（攻6耗5）入手牌');
        assert(!e.state.players[fp].pouches.zhuge.can, '使用后残锦囊消耗');
    }
    console.log('\n=== 大乔 / 孙尚香（周瑜残锦囊，打出触发）===');
    {
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.state.players[fp].pouches.zhouyu = { que: false, can: true, ji: false };
        e.state.players[fp].hp = 1;
        e.state.players[enemy].qi = 9;
        const r = e.usePouch(fp, 'zhouyu', types_1.PouchType.Can, 'daqiao');
        assert(r.ok, '周瑜残锦囊产出大乔');
        // 打出大乔
        e.state.players[fp].hand.push(inst('daqiao', 't_daqiao'));
        const r2 = (0, CardEffect_1.applyCardEffect)(e, inst('daqiao', 't_daqiao'), fp);
        assert(r2.ok, '大乔可打出');
        assert(e.state.players[enemy].qi === 0, `大乔清空敌方气量（9 → ${e.state.players[enemy].qi}）`);
    }
    {
        // 孙尚香：偷取敌方急锦囊
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.state.players[fp].pouches.zhouyu = { que: false, can: true, ji: false };
        e.state.players[fp].hp = 1;
        e.state.players[enemy].pouches.zhuge = { que: false, can: false, ji: true };
        const r = e.usePouch(fp, 'zhouyu', types_1.PouchType.Can, 'sunshangxiang');
        assert(r.ok, '孙尚香入手牌');
        const r2 = (0, CardEffect_1.applyCardEffect)(e, inst('sunshangxiang', 't_ssx'), fp);
        assert(r2.ok, '孙尚香打出成功');
        assert(!e.state.players[enemy].pouches.zhuge.ji, '敌方急锦囊被偷走');
        assert(e.state.players[fp].pouches.zhuge && e.state.players[fp].pouches.zhuge.ji, '我方获得急锦囊');
        // 敌方无急锦囊时: 出牌成功(正常消耗)但完全无效
        const e2 = freshEngine();
        e2.state.players[0].hand.push(inst('sunshangxiang', 't2_ssx'));
        const r3 = (0, CardEffect_1.applyCardEffect)(e2, inst('sunshangxiang', 't2_ssx'), 0);
        assert(r3.ok, '敌方无急锦囊时孙尚香仍可打出（只是完全无效）');
        assert(!e2.state.players[0].hand.some(c => c.def.id === 'sunshangxiang'), '孙尚香正常消耗（不在手牌）');
    }
    console.log('\n=== 司马懿：坚壁清野 2 层龟背阵 ===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].pouches.simayi = { que: true, can: false, ji: false };
        e.state.players[fp].hp = 2;
        const r = e.usePouch(fp, 'simayi', types_1.PouchType.Que, 'jianbi');
        assert(r.ok, '坚壁清野入手牌');
        // 打出坚壁清野
        e.state.players[fp].hand.push(inst('jianbi', 't_jianbi'));
        const r2 = (0, CardEffect_1.applyCardEffect)(e, inst('jianbi', 't_jianbi'), fp);
        assert(r2.ok, '坚壁清野打出');
        assert(e.guiBeiLayers === 2, `龟背减攻 2 层（实际 ${e.guiBeiLayers}）`);
        // 再打龟背阵 +1 层
        e.state.players[fp].hand.push(inst('guibei', 't_guibei'));
        const r3 = (0, CardEffect_1.applyCardEffect)(e, inst('guibei', 't_guibei'), fp);
        assert(r3.ok && e.guiBeiLayers === 3, `叠加后共 3 层减攻（实际 ${e.guiBeiLayers}）`);
    }
    console.log('\n=== 龟背阵减伤生效 ===');
    {
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.guiBeiProtector = enemy;
        e.guiBeiLayers = 3;
        e.guiBeiRemainingTurns = 3;
        e.state.players[fp].qi = 10;
        e.state.players[fp].hand.push(inst('soldier', 't_sol'));
        const before = e.state.players[enemy].hp;
        (0, CardEffect_1.applyCardEffect)(e, inst('soldier', 't_sol'), fp);
        e.defenderPass();
        // 士兵攻1 - 龟背3层 = 0
        assert(e.state.players[enemy].hp === before, `龟背减伤 3 层 · 士兵攻击被完全抵消（hp ${e.state.players[enemy].hp}）`);
        // 绝杀不受龟背影响
        e.turn.setActivePlayer(fp);
        e.state.actionEnded = [false, false];
        e.state.players[fp].qi = 10;
        e.state.players[enemy].hp = 8;
        e.state.players[fp].hand.push(inst('yitianjian', 't_yj'));
        (0, CardEffect_1.applyCardEffect)(e, inst('yitianjian', 't_yj'), fp);
        assert(e.state.players[enemy].hp === 6, `倚天剑 2 点真实伤害无视龟背（hp ${e.state.players[enemy].hp}）`);
    }
    console.log('\n=== 鱼鳞阵：己方防具防御 +1 ===');
    {
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.state.players[fp].hand.push(inst('yulin', 't_yulin'));
        const r = (0, CardEffect_1.applyCardEffect)(e, inst('yulin', 't_yulin'), fp);
        assert(r.ok && e.state.players[fp].yulin.active, '鱼鳞阵生效（防御 +1）');
        // 敌方攻击 → 防御方打出皮甲（1+1=2）
        e.turn.setActivePlayer(enemy);
        e.state.players[enemy].qi = 10;
        e.state.players[enemy].hand.push(inst('soldier', 't_sol2'));
        (0, CardEffect_1.applyCardEffect)(e, inst('soldier', 't_sol2'), enemy);
        e.state.players[fp].hand.push(inst('leather', 't_lea'));
        const r2 = (0, CardEffect_1.applyCardEffect)(e, inst('leather', 't_lea'), fp);
        assert(r2.ok && e.defensePool === 2, `皮甲在鱼鳞阵下防御 2（实际 ${e.defensePool}）`);
    }
    console.log('\n=== 盾系列防具 ===');
    {
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.turn.setActivePlayer(enemy);
        e.state.players[enemy].qi = 10;
        e.state.players[enemy].hand.push(inst('soldier', 't_sol3'));
        (0, CardEffect_1.applyCardEffect)(e, inst('soldier', 't_sol3'), enemy);
        e.state.players[fp].hand.push(inst('wood_shield', 't_ws'));
        const r = (0, CardEffect_1.applyCardEffect)(e, inst('wood_shield', 't_ws'), fp);
        assert(r.ok && e.defensePool === 1, `木盾防御 1（实际 ${e.defensePool}）`);
    }
    console.log('\n=== 奇门遁甲 / 火烧连营：兵法 +3 ===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].hand.push(inst('qimen', 't_qm'));
        const r = (0, CardEffect_1.applyCardEffect)(e, inst('qimen', 't_qm'), fp);
        assert(r.ok, '奇门遁甲打出');
        const s = e.state.players[fp].strategies;
        assert(s.length === 1 && s[0].layers === 3 && s[0].remainingTurns === 3, `兵法 +3 层 · 3 回合（层数 ${s[0]?.layers}）`);
        e.state.players[fp].hand.push(inst('huoshao', 't_hs'));
        (0, CardEffect_1.applyCardEffect)(e, inst('huoshao', 't_hs'), fp);
        assert(e.state.players[fp].strategies.length === 2, '火烧连营再 +3 层');
    }
    console.log('\n=== 急锦囊：普通攻击致死 → 丹药保 1 血 ===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].pouches.zhuge = { que: false, can: false, ji: true };
        e.emergencyHealPending = fp;
        e.state.players[fp].hp = 0;
        e.state.players[fp].overkill = 3;
        const r = e.usePouch(fp, 'zhuge', types_1.PouchType.Ji, 'huanhun_dan');
        assert(r.ok, '急锦囊产出还魂丹');
        assert(e.state.players[fp].hand.some(c => c.def.id === 'huanhun_dan'), '还魂丹入手牌');
        assert(!e.state.players[fp].pouches.zhuge.ji, '急锦囊标记消耗');
        // 打出还魂丹：保 1 血（无视溢出 3）
        const dan = e.state.players[fp].hand.find(c => c.def.id === 'huanhun_dan');
        const r2 = (0, CardEffect_1.applyCardEffect)(e, dan, fp);
        assert(r2.ok && e.state.players[fp].hp === 1, `还魂丹保 1 血（实际 hp ${e.state.players[fp].hp}）`);
        assert(e.emergencyHealPending === null, '紧急救血结束');
    }
    console.log('\n=== 绝杀致死：手牌绝疗丹自动保命 / 急锦囊手动自救 ===');
    {
        // 手牌已有绝疗丹 → 绝杀自动保命（无需玩家操作）
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.state.players[enemy].hand.push(inst('jueliao_dan', 't_jld'));
        e.state.players[enemy].hp = 1;
        e.state.players[fp].qi = 10;
        e.state.players[fp].hand.push(inst('yitianjian', 't_yj4'));
        (0, CardEffect_1.applyCardEffect)(e, inst('yitianjian', 't_yj4'), fp);
        assert(e.state.players[enemy].hp === 1 && !e.state.gameOver, '手牌绝疗丹 · 绝杀自动保 1 血');
    }
    {
        // 急锦囊 → 进入绝杀急救等待（不立即判负）
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.state.players[enemy].pouches.zhuge = { que: false, can: false, ji: true };
        e.state.players[enemy].hp = 1;
        e.state.players[fp].qi = 10;
        e.state.players[fp].hand.push(inst('yitianjian', 't_yj2'));
        (0, CardEffect_1.applyCardEffect)(e, inst('yitianjian', 't_yj2'), fp);
        assert(e.state.players[enemy].hp === 0, '绝杀击至 0 血');
        assert(e.ultimateSavePending === enemy, '进入绝杀急救等待（ultimateSavePending）');
        assert(!e.state.gameOver, '未立即判负（等待玩家选择）');
        // 使用急锦囊 → 抽中绝疗丹 → 保命
        const origRandom = Math.random;
        Math.random = () => 0.1; // < 0.5 → 绝疗丹
        const r = e.useUltimatePouch(enemy);
        Math.random = origRandom;
        assert(r.ok && r.saved === true, `使用急锦囊 · 抽中绝疗丹保 1 血（saved=${r.saved}）`);
        assert(e.state.players[enemy].hp === 1 && !e.state.gameOver, '保 1 血');
        assert(!e.state.players[enemy].pouches.zhuge.ji, '急锦囊已消耗');
    }
    {
        // 使用急锦囊 → 抽中还魂丹 → 死亡
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.state.players[enemy].pouches.zhuge = { que: false, can: false, ji: true };
        e.state.players[enemy].hp = 1;
        e.state.players[fp].qi = 10;
        e.state.players[fp].hand.push(inst('yitianjian', 't_yj3'));
        (0, CardEffect_1.applyCardEffect)(e, inst('yitianjian', 't_yj3'), fp);
        const origRandom = Math.random;
        Math.random = () => 0.9; // >= 0.5 → 还魂丹
        const r = e.useUltimatePouch(enemy);
        Math.random = origRandom;
        assert(r.ok && r.saved === false, '使用急锦囊 · 抽中还魂丹');
        assert(e.state.gameOver, '还魂丹 · 绝杀无效 · 死亡判负');
    }
    {
        // 放弃自救 → 直接判负
        const e = freshEngine();
        const fp = 0, enemy = 1;
        e.state.players[enemy].pouches.zhuge = { que: false, can: false, ji: true };
        e.state.players[enemy].hp = 1;
        e.state.players[fp].qi = 10;
        e.state.players[fp].hand.push(inst('yitianjian', 't_yj5'));
        (0, CardEffect_1.applyCardEffect)(e, inst('yitianjian', 't_yj5'), fp);
        const r = e.giveUpUltimateSave(enemy);
        assert(r.ok && e.state.gameOver, '放弃急锦囊自救 · 直接判负');
    }
    console.log('\n=== 回合结束清桌 ===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].hand.push(inst('ration', 't_ration'));
        (0, CardEffect_1.applyCardEffect)(e, inst('ration', 't_ration'), fp);
        assert(e.state.table.length === 1, `打出后卡牌在桌面（实际 ${e.state.table.length}）`);
        assert(e.state.discard.length === 0, '桌面卡尚未进弃牌堆');
        const discardBefore = e.state.discard.length;
        e.endTurn();
        assert(e.state.table.length === 0, '回合结束桌面清空');
        assert(e.state.discard.length === discardBefore + 1, '桌面卡进弃牌堆');
    }
    console.log('\n=== 锦囊标记跨回合保留 ===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].pouches.zhuge = { que: true, can: false, ji: false };
        e.state.players[fp].hp = 8; // 缺血不满足也不影响保留
        e.endTurn();
        assert(e.state.players[fp].pouches.zhuge.que, '回合结束后锦囊标记保留（不因回合结束清空）');
    }
    console.log('\n=== 锦囊选项查询 ===');
    {
        const e = freshEngine();
        const fp = 0;
        e.state.players[fp].pouches.zhuge = { que: true, can: true, ji: true };
        e.state.players[fp].hp = 2;
        const opts = e.getPouchOptions(fp);
        assert(opts.some(o => o.pouch === types_1.PouchType.Que && o.choices.length === 3), '缺血时缺锦囊 3 个选项（八卦/龟背/奇门）');
        e.state.players[fp].hp = 1;
        const opts2 = e.getPouchOptions(fp);
        assert(opts2.some(o => o.pouch === types_1.PouchType.Can && o.choices.length === 5), '残血时残锦囊 5 个选项');
    }
    console.log('\n=== 测试结果 ===');
    console.log(`通过：${passed} · 失败：${failed}`);
    if (failed > 0)
        process.exit(1);
    console.log('🎉 v4.3 新机制测试通过！');
}
main();
//# sourceMappingURL=verify-v43.js.map