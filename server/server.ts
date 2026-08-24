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
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import express = require('express');
import cors = require('cors');
import { Server as IOServer, Socket } from 'socket.io';
// QRCode 已移除：公网部署通过域名访问，局域网通过服务端日志的 IP 访问

import { GameEngine } from '../assets/scripts/core/GameEngine';
import { applyCardEffect } from '../assets/scripts/core/CardEffect';
import {
  PlayerId,
  PlayerState,
  CardInstance,
  StrategyRecord,
  TurnPhase,
  CardCategory,
  FormationType,
} from '../assets/scripts/core/types';
import { HP_MAX } from '../assets/scripts/core/BattleState';
import { createAuthRouter } from './auth/routes';
import { verifyToken } from './auth/authService';
import { getDb } from './auth/db';

// ============================================================
// 配置
// ============================================================
const PORT = Number(process.env.PORT || 3000);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0'; // 局域网/公网均需 0.0.0.0
const ROOM_ID = 'sanguosha-room-001'; // 单房间模式：固定房间号

// ============================================================
// 工具：获取本机局域网 IPv4
// ============================================================
function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  const candidates: string[] = [];
  for (const name of Object.keys(ifaces)) {
    const list = ifaces[name] || [];
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        // 优先 192.168.x.x（家庭路由器最常见）
        if (net.address.startsWith('192.168.')) candidates.unshift(net.address);
        else candidates.push(net.address);
      }
    }
  }
  return candidates[0] || '127.0.0.1';
}

// ============================================================
// 房间模型（单房间模式）
// ============================================================
type Slot = 'p1' | 'p2';
interface PlayerSlot {
  socketId: string | null;
  pid: PlayerId;
  name: string;
  /** 登录用户稳定标识(正式用户 u<id>,游客 g<hex>);用于断线重连按身份恢复槽位 */
  userId: string | null;
}
interface Room {
  engine: GameEngine;
  started: boolean;
  players: Record<Slot, PlayerSlot>;
  spectators: string[]; // socketId list（预留，当前不开放）
}
const room: Room = {
  engine: new GameEngine(),
  started: false,
  players: {
    p1: { socketId: null, pid: 0, name: '玩家1（先手方）', userId: null },
    p2: { socketId: null, pid: 1, name: '玩家2（后手方）', userId: null },
  },
  spectators: [],
};

// ============================================================
// 视角过滤：把完整状态按玩家视角切片，确保手牌严格隔离
// ============================================================
interface StrategyView {
  type: string;
  layers: number;
  remainingTurns: number;
  sourceCardUid?: string;
}
interface PlayerView {
  pid: PlayerId;
  name: string;
  hp: number;
  hpMax: number;
  qi: number;
  handCount: number;
  /** 只有本人视角才有 handCards；对手视角永远为 [] */
  handCards: Array<{
    uid: string;
    id: string;
    name: string;
    category: string;
    subtype?: string;
    value: number;
    cost: number;
    desc: string;
  }>;
  strategies: StrategyView[];
  usedNormalQi: boolean;
  usedBigQi: boolean;
}
interface RoomStateView {
  roomId: string;
  started: boolean;
  /** 接收方本人的玩家槽位：p1/p2 */
  yourSlot: Slot | null;
  yourPid: PlayerId | null;
  roundCount: number;
  turnPhase: TurnPhase;
  /** 当前行动玩家 pid（UI 用它判断「是否我出牌」）*/
  activePid: PlayerId;
  /** 防御响应中的受击者 pid */
  defensePid: PlayerId | null;
  /** 当前防御响应是否为八卦阵反弹受击（true 时仅允许出防具，不可再出八卦阵） */
  isReflect: boolean;
  /** 紧急救血等待中的 pid */
  emergencyHealPid: PlayerId | null;
  firstPlayerPid: PlayerId;
  guiBeiProtectorPid: PlayerId | null;
  guiBeiRemainingTurns: number;
  deckCount: number;
  discardCount: number;
  /** 双方是否已结束行动（UI 用来显示「结束行动」按钮状态） */
  actionEnded: [boolean, boolean];
  you: PlayerView;
  opponent: PlayerView;
  gameOver: boolean;
  winner: PlayerId | null; // null = 进行中 / 平局
  gameOverDetail: string | null;
  logs: string[]; // 最近 20 条日志
}

function strategyToView(s: StrategyRecord): StrategyView {
  return { type: s.type, layers: s.layers, remainingTurns: s.remainingTurns, sourceCardUid: s.sourceCardUid };
}

