/**
 * 三国卡牌对战 · 核心类型定义
 * 引擎无关，Cocos-Creator 与 Web 均可使用
 */

/** 玩家 ID：0=先手方初始，1=后手方初始 */
export type PlayerId = 0 | 1;

/** 卡牌大类 */
export enum CardCategory {
  General = 'general',           // 武将攻击牌
  Armor = 'armor',                // 防具防御牌
  FunctionQi = 'function_qi',    // 功能-补气
  FunctionHp = 'function_hp',    // 功能-补血
  Strategy = 'strategy',          // 兵法增伤
  Ultimate = 'ultimate',          // 绝杀神兵
  Formation = 'formation',        // 阵法战术
  Charm = 'charm',                // 魅惑类（削弱对方兵法/气）
}

/** 武将等级（用于生成卡牌数据，非运行时状态） */
export enum GeneralTier {
  Soldier = 'soldier',       // 士兵 攻1耗1
  Normal = 'normal',         // 普通武将 攻2耗2
  SecondRate = 'second_rate',// 二流大将 攻3耗3
  FiveTiger = 'five_tiger',  // 五虎上将 攻4耗4
  LuBu = 'lubu',             // 吕布 攻5基础耗4
}

/** 防具等级 */
export enum ArmorTier {
  Leather = 'leather',   // 皮甲 防1
  Bronze = 'bronze',     // 铜甲 防2
  Iron = 'iron',          // 铁甲 防3
  Steel = 'steel',        // 钢甲 防4
}

/** 补气牌等级 */
export enum QiTier {
  Ration = 'ration',       // 兵粮补给 +2气
  Rest = 'rest',           // 整军休战 +3气
  Supply = 'supply',       // 军需急运 +4气
}

/** 补血牌等级 */
export enum HpTier {
  Wine = 'wine',          // 杜康药酒 回1血
  Medicine = 'medicine',  // 华佗汤药 回2血
  Bandage = 'bandage',    // 随军伤药 回3血
}

/** 兵法种类 */
export enum StrategyType {
  MengDe = 'mengde',  // 孟德新书 +1层
  SunZi = 'sunzi',    // 孙子兵法 +2层
}

/** 绝杀神兵种类 */
export enum UltimateType {
  GanJiang = 'ganjiang',     // 干将 1点真实
  MoXie = 'moxie',            // 莫邪 1点真实
  ChiXiao = 'chixiao',       // 赤霄 1点真实
  QiXingLongYuan = 'qixing_longyuan', // 七星龙渊 1点真实
  YiTianJian = 'yitianjian', // 倚天剑 2点真实
}

/** 阵法种类 */
export enum FormationType {
  BaGua = 'bagua',   // 八卦阵（受击反弹）
  ZhuiFeng = 'zhuifeng', // 追风阵（篡改先手）
  GuiBei = 'guibei', // 龟背阵（本回合对方武将攻击-1）
}

/** 魅惑种类 */
export enum CharmType {
  Diaochan = 'diaochan',   // 貂蝉
  Xiaoqiao = 'xiaoqiao',   // 小乔
}

/** 卡牌静态定义（牌库模板） */
export interface CardDef {
  /** 全局唯一 ID（如 'soldier_0', 'lubu', 'mengde_0'） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 卡牌大类 */
  category: CardCategory;
  /** 子类标识 */
  subtype?: GeneralTier | ArmorTier | QiTier | HpTier | StrategyType | UltimateType | FormationType | CharmType;
  /** 核心数值（攻击/防御/补气/补血/层数/真实伤害） */
  value: number;
  /** 耗气量（武将牌专用；功能牌打出 0 消耗，但补气值≠0） */
  cost: number;
  /** 描述文本 */
  desc: string;
}

/** 运行时卡牌实例（带实例 ID 用于手牌/弃牌堆追踪） */
export interface CardInstance {
  /** 实例唯一 ID */
  uid: string;
  /** 指向静态定义 */
  def: CardDef;
}

