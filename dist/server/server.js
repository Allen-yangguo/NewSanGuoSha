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
/**
 * 三国卡牌对战 · 联机服务端（Node.js + Express + Socket.IO）
 *
 * 架构：
 *  - 游戏业务逻辑 100% 在服务端执行（直接复用 assets/scripts/core 引擎）
 *  - 客户端仅提交操作指令、接收「区分视角」的状态推送
 *  - 手牌严格隔离：p1 永远收不到 p2.handCards，反之亦然
 *
 *  未来迁移云服务器：
 *  - 仅需改 listen(PORT, '0.0.0.0')、云厂商安全组/防火墙放行端口
 *  - 游戏逻辑、事件协议、前端代码完全不变
 */
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const express = require("express");
const cors = require("cors");
const socket_io_1 = require("socket.io");
// QRCode 已移除：公网部署通过域名访问，局域网通过服务端日志的 IP 访问
const GameEngine_1 = require("../assets/scripts/core/GameEngine");
const CardEffect_1 = require("../assets/scripts/core/CardEffect");
const types_1 = require("../assets/scripts/core/types");
const BattleState_1 = require("../assets/scripts/core/BattleState");
// ============================================================
// 配置
// ============================================================
const PORT = Number(process.env.PORT || 3000);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0'; // 局域网/公网均需 0.0.0.0
const ROOM_ID = 'sanguosha-room-001'; // 单房间模式：固定房间号
// ============================================================
// 工具：获取本机局域网 IPv4
// ============================================================
function getLanIp() {
    const ifaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(ifaces)) {
        const list = ifaces[name] || [];
        for (const net of list) {
            if (net.family === 'IPv4' && !net.internal) {
                // 优先 192.168.x.x（家庭路由器最常见）
                if (net.address.startsWith('192.168.'))
                    candidates.unshift(net.address);
                else
                    candidates.push(net.address);
            }
        }
    }
    return candidates[0] || '127.0.0.1';
}
const room = {
    engine: new GameEngine_1.GameEngine(),
    started: false,
    players: {
        p1: { socketId: null, pid: 0, name: '玩家1（先手方）' },
        p2: { socketId: null, pid: 1, name: '玩家2（后手方）' },
    },
    spectators: [],
};
function strategyToView(s) {
    return { type: s.type, layers: s.layers, remainingTurns: s.remainingTurns, sourceCardUid: s.sourceCardUid };
}
function buildPlayerView(slot, mePid) {
    const slotInfo = room.players[slot];
    const p = room.engine.state.players[slotInfo.pid];
    const isMe = slotInfo.pid === mePid;
    return {
        pid: slotInfo.pid,
        name: slotInfo.name,
        hp: p.hp,
        hpMax: BattleState_1.HP_MAX,
        qi: p.qi,
        handCount: p.hand.length,
        handCards: isMe
            ? p.hand.map(c => ({
                uid: c.uid,
                id: c.def.id,
                name: c.def.name,
                category: c.def.category,
                subtype: c.def.subtype,
                value: c.def.value,
                cost: c.def.cost,
                desc: c.def.desc,
            }))
            : [], // 对手手牌：绝对不泄露明细
        strategies: p.strategies.map(strategyToView),
        usedNormalQi: p.usedNormalQi,
        usedBigQi: p.usedBigQi,
    };
}
/**
 * 为某个 socket（玩家视角）生成过滤后的房间状态
 */
