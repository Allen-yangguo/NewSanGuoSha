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
exports.getDb = getDb;
exports.findUserByPhone = findUserByPhone;
exports.findUserByUsername = findUserByUsername;
exports.findUserByAccount = findUserByAccount;
exports.findUserById = findUserById;
exports.createUser = createUser;
exports.createBotUser = createBotUser;
exports.listBots = listBots;
exports.isBotUser = isBotUser;
exports.updateUserNickname = updateUserNickname;
exports.updateUserPassword = updateUserPassword;
exports.listUsers = listUsers;
exports.updateUserPasswordById = updateUserPasswordById;
exports.deleteUser = deleteUser;
exports.touchGuest = touchGuest;
exports.insertSmsCode = insertSmsCode;
exports.findLatestSmsCode = findLatestSmsCode;
exports.markSmsCodeConsumed = markSmsCodeConsumed;
exports.getRecord = getRecord;
exports.updateRecord = updateRecord;
exports.localDateStr = localDateStr;
exports.getLeaderboard = getLeaderboard;
/**
 * 用户管理 · JSON 文件数据访问层（纯 JS，无原生模块依赖）
 * 单文件 data/users.json，首次启动自动创建
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'users.json');
let _data = null;
function loadData() {
    if (_data)
        return _data;
    if (!fs.existsSync(DB_DIR))
        fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        const fresh = { users: [], sms_codes: [], guests: [], records: {}, nextId: { users: 1, sms_codes: 1 } };
        _data = fresh;
        saveData();
        return _data;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
        if (!parsed.users)
            parsed.users = [];
        if (!parsed.sms_codes)
            parsed.sms_codes = [];
        if (!parsed.guests)
            parsed.guests = [];
        if (!parsed.nextId)
            parsed.nextId = { users: 1, sms_codes: 1 };
        if (!parsed.records)
            parsed.records = {};
        // 兼容旧数据：为缺少 nickname/username 的用户补默认值
        for (const u of parsed.users) {
            if (!u.nickname)
                u.nickname = `玩家${u.id}`;
            if (u.username === undefined)
                u.username = '';
        }
    }
    catch {
        parsed = { users: [], sms_codes: [], guests: [], records: {}, nextId: { users: 1, sms_codes: 1 } };
    }
    _data = parsed;
    return _data;
}
function saveData() {
    if (!_data)
        return;
    fs.writeFileSync(DB_PATH, JSON.stringify(_data, null, 2), 'utf-8');
}
/** 初始化（兼容旧 getDb 调用，确保数据文件存在） */
function getDb() {
    loadData();
    return { ok: true };
}
// ===== 用户表 =====
function findUserByPhone(phone) {
    return loadData().users.find(u => u.phone === phone);
}
function findUserByUsername(username) {
    return loadData().users.find(u => u.username === username);
}
/** 按账号查找(手机号或用户名,用于登录) */
function findUserByAccount(account) {
    return loadData().users.find(u => u.phone === account || u.username === account);
}
function findUserById(id) {
    return loadData().users.find(u => u.id === id);
}
function createUser(phone, passwordHash, nickname, username = '') {
    const data = loadData();
    const now = new Date().toISOString();
    const row = {
        id: data.nextId.users++,
        phone,
        username,
        password_hash: passwordHash,
        nickname: nickname || `玩家${data.nextId.users}`,
        created_at: now,
        updated_at: now,
    };
    data.users.push(row);
    saveData();
    return row;
}
// ===== 模拟玩家（机器人）=====
/** 创建模拟玩家（昵称由调用方生成；永不用于真实登录） */
function createBotUser(nickname) {
    const data = loadData();
    const now = new Date().toISOString();
    const row = {
        id: data.nextId.users++,
        phone: '',
        username: `bot_${Date.now()}_${data.nextId.users}`,
        password_hash: '$2b$10$botbotbotbotbotbotbotbotbotbotbotbotbotb', // 不可登录
        nickname,
        created_at: now,
        updated_at: now,
        isBot: true,
    };
    data.users.push(row);
    saveData();
    return row;
}
/** 所有模拟玩家 */
function listBots() {
    return loadData().users.filter(u => u.isBot);
}
/** 判断某用户是否为模拟玩家 */
function isBotUser(uid) {
    if (!uid.startsWith('u'))
        return false;
    const id = Number(uid.slice(1));
    const u = loadData().users.find(x => x.id === id);
    return !!u?.isBot;
}
function updateUserNickname(id, nickname) {
    const data = loadData();
    const user = data.users.find(u => u.id === id);
    if (user) {
        user.nickname = nickname;
        user.updated_at = new Date().toISOString();
        saveData();
    }
}
function updateUserPassword(phone, passwordHash) {
    const data = loadData();
    const user = data.users.find(u => u.phone === phone);
    if (user) {
        user.password_hash = passwordHash;
        user.updated_at = new Date().toISOString();
        saveData();
    }
}
// ===== 用户管理（管理后台）=====
/** 用户列表/搜索: 关键词匹配 id / 手机号 / 用户名 / 昵称 */
function listUsers(keyword) {
    const data = loadData();
    const kw = (keyword || '').trim().toLowerCase();
    if (!kw)
        return [...data.users];
    return data.users.filter(u => String(u.id) === kw ||
        u.phone.toLowerCase().includes(kw) ||
        (u.username || '').toLowerCase().includes(kw) ||
        (u.nickname || '').toLowerCase().includes(kw));
}
/** 按 id 重置密码 */
function updateUserPasswordById(id, passwordHash) {
    const data = loadData();
    const user = data.users.find(u => u.id === id);
    if (!user)
        return false;
    user.password_hash = passwordHash;
    user.updated_at = new Date().toISOString();
    saveData();
    return true;
}
/** 删除用户(同时删除其战绩) */
function deleteUser(id) {
    const data = loadData();
    const idx = data.users.findIndex(u => u.id === id);
    if (idx < 0)
        return false;
    data.users.splice(idx, 1);
    delete data.records[`u${id}`];
    saveData();
    return true;
}
// ===== 游客表 =====
function touchGuest(guestId) {
    const data = loadData();
    const now = new Date().toISOString();
    const existing = data.guests.find(g => g.guest_id === guestId);
    if (existing) {
        existing.last_active = now;
    }
    else {
        data.guests.push({ guest_id: guestId, created_at: now, last_active: now });
    }
    saveData();
}
// ===== 短信验证码表 =====
function insertSmsCode(phone, code, purpose, expiresAt) {
    const data = loadData();
    const createdAt = new Date().toISOString();
    data.sms_codes.push({
        id: data.nextId.sms_codes++,
        phone, code, purpose, expires_at: expiresAt,
        consumed: false, created_at: createdAt,
    });
    saveData();
}
function findLatestSmsCode(phone, purpose) {
    const data = loadData();
    // 倒序找最新一条未消费的
    for (let i = data.sms_codes.length - 1; i >= 0; i--) {
        const row = data.sms_codes[i];
        if (row.phone === phone && row.purpose === purpose && !row.consumed) {
            return { id: row.id, code: row.code, expires_at: row.expires_at };
        }
    }
    return undefined;
}
function markSmsCodeConsumed(id) {
    const data = loadData();
    const row = data.sms_codes.find(s => s.id === id);
    if (row) {
        row.consumed = true;
        saveData();
    }
}
function emptyRecord(uid) {
    return {
        uid, totalGames: 0, wins: 0, losses: 0, draws: 0,
        totalScore: 0, firstBloods: 0, successfulAttacks: 0, ultimateKills: 0,
        todayGames: 0, todayKey: '',
    };
}
function getRecord(uid) {
    const data = loadData();
    if (!data.records[uid]) {
        data.records[uid] = emptyRecord(uid);
        saveData();
    }
    return data.records[uid];
}
function updateRecord(uid, patch) {
    const data = loadData();
    if (!data.records[uid])
        data.records[uid] = emptyRecord(uid);
    Object.assign(data.records[uid], patch);
    saveData();
}
// ===== 排行榜 =====
/** 北京时间日期 YYYY-MM-DD(固定 UTC+8,不随服务器时区变化;活跃榜按北京"今天"统计) */
function localDateStr(d = new Date()) {
    const bj = new Date(d.getTime() + 8 * 3600 * 1000);
    const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(bj.getUTCDate()).padStart(2, '0');
    return `${bj.getUTCFullYear()}-${m}-${day}`;
}
/**
 * 排行榜前十
 * @param type 'score' = 累计积分榜; 'active' = 今日活跃榜(当天对局数,跨日自动归零)
 * @param limit 数量(默认 10)
 */
function getLeaderboard(type, limit = 10) {
    const data = loadData();
    const today = localDateStr();
    const userByUid = new Map();
    for (const u of data.users)
        userByUid.set(`u${u.id}`, u);
    const rows = [];
    for (const r of Object.values(data.records)) {
        const user = userByUid.get(r.uid);
        if (!user)
            continue; // 记录对应用户已删除
        const todayGames = r.todayKey === today ? (r.todayGames || 0) : 0;
        rows.push({
            rank: 0,
            uid: r.uid,
            nickname: user.nickname,
            isBot: !!user.isBot,
            totalScore: r.totalScore || 0,
            totalGames: r.totalGames || 0,
            wins: r.wins || 0,
            todayGames,
        });
    }
    rows.sort((a, b) => type === 'score' ? b.totalScore - a.totalScore : b.todayGames - a.todayGames);
    return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}
//# sourceMappingURL=db.js.map