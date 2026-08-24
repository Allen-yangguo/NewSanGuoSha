/**
 * 三国卡牌对战 · 全 107 张卡牌数据定义（最终定稿）
 * 严格按官方规则文档数量对账：
 *   武将 38 + 防具 23 + 功能 31 + 兵法 3 + 绝杀 5 + 阵法 5 + 魅惑 2 = 107
 */
import {
  CardCategory,
  CardDef,
  GeneralTier,
  ArmorTier,
  QiTier,
  HpTier,
  StrategyType,
  UltimateType,
  FormationType,
  CharmType,
} from './types';

/** 生成 N 张同一定义的卡牌（带不同实例 ID 后缀） */
function makeCopies(
  idPrefix: string,
  name: string,
  category: CardCategory,
  subtype: any,
  value: number,
  cost: number,
  desc: string,
  count: number,
): CardDef[] {
  const arr: CardDef[] = [];
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
function buildGenerals(): CardDef[] {
  const out: CardDef[] = [];
  // 士兵 ×15 攻1耗1
  out.push(...makeCopies(
    'soldier', '士兵', CardCategory.General, GeneralTier.Soldier,
    1, 1, '攻 1 · 耗气 1', 15,
  ));
  // 普通武将 ×10 攻2耗2
  out.push(...makeCopies(
    'general_normal', '普通武将', CardCategory.General, GeneralTier.Normal,
    2, 2, '攻 2 · 耗气 2', 10,
  ));
  // 二流大将 ×7 攻3耗3
  const secondRate: Array<{ id: string; name: string }> = [
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
      category: CardCategory.General,
      subtype: GeneralTier.SecondRate,
      value: 3,
      cost: 3,
      desc: '大将 · 攻 3 · 耗气 3',
    });
  }
  // 五虎上将 ×5 攻4耗4（用真实姓名增加三国韵味）
  const fiveTiger: Array<{ id: string; name: string }> = [
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
      category: CardCategory.General,
      subtype: GeneralTier.FiveTiger,
      value: 4,
      cost: 4,
      desc: '五虎上将 · 攻 4 · 耗气 4',
    });
  }
  // 吕布 ×1 攻5 基础耗4
  out.push({
    id: 'lubu',
    name: '吕布',
    category: CardCategory.General,
    subtype: GeneralTier.LuBu,
    value: 5,
    cost: 4, // 专属基础耗气 4
    desc: '飞将 · 攻 5 · 基础耗气 4',
  });
  return out;
}

/** 防具牌：23 张 */
function buildArmors(): CardDef[] {
  const out: CardDef[] = [];
  out.push(...makeCopies(
    'leather', '皮甲', CardCategory.Armor, ArmorTier.Leather,
    1, 0, '防 1 · 受击时抵消 1 点伤害', 10,
  ));
  out.push(...makeCopies(
    'bronze', '铜甲', CardCategory.Armor, ArmorTier.Bronze,
    2, 0, '防 2 · 受击时抵消 2 点伤害', 6,
  ));
  out.push(...makeCopies(
    'iron', '铁甲', CardCategory.Armor, ArmorTier.Iron,
    3, 0, '防 3 · 受击时抵消 3 点伤害', 4,
  ));
  out.push(...makeCopies(
    'steel', '钢甲', CardCategory.Armor, ArmorTier.Steel,
    4, 0, '防 4 · 受击时抵消 4 点伤害', 3,
  ));
  return out;
}

/** 功能-补气牌：12 张 */
function buildFunctionQi(): CardDef[] {
  const out: CardDef[] = [];
  out.push(...makeCopies(
    'ration', '兵粮补给', CardCategory.FunctionQi, QiTier.Ration,
    2, 0, '自身回合打出 · 立即 +2 气', 6,
  ));
  out.push(...makeCopies(
    'rest', '整军休战', CardCategory.FunctionQi, QiTier.Rest,
    3, 0, '自身回合打出 · 立即 +3 气', 4,
  ));
  out.push(...makeCopies(
    'supply', '军需急运', CardCategory.FunctionQi, QiTier.Supply,
    4, 0, '自身回合打出 · 立即 +4 气', 2,
  ));
  return out;
}

/** 功能-补血牌：19 张 */
function buildFunctionHp(): CardDef[] {
  const out: CardDef[] = [];
  out.push(...makeCopies(
    'wine', '杜康药酒', CardCategory.FunctionHp, HpTier.Wine,
    1, 0, '未满血回 1 血｜满血时 +1 气', 10,
  ));
  out.push(...makeCopies(
    'medicine', '华佗汤药', CardCategory.FunctionHp, HpTier.Medicine,
    2, 0, '未满血回 2 血｜满血时 +2 气', 6,
  ));
  out.push(...makeCopies(
    'bandage', '随军伤药', CardCategory.FunctionHp, HpTier.Bandage,
    3, 0, '未满血回 3 血｜满血时 +3 气', 3,
  ));
  return out;
}

/** 兵法增伤牌：3 张 */
function buildStrategy(): CardDef[] {
  const out: CardDef[] = [];
  // 孟德新书 ×2 +1层
  out.push(...makeCopies(
    'mengde', '孟德新书', CardCategory.Strategy, StrategyType.MengDe,
    1, 0, '获得 1 层兵法增幅 · 武将攻击 +1 · 持续 3 回合', 2,
  ));
  // 孙子兵法 ×1 +2层
  out.push({
    id: 'sunzi_0',
    name: '孙子兵法',
    category: CardCategory.Strategy,
    subtype: StrategyType.SunZi,
    value: 2,
    cost: 0,
    desc: '获得 2 层兵法增幅 · 武将攻击 +2 · 持续 3 回合',
  });
  return out;
}