/** 兵法生效记录（独立倒计时，按文档要求不要只记总层数） */
export interface StrategyRecord {
  /** 来源卡牌实例 UID */
  sourceCardUid: string;
  /** 兵法种类 */
  type: StrategyType;
  /** 该卡提供的层数（孟德新书=1，孙子兵法=2） */
  layers: number;
  /** 剩余回合数 */
  remainingTurns: number;
}

/** 玩家状态 */
export interface PlayerState {
  /** 玩家 ID */
  id: PlayerId;
  /** 当前血量 */
  hp: number;
  /** 当前气量 */
  qi: number;
  /** 手牌 */
  hand: CardInstance[];
  /** 兵法生效记录列表 */
  strategies: StrategyRecord[];
  /** 普通补气按钮是否已使用 */
  usedNormalQi: boolean;
  /** 大补气按钮是否已使用 */
  usedBigQi: boolean;
  /** 本回合是否已触发掉血补气事件计数（用于诊断） */
  hpLossQiThisTurn: number;
  /** 紧急救血阶段的溢出伤害（补血量需 > overkill 才能救活） */
  overkill: number;
}

/** 回合阶段 */
export enum TurnPhase {
  Action = 'action',     // 先手玩家行动阶段
  Defense = 'defense',   // 后手玩家受击防御阶段
  Settle = 'settle',     // 回合终局结算
  Draw = 'draw',         // 补牌阶段
  SwitchFirst = 'switch_first', // 互换先手
}

/** 战斗状态（互斥，残爆复合态覆盖残血） */
export enum BattleState {
  Normal = 'normal',           // 正常
  LowHp = 'low_hp',            // 缺血（hp=2） 攻击+1
  Critical = 'critical',       // 残血（hp=1） 攻击+1 耗气-1可降至0
  CriticalBurst = 'critical_burst', // 残爆（hp=1 + 兵法层数） 状态加成+2 保留0费特权
}

/** 游戏结束原因 */
export enum GameOverReason {
  HpZero = 'hp_zero',           // 中途血量≤0
  DeckEmpty = 'deck_empty',    // 牌库耗尽
}

/** 游戏结果 */
export interface GameResult {
  winner: PlayerId | null; // null=平局
  reason: GameOverReason;
  detail: string;
}

/** 行动上下文：执行卡牌效果时传入 */
export interface ActionContext {
  engine: any; // 引用 GameEngine（避免循环依赖用 any）
  actor: PlayerId;     // 出牌玩家
  target: PlayerId;    // 受影响玩家
}

/** 卡牌效果函数签名 */
export type CardEffectFn = (card: CardInstance, ctx: ActionContext) => void;

// ===== 战绩得分追踪 =====
/** 单局得分追踪（引擎内部维护，局末结算用） */
export interface ScoreTracker {
  /** 一血归属（本局第一次成功攻击），null=尚未 */
  firstBloodPid: PlayerId | null;
  /** 各玩家成功攻击次数 */
  attackHits: [number, number];
  /** 各玩家绝杀次数 */
  ultimateKills: [number, number];
  /** 各玩家战斗得分（攻击分累计） */
  combatScore: [number, number];
}

/** 局末结算明细 */
export interface GameSettlement {
  /** 胜利方 pid（null=平局） */
  winner: PlayerId | null;
  /** 各玩家最终得分（正数） */
  scores: [number, number];
  /** 得分明细 */
  breakdown: {
    combatScore: number;      // 战斗分（攻击命中累计）
    firstBlood: number;       // 一血奖励
    victoryBonus: number;     // 胜利基础分
    speedBonus: number;      // 快速胜利奖励
    hpBonus: number;         // 剩余血量奖励
    lossPenalty: number;      // 失败扣分（负数）
  }[];
  /** 本局回合数 */
  roundCount: number;
}