function buildPlayerView(
  slot: Slot,
  mePid: PlayerId,
): PlayerView {
  const slotInfo = room.players[slot];
  const p: PlayerState = room.engine.state.players[slotInfo.pid];
  const isMe = slotInfo.pid === mePid;
  return {
    pid: slotInfo.pid,
    name: slotInfo.name,
    hp: p.hp,
    hpMax: HP_MAX,
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
function buildRoomState(socketId: string): RoomStateView {
  // 找出这个 socket 在 p1 / p2 哪个槽
  let yourSlot: Slot | null = null;
  if (room.players.p1.socketId === socketId) yourSlot = 'p1';
  else if (room.players.p2.socketId === socketId) yourSlot = 'p2';

  const yourPid: PlayerId | null = yourSlot ? room.players[yourSlot].pid : null;
  const me = yourPid !== null ? buildPlayerView(yourSlot!, yourPid) : (null as any);
  // opponent 用另一个槽的 pid 构造（mePid 保持你自己，确保对手 handCards=[]）
  const oppSlot: Slot = yourSlot === 'p1' ? 'p2' : 'p1';
  const opponent = yourPid !== null ? buildPlayerView(oppSlot, yourPid) : (null as any);

  const defensePid: PlayerId | null =
    room.engine.turn.isAwaitingDefense() && room.engine.pendingAttack
      ? room.engine.pendingAttack.defender
      : null;
  const isReflect: boolean =
    room.engine.turn.isAwaitingDefense() && room.engine.pendingAttack?.isReflect === true;

  return {
    roomId: ROOM_ID,
    started: room.started,
    yourSlot,
    yourPid,
    roundCount: room.engine.state.roundCount,
    turnPhase: room.engine.turn.phase,
    activePid: room.engine.turn.activePlayer,
    defensePid,
    isReflect,
    emergencyHealPid: room.engine.emergencyHealPending,
    firstPlayerPid: room.engine.state.firstPlayer,
    guiBeiProtectorPid: room.engine.guiBeiProtector,
    guiBeiRemainingTurns: room.engine.guiBeiRemainingTurns,
    deckCount: room.engine.state.deck.length,
    discardCount: room.engine.state.discard.length,
    actionEnded: [...room.engine.state.actionEnded] as [boolean, boolean],
    you: me,
    opponent,
    gameOver: room.engine.state.gameOver,
    winner: room.engine.state.result?.winner ?? null,
    gameOverDetail: room.engine.state.result?.detail ?? null,
    logs: room.engine.logs.slice(-20),
  };
}

function findCardByUid(pid: PlayerId, uid: string): CardInstance | null {
  return room.engine.state.players[pid].hand.find(c => c.uid === uid) || null;
}

function slotOfPid(pid: PlayerId): Slot { return pid === 0 ? 'p1' : 'p2'; }
function socketOfPid(pid: PlayerId): string | null {
  return room.players[slotOfPid(pid)].socketId;
}

// ============================================================
// 推送：给某个玩家推送自己视角的 roomState
// ============================================================
function pushRoomStateTo(io: IOServer, socketId: string): void {
  io.to(socketId).emit('roomState', buildRoomState(socketId));
}
/** 向 p1 / p2 各自推送自己视角的状态（最常用：状态变化后立刻调这个）*/
function broadcastRoomState(io: IOServer): void {
  for (const slot of ['p1', 'p2'] as Slot[]) {
    const sid = room.players[slot].socketId;
    if (sid) pushRoomStateTo(io, sid);
  }
}
/** 向双方广播一个游戏事件（不含隐私数据）*/
function broadcastEvent(io: IOServer, event: string, payload: any): void {
  io.to(ROOM_ID).emit(event, payload);
}

/** 行动阶段：当前行动玩家无牌可出时自动结束行动 */
function tryAutoEndAction(io: IOServer, room: Room): void {
  if (room.engine.state.gameOver) return;
  if (!room.engine.turn.isInActionPhase()) return;
  const actor = room.engine.turn.activePlayer;
  if (room.engine.state.actionEnded[actor]) return;
  if (room.engine.canPlayAnyCard(actor)) return;
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
app.use(express.json());
// 用户认证 REST 接口
app.use('/api/auth', createAuthRouter());

// 静态托管：基于 process.cwd() 解析 client/dist，兼容 ts-node 和编译后运行
// ts-node 运行 server/server.ts 时 cwd 是项目根
// node dist/server/server.js 运行时 cwd 是项目根
const clientDist = path.resolve(process.cwd(), 'client', 'dist');
app.use(express.static(clientDist));

// 健康检查 / 状态接口（公网部署无二维码，但保留状态接口给前端大厅用）
app.get('/__status', (_req: express.Request, res: express.Response) => {
  const p1 = room.players.p1.socketId ? '✅ 玩家1 已接入' : '⏳ 等待玩家1...';
  const p2 = room.players.p2.socketId ? '✅ 玩家2 已接入' : '⏳ 等待玩家2...';
  res.json({ status: `${p1} ｜ ${p2}`, started: room.started });
});

// SPA 兜底：所有未匹配路由都返回前端 index.html
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (_req.path.startsWith('/socket.io/')) return next(); // 不拦截 socket.io
  if (_req.path === '/__status') return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err: any) => {
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
const io = new IOServer(server, {
  cors: { origin: '*' },
});

// 连接鉴权：必须携带有效 JWT（正式用户或游客），否则拒绝连接
io.use((socket: Socket, next) => {
  const token = (socket.handshake.auth as any)?.token as string | undefined;
  if (!token) return next(new Error('未登录'));
  const payload = verifyToken(token);
  if (!payload) return next(new Error('登录已过期'));
  (socket.data as any).auth = payload;
  next();
});

// ============================================================
// Socket 事件处理
// ============================================================
io.on('connection', (socket: Socket) => {
  console.log(`[IO] 新连接：${socket.id}   IP=${socket.handshake.address}`);

  // ---------- joinRoom：客户端加入房间（分配 p1/p2 槽）----------
  socket.on('joinRoom', (payload: { roomId?: string; name?: string; preferSlot?: Slot } = {}, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const auth = (socket.data as any).auth as { uid: string; phone?: string; role: string } | undefined;
    const userId = auth?.uid ?? null;
    // 清理同 socketId / 同 userId 的旧占用(只清 socketId,保留 userId 以便按身份恢复)
    for (const s of ['p1', 'p2'] as Slot[]) {
      const slot = room.players[s];
      if (slot.socketId === socket.id || (userId && slot.userId === userId)) {
        slot.socketId = null;
      }
    }

    let mySlot: Slot | null = null;
    // 1) 按 userId 恢复(服务端身份重连,比 localStorage 槽位更可靠)
    if (userId) {
      for (const s of ['p1', 'p2'] as Slot[]) {
        if (room.players[s].userId === userId && !room.players[s].socketId) {
          mySlot = s;
          break;
        }
      }
    }
    // 2) 按 preferSlot（客户端 localStorage 记录的槽位）
    if (!mySlot && payload?.preferSlot && !room.players[payload.preferSlot].socketId) {
      mySlot = payload.preferSlot;
    }
    // 3) 否则找空槽：优先 p1，再 p2
    if (!mySlot) {
      if (!room.players.p1.socketId) mySlot = 'p1';
      else if (!room.players.p2.socketId) mySlot = 'p2';
    }
    if (!mySlot) {
      cb(false, { error: '房间已满（两位玩家已齐）' });
      return;
    }
    room.players[mySlot].socketId = socket.id;
    room.players[mySlot].userId = userId;
    if (payload?.name) room.players[mySlot].name = payload.name;
    socket.join(ROOM_ID);
    console.log(`[IO] ${socket.id} 加入房间 -> ${mySlot} (pid=${room.players[mySlot].pid})${room.started ? ' · 重连' : ''}`);

    // 如果两个槽都满了且对局未开始 → 自动开局
    const bothReady = room.players.p1.socketId && room.players.p2.socketId;
    if (bothReady && !room.started) {
      room.engine = new GameEngine();
      room.engine.initGame();
      room.started = true;
      console.log(`[Game] 两位玩家到齐 · 对局开始 · 先手=玩家${room.engine.state.firstPlayer + 1}`);
      broadcastEvent(io, 'eventGameStart', {
        firstPlayerPid: room.engine.state.firstPlayer,
      });
    } else if (room.started) {
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
  socket.on('playCard', (payload: { cardUid: string }, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const pid = getPidBySocket(socket.id);
    if (pid === null) return cb(false, { error: '未加入房间' });
    if (!room.started) return cb(false, { error: '对局未开始' });

    const card = findCardByUid(pid, payload.cardUid);
    if (!card) return cb(false, { error: '手牌中找不到该卡（可能已打出）' });

    const before = { ...card.def }; // 广播用
    const r = applyCardEffect(room.engine, card, pid);
    if (!r.ok) {
      cb(false, { error: r.message });
      return;
    }
    // 广播「有玩家打出了某张牌」（双方可见）
    // 计算结算后攻击力（武将 → pendingAttack.damage，绝杀 → card.def.value）
    let attackPower: number | undefined;
    if (r.triggeredDamage && room.engine.pendingAttack) {
      attackPower = room.engine.pendingAttack.damage;
    } else if (r.triggeredUltimate) {
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
        triggeredCharm: !!r.triggeredCharm,
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
      const hasArmor = defender.hand.some((c: CardInstance) => c.def.category === CardCategory.Armor);
      const hasBagua = defender.hand.some((c: CardInstance) =>
        c.def.category === CardCategory.Formation && c.def.subtype === FormationType.BaGua);
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
  socket.on('useBonus', (payload: { type: 'normal' | 'big' | 'burst' }, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const pid = getPidBySocket(socket.id);
    if (pid === null) return cb(false, { error: '未加入房间' });
    if (!room.started) return cb(false, { error: '对局未开始' });
    let r: any;
    if (payload.type === 'normal') r = room.engine.useNormalQiButton(pid);
    else if (payload.type === 'big') r = room.engine.useBigQiButton(pid);
    else if (payload.type === 'burst') r = room.engine.useManualBurst(pid);
    else return cb(false, { error: '未知 bonus type' });
    if (!r.ok) return cb(false, { error: r.message });
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
  socket.on('confirmDefend', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const pid = getPidBySocket(socket.id);
    if (pid === null) return cb(false, { error: '未加入房间' });
    if (!room.engine.turn.isAwaitingDefense()) return cb(false, { error: '非受击防御阶段' });
    if (room.engine.pendingAttack?.defender !== pid) return cb(false, { error: '你不是当前防御方' });
    const r = room.engine.defenderPass();
    if (!r.ok) return cb(false, { error: r.message });
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
  socket.on('giveUpEmergencyHeal', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const pid = getPidBySocket(socket.id);
    if (pid === null) return cb(false, { error: '未加入房间' });
    if (room.engine.emergencyHealPending !== pid) return cb(false, { error: '非紧急救血阶段' });
    const r = room.engine.emergencyHealGiveUp();
    if (!r.ok) return cb(false, { error: r.message });
    broadcastEvent(io, 'eventGameOver', {
      winner: room.engine.state.result?.winner ?? null,
      reason: room.engine.state.result?.reason ?? null,
      detail: room.engine.state.result?.detail ?? null,
    });
    cb(true, r);
    broadcastRoomState(io);
  });

  // ---------- 当前行动玩家：结束行动（操作权交给对方或触发回合终局）----------
  socket.on('readyNextTurn', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const pid = getPidBySocket(socket.id);
    if (pid === null) return cb(false, { error: '未加入房间' });
    if (!room.engine.turn.isInActionPhase()) return cb(false, { error: '当前不在行动阶段' });
    if (room.engine.turn.activePlayer !== pid) return cb(false, { error: '不是你的行动阶段' });
    if (room.engine.turn.isAwaitingDefense()) return cb(false, { error: '请先完成防御响应' });
    if (room.engine.emergencyHealPending !== null) return cb(false, { error: '等待紧急救血处理' });
    const roundBefore = room.engine.state.roundCount;
    const r = room.engine.endActionPhase();
    if (!r.ok) return cb(false, { error: r.message });
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
  socket.on('resetRoom', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    // 重置引擎，保留双方 socketId 不变
    room.engine = new GameEngine();
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
    let affected: Slot | null = null;
    for (const s of ['p1', 'p2'] as Slot[]) {
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
        room.engine = new GameEngine();
        room.engine.initGame();
        room.players.p1.userId = null;
        room.players.p2.userId = null;
        console.log('[IO] 所有玩家离线 · 房间已重置');
      }
      broadcastRoomState(io);
    }
  });
});

function getPidBySocket(socketId: string): PlayerId | null {
  if (room.players.p1.socketId === socketId) return 0;
  if (room.players.p2.socketId === socketId) return 1;
  return null;
}

// ============================================================
// 启动
// ============================================================
async function main() {
  // 初始化用户数据库(建表)
  getDb();
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