/** 绝杀神兵牌：5 张 */
function buildUltimate(): CardDef[] {
  const out: CardDef[] = [];
  const list: Array<{ id: string; name: string; type: UltimateType; dmg: number; desc: string }> = [
    { id: 'ganjiang', name: '干将', type: UltimateType.GanJiang, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
    { id: 'moxie', name: '莫邪', type: UltimateType.MoXie, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
    { id: 'chixiao', name: '赤霄', type: UltimateType.ChiXiao, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
    { id: 'qixing_longyuan', name: '七星龙渊', type: UltimateType.QiXingLongYuan, dmg: 1, desc: '神兵 · 1 点真实伤害 · 无视防具' },
    { id: 'yitianjian', name: '倚天剑', type: UltimateType.YiTianJian, dmg: 2, desc: '神兵 · 2 点真实伤害 · 击杀不可急救' },
  ];
  for (const u of list) {
    out.push({
      id: u.id,
      name: u.name,
      category: CardCategory.Ultimate,
      subtype: u.type,
      value: u.dmg,
      cost: 0,
      desc: u.desc,
    });
  }
  return out;
}

/** 阵法战术牌：5 张 */
function buildFormation(): CardDef[] {
  const out: CardDef[] = [];
  // 八卦阵 ×2 受击反弹
  out.push(...makeCopies(
    'bagua', '八卦阵', CardCategory.Formation, FormationType.BaGua,
    0, 0, '受击触发 · 全额反弹武将结算后真实伤害 · 不可反弹绝杀/倚天剑', 2,
  ));
  // 追风阵 ×2 篡改先手
  out.push(...makeCopies(
    'zhuifeng', '追风阵', CardCategory.Formation, FormationType.ZhuiFeng,
    0, 0, '自身回合触发 · 下一回合仍为己方先手 · 生效后恢复默认轮换', 2,
  ));
  // 龟背阵 ×1 持续3回合对方武将攻击 -1
  out.push(...makeCopies(
    'guibei', '龟背阵', CardCategory.Formation, FormationType.GuiBei,
    0, 0, '自身回合触发 · 持续3回合对方武将攻击力 -1 · 绝杀不受影响 · 到期消失', 1,
  ));
  return out;
}

/** 魅惑牌：2 张 */
function buildCharm(): CardDef[] {
  const out: CardDef[] = [];
  // 貂蝉 ×1
  out.push({
    id: 'diaochan',
    name: '貂蝉',
    category: CardCategory.Charm,
    subtype: CharmType.Diaochan,
    value: 0, cost: 0,
    desc: '魅惑 · 对方兵法层 -1 · 若兵法层为 0 则对方 -3 气',
  });
  // 小乔 ×1
  out.push({
    id: 'xiaoqiao',
    name: '小乔',
    category: CardCategory.Charm,
    subtype: CharmType.Xiaoqiao,
    value: 0, cost: 0,
    desc: '魅惑 · 对方兵法层 -1 · 若兵法层为 0 则对方 -3 气',
  });
  return out;
}

/** 构建完整 107 张牌库（按文档数量精确对账） */
export function buildFullDeck(): CardDef[] {
  const out: CardDef[] = [];
  out.push(...buildGenerals());     // 38
  out.push(...buildArmors());       // 23
  out.push(...buildFunctionQi());  // 12
  out.push(...buildFunctionHp());  // 19
  out.push(...buildStrategy());     // 3
  out.push(...buildUltimate());     // 5
  out.push(...buildFormation());    // 5
  out.push(...buildCharm());        // 2
  // 合计 38+23+12+19+3+5+5+2 = 107
  return out;
}

/** 数量自检（开发期调用，断言牌库总数=107） */
export function assertDeckSize(deck: CardDef[]): void {
  const expected = 107;
  if (deck.length !== expected) {
    throw new Error(`牌库数量错误：期望 ${expected}，实际 ${deck.length}`);
  }
  // 分类对账
  const counter: Record<string, number> = {};
  for (const c of deck) {
    counter[c.category] = (counter[c.category] || 0) + 1;
  }
  const expect: Record<string, number> = {
    [CardCategory.General]: 38,
    [CardCategory.Armor]: 23,
    [CardCategory.FunctionQi]: 12,
    [CardCategory.FunctionHp]: 19,
    [CardCategory.Strategy]: 3,
    [CardCategory.Ultimate]: 5,
    [CardCategory.Formation]: 5,
    [CardCategory.Charm]: 2,
  };
  for (const k of Object.keys(expect)) {
    if (counter[k] !== expect[k]) {
      throw new Error(`分类 ${k} 数量错误：期望 ${expect[k]}，实际 ${counter[k]}`);
    }
  }
}

/** 卡牌配色规范（按 UI 规范文档） */
export const CARD_COLORS: Record<CardCategory, { bg: string; border: string; label: string }> = {
  [CardCategory.General]:    { bg: '#F3E9D7', border: '#705C48', label: '武将攻击' },
  [CardCategory.Armor]:      { bg: '#E4E7EA', border: '#5C6772', label: '防具防御' },
  [CardCategory.FunctionQi]: { bg: '#EBDBC3', border: '#825E3B', label: '功能-补气' },
  [CardCategory.FunctionHp]: { bg: '#F2E0DC', border: '#8C4A40', label: '功能-补血' },
  [CardCategory.Strategy]:   { bg: '#E8D9BC', border: '#4B3B2A', label: '兵法增伤' },
  [CardCategory.Ultimate]:   { bg: '#1F1310', border: '#C9A227', label: '绝杀神兵' },
  [CardCategory.Formation]:  { bg: '#D9E2E0', border: '#344240', label: '阵法战术' },
  [CardCategory.Charm]:      { bg: '#F5DCE6', border: '#8C4A6E', label: '魅惑' },
};
