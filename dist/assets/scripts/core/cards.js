"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARD_COLORS = void 0;
exports.buildFullDeck = buildFullDeck;
exports.assertDeckSize = assertDeckSize;
/**
 * 三国卡牌对战 · 全 104 张卡牌数据定义（最终定稿）
 * 严格按官方规则文档数量对账：
 *   武将 38 + 防具 23 + 功能 31 + 兵法 3 + 绝杀 5 + 阵法 4 = 104
 */
const types_1 = require("./types");
/** 生成 N 张同一定义的卡牌（带不同实例 ID 后缀） */
function makeCopies(idPrefix, name, category, subtype, value, cost, desc, count) {
    const arr = [];
    for (let i = 0; i < count; i++) {
        arr.push({
            id: `${idPrefix}_${i}`,
            name,
            category,
            subtype,
            value,
            cost,
            desc,
        });
    }
    return arr;
}
/** 武将牌：38 张 */
function buildGenerals() {
    const out = [];
    // 士兵 ×15 攻1耗1
    out.push(...makeCopies('soldier', '士兵', types_1.CardCategory.General, types_1.GeneralTier.Soldier, 1, 1, '攻 1 · 耗气 1', 15));
    // 普通武将 ×10 攻2耗2
    out.push(...makeCopies('general_normal', '普通武将', types_1.CardCategory.General, types_1.GeneralTier.Normal, 2, 2, '攻 2 · 耗气 2', 10));
    // 二流大将 ×7 攻3耗3
    const secondRate = [
        { id: 'weiyan', name: '魏延' },
        { id: 'xiahou_dun', name: '夏侯惇' },
        { id: 'zhangliao', name: '张辽' },
        { id: 'xuhuang', name: '徐晃' },
        { id: 'zhanghe', name: '张郃' },
        { id: 'ganning', name: '甘宁' },
        { id: 'taishici', name: '太史慈' },
    ];
    for (const g of secondRate) {
        out.push({
            id: g.id,
            name: g.name,
            category: types_1.CardCategory.General,
            subtype: types_1.GeneralTier.SecondRate,
            value: 3,
            cost: 3,
            desc: '大将 · 攻 3 · 耗气 3',
        });
    }
    // 五虎上将 ×5 攻4耗4（用真实姓名增加三国韵味）
    const fiveTiger = [
        { id: 'guanyu', name: '关羽' },
        { id: 'zhangfei', name: '张飞' },
        { id: 'zhaoyun', name: '赵云' },
        { id: 'machao', name: '马超' },
        { id: 'huangzhong', name: '黄忠' },
    ];
    for (const g of fiveTiger) {
        out.push({
            id: g.id,
            name: g.name,
            category: types_1.CardCategory.General,
            subtype: types_1.GeneralTier.FiveTiger,
            value: 4,
            cost: 4,
            desc: '五虎上将 · 攻 4 · 耗气 4',
        });
    }
    // 吕布 ×1 攻5 基础耗4
    out.push({
        id: 'lubu',
        name: '吕布',
        category: types_1.CardCategory.General,
        subtype: types_1.GeneralTier.LuBu,
        value: 5,
        cost: 4, // 专属基础耗气 4
        desc: '飞将 · 攻 5 · 基础耗气 4',
    });
    return out;
}
/** 防具牌：23 张 */
function buildArmors() {
    const out = [];
    out.push(...makeCopies('leather', '皮甲', types_1.CardCategory.Armor, types_1.ArmorTier.Leather, 1, 0, '防 1 · 受击时抵消 1 点伤害', 10));
    out.push(...makeCopies('bronze', '铜甲', types_1.CardCategory.Armor, types_1.ArmorTier.Bronze, 2, 0, '防 2 · 受击时抵消 2 点伤害', 6));
    out.push(...makeCopies('iron', '铁甲', types_1.CardCategory.Armor, types_1.ArmorTier.Iron, 3, 0, '防 3 · 受击时抵消 3 点伤害', 4));
    out.push(...makeCopies('steel', '钢甲', types_1.CardCategory.Armor, types_1.ArmorTier.Steel, 4, 0, '防 4 · 受击时抵消 4 点伤害', 3));
    return out;
}
/** 功能-补气牌：12 张 */
function buildFunctionQi() {
    const out = [];
    out.push(...makeCopies('ration', '兵粮补给', types_1.CardCategory.FunctionQi, types_1.QiTier.Ration, 2, 0, '自身回合打出 · 立即 +2 气', 6));
    out.push(...makeCopies('rest', '整军休战', types_1.CardCategory.FunctionQi, types_1.QiTier.Rest, 3, 0, '自身回合打出 · 立即 +3 气', 4));
    out.push(...makeCopies('supply', '军需急运', types_1.CardCategory.FunctionQi, types_1.QiTier.Supply, 4, 0, '自身回合打出 · 立即 +4 气', 2));
    return out;
}
/** 功能-补血牌：19 张 */
function buildFunctionHp() {
    const out = [];
    out.push(...makeCopies('wine', '杜康药酒', types_1.CardCategory.FunctionHp, types_1.HpTier.Wine, 1, 0, '未满血回 1 血｜满血时 +1 气', 10));
    out.push(...makeCopies('medicine', '华佗汤药', types_1.CardCategory.FunctionHp, types_1.HpTier.Medicine, 2, 0, '未满血回 2 血｜满血时 +2 气', 6));
    out.push(...makeCopies('bandage', '随军伤药', types_1.CardCategory.FunctionHp, types_1.HpTier.Bandage, 3, 0, '未满血回 3 血｜满血时 +3 气', 3));
    return out;
}
/** 兵法增伤牌：3 张 */
function buildStrategy() {
    const out = [];
    // 孟德新书 ×2 +1层
    out.push(...makeCopies('mengde', '孟德新书', types_1.CardCategory.Strategy, types_1.StrategyType.MengDe, 1, 0, '获得 1 层兵法增幅 · 武将攻击 +1 · 持续 3 回合', 2));
    // 孙子兵法 ×1 +2层
    out.push({
        id: 'sunzi_0',
        name: '孙子兵法',
        category: types_1.CardCategory.Strategy,
        subtype: types_1.StrategyType.SunZi,
        value: 2,
        cost: 0,
        desc: '获得 2 层兵法增幅 · 武将攻击 +2 · 持续 3 回合',
    });
    return out;
}
/** 绝杀神兵牌：5 张 */
function buildUltimate() {
    const out = [];
    const list = [
        { id: 'ganjiang', name: '干将', type: types_1.UltimateType.GanJiang, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
        { id: 'moxie', name: '莫邪', type: types_1.UltimateType.MoXie, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
        { id: 'chixiao', name: '赤霄', type: types_1.UltimateType.ChiXiao, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
        { id: 'qixing_longyuan', name: '七星龙渊', type: types_1.UltimateType.QiXingLongYuan, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
        { id: 'yitianjian', name: '倚天剑', type: types_1.UltimateType.YiTianJian, dmg: 2, desc: '神兵 · 2 点真实伤害 · 击杀不可急救' },
    ];
    for (const u of list) {
        out.push({
            id: u.id,
            name: u.name,
            category: types_1.CardCategory.Ultimate,
            subtype: u.type,
            value: u.dmg,
            cost: 0,
            desc: u.desc,
        });
    }
    return out;
}
/** 阵法战术牌：4 张 */
function buildFormation() {
    const out = [];
    // 八卦阵 ×2 受击反弹
    out.push(...makeCopies('bagua', '八卦阵', types_1.CardCategory.Formation, types_1.FormationType.BaGua, 0, 0, '受击触发 · 全额反弹武将结算后真实伤害 · 不可反弹绝杀/倚天剑', 2));
    // 追风阵 ×2 篡改先手
    out.push(...makeCopies('zhuifeng', '追风阵', types_1.CardCategory.Formation, types_1.FormationType.ZhuiFeng, 0, 0, '自身回合触发 · 下一回合仍为己方先手 · 生效后恢复默认轮换', 2));
    return out;
}
/** 构建完整 104 张牌库（按文档数量精确对账） */
function buildFullDeck() {
    const out = [];
    out.push(...buildGenerals()); // 38
    out.push(...buildArmors()); // 23
    out.push(...buildFunctionQi()); // 12
    out.push(...buildFunctionHp()); // 19
    out.push(...buildStrategy()); // 3
    out.push(...buildUltimate()); // 5
    out.push(...buildFormation()); // 4
    // 合计 38+23+12+19+3+5+4 = 104
    return out;
}
/** 数量自检（开发期调用，断言牌库总数=104） */
function assertDeckSize(deck) {
    const expected = 104;
    if (deck.length !== expected) {
        throw new Error(`牌库数量错误：期望 ${expected}，实际 ${deck.length}`);
    }
    // 分类对账
    const counter = {};
    for (const c of deck) {
        counter[c.category] = (counter[c.category] || 0) + 1;
    }
    const expect = {
        [types_1.CardCategory.General]: 38,
        [types_1.CardCategory.Armor]: 23,
        [types_1.CardCategory.FunctionQi]: 12,
        [types_1.CardCategory.FunctionHp]: 19,
        [types_1.CardCategory.Strategy]: 3,
        [types_1.CardCategory.Ultimate]: 5,
        [types_1.CardCategory.Formation]: 4,
    };
    for (const k of Object.keys(expect)) {
        if (counter[k] !== expect[k]) {
            throw new Error(`分类 ${k} 数量错误：期望 ${expect[k]}，实际 ${counter[k]}`);
        }
    }
}
/** 卡牌配色规范（按 UI 规范文档） */
exports.CARD_COLORS = {
    [types_1.CardCategory.General]: { bg: '#F3E9D7', border: '#705C48', label: '武将攻击' },
    [types_1.CardCategory.Armor]: { bg: '#E4E7EA', border: '#5C6772', label: '防具防御' },
    [types_1.CardCategory.FunctionQi]: { bg: '#EBDBC3', border: '#825E3B', label: '功能-补气' },
    [types_1.CardCategory.FunctionHp]: { bg: '#F2E0DC', border: '#8C4A40', label: '功能-补血' },
    [types_1.CardCategory.Strategy]: { bg: '#E8D9BC', border: '#4B3B2A', label: '兵法增伤' },
    [types_1.CardCategory.Ultimate]: { bg: '#1F1310', border: '#C9A227', label: '绝杀神兵' },
    [types_1.CardCategory.Formation]: { bg: '#D9E2E0', border: '#344240', label: '阵法战术' },
};
//# sourceMappingURL=cards.js.map