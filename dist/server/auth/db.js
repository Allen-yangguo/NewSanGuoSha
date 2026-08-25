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
exports.findUserById = findUserById;
exports.createUser = createUser;
exports.updateUserPassword = updateUserPassword;
exports.touchGuest = touchGuest;
exports.insertSmsCode = insertSmsCode;
exports.findLatestSmsCode = findLatestSmsCode;
exports.markSmsCodeConsumed = markSmsCodeConsumed;
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
        const fresh = { users: [], sms_codes: [], guests: [], nextId: { users: 1, sms_codes: 1 } };
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
    }
    catch {
        parsed = { users: [], sms_codes: [], guests: [], nextId: { users: 1, sms_codes: 1 } };
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
function findUserById(id) {
    return loadData().users.find(u => u.id === id);
}
function createUser(phone, passwordHash) {
    const data = loadData();
    const now = new Date().toISOString();
    const row = {
        id: data.nextId.users++,
        phone,
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
    };
    data.users.push(row);
    saveData();
    return row;
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
//# sourceMappingURL=db.js.map