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
import * as QRCode from 'qrcode';

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
    p1: { socketId: null, pid: 0, name: '玩家1（先手方）' },
    p2: { socketId: null, pid: 1, name: '玩家2（后手方）' },
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
  /** 紧急救血等待中的 pid */
  emergencyHealPid: PlayerId | null;
  firstPlayerPid: PlayerId;
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

// 静态托管：优先 client/dist（Vue3 编译产物），回退到简单等待页
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
// 简单占位页：client 还没 build 时显示二维码
app.get('/__qr', (_req: express.Request, res: express.Response) => {
  const ip = getLanIp();
  const url = `http://${ip}:${PORT}`;
  res.type('html').send(`
    <html><head><meta charset="utf-8"><title>三国卡牌对战 · 扫码加入</title>
    <style>body{font-family:"Microsoft YaHei",sans-serif;display:flex;flex-direction:column;
      align-items:center;justify-content:center;min-height:100vh;margin:0;
      background:linear-gradient(135deg,#f3e9d7 0%,#e8d9bc 100%);color:#4b3b2a;}
    h1{font-size:28px;margin:0 0 8px;letter-spacing:4px;}
    p{margin:4px 0;color:#705c48;}
    .box{background:#fff;padding:28px 32px;border-radius:12px;box-shadow:0 8px 24px rgba(75,59,42,.15);
      display:flex;flex-direction:column;align-items:center;}
    .url{font-size:18px;font-weight:bold;color:#8c4a40;margin:8px 0 16px;
      padding:6px 14px;border:1px dashed #825e3b;border-radius:6px;background:#faf6f0;}
    </style></head><body>
    <div class="box">
      <h1>三国卡牌对战</h1>
      <p>两台手机连接同一 WiFi，扫描下方二维码或打开网址即可对战</p>
      <div class="url">${url}</div>
      <img id="qr" />
      <p id="st" style="margin-top:14px;"></p>
    </div>
    <script>
      fetch('/__qr_data').then(r=>r.json()).then(d=>{
        document.getElementById('qr').src = d.qr;
        document.getElementById('st').innerText = d.status;
      });
    </script>
    </body></html>
  `);
});
app.get('/__qr_data', async (_req: express.Request, res: express.Response) => {
  const ip = getLanIp();
  const url = `http://${ip}:${PORT}`;
  const qr = await QRCode.toDataURL(url, { width: 280, margin: 1 });
  const p1 = room.players.p1.socketId ? '✅ 玩家1 已接入' : '⏳ 等待玩家1...';
  const p2 = room.players.p2.socketId ? '✅ 玩家2 已接入' : '⏳ 等待玩家2...';
  res.json({ url, qr, status: `${p1} ｜ ${p2}` });
});
// 兜底 SPA 路由：Express v5 不支持 app.get('*')，改用中间件
app.use((_req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (_req.path.startsWith('/socket.io/')) return _next(); // 不拦截 socket.io
  if (_req.path === '/__qr' || _req.path === '/__qr_data') return _next(); // 已在前面路由处理过
  // 若 client/dist/index.html 存在则 sendFile，否则重定向到 /__qr
  res.sendFile(path.join(clientDist, 'index.html'), (err: any) => {
    if (err) res.redirect('/__qr');
  });
});

const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: '*' },
});

// ============================================================
// Socket 事件处理
// ============================================================
io.on('connection', (socket: Socket) => {
  console.log(`[IO] 新连接：${socket.id}   IP=${socket.handshake.address}`);

  // ---------- joinRoom：客户端加入房间（分配 p1/p2 槽）----------
  socket.on('joinRoom', (payload: { roomId?: string; name?: string; preferSlot?: Slot } = {}, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    // 如果这 socket 原本在某个槽（同 socketId 重连），先清掉旧的
    for (const s of ['p1', 'p2'] as Slot[]) {
      if (room.players[s].socketId === socket.id) room.players[s].socketId = null;
    }

    // 优先尝试恢复到 preferSlot（客户端 localStorage 记录的槽位）
    let mySlot: Slot | null = null;
    if (payload?.preferSlot && !room.players[payload.preferSlot].socketId) {
      mySlot = payload.preferSlot;
    }
    // 否则找空槽：优先 p1，再 p2
    if (!mySlot) {
      if (!room.players.p1.socketId) mySlot = 'p1';
      else if (!room.players.p2.socketId) mySlot = 'p2';
    }
    if (!mySlot) {
      cb(false, { error: '房间已满（两位玩家已齐）' });
      return;
    }
    room.players[mySlot].socketId = socket.id;
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
      // 玩家离线，对局暂停（不重置 engine，保留状态；等重连）
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
  const ip = getLanIp();
  const url = `http://${ip}:${PORT}`;
  server.listen(PORT, BIND_HOST, async () => {
    const qr = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     三国卡牌对战 · Socket.IO 联机服务已启动      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  本机局域网访问： ${url.padEnd(37)}║`);
    console.log(`║  服务监听地址：   ${BIND_HOST}:${PORT.toString().padEnd(29)}║`);
    console.log(`║  控制台二维码页： ${(url + '/__qr').padEnd(37)}║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  迁移云服务器：仅改 PORT/BIND_HOST + 安全组     ║');
    console.log('║  业务逻辑、事件协议、前端代码完全不变            ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log(qr);
    console.log('');
  });
}

main().catch(err => {
  console.error('启动失败：', err);
  process.exit(1);
});
