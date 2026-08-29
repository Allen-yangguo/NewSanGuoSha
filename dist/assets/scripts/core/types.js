"use strict";
/**
 * 三国卡牌对战 · 核心类型定义
 * 引擎无关，Cocos-Creator 与 Web 均可使用
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameOverReason = exports.BattleState = exports.TurnPhase = exports.CharmType = exports.PouchType = exports.StrategistType = exports.FormationType = exports.UltimateType = exports.StrategyType = exports.HpTier = exports.QiTier = exports.ArmorTier = exports.GeneralTier = exports.CardCategory = void 0;
/** 卡牌大类 */
var CardCategory;
(function (CardCategory) {
    CardCategory["General"] = "general";
    CardCategory["Armor"] = "armor";
    CardCategory["FunctionQi"] = "function_qi";
    CardCategory["FunctionHp"] = "function_hp";
    CardCategory["Strategy"] = "strategy";
    CardCategory["Ultimate"] = "ultimate";
    CardCategory["Formation"] = "formation";
    CardCategory["Charm"] = "charm";
    CardCategory["Strategist"] = "strategist";
})(CardCategory || (exports.CardCategory = CardCategory = {}));
/** 武将等级（用于生成卡牌数据，非运行时状态） */
var GeneralTier;
(function (GeneralTier) {
    GeneralTier["Soldier"] = "soldier";
    GeneralTier["Normal"] = "normal";
    GeneralTier["SecondRate"] = "second_rate";
    GeneralTier["FiveTiger"] = "five_tiger";
    GeneralTier["LuBu"] = "lubu";
    GeneralTier["Limited"] = "limited";
})(GeneralTier || (exports.GeneralTier = GeneralTier = {}));
/** 防具等级 */
var ArmorTier;
(function (ArmorTier) {
    ArmorTier["Leather"] = "leather";
    ArmorTier["Bronze"] = "bronze";
    ArmorTier["Iron"] = "iron";
    ArmorTier["Steel"] = "steel";
    ArmorTier["WoodShield"] = "wood_shield";
    ArmorTier["BronzeShield"] = "bronze_shield";
    ArmorTier["IronShield"] = "iron_shield";
    ArmorTier["SteelShield"] = "steel_shield";
})(ArmorTier || (exports.ArmorTier = ArmorTier = {}));
/** 补气牌等级 */
var QiTier;
(function (QiTier) {
    QiTier["Ration"] = "ration";
    QiTier["Rest"] = "rest";
    QiTier["Supply"] = "supply";
})(QiTier || (exports.QiTier = QiTier = {}));
/** 补血牌等级 */
var HpTier;
(function (HpTier) {
    HpTier["Wine"] = "wine";
    HpTier["Medicine"] = "medicine";
    HpTier["Bandage"] = "bandage";
    HpTier["HuanHunDan"] = "dan_huanhun";
    HpTier["JueLiaoDan"] = "dan_jueliao";
})(HpTier || (exports.HpTier = HpTier = {}));
/** 兵法种类 */
var StrategyType;
(function (StrategyType) {
    StrategyType["MengDe"] = "mengde";
    StrategyType["SunZi"] = "sunzi";
    StrategyType["QiMenDunJia"] = "qimen";
    StrategyType["HuoShaoLianYing"] = "huoshao";
})(StrategyType || (exports.StrategyType = StrategyType = {}));
/** 绝杀神兵种类 */
var UltimateType;
(function (UltimateType) {
    UltimateType["GanJiang"] = "ganjiang";
    UltimateType["MoXie"] = "moxie";
    UltimateType["ChiXiao"] = "chixiao";
    UltimateType["QiXingLongYuan"] = "qixing_longyuan";
    UltimateType["YiTianJian"] = "yitianjian";
})(UltimateType || (exports.UltimateType = UltimateType = {}));
/** 阵法种类 */
var FormationType;
(function (FormationType) {
    FormationType["BaGua"] = "bagua";
    FormationType["ZhuiFeng"] = "zhuifeng";
    FormationType["GuiBei"] = "guibei";
    FormationType["QiMenDunJia"] = "qimen";
    FormationType["HuoShaoLianYing"] = "huoshao";
    FormationType["YuLin"] = "yulin";
    FormationType["JianBiQingYe"] = "jianbi";
})(FormationType || (exports.FormationType = FormationType = {}));
/** 智者种类 */
var StrategistType;
(function (StrategistType) {
    StrategistType["ZhugeLiang"] = "zhuge";
    StrategistType["ZhouYu"] = "zhouyu";
    StrategistType["SimaYi"] = "simayi";
})(StrategistType || (exports.StrategistType = StrategistType = {}));
/** 锦囊种类 */
var PouchType;
(function (PouchType) {
    PouchType["Que"] = "que";
    PouchType["Can"] = "can";
    PouchType["Ji"] = "ji";
})(PouchType || (exports.PouchType = PouchType = {}));
/** 魅惑种类 */
var CharmType;
(function (CharmType) {
    CharmType["Diaochan"] = "diaochan";
    CharmType["Xiaoqiao"] = "xiaoqiao";
    CharmType["DaQiao"] = "daqiao";
    CharmType["SunShangXiang"] = "sunshangxiang";
})(CharmType || (exports.CharmType = CharmType = {}));
/** 回合阶段 */
var TurnPhase;
(function (TurnPhase) {
    TurnPhase["Action"] = "action";
    TurnPhase["Defense"] = "defense";
    TurnPhase["Settle"] = "settle";
    TurnPhase["Draw"] = "draw";
    TurnPhase["SwitchFirst"] = "switch_first";
})(TurnPhase || (exports.TurnPhase = TurnPhase = {}));
/** 战斗状态（互斥，残爆复合态覆盖残血） */
var BattleState;
(function (BattleState) {
    BattleState["Normal"] = "normal";
    BattleState["LowHp"] = "low_hp";
    BattleState["Critical"] = "critical";
    BattleState["CriticalBurst"] = "critical_burst";
})(BattleState || (exports.BattleState = BattleState = {}));
/** 游戏结束原因 */
var GameOverReason;
(function (GameOverReason) {
    GameOverReason["HpZero"] = "hp_zero";
    GameOverReason["DeckEmpty"] = "deck_empty";
})(GameOverReason || (exports.GameOverReason = GameOverReason = {}));
//# sourceMappingURL=types.js.map