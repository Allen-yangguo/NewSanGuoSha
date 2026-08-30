"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBotSystem = initBotSystem;
exports.shutdownBots = shutdownBots;
exports.getBotSocketIds = getBotSocketIds;
exports.isBotSocketId = isBotSocketId;
exports.ensureBotOpponent = ensureBotOpponent;
exports.isBotUid = isBotUid;
/**
 * 模拟玩家系统（v6.0）
 *
 * 设计:
 *  - 模拟玩家 = users.json 里 isBot=true 的正式用户,昵称 AI 生成(三国风)
 *  - 通过真实 socket.io-client 连接与真人走完全相同的协议(坐桌/准备/出牌/结算),积分结算由服务端统一处理,与真人完全一致
 *  - 预建 20 个;每日新增 2-3 个(按 data/bots-meta.json 记录日期)
 *  - 同一时刻活跃上限 10 个,周期轮换:非对局中的活跃机器人休眠,唤醒沉睡机器人
 *  - AI 行为:大厅闲逛(刷新桌列表)→ 挑空桌入座 → 准备等对手 → 对局中用启发式出牌 → 局后重开/离桌
 *  - 对外暴露 isBotSocketId / getBotSocketIds 供流量监控区分统计口径
 */
const socket_io_client_1 = require("socket.io-client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("../auth/db");
const authService_1 = require("../auth/authService");
const MAX_ACTIVE = 10; // 同时活跃上限
const PEAK_ACTIVE = 10; // 黄金时间活跃上限
const OFFPEAK_ACTIVE = 4; // 非黄金时间活跃上限
const NIGHT_START_HOUR = 1; // 凌晨 1 点起所有模拟玩家不出现
const NIGHT_END_HOUR = 6; // 早上 6 点起恢复
const DAILY_GAME_CAP = 30; // 每个模拟玩家每日对局上限(满则当日不再激活)
const TARGET_BOTS = 20; // 预建数量
const DAILY_ADD = [2, 3]; // 每日新增 2~3 个
const ROTATE_MS = 3 * 60 * 1000; // 每 3 分钟轮换一批
const MAX_BOT_VS_BOT = 4; // 机器人互相对局上限(留桌给真人)
const SOLO_WAIT_CAP = 6; // 独占空桌等真人的机器人上限(其余参与机器人互对)
const META_FILE = path.resolve(process.cwd(), 'data', 'bots-meta.json');
// ===== 北京时间(固定 UTC+8,不随服务器时区变化)=====
/** 北京时间 Date 对象 */
function beijingNow() {
    return new Date(Date.now() + 8 * 3600 * 1000);
}
/** 北京时间小时(0-23) */
function beijingHour() {
    return beijingNow().getUTCHours();
}
/** 北京时间日期 YYYY-MM-DD */
function beijingDate() {
    const d = beijingNow();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
/** 当前应保持活跃的机器人数量(按北京时间: 黄金时间多,夜间 1-6 点为 0) */
function currentMaxActive() {
    const h = beijingHour();
    if (h >= NIGHT_START_HOUR && h < NIGHT_END_HOUR)
        return 0; // 北京时间凌晨 1~6 点: 全部休眠
    if (h >= 18 || h < 1)
        return PEAK_ACTIVE; // 北京时间 18:00~24:00 黄金时间
    return OFFPEAK_ACTIVE; // 其余时间少量
}
/** 活跃机器人 socket id 集合(供监控区分统计) */
const activeBotSocketIds = new Set();
/** 机器人昵称生成: 拟真真人风格(姓名/网名/英文/趣味混合,避免模板化一眼假) */
// 旧版模板昵称(前缀+后缀,如「陈留先锋」)保留在这里仅用于迁移检测
const LEGACY_PREFIX = [
    '千里', '单骑', '卧龙', '凤雏', '锦帆', '白衣', '百骑', '虎痴', '恶来', '鬼谋',
    '温侯', '美髯', '燕人', '子龙', '幼麟', '冢虎', '飞将', '毒士', '陈留', '颍川',
];
const LEGACY_SUFFIX = [
    '剑客', '豪杰', '谋主', '先锋', '都督', '军师', '猛将', '游侠', '隐士', '名士',
    '虎将', '悍将', '奇才', '神射', '铁骑', '轻骑', '医者', '信使', '商贾', '镖师',
];
const SURNAMES = [
    '张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何',
    '高', '林', '罗', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '萧', '程',
    '袁', '董', '潘', '蒋', '蔡', '余', '杜', '叶', '苏', '魏', '吕', '丁', '沈', '任', '姚', '卢', '姜',
    '崔', '钟', '谭', '陆', '汪', '范', '金', '石', '廖', '贾', '夏', '韦', '付', '方', '白', '邹', '孟',
    '熊', '秦', '邱', '江', '尹', '薛', '闫', '段', '雷', '侯', '龙', '史', '陶', '黎', '贺', '顾', '毛',
    '郝', '龚', '邵', '万', '钱', '严', '覃', '武', '戴', '莫', '孔', '向', '汤',
];
const GIVEN_1 = [
    '伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超',
    '秀', '霞', '平', '刚', '桂', '英', '华', '玉', '萍', '红', '晶', '丹', '梅', '旭', '辉', '帆', '斌',
    '宇', '浩', '凯', '晨', '阳', '雪', '峰', '霖', '楠', '琳', '璐', '婷', '悦', '睿', '轩', '宸', '怡',
    '欣', '妍', '航', '哲', '博', '然', '泽', '希', '诺', '尧', '俊', '东', '坤', '鹏', '翔', '飞', '亮',
    '健', '鑫', '雷', '佳', '嘉', '冰', '洁', '安', '琪', '萱', '涵', '彤', '韵', '淑', '珍', '芝', '兰',
    '琴', '雯', '云', '颖', '凤', '娥', '花', '春', '夏', '秋', '冬', '宁', '柔', '巧', '甜', '蜜', '霜',
    '露', '雨', '晴', '枫', '松', '柏', '柳', '杨', '槐', '森', '林', '川', '岩', '峰', '野', '原', '田',
];
const NET_2 = [
    '清风', '明月', '星河', '云舒', '晚风', '初雪', '听雨', '拾光', '南巷', '北岛', '长安', '故里', '半夏',
    '微凉', '浅笑', '静好', '安然', '若曦', '沐辰', '子墨', '书言', '念安', '初晴', '晚秋', '春晓', '秋棠',
    '冬雪', '夏萤', '思远', '慕白', '知微', '云深', '逐月', '凌霜', '孤鸿', '落霞', '飞雪', '青梧', '白榆',
    '沉舟', '破晓', '长歌', '远山', '听澜', '望舒', '疏影', '暗香', '流萤', '星野', '月白', '浮生', '半盏',
    '一梦', '千寻', '未央', '顾北', '南乔', '北栀', '清欢', '归途', '旧梦', '新芽', '拾忆', '听风', '观澜',
    '折光', '萤火', '沐雨', '闻笛', '枕月', '踏雪', '寻梅', '点墨', '挥毫', '泛舟', '采薇', '摘星', '揽月',
    '抚琴', '弈棋', '品茗', '煮酒', '论道', '说书', '行医', '铸剑', '猎风', '逐日', '追月', '暮霭', '晨曦',
    '繁星', '冷月', '孤帆', '远影', '扁舟', '蓑笠', '钓雪', '寒江', '独钓', '采菊', '东篱', '南山', '归隐',
    '听泉', '望岳', '临渊', '羡鱼', '结庐', '人间', '云朵', '糖豆', '星星', '月亮', '太阳', '泡泡', '雪球',
    '奶茶', '布丁', '团子', '麻薯', '芋圆', '糯米', '豆沙', '芝麻', '花生', '核桃', '柚子', '芒果', '柠檬',
];
const NET_4 = [
    '小桥流水', '长安故里', '南巷旧人', '七月长安', '一叶知秋', '半盏清茶', '南风知意', '北冥有鱼', '月下独酌',
    '风起长林', '山河远阔', '人间烟火', '且听风吟', '岁月静好', '浮生若梦', '时光微凉', '落花听雨', '烟雨江南',
    '青灯古卷', '白衣胜雪', '踏雪无痕', '剑指天涯', '醉卧沙场', '策马奔腾', '仗剑天涯', '快意恩仇', '笑傲江湖',
    '浪迹天涯', '无名之辈', '过客匆匆', '红尘摆渡', '菩提树下', '三生有幸', '十里桃花', '千山暮雪', '万里星河',
    '云淡风轻', '静水流深', '细水长流', '灯火阑珊', '曲终人散', '高山流水', '阳春白雪', '沧海桑田', '海阔天空',
    '天高云淡', '风轻云淡', '花好月圆', '良辰美景', '一见如故', '相见恨晚', '旧友重逢', '江湖再见', '来日方长',
];
const EN_NAMES = [
    'Luna', 'Momo', 'Aki', 'Rio', 'Kiki', 'Nana', 'Yuki', 'Mia', 'Leo', 'Kevin', 'Jerry', 'Tommy',
    'Jacky', 'Sunny', 'Star', 'Moon', 'Sky', 'Wind', 'Fire', 'Ice', 'Rain', 'Snow', 'King', 'Queen',
    'Hero', 'Sword', 'Dragon', 'Tiger', 'Wolf', 'Fox', 'Bear', 'Eagle', 'Night', 'Dawn', 'Misty',
    'Coco', 'Lily', 'Molly', 'Dora', 'Nina', 'Rita', 'Sara', 'Emma', 'Amy', 'Ivy', 'Joy', 'Grace',
    'Rose', 'Candy', 'Hana', 'Sora', 'Kai', 'Rin', 'Suki', 'Rui', 'Ao', 'Ren', 'Yua', 'Mika',
];
const FUN_NAMES = [
    '肉肉', '团子', '麻薯', '布丁', '奶茶', '可乐', '薯片', '干饭人', '摆烂王', '摸鱼大师', '夜猫子',
    '早睡冠军', '咸鱼翻身', '阿杰', '阿伟', '小新', '小丸子', '皮皮虾', '螃蟹', '章鱼哥', '小狐狸',
    '大聪明', '小机灵', '老好人', '热心肠', '话痨', '闷葫芦', '开心果', '小太阳', '元气满满', '佛系青年',
];
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/** 生成一个拟真昵称(不保证唯一) */
function genNickname() {
    const r = Math.random() * 100;
    let nick;
    if (r < 15) {
        nick = pick(SURNAMES) + pick(GIVEN_1); // 姓名·2字: 张伟 / 李娜
    }
    else if (r < 30) {
        nick = pick(SURNAMES) + pick(GIVEN_1) + pick(GIVEN_1); // 姓名·3字: 王雨晴 / 刘子涵
    }
    else if (r < 60) {
        nick = pick(NET_2); // 双字网名: 清风 / 星河
    }
    else if (r < 70) {
        nick = pick(NET_4); // 四字网名: 小桥流水 / 半盏清茶
    }
    else if (r < 80) {
        nick = pick(EN_NAMES); // 英文名: Luna / Momo
    }
    else if (r < 85) {
        nick = pick(FUN_NAMES); // 趣味口语: 干饭人 / 小狐狸
    }
    else {
        nick = pick(NET_2) + (Math.random() < 0.5 ? '' : pick(GIVEN_1)); // 双字+字: 清风雨
    }
    // 约 1/4 概率追加数字/符号装饰,更贴近真实玩家 ID
    const dr = Math.random();
    if (dr < 0.12)
        nick += Math.floor(Math.random() * 90 + 10); // 清风87
    else if (dr < 0.20)
        nick += '_' + Math.floor(Math.random() * 900 + 100); // 清风_257
    else if (dr < 0.24)
        nick += pick(['~', '.', '·', '-']) + Math.floor(Math.random() * 9 + 1); // 清风~3
    return nick;
}
/** 旧版模板昵称(2字前缀+2字后缀)检测 */
function isLegacyNick(nick) {
    if (nick.length !== 4)
        return false;
    return LEGACY_PREFIX.includes(nick.slice(0, 2)) && LEGACY_SUFFIX.includes(nick.slice(2));
}
/** 生成一个与 used 不重复的昵称 */
function genUniqueNickname(used) {
    for (let i = 0; i < 300; i++) {
        const n = genNickname();
        if (!used.has(n))
            return n;
    }
    return genNickname() + Math.floor(Math.random() * 10000);
}
function readMeta() {
    try {
        if (fs.existsSync(META_FILE)) {
            return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
        }
    }
    catch { /* ignore */ }
    return { lastDaily: '' };
}
function writeMeta(m) {
    try {
        fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
        fs.writeFileSync(META_FILE, JSON.stringify(m), 'utf-8');
    }
    catch (e) {
        console.error('[BOT] meta 保存失败', e);
    }
}
/** 补齐到目标数量(幂等),返回所有机器人用户 */
function ensureBots() {
    let bots = (0, db_1.listBots)();
    const used = new Set(bots.map(b => b.nickname));
    for (let i = bots.length; i < TARGET_BOTS; i++) {
        const nick = genUniqueNickname(used);
        used.add(nick);
        const row = (0, db_1.createBotUser)(nick);
        bots.push(row);
    }
    return bots.map(b => ({ uid: `u${b.id}`, nickname: b.nickname }));
}
/** 将旧版模板昵称(前缀+后缀,如「陈留先锋」)迁移为拟真昵称(幂等) */
function migrateLegacyBots() {
    const bots = (0, db_1.listBots)();
    const used = new Set(bots.map(b => b.nickname));
    for (const b of bots) {
        if (!isLegacyNick(b.nickname))
            continue;
        const fresh = genUniqueNickname(used);
        (0, db_1.updateUserNickname)(b.id, fresh);
        used.delete(b.nickname);
        used.add(fresh);
        console.log(`[BOT] 昵称迁移: ${b.nickname} → ${fresh}`);
    }
}
/** 每日新增 2~3 个模拟玩家(日期变更才执行) */
function dailyAddBots() {
    const meta = readMeta();
    const today = beijingDate();
    if (meta.lastDaily === today)
        return;
    const count = DAILY_ADD[0] + Math.floor(Math.random() * (DAILY_ADD[1] - DAILY_ADD[0] + 1));
    const used = new Set((0, db_1.listBots)().map(b => b.nickname));
    for (let i = 0; i < count; i++) {
        const nick = genUniqueNickname(used);
        used.add(nick);
        (0, db_1.createBotUser)(nick);
    }
    writeMeta({ lastDaily: today });
    console.log(`[BOT] 每日新增 ${count} 个模拟玩家 · 当前共 ${(0, db_1.listBots)().length} 个`);
}
const bots = [];
function emitAck(socket, evt, payload) {
    return new Promise(resolve => {
        try {
            socket.emit(evt, payload, (ok, data) => resolve({ ok, data }));
        }
        catch {
            resolve({ ok: false, data: null });
        }
    });
}
/** 模拟真人思考延迟(ms): 出牌/防御/急救节奏不同(参考单机 AI 的「决策-延迟-再决策」结构,放缓以拟真) */
function thinkDelay(kind) {
    if (kind === 'action')
        return 1500 + Math.random() * 1500; // 出牌思考 1.5~3s
    if (kind === 'defend')
        return 1000 + Math.random() * 1200; // 防御思考 1~2.2s
    return 800 + Math.random() * 800; // 急救稍快 0.8~1.6s
}
/** 延迟执行一次决策(防抖: 同一时刻只保留最新一个决策,避免 roomState 连推叠加出牌) */
function scheduleThink(bot, fn, ms) {
    if (bot.thinkTimer)
        clearTimeout(bot.thinkTimer);
    bot.thinkTimer = setTimeout(() => {
        bot.thinkTimer = null;
        if (bot.socket && !bot.socket.disconnected)
            fn();
    }, ms);
    bot.thinkTimer.unref?.();
}
function schedule(bot, fn, ms) {
    if (!bot.socket)
        return;
    const t = setTimeout(fn, ms);
    t.unref?.();
}
/** 进入大厅闲逛: 刷新桌列表,挑桌坐下 */
function lobbyLoop(bot) {
    const s = bot.socket;
    if (!s || bot.state === 'sleep')
        return;
    if (bot.state !== 'idle')
        return;
    (async () => {
        const { ok, data } = await emitAck(s, 'getTableList', {});
        if (!ok || !Array.isArray(data))
            return;
        const tables = data;
        const free = tables.filter(t => !t.started);
        // 入座优先级(让真人随时有对手可约 + 保留机器人互对供旁观):
        // 1) 桌上已有 1 个真人(陪真人打)
        // 2) 保底互打: 当前没有任何机器人互对局时,先开一桌供旁观(botWait 伙伴 > 自己占空桌等伙伴)
        // 3) 空桌独占等真人(限量 SOLO_WAIT_CAP)
        // 4) 桌上已有 1 个机器人(机器互打,限量 MAX_BOT_VS_BOT)
        const humanWait = free.filter(t => {
            const a = seatTaken(t.p1), b = seatTaken(t.p2);
            return a !== b && !seatIsBot(a ? t.p1 : t.p2);
        });
        const empty = free.filter(t => !seatTaken(t.p1) && !seatTaken(t.p2));
        const botWait = free.filter(t => {
            const a = seatTaken(t.p1), b = seatTaken(t.p2);
            return a !== b && seatIsBot(a ? t.p1 : t.p2);
        });
        const soloWait = free.filter(t => {
            const a = seatTaken(t.p1), b = seatTaken(t.p2);
            return a !== b && seatIsBot(a ? t.p1 : t.p2);
        }).length;
        const bvc = botVsBotCount(tables);
        // 当前活跃机器人总数(非休眠),用于保底互打判断
        const activeCount = bots.filter(b => b.state !== 'sleep').length;
        let target = null;
        let slot = 'p1';
        if (humanWait.length > 0) {
            target = humanWait[0];
            slot = !seatTaken(target.p1) ? 'p1' : 'p2';
        }
        else if (bvc === 0 && botWait.length > 0) {
            // 保底: 当前无机器人互对局,加入已在等伙伴的机器人桌,启动互打供旁观
            target = botWait[0];
            slot = !seatTaken(target.p1) ? 'p1' : 'p2';
        }
        else if (bvc === 0 && empty.length > 0 && activeCount >= 2) {
            // 保底: 自己占空桌等伙伴(活跃机器人 >= 2 时开新保底桌,供旁观)
            target = empty[Math.floor(Math.random() * empty.length)];
            slot = 'p1';
        }
        else if (empty.length > 0 && soloWait < SOLO_WAIT_CAP) {
            target = empty[Math.floor(Math.random() * empty.length)];
            slot = 'p1';
        }
        else if (botWait.length > 0 && bvc < MAX_BOT_VS_BOT) {
            target = botWait[0];
            slot = !seatTaken(target.p1) ? 'p1' : 'p2';
        }
        if (!target) {
            // 全满/全开局: 大厅闲逛等待
            bot.lobbyTimer = setTimeout(() => lobbyLoop(bot), 10000 + Math.random() * 10000);
            return;
        }
        // 避免立刻重复入座刚站起的桌
        if (target.id === bot.lastTableId && empty.length > 0) {
            target = empty[Math.floor(Math.random() * empty.length)];
            slot = 'p1';
        }
        // 错峰入座(模拟真人节奏,避免机器人同时抢座)
        await new Promise(r => setTimeout(r, 500 + Math.random() * 3500));
        if (!bot.socket || bot.state !== 'idle')
            return;
        const sit = await emitAck(s, 'sitDown', { tableId: target.id, slot, name: bot.nickname });
        if (!sit.ok) {
            bot.lobbyTimer = setTimeout(() => lobbyLoop(bot), 8000 + Math.random() * 7000);
            return;
        }
        bot.state = 'sitting';
        bot.lastTableId = target.id;
        // 坐下后准备(模拟真人节奏)
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1500));
        await emitAck(s, 'ready', {});
        // 等开局(最多 90s),超时换桌
        setTimeout(() => {
            if (bot.state === 'sitting') {
                emitAck(s, 'standUp', {}).then(() => {
                    bot.state = 'idle';
                    bot.lobbyTimer = setTimeout(() => lobbyLoop(bot), 4000 + Math.random() * 5000);
                });
            }
        }, 90000).unref?.();
    })();
}
function seatTaken(seat) {
    return !!(seat && seat.name !== null);
}
/** 座位上的名字是否某个机器人的昵称(用于区分真人/机器人) */
function seatIsBot(seat) {
    if (!seat || !seat.name)
        return false;
    return bots.some(b => b.nickname === seat.name);
}
/** 当前机器人互相对局数 */
function botVsBotCount(tables) {
    return tables.filter(t => t.started && seatIsBot(t.p1) && seatIsBot(t.p2)).length;
}
// ============ 对局 AI ============
/** 出牌并附带失败兜底: 服务端拒绝(如气不足/时机不对)时不会广播新状态,机器人必须自己兜底推进,否则死锁 */
function tryPlay(bot, uid, fallback) {
    if (!bot.socket || bot.socket.disconnected)
        return;
    emitAck(bot.socket, 'playCard', { cardUid: uid }).then(r => {
        if (!r.ok)
            fallback();
    });
}
/** 结束行动(行动阶段兜底) */
function tryEndAction(bot) {
    if (!bot.socket || bot.socket.disconnected)
        return;
    emitAck(bot.socket, 'readyNextTurn', {});
}
function botEmergency(bot, room) {
    const hand = room.you?.handCards || [];
    const heal = hand.find((c) => c.category === 'function_hp');
    if (heal)
        tryPlay(bot, heal.uid, () => emitAck(bot.socket, 'giveUpEmergencyHeal', {}));
    else
        emitAck(bot.socket, 'giveUpEmergencyHeal', {});
}
function botDefend(bot, room) {
    const hand = room.you?.handCards || [];
    // 八卦阵反弹(非绝杀时)
    const bagua = hand.find((c) => c.category === 'formation' && c.id.startsWith('bagua'));
    if (bagua && bot.lastAttackPower > 0) {
        tryPlay(bot, bagua.uid, () => emitAck(bot.socket, 'confirmDefend', {}));
        return;
    }
    // 出一个防具(最高防御),下个 roomState 若仍需防御则继续出或确认
    const armors = hand
        .filter((c) => c.category === 'armor')
        .sort((a, b) => b.value - a.value);
    if (armors.length > 0) {
        tryPlay(bot, armors[0].uid, () => emitAck(bot.socket, 'confirmDefend', {}));
        return;
    }
    emitAck(bot.socket, 'confirmDefend', {});
}
function botAction(bot, room) {
    const hand = room.you?.handCards || [];
    const qi = room.you?.qi ?? 0;
    const hp = room.you?.hp ?? 8;
    const oppHp = room.opponent?.hp ?? 8;
    const myPid = room.yourPid;
    const fallback = () => tryEndAction(bot);
    // 0. 残血/缺血有锦囊 → 用锦囊(随机);失败兜底结束行动
    const pouchOpts = (room.you?.pouches || []).flatMap((p) => (p.options || []).map((o) => ({ sid: p.strategistId, pouch: o.pouch })));
    if (pouchOpts.length > 0) {
        const po = pouchOpts[0];
        emitAck(bot.socket, 'usePouch', { strategistId: po.sid, pouch: po.pouch, choice: '' }).then(r => {
            if (!r.ok)
                fallback();
        });
        return;
    }
    // 1. 绝杀: 对手低血
    const ult = hand.find((c) => c.category === 'ultimate');
    if (ult && oppHp <= 3) {
        tryPlay(bot, ult.uid, fallback);
        return;
    }
    // 2. 残血补血
    if (hp <= 2) {
        const heal = hand.find((c) => c.category === 'function_hp');
        if (heal) {
            tryPlay(bot, heal.uid, fallback);
            return;
        }
    }
    // 3. 气少补气
    if (qi < 3) {
        const q = hand.find((c) => c.category === 'function_qi');
        if (q) {
            tryPlay(bot, q.uid, fallback);
            return;
        }
    }
    // 4. 武将攻击(能负担的最高攻)
    const generals = hand
        .filter((c) => c.category === 'general')
        .sort((a, b) => b.value - a.value);
    const general = generals.find((g) => qi >= (g.cost || 0));
    if (general) {
        tryPlay(bot, general.uid, fallback);
        return;
    }
    // 5. 智者牌(白嫖锦囊)
    const strategist = hand.find((c) => c.category === 'strategist');
    if (strategist) {
        tryPlay(bot, strategist.uid, fallback);
        return;
    }
    // 6. 兵法/阵法
    const aux = hand.find((c) => c.category === 'strategy' || c.category === 'formation' || c.category === 'charm');
    if (aux) {
        tryPlay(bot, aux.uid, fallback);
        return;
    }
    // 7. 补气按钮(需满足轮次才尝试;失败兜底结束行动)
    if (room.roundCount >= 4 && !room.you?.usedNormalQi) {
        emitAck(bot.socket, 'useBonus', { type: 'normal' }).then(r => { if (!r.ok)
            fallback(); });
        return;
    }
    if (room.roundCount >= 7 && !room.you?.usedBigQi) {
        emitAck(bot.socket, 'useBonus', { type: 'big' }).then(r => { if (!r.ok)
            fallback(); });
        return;
    }
    // 8. 结束行动
    tryEndAction(bot);
    void myPid;
}
/** 机器人离桌回大厅(重置连续对局批次,下次对局重新随机 2~8 局) */
function botLeaveToLobby(bot) {
    bot.state = 'idle';
    bot.gameOverHandled = false;
    bot.sessionTarget = 0;
    bot.sessionGames = 0;
    bot.rematchPending = false;
    lobbyLoop(bot);
}
/** 机器人请求「再来一局」(防重复;失败按原因处理: 时机未到→延迟重试, 对方离开→离桌) */
function botRequestRematch(bot) {
    if (!bot.socket || bot.socket.disconnected)
        return;
    if (bot.rematchPending)
        return; // 已有请求在途
    bot.rematchPending = true;
    emitAck(bot.socket, 'resetRoom', {}).then((r) => {
        if (!bot.socket || bot.socket.disconnected)
            return;
        if (r.ok && r.data?.waiting) {
            // 等待对方确认 → 30 秒未确认 → 离桌回大厅
            bot.rematchTimer = setTimeout(() => {
                bot.rematchTimer = null;
                bot.rematchPending = false;
                emitAck(bot.socket, 'standUp', {}).then(() => botLeaveToLobby(bot));
            }, 30000).unref?.();
        }
        else if (r.ok) {
            bot.gameOverHandled = false; // 双方确认 → 已重开
            bot.rematchPending = false;
        }
        else {
            const err = r.data?.error || '';
            bot.rematchPending = false;
            if (/对局未结束/.test(err)) {
                // 时机未到(对方刚重开/状态未就绪) → 延迟重试,不立即退出
                bot.rematchTimer = setTimeout(() => botRequestRematch(bot), 3000).unref?.();
            }
            else {
                // 对方已离开等 → 离桌回大厅
                emitAck(bot.socket, 'standUp', {}).then(() => botLeaveToLobby(bot));
            }
        }
    });
}
/** 连接机器人 socket 并挂载 AI 监听 */
function connectBot(bot, serverUrl) {
    const token = (0, authService_1.createBotToken)(bot.uid);
    const socket = (0, socket_io_client_1.io)(serverUrl, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
    });
    bot.socket = socket;
    bot.state = 'idle';
    bot.lastAttackPower = 0;
    bot.gameOverHandled = false;
    bot.thinkTimer = null;
    bot.lastGameOver = false;
    bot.sessionTarget = 0;
    bot.sessionGames = 0;
    bot.rematchPending = false;
    socket.on('connect', () => {
        if (socket.id) {
            activeBotSocketIds.add(socket.id);
            bot.connId = socket.id;
        }
        console.log(`[BOT] ${bot.nickname} 上线 (${socket.id}) · 活跃 ${activeBotSocketIds.size}/${currentMaxActive()}`);
        // 按机器人索引错峰进入大厅(2.5s/人 + 随机),避免并发决策时互相看不到已入座的机器人,
        // 从而稳定触发「保底互打」: 先来的占空桌等伙伴,后来的看到后 join 同一桌。
        const idx = bots.indexOf(bot);
        const stagger = (idx < 0 ? 0 : idx) * 2500 + Math.random() * 1500;
        setTimeout(() => lobbyLoop(bot), stagger).unref?.();
    });
    socket.on('connect_error', (err) => {
        console.log(`[BOT] ${bot.nickname} 连接失败: ${err.message}`);
    });
    socket.on('roomState', (room) => {
        bot.lastGameOver = !!room?.gameOver;
        if (!room || room.gameOver)
            return;
        bot.myPid = room.yourPid ?? null;
        if (room.started)
            bot.state = 'playing';
        if (room.emergencyHealPid === room.yourPid) {
            scheduleThink(bot, () => botEmergency(bot, room), thinkDelay('emg'));
            return;
        }
        if (room.ultimateSavePid === room.yourPid) {
            // 被绝杀击杀且有急锦囊: 自动使用急锦囊自救(50% 绝疗丹)
            scheduleThink(bot, () => emitAck(bot.socket, 'useUltimatePouch', {}), thinkDelay('emg'));
            return;
        }
        if (room.defensePid === room.yourPid) {
            scheduleThink(bot, () => botDefend(bot, room), thinkDelay('defend'));
            return;
        }
        if (room.turnPhase === 'action' && room.activePid === room.yourPid && room.actionEnded && !room.actionEnded[room.yourPid]) {
            scheduleThink(bot, () => botAction(bot, room), thinkDelay('action'));
        }
    });
    socket.on('eventPlayCard', (d) => {
        if (d && typeof d.attackPower === 'number')
            bot.lastAttackPower = d.attackPower;
    });
    socket.on('eventGameStart', () => {
        bot.state = 'playing';
        bot.lastAttackPower = 0;
        if (bot.rematchTimer) {
            clearTimeout(bot.rematchTimer);
            bot.rematchTimer = null;
        }
    });
    socket.on('eventGameOver', () => {
        if (bot.gameOverHandled)
            return;
        bot.gameOverHandled = true;
        // 每日对局计数(跨日重置)
        const today = beijingDate();
        if (bot.dayKey !== today) {
            bot.dayKey = today;
            bot.gamesToday = 0;
        }
        bot.gamesToday += 1;
        // 连续对局计数: 本批目标未定则随机 2~8 局(模拟真人连打几局再休息)
        bot.sessionGames += 1;
        if (bot.sessionTarget === 0) {
            bot.sessionTarget = 2 + Math.floor(Math.random() * 7); // 2~8
            console.log(`[BOT] ${bot.nickname} 本批目标连续 ${bot.sessionTarget} 局`);
        }
        // 当日对局达到上限 → 先离桌,再休眠(对局刚结束时 state 仍是 playing,sleepBot 拒绝 playing,必须先 standUp)
        if (bot.gamesToday >= DAILY_GAME_CAP) {
            console.log(`[BOT] ${bot.nickname} 今日对局已达 ${DAILY_GAME_CAP} 局上限,今日不再激活`);
            emitAck(socket, 'standUp', {}).then(() => {
                bot.state = 'idle';
                sleepBot(bot);
            });
            return;
        }
        // 本批目标达成 → 离桌休息(换桌/等轮换),下次对局重新随机 2~8 局
        if (bot.sessionGames >= bot.sessionTarget) {
            console.log(`[BOT] ${bot.nickname} 本批 ${bot.sessionGames} 局达成 · 离桌休息`);
            emitAck(socket, 'standUp', {}).then(() => {
                botLeaveToLobby(bot);
            });
            return;
        }
        // 未达目标 → 请求「再来一局」(防重复;失败按原因重试或离桌)
        bot.rematchPending = false;
        bot.rematchTimer = setTimeout(() => {
            bot.rematchTimer = null;
            botRequestRematch(bot);
        }, 6000);
    });
    // 真人请求「再来一局」→ 机器人确认(双方都确认后服务端重开)
    socket.on('eventRematchRequest', () => {
        if (bot.state === 'playing' && bot.lastGameOver) {
            if (bot.rematchTimer) {
                clearTimeout(bot.rematchTimer);
                bot.rematchTimer = null;
            }
            botRequestRematch(bot);
        }
    });
    // 对局终止(真人强退/离线超时): 模拟玩家留在桌,重置为未准备,重新准备等真人
    socket.on('eventGameAborted', () => {
        if (bot.state !== 'playing')
            return;
        bot.state = 'sitting';
        bot.gameOverHandled = false;
        bot.lastGameOver = false;
        bot.sessionTarget = 0; // 对局被终止 → 视为新一批
        bot.sessionGames = 0;
        if (bot.rematchTimer) {
            clearTimeout(bot.rematchTimer);
            bot.rematchTimer = null;
        }
        // 重新准备(真人入座后双方准备即开局);90 秒等不到真人 → 换桌
        emitAck(socket, 'ready', {}).then(() => {
            bot.rematchTimer = setTimeout(() => {
                bot.rematchTimer = null;
                emitAck(socket, 'standUp', {}).then(() => {
                    botLeaveToLobby(bot);
                });
            }, 90000).unref?.();
        });
    });
    socket.on('eventPlayerLeave', (d) => {
        if (bot.state !== 'playing' || !d || typeof d.slot !== 'string' || bot.myPid === null)
            return;
        const oppSlot = bot.myPid === 0 ? 'p2' : 'p1';
        if (d.slot !== oppSlot)
            return;
        if (bot.lastGameOver) {
            // 对局结束后对手离开 → 等不来「再来一局」,离桌回大厅
            if (bot.rematchTimer) {
                clearTimeout(bot.rematchTimer);
                bot.rematchTimer = null;
            }
            emitAck(socket, 'standUp', {}).then(() => {
                botLeaveToLobby(bot);
            });
        }
        // 对局进行中对手断线 → 留在桌等真人回来(服务端保留对局与座位,90s 未回按强退终止)
    });
    socket.on('disconnect', (reason) => {
        if (bot.connId)
            activeBotSocketIds.delete(bot.connId);
        bot.connId = null;
        bot.socket = null;
        bot.state = 'sleep';
        if (bot.lobbyTimer)
            clearTimeout(bot.lobbyTimer);
        if (bot.thinkTimer)
            clearTimeout(bot.thinkTimer);
        bot.thinkTimer = null;
        if (bot.rematchTimer)
            clearTimeout(bot.rematchTimer);
        bot.rematchTimer = null;
        bot.rematchPending = false;
        console.log(`[BOT] ${bot.nickname} 离线 · 原因=${reason}`);
    });
}
/** 唤醒一个沉睡机器人 */
function wakeBot(bot, serverUrl) {
    if (bot.state !== 'sleep' || !bot.socket) {
        if (!bot.socket)
            connectBot(bot, serverUrl);
        return;
    }
    connectBot(bot, serverUrl);
}
/** 休眠一个机器人(仅非对局中) */
function sleepBot(bot) {
    if (bot.state === 'sleep' || bot.state === 'playing')
        return false;
    if (bot.lobbyTimer)
        clearTimeout(bot.lobbyTimer);
    if (bot.thinkTimer)
        clearTimeout(bot.thinkTimer);
    bot.thinkTimer = null;
    if (bot.rematchTimer)
        clearTimeout(bot.rematchTimer);
    bot.rematchTimer = null;
    bot.rematchPending = false;
    try {
        bot.socket?.disconnect();
    }
    catch { /* ignore */ }
    bot.state = 'sleep';
    return true;
}
/** 轮换: 按当前时段目标活跃数(黄金多/夜间0)调整,并遵守每日对局上限 */
async function rotateActive(serverUrl) {
    const today = beijingDate();
    const target = currentMaxActive();
    const activeNow = () => bots.filter(b => b.state !== 'sleep').length;
    // 超限 → 休眠空闲的(idle/sitting 且非对局)
    while (activeNow() > target) {
        const idle = bots.find(b => b.state !== 'sleep' && b.state !== 'playing');
        if (!idle)
            break;
        sleepBot(idle);
    }
    // 未满 → 唤醒沉睡的(跳过当日达上限的)
    while (activeNow() < target) {
        const sleeping = bots.find(b => {
            if (b.state !== 'sleep')
                return false;
            if (b.dayKey === today && b.gamesToday >= DAILY_GAME_CAP)
                return false;
            return true;
        });
        if (!sleeping)
            break;
        wakeBot(sleeping, serverUrl);
    }
    // 数量刚好 → 主动轮换「独占空桌等真人」的机器人,让新面孔出现(模拟真人进出大厅)
    if (activeNow() === target && target > 0) {
        const sleepers = bots.filter(b => b.state === 'sleep' && !(b.dayKey === today && b.gamesToday >= DAILY_GAME_CAP));
        if (sleepers.length === 0)
            return;
        // 用任意活跃机器人 socket 查桌列表,识别「独占等真人」的机器人(避免误伤陪真人的)
        const probe = bots.find(b => b.state !== 'sleep' && b.socket && !b.socket.disconnected);
        if (!probe)
            return;
        const { ok, data } = await emitAck(probe.socket, 'getTableList', {});
        if (!ok || !Array.isArray(data))
            return;
        const tables = data;
        const soloWaiters = bots.filter(b => {
            if (b.state !== 'sitting' || !b.socket)
                return false;
            const t = tables.find(x => {
                const a = x.p1, c = x.p2;
                return (a && a.name === b.nickname) || (c && c.name === b.nickname);
            });
            if (!t)
                return false;
            const me = t.p1 && t.p1.name === b.nickname ? t.p1 : t.p2;
            const other = me === t.p1 ? t.p2 : t.p1;
            return !!other && !other.name; // 对面无人 → 独占等真人
        });
        if (soloWaiters.length === 0)
            return;
        const n = Math.min(2, soloWaiters.length, sleepers.length);
        for (let i = 0; i < n; i++) {
            const leave = soloWaiters[i];
            if (sleepBot(leave)) {
                const enter = sleepers[Math.floor(Math.random() * sleepers.length)];
                wakeBot(enter, serverUrl);
                sleepers.splice(sleepers.indexOf(enter), 1);
            }
        }
        console.log(`[BOT] 轮换 ${n} 个活跃机器人(新面孔入厅)`);
    }
}
/** 事件循环停滞检测(诊断用) */
function startLoopWatchdog() {
    let last = Date.now();
    const t = setInterval(() => {
        const now = Date.now();
        const gap = now - last;
        if (gap > 5000) {
            console.log(`[BOT] ⚠ 事件循环停滞 ${(gap / 1000).toFixed(1)}s (从 ${new Date(last).toISOString()} 到 ${new Date(now).toISOString()})`);
        }
        last = now;
    }, 1000);
    t.unref?.();
}
// ============================================================
// 对外接口
// ============================================================
/** 初始化模拟玩家系统: 预建 + 每日新增 + 唤醒第一批 + 轮换定时器 */
/** 服务端 URL(唤醒沉睡机器人时用) */
let botServerUrl = '';
function initBotSystem(serverUrl) {
    botServerUrl = serverUrl;
    startLoopWatchdog();
    ensureBots();
    migrateLegacyBots(); // 旧模板昵称迁移为拟真昵称(幂等,仅在首次升级时改名)
    dailyAddBots();
    const refreshed = (0, db_1.listBots)().map(b => ({ uid: `u${b.id}`, nickname: b.nickname }));
    // 用刷新后的完整列表建实例(兼容已有实例)
    bots.length = 0;
    for (const u of refreshed) {
        bots.push({
            uid: u.uid,
            nickname: u.nickname,
            socket: null,
            connId: null,
            state: 'sleep',
            myPid: null,
            lastAttackPower: 0,
            lobbyTimer: null,
            thinkTimer: null,
            rematchTimer: null,
            lastGameOver: false,
            gameOverHandled: false,
            gamesToday: 0,
            dayKey: beijingDate(),
            lastTableId: null,
            sessionTarget: 0,
            sessionGames: 0,
            rematchPending: false,
        });
    }
    console.log(`[BOT] 模拟玩家系统启动 · 共 ${bots.length} 个(当前时段目标活跃 ${currentMaxActive()})`);
    // 唤醒第一批(遵守当前时段上限与每日对局上限)
    const today = beijingDate();
    for (const b of bots) {
        if (bots.filter(x => x.state !== 'sleep').length >= currentMaxActive())
            break;
        if (b.dayKey === today && b.gamesToday >= DAILY_GAME_CAP)
            continue;
        wakeBot(b, serverUrl);
    }
    // 周期轮换(休眠空闲 / 唤醒沉睡)
    const t = setInterval(() => rotateActive(serverUrl), ROTATE_MS);
    t.unref?.();
}
/** 关闭所有机器人(服务退出时调用) */
function shutdownBots() {
    for (const b of bots) {
        if (b.lobbyTimer)
            clearTimeout(b.lobbyTimer);
        try {
            b.socket?.disconnect();
        }
        catch { /* ignore */ }
        b.socket = null;
        b.state = 'sleep';
    }
    activeBotSocketIds.clear();
}
/** 当前活跃机器人 socket id 集合 */
function getBotSocketIds() {
    return activeBotSocketIds;
}
/** 判断 socket id 是否机器人 */
function isBotSocketId(socketId) {
    return activeBotSocketIds.has(socketId);
}
/** 真人入座空桌: 调度机器人来陪(空闲机器人立即决策;无空闲则唤醒一个沉睡的) */
function ensureBotOpponent() {
    // 让所有空闲机器人立即检查大厅(优先「陪真人」)
    for (const b of bots) {
        if (b.state === 'idle' && b.socket && !b.socket.disconnected) {
            lobbyLoop(b);
        }
    }
    // 没有空闲机器人 → 唤醒一个沉睡的(未达当日 30 局上限)
    const idleNow = bots.filter(b => b.state === 'idle').length;
    if (idleNow === 0) {
        const today = beijingDate();
        const sleeper = bots.find(b => b.state === 'sleep' && !(b.dayKey === today && b.gamesToday >= DAILY_GAME_CAP));
        if (sleeper) {
            console.log(`[BOT] 真人入座 · 唤醒 ${sleeper.nickname} 来陪`);
            wakeBot(sleeper, botServerUrl);
        }
    }
}
/** 判断 uid 是否模拟玩家(供表格/监控用) */
function isBotUid(uid) {
    if (!uid)
        return false;
    return (0, db_1.isBotUser)(uid);
}
//# sourceMappingURL=botManager.js.map