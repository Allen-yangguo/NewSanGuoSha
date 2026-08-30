/**
 * 三国卡牌对战 · 全部卡牌数据定义（v5.0 定稿）
 * 牌库对账：
 *   武将 44 + 防具 38 + 功能 34 + 兵法 3 + 绝杀 5 + 阵法 6 + 魅惑 2 + 智者 3 = 135
 * 另有限定卡 15 张（不在初始牌库，仅智者锦囊产出）
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
  StrategistType,
  PouchType,
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

/** 武将牌：44 张（士兵15 + 普通10 + 二流10 + 一流8 + 吕布1） */
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
  // 二流大将 ×10 攻3耗3
  const secondRate: Array<{ id: string; name: string }> = [
    { id: 'weiyan', name: '魏延' },
    { id: 'xiahou_dun', name: '夏侯惇' },
    { id: 'zhangliao', name: '张辽' },
    { id: 'zhanghe', name: '张郃' },
    { id: 'ganning', name: '甘宁' },
    { id: 'taishici', name: '太史慈' },
    // v4.3 新增二流武将
    { id: 'yanliang', name: '颜良' },
    { id: 'wenchou', name: '文丑' },
    { id: 'huaxiong', name: '华雄' },
    { id: 'pangde', name: '庞德' },
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
  // v4.3 一流武将（曹操阵营，对标五虎上将）×3 攻4耗4
  const firstRate: Array<{ id: string; name: string }> = [
    { id: 'xuchu', name: '许褚' },
    { id: 'dianwei', name: '典韦' },
    { id: 'xuhuang', name: '徐晃' },
  ];
  for (const g of firstRate) {
    out.push({
      id: g.id,
      name: g.name,
      category: CardCategory.General,
      subtype: GeneralTier.FiveTiger,
      value: 4,
      cost: 4,
      desc: '一流武将 · 攻 4 · 耗气 4',
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

/** 防具牌：38 张（甲系列 20 + 盾系列 18） */
function buildArmors(): CardDef[] {
  const out: CardDef[] = [];
  // 甲系列：皮甲8 / 铜甲5 / 铁甲4 / 钢甲3
  out.push(...makeCopies(
    'leather', '皮甲', CardCategory.Armor, ArmorTier.Leather,
    1, 0, '防 1 · 受击时抵消 1 点伤害', 8,
  ));
  out.push(...makeCopies(
    'bronze', '铜甲', CardCategory.Armor, ArmorTier.Bronze,
    2, 0, '防 2 · 受击时抵消 2 点伤害', 5,
  ));
  out.push(...makeCopies(
    'iron', '铁甲', CardCategory.Armor, ArmorTier.Iron,
    3, 0, '防 3 · 受击时抵消 3 点伤害', 4,
  ));
  out.push(...makeCopies(
    'steel', '钢甲', CardCategory.Armor, ArmorTier.Steel,
    4, 0, '防 4 · 受击时抵消 4 点伤害', 3,
  ));
  // v4.3 盾系列（B2 盾）：木盾8 / 铜盾5 / 铁盾3 / 钢盾2
  out.push(...makeCopies(
    'wood_shield', '木盾', CardCategory.Armor, ArmorTier.WoodShield,
    1, 0, '防 1 · 受击时抵消 1 点伤害', 8,
  ));
  out.push(...makeCopies(
    'bronze_shield', '铜盾', CardCategory.Armor, ArmorTier.BronzeShield,
    2, 0, '防 2 · 受击时抵消 2 点伤害', 5,
  ));
  out.push(...makeCopies(
    'iron_shield', '铁盾', CardCategory.Armor, ArmorTier.IronShield,
    3, 0, '防 3 · 受击时抵消 3 点伤害', 3,
  ));
  out.push(...makeCopies(
    'steel_shield', '钢盾', CardCategory.Armor, ArmorTier.SteelShield,
    4, 0, '防 4 · 受击时抵消 4 点伤害', 2,
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

/** 功能-补血牌：22 张 */
function buildFunctionHp(): CardDef[] {
  const out: CardDef[] = [];
  out.push(...makeCopies(
    'wine', '杜康药酒', CardCategory.FunctionHp, HpTier.Wine,
    1, 0, '未满血回 1 血｜满血时 +1 气', 10,
  ));
  out.push(...makeCopies(
    'medicine', '华佗汤药', CardCategory.FunctionHp, HpTier.Medicine,
    2, 0, '未满血回 2 血｜满血时 +2 气', 8,
  ));
  out.push(...makeCopies(
    'bandage', '随军伤药', CardCategory.FunctionHp, HpTier.Bandage,
    3, 0, '未满血回 3 血｜满血时 +3 气', 4,
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

/** 阵法战术牌：6 张（入初始牌库） */
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
  // v4.3 鱼鳞阵 ×1 持续3回合己方防具防御 +1（锦囊也可产出）
  out.push(...makeCopies(
    'yulin', '鱼鳞阵', CardCategory.Formation, FormationType.YuLin,
    0, 0, '自身回合触发 · 持续3回合己方防具防御 +1 · 到期消失', 1,
  ));
  return out;
}

/** 智者牌：3 张（诸葛亮/周瑜/司马懿，0 耗气，打出获得锦囊标记） */
function buildStrategists(): CardDef[] {
  return [
    {
      id: 'zhuge', name: '诸葛亮', category: CardCategory.Strategist,
      subtype: StrategistType.ZhugeLiang, value: 0, cost: 0,
      desc: '智者 · 缺/残/急三锦囊 · 缺血=2 缺锦囊(八卦/龟背/奇门) · 残血=1 残锦囊(神兵五选一) · 急救阶段急锦囊(还魂/绝疗丹)',
    },
    {
      id: 'zhouyu', name: '周瑜', category: CardCategory.Strategist,
      subtype: StrategistType.ZhouYu, value: 0, cost: 0,
      desc: '智者 · 缺/残两锦囊 · 缺(火烧连营/鱼鳞阵) · 残(大乔清气/孙尚香偷急)',
    },
    {
      id: 'simayi', name: '司马懿', category: CardCategory.Strategist,
      subtype: StrategistType.SimaYi, value: 0, cost: 0,
      desc: '智者 · 缺/残两锦囊 · 缺(龟背/坚壁清野) · 残(红血三将)',
    },
  ];
}

/**
 * 限定产出卡牌：15 张（不在初始牌库，仅智者锦囊产出）
 * 武将 10 + 丹药 2 + 阵法 3
 */
export function buildLimitedCards(): CardDef[] {
  const out: CardDef[] = [];
  // 诸葛亮残锦囊：蛇矛张飞/偃月关羽/龙胆赵云 攻8耗5 · 方天吕布 攻9耗5 · 三英 攻10耗5（锦囊产出武将攻击力+2）
  const zhugeSpecials: Array<{ id: string; name: string; value: number; cost: number }> = [
    { id: 'zhangfei_shemiao', name: '蛇矛张飞', value: 8, cost: 5 },
    { id: 'guanyu_yanyue', name: '偃月关羽', value: 8, cost: 5 },
    { id: 'zhaoyun_longdan', name: '龙胆赵云', value: 8, cost: 5 },
    { id: 'lubu_fangtian', name: '方天吕布', value: 9, cost: 5 },
    { id: 'sanying', name: '三英', value: 10, cost: 5 },
  ];
  for (const g of zhugeSpecials) {
    out.push({
      id: g.id, name: g.name, category: CardCategory.General, subtype: GeneralTier.Limited,
      value: g.value, cost: g.cost, desc: `限定武将 · 攻 ${g.value} · 耗气 ${g.cost}`,
    });
  }
  // 周瑜残锦囊：大乔（清空敌方气量）/ 孙尚香（偷取敌方急锦囊）——魅惑系列
  out.push({
    id: 'daqiao', name: '大乔', category: CardCategory.Charm, subtype: CharmType.DaQiao,
    value: 0, cost: 0, desc: '魅惑 · 打出直接清空敌方当前气量（不改上限、不清状态标记）',
  });
  out.push({
    id: 'sunshangxiang', name: '孙尚香', category: CardCategory.Charm, subtype: CharmType.SunShangXiang,
    value: 0, cost: 0, desc: '魅惑 · 偷取敌方【急】锦囊标记 · 敌方无急锦囊则出牌完全无效',
  });
  // 司马懿残锦囊：红血三将 攻8耗5（锦囊产出武将攻击力+2）
  const simaSpecials: Array<{ id: string; name: string }> = [
    { id: 'xuchu_hongxue', name: '红血许褚' },
    { id: 'dianwei_hongxue', name: '红血典韦' },
    { id: 'xuhuang_hongxue', name: '红血徐晃' },
  ];
  for (const g of simaSpecials) {
    out.push({
      id: g.id, name: g.name, category: CardCategory.General, subtype: GeneralTier.Limited,
      value: 8, cost: 5, desc: '限定武将 · 攻 8 · 耗气 5',
    });
  }
  // 丹药：还魂丹（仅救普通攻击致死）/ 绝疗丹（普通与绝杀均有效）
  out.push({
    id: 'huanhun_dan', name: '还魂丹', category: CardCategory.FunctionHp, subtype: HpTier.HuanHunDan,
    value: 1, cost: 0, desc: '急救 · 保 1 血 · 仅普通攻击致死有效，绝杀伤害无效',
  });
  out.push({
    id: 'jueliao_dan', name: '绝疗丹', category: CardCategory.FunctionHp, subtype: HpTier.JueLiaoDan,
    value: 1, cost: 0, desc: '急救 · 保 1 血 · 普通攻击与绝杀均有效',
  });
  // 阵法（仅锦囊产出）：奇门遁甲/火烧连营（兵法+3）· 坚壁清野（2层龟背减攻-2）
  out.push({
    id: 'qimen', name: '奇门遁甲', category: CardCategory.Formation, subtype: FormationType.QiMenDunJia,
    value: 3, cost: 0, desc: '锦囊 · 己方行动打出 · 兵法 +3 · 持续 3 回合',
  });
  out.push({
    id: 'huoshao', name: '火烧连营', category: CardCategory.Formation, subtype: FormationType.HuoShaoLianYing,
    value: 3, cost: 0, desc: '锦囊 · 己方行动打出 · 兵法 +3 · 持续 3 回合',
  });
  out.push({
    id: 'jianbi', name: '坚壁清野', category: CardCategory.Formation, subtype: FormationType.JianBiQingYe,
    value: 2, cost: 0, desc: '锦囊 · 己方行动打出 · 施加 2 层龟背阵 · 对方武将攻击 -2 · 持续 3 回合',
  });
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

/** 构建完整 135 张牌库（按文档数量精确对账） */
export function buildFullDeck(): CardDef[] {
  const out: CardDef[] = [];
  out.push(...buildGenerals());     // 44
  out.push(...buildArmors());       // 38
  out.push(...buildFunctionQi());  // 12
  out.push(...buildFunctionHp());  // 22
  out.push(...buildStrategy());     // 3
  out.push(...buildUltimate());     // 5
  out.push(...buildFormation());    // 6
  out.push(...buildCharm());        // 2
  out.push(...buildStrategists());  // 3
  // 合计 44+38+12+22+3+5+6+2+3 = 135
  return out;
}

/** 数量自检（开发期调用，断言牌库总数=135） */
export function assertDeckSize(deck: CardDef[]): void {
  const expected = 135;
  if (deck.length !== expected) {
    throw new Error(`牌库数量错误：期望 ${expected}，实际 ${deck.length}`);
  }
  // 分类对账
  const counter: Record<string, number> = {};
  for (const c of deck) {
    counter[c.category] = (counter[c.category] || 0) + 1;
  }
  const expect: Record<string, number> = {
    [CardCategory.General]: 44,
    [CardCategory.Armor]: 38,
    [CardCategory.FunctionQi]: 12,
    [CardCategory.FunctionHp]: 22,
    [CardCategory.Strategy]: 3,
    [CardCategory.Ultimate]: 5,
    [CardCategory.Formation]: 6,
    [CardCategory.Charm]: 2,
    [CardCategory.Strategist]: 3,
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
  [CardCategory.Strategist]: { bg: '#E8E2F5', border: '#5A4A8C', label: '智者' },
};

// ============================================================
// 智者锦囊产出表（锦囊产出的卡牌均为实体手牌）
// ============================================================
let _pouchChoices: Record<string, CardDef[]> | null = null;

function pouchKey(strategistId: string, pouch: string): string {
  return `${strategistId}:${pouch}`;
}

/** 构建锦囊产出查找表（懒加载） */
function buildPouchChoices(): void {
  const limited = buildLimitedCards();
  const byId = new Map<string, CardDef>(limited.map(d => [d.id, d]));
  const deckDefs = buildFullDeck();
  const deckById = (prefix: string): CardDef | undefined => deckDefs.find(d => d.id.startsWith(prefix));
  const get = (id: string): CardDef | null => byId.get(id) || deckById(id) || null;

  _pouchChoices = {};
  const set = (s: StrategistType, p: PouchType, ids: string[]) => {
    _pouchChoices![pouchKey(s, p)] = ids
      .map(id => get(id))
      .filter((d): d is CardDef => !!d);
  };

  // 诸葛亮：缺(八卦阵/龟背阵/奇门遁甲) · 残(五神兵) · 急(还魂丹/绝疗丹)
  set(StrategistType.ZhugeLiang, PouchType.Que, ['bagua', 'guibei', 'qimen']);
  set(StrategistType.ZhugeLiang, PouchType.Can, [
    'zhangfei_shemiao', 'guanyu_yanyue', 'zhaoyun_longdan', 'lubu_fangtian', 'sanying',
  ]);
  set(StrategistType.ZhugeLiang, PouchType.Ji, ['huanhun_dan', 'jueliao_dan']);
  // 周瑜：缺(火烧连营/鱼鳞阵) · 残(大乔/孙尚香)
  set(StrategistType.ZhouYu, PouchType.Que, ['huoshao', 'yulin']);
  set(StrategistType.ZhouYu, PouchType.Can, ['daqiao', 'sunshangxiang']);
  // 司马懿：缺(龟背阵/坚壁清野) · 残(红血三将)
  set(StrategistType.SimaYi, PouchType.Que, ['guibei', 'jianbi']);
  set(StrategistType.SimaYi, PouchType.Can, ['xuchu_hongxue', 'dianwei_hongxue', 'xuhuang_hongxue']);
}

/** 获取某智者某锦囊的可产出卡牌选项 */
export function getPouchChoices(strategistId: string, pouch: PouchType): CardDef[] {
  if (!_pouchChoices) buildPouchChoices();
  return _pouchChoices![pouchKey(strategistId, pouch)] || [];
}