function buildRoomState(socketId) {
    // 找出这个 socket 在 p1 / p2 哪个槽
    let yourSlot = null;
    if (room.players.p1.socketId === socketId)
        yourSlot = 'p1';
    else if (room.players.p2.socketId === socketId)
        yourSlot = 'p2';
    const yourPid = yourSlot ? room.players[yourSlot].pid : null;
    const me = yourPid !== null ? buildPlayerView(yourSlot, yourPid) : null;
    // opponent 用另一个槽的 pid 构造（mePid 保持你自己，确保对手 handCards=[]）
    const oppSlot = yourSlot === 'p1' ? 'p2' : 'p1';
    const opponent = yourPid !== null ? buildPlayerView(oppSlot, yourPid) : null;
    const defensePid = room.engine.turn.isAwaitingDefense() && room.engine.pendingAttack
        ? room.engine.pendingAttack.defender
        : null;
    return {
        roomId: ROOM_ID,
        started: room.started,
        yourSlot,
        yourPid,
        roundCount: room.engine.state.roundCount,
        turnPhase: room.engine.turn.phase,
        activePid: room.engine.turn.activePlayer,
        defensePid,
        emergencyHealPid: room.engine.emergencyHealPending,
        firstPlayerPid: room.engine.state.firstPlayer,
        deckCount: room.engine.state.deck.length,
        discardCount: room.engine.state.discard.length,
        actionEnded: [...room.engine.state.actionEnded],
        you: me,
        opponent,
        gameOver: room.engine.state.gameOver,
        winner: room.engine.state.result?.winner ?? null,
        gameOverDetail: room.engine.state.result?.detail ?? null,
        logs: room.engine.logs.slice(-20),
    };
}
function findCardByUid(pid, uid) {
    return room.engine.state.players[pid].hand.find(c => c.uid === uid) || null;
}
function slotOfPid(pid) { return pid === 0 ? 'p1' : 'p2'; }
function socketOfPid(pid) {
    return room.players[slotOfPid(pid)].socketId;
}
// ============================================================
// 推送：给某个玩家推送自己视角的 roomState
// ============================================================
function pushRoomStateTo(io, socketId) {
    io.to(socketId).emit('roomState', buildRoomState(socketId));
}
/** 向 p1 / p2 各自推送自己视角的状态（最常用：状态变化后立刻调这个）*/
function broadcastRoomState(io) {
    for (const slot of ['p1', 'p2']) {
        const sid = room.players[slot].socketId;
        if (sid)
            pushRoomStateTo(io, sid);
    }
}
/** 向双方广播一个游戏事件（不含隐私数据）*/
function broadcastEvent(io, event, payload) {
    io.to(ROOM_ID).emit(event, payload);
}
/** 行动阶段：当前行动玩家无牌可出时自动结束行动 */
function tryAutoEndAction(io, room) {
    if (room.engine.state.gameOver)
        return;
    if (!room.engine.turn.isInActionPhase())
        return;
    const actor = room.engine.turn.activePlayer;
    if (room.engine.state.actionEnded[actor])
        return;
    if (room.engine.canPlayAnyCard(actor))
        return;
    // 无牌可出 → 自动结束行动
    const r = room.engine.endActionPhase();
    if (r.ok) {
        broadcastEvent(io, 'eventTurnEnd', { message: r.message });
        if (room.engine.state.gameOver) {
            broadcastEvent(io, 'eventGameOver', {
                winner: room.engine.state.result?.winner ?? null,
                reason: room.engine.state.result?.reason ?? null,
                detail: room.engine.state.result?.detail ?? null,
            });
        }
    }
}
// ============================================================
// Express & Socket.IO 初始化
// ============================================================
const app = express();
app.use(cors());
// 静态托管：基于 process.cwd() 解析 client/dist，兼容 ts-node 和编译后运行
// ts-node 运行 server/server.ts 时 cwd 是项目根
// node dist/server/server.js 运行时 cwd 是项目根
const clientDist = path.resolve(process.cwd(), 'client', 'dist');
app.use(express.static(clientDist));
// 健康检查 / 状态接口（公网部署无二维码，但保留状态接口给前端大厅用）
app.get('/__status', (_req, res) => {
    const p1 = room.players.p1.socketId ? '✅ 玩家1 已接入' : '⏳ 等待玩家1...';
    const p2 = room.players.p2.socketId ? '✅ 玩家2 已接入' : '⏳ 等待玩家2...';
    res.json({ status: `${p1} ｜ ${p2}`, started: room.started });
});
// SPA 兜底：所有未匹配路由都返回前端 index.html
app.use((_req, res, next) => {
    if (_req.path.startsWith('/socket.io/'))
        return next(); // 不拦截 socket.io
    if (_req.path === '/__status')
        return next();
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
        if (err) {
            res.status(500).type('html').send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h1>前端未构建</h1>
        <p>请先执行 <code>cd client && npm install && npm run build</code></p>
        <p>路径: ${clientDist}</p>
        </body></html>
      `);
        }
    });
});
const server = http.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: { origin: '*' },
});
// ============================================================
// Socket 事件处理
// ============================================================
io.on('connection', (socket) => {
    console.log(`[IO] 新连接：${socket.id}   IP=${socket.handshake.address}`);
    // ---------- joinRoom：客户端加入房间（分配 p1/p2 槽）----------
    socket.on('joinRoom', (payload = {}, ack) => {
        const cb = typeof ack === 'function' ? ack : () => { };
        // 如果这 socket 原本在某个槽（同 socketId 重连），先清掉旧的
        for (const s of ['p1', 'p2']) {
            if (room.players[s].socketId === socket.id)
                room.players[s].socketId = null;
        }
        // 优先尝试恢复到 preferSlot（客户端 localStorage 记录的槽位）
        let mySlot = null;
        if (payload?.preferSlot && !room.players[payload.preferSlot].socketId) {
            mySlot = payload.preferSlot;
        }
        // 否则找空槽：优先 p1，再 p2
        if (!mySlot) {
            if (!room.players.p1.socketId)
                mySlot = 'p1';
            else if (!room.players.p2.socketId)
                mySlot = 'p2';
        }
        if (!mySlot) {
            cb(false, { error: '房间已满（两位玩家已齐）' });
            return;
        }
        room.players[mySlot].socketId = socket.id;
        if (payload?.name)
            room.players[mySlot].name = payload.name;
        socket.join(ROOM_ID);
        console.log(`[IO] ${socket.id} 加入房间 -> ${mySlot} (pid=${room.players[mySlot].pid})${room.started ? ' · 重连' : ''}`);
        // 如果两个槽都满了且对局未开始 → 自动开局
        const bothReady = room.players.p1.socketId && room.players.p2.socketId;
        if (bothReady && !room.started) {
            room.engine = new GameEngine_1.GameEngine();
            room.engine.initGame();
            room.started = true;
            console.log(`[Game] 两位玩家到齐 · 对局开始 · 先手=玩家${room.engine.state.firstPlayer + 1}`);
            broadcastEvent(io, 'eventGameStart', {
                firstPlayerPid: room.engine.state.firstPlayer,
            });
        }
        else if (room.started) {
            // 重连场景：对局进行中，主动给重连的 socket 推送 eventGameStart
            // 避免客户端 state.started 没同步导致卡在大厅
            io.to(socket.id).emit('eventGameStart', {
                firstPlayerPid: room.engine.state.firstPlayer,
            });
            console.log(`[Game] ${mySlot} 重连 · 已补发 eventGameStart`);
        }
        cb(true, {
            slot: mySlot,
            pid: room.players[mySlot].pid,
            roomId: ROOM_ID,
            started: room.started,
        });
        broadcastRoomState(io);
    });
    // ---------- 通用：出牌 ----------
    // payload: { cardUid: string }
    socket.on('playCard', (payload, ack) => {
        const cb = typeof ack === 'function' ? ack : () => { };
        const pid = getPidBySocket(socket.id);
        if (pid === null)
            return cb(false, { error: '未加入房间' });
        if (!room.started)
            return cb(false, { error: '对局未开始' });
        const card = findCardByUid(pid, payload.cardUid);
        if (!card)
            return cb(false, { error: '手牌中找不到该卡（可能已打出）' });
        const before = { ...card.def }; // 广播用
        const r = (0, CardEffect_1.applyCardEffect)(room.engine, card, pid);
        if (!r.ok) {
            cb(false, { error: r.message });
            return;
        }
        // 广播「有玩家打出了某张牌」（双方可见）
        // 计算结算后攻击力（武将 → pendingAttack.damage，绝杀 → card.def.value）
        let attackPower;
        if (r.triggeredDamage && room.engine.pendingAttack) {
            attackPower = room.engine.pendingAttack.damage;
        }
        else if (r.triggeredUltimate) {
            attackPower = before.value;
        }
        broadcastEvent(io, 'eventPlayCard', {
            actorPid: pid,
            card: { id: before.id, name: before.name, category: before.category, value: before.value, cost: before.cost },
            result: {
                triggeredDamage: !!r.triggeredDamage,
                triggeredReflect: !!r.triggeredReflect,
                triggeredHeal: !!r.triggeredHeal,
                triggeredQi: !!r.triggeredQi,
                triggeredUltimate: !!r.triggeredUltimate,
            },
            attackPower,
        });
        if (r.triggeredDamage) {
            broadcastEvent(io, 'eventDamage', { message: r.message });
        }
        if (room.engine.state.gameOver) {
            broadcastEvent(io, 'eventGameOver', {
                winner: room.engine.state.result?.winner ?? null,
                reason: room.engine.state.result?.reason ?? null,
                detail: room.engine.state.result?.detail ?? null,
            });
        }
        cb(true, r);
        // 自动防御结算：
        // 1. 防具累计 >= 攻击伤害 → 自动通过
        // 2. 防御方手中没有防具牌也没有八卦阵 → 自动承受
        if (room.engine.turn.isAwaitingDefense()
            && !room.engine.baguaTriggered
            && room.engine.pendingAttack) {
            const atk = room.engine.pendingAttack;
            const defender = room.engine.state.players[atk.defender];
            const hasArmor = defender.hand.some((c) => c.def.category === types_1.CardCategory.Armor);
            const hasBagua = defender.hand.some((c) => c.def.category === types_1.CardCategory.Formation && c.def.subtype === types_1.FormationType.BaGua);
            const shouldAuto = room.engine.defensePool >= atk.damage || (!hasArmor && !hasBagua);
            if (shouldAuto) {
                const dr = room.engine.defenderPass();
                if (dr.ok) {
                    broadcastEvent(io, 'eventDamage', { message: dr.message });
                    if (room.engine.state.gameOver) {
                        broadcastEvent(io, 'eventGameOver', {
                            winner: room.engine.state.result?.winner ?? null,
                            reason: room.engine.state.result?.reason ?? null,
                            detail: room.engine.state.result?.detail ?? null,
                        });
                    }
                }
            }
        }
        // 行动阶段：无牌可出时自动结束行动
        tryAutoEndAction(io, room);
        broadcastRoomState(io);
    });
    // ---------- 使用补气按钮 ----------
    // payload: { type: 'normal' | 'big' | 'burst' }
    socket.on('useBonus', (payload, ack) => {
        const cb = typeof ack === 'function' ? ack : () => { };
        const pid = getPidBySocket(socket.id);
        if (pid === null)
            return cb(false, { error: '未加入房间' });
        if (!room.started)
            return cb(false, { error: '对局未开始' });
        let r;
        if (payload.type === 'normal')
            r = room.engine.useNormalQiButton(pid);
        else if (payload.type === 'big')
            r = room.engine.useBigQiButton(pid);
        else if (payload.type === 'burst')
            r = room.engine.useManualBurst(pid);
        else
            return cb(false, { error: '未知 bonus type' });
        if (!r.ok)
            return cb(false, { error: r.message });
        broadcastEvent(io, 'eventBuffChange', {
            actorPid: pid,
            type: payload.type,
            message: r.message,
        });
        cb(true, r);
        // 行动阶段：无牌可出时自动结束行动
        tryAutoEndAction(io, room);
        broadcastRoomState(io);
    });
    // ---------- 受击阶段：防御方确认（结束防御 / 放弃防御）----------
    socket.on('confirmDefend', (_payload, ack) => {
        const cb = typeof ack === 'function' ? ack : () => { };
        const pid = getPidBySocket(socket.id);
        if (pid === null)
            return cb(false, { error: '未加入房间' });
        if (!room.engine.turn.isAwaitingDefense())
            return cb(false, { error: '非受击防御阶段' });
        if (room.engine.pendingAttack?.defender !== pid)
            return cb(false, { error: '你不是当前防御方' });
        const r = room.engine.defenderPass();
        if (!r.ok)
            return cb(false, { error: r.message });
        broadcastEvent(io, 'eventDamage', { actorPid: pid, message: r.message });
        if (room.engine.state.gameOver) {
            broadcastEvent(io, 'eventGameOver', {
                winner: room.engine.state.result?.winner ?? null,
                reason: room.engine.state.result?.reason ?? null,
                detail: room.engine.state.result?.detail ?? null,
            });
        }
        cb(true, r);
        broadcastRoomState(io);
    });
    // ---------- 紧急救血阶段：接受败北（不补血）----------
    socket.on('giveUpEmergencyHeal', (_payload, ack) => {
        const cb = typeof ack === 'function' ? ack : () => { };
        const pid = getPidBySocket(socket.id);
        if (pid === null)
            return cb(false, { error: '未加入房间' });
        if (room.engine.emergencyHealPending !== pid)
            return cb(false, { error: '非紧急救血阶段' });
        const r = room.engine.emergencyHealGiveUp();
        if (!r.ok)
            return cb(false, { error: r.message });
        broadcastEvent(io, 'eventGameOver', {
            winner: room.engine.state.result?.winner ?? null,
            reason: room.engine.state.result?.reason ?? null,
            detail: room.engine.state.result?.detail ?? null,
        });
        cb(true, r);
        broadcastRoomState(io);
    });
    // ---------- 当前行动玩家：结束行动（操作权交给对方或触发回合终局）----------
    socket.on('readyNextTurn', (_payload, ack) => {
        const cb = typeof ack === 'function' ? ack : () => { };
        const pid = getPidBySocket(socket.id);
        if (pid === null)
            return cb(false, { error: '未加入房间' });
        if (!room.engine.turn.isInActionPhase())
            return cb(false, { error: '当前不在行动阶段' });
        if (room.engine.turn.activePlayer !== pid)
            return cb(false, { error: '不是你的行动阶段' });
        if (room.engine.turn.isAwaitingDefense())
            return cb(false, { error: '请先完成防御响应' });
        if (room.engine.emergencyHealPending !== null)
            return cb(false, { error: '等待紧急救血处理' });
        const roundBefore = room.engine.state.roundCount;
        const r = room.engine.endActionPhase();
        if (!r.ok)
            return cb(false, { error: r.message });
        // roundCount 变化意味着回合真的结束了（endTurn 被触发）
        if (room.engine.state.roundCount !== roundBefore) {
            broadcastEvent(io, 'eventTurnEnd', {
                nextRoundCount: room.engine.state.roundCount,
                nextFirstPid: room.engine.state.firstPlayer,
            });
        }
        if (room.engine.state.gameOver) {
            broadcastEvent(io, 'eventGameOver', {
                winner: room.engine.state.result?.winner ?? null,
                reason: room.engine.state.result?.reason ?? null,
                detail: room.engine.state.result?.detail ?? null,
            });
        }
        cb(true, r);
        broadcastRoomState(io);
    });
    // ---------- 重置下一局（任意一方可触发，双方都保留在线直接重开）----------
    socket.on('resetRoom', (_payload, ack) => {
        const cb = typeof ack === 'function' ? ack : () => { };
        // 重置引擎，保留双方 socketId 不变
        room.engine = new GameEngine_1.GameEngine();
        room.engine.initGame();
        room.started = true;
        console.log(`[Game] 房间重置 · 新对局开始 · 先手=玩家${room.engine.state.firstPlayer + 1}`);
        broadcastEvent(io, 'eventRoomReset', {});
        broadcastEvent(io, 'eventGameStart', {
            firstPlayerPid: room.engine.state.firstPlayer,
        });
        cb(true, { message: '新对局已开始' });
        broadcastRoomState(io);
    });
    // ---------- 断开连接 ----------
    socket.on('disconnect', () => {
        console.log(`[IO] 断开：${socket.id}`);
        let affected = null;
        for (const s of ['p1', 'p2']) {
            if (room.players[s].socketId === socket.id) {
                room.players[s].socketId = null;
                affected = s;
            }
        }
        if (affected) {
            console.log(`[IO] ${affected} 槽已清空`);
            broadcastEvent(io, 'eventPlayerLeave', { slot: affected });
            // 如果所有玩家都离开了，重置房间状态
            // 否则下次加入时 started=true 但不 emit eventGameStart，导致前端卡住
            if (!room.players.p1.socketId && !room.players.p2.socketId) {
                room.started = false;
                room.engine = new GameEngine_1.GameEngine();
                room.engine.initGame();
                console.log('[IO] 所有玩家离线 · 房间已重置');
            }
            broadcastRoomState(io);
        }
    });
});
function getPidBySocket(socketId) {
    if (room.players.p1.socketId === socketId)
        return 0;
    if (room.players.p2.socketId === socketId)
        return 1;
    return null;
}
// ============================================================
// 启动
// ============================================================
async function main() {
    const ip = getLanIp();
    const lanUrl = `http://${ip}:${PORT}`;
    server.listen(PORT, BIND_HOST, async () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║     三国卡牌对战 · Socket.IO 联机服务已启动      ║');
        console.log('╠══════════════════════════════════════════════════╣');
        console.log(`║  服务监听：       ${BIND_HOST}:${PORT}                        ║`);
        console.log(`║  本机访问：       ${lanUrl.padEnd(37)}║`);
        console.log('║  公网部署：访问服务分配的域名（如 xxx.zeabur.app）║');
        console.log('║  局域网部署：访问本机 IP + 端口                  ║');
        console.log('╠══════════════════════════════════════════════════╣');
        console.log('║  前端入口：打开网页选择「单机 vs AI」或「联机」  ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log('');
    });
}
main().catch(err => {
    console.error('启动失败：', err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map