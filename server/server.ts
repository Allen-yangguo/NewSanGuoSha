/**
 * 三国卡牌对战 · 联机服务端（Node.js + Express + Socket.IO）
 *
 * 架构：
 *  - 游戏业务逻辑 100% 在服务端执行（直接复用 assets/scripts/core 引擎）
 *  - 客户端仅提交操作指令、接收「区分视角」的状态推送
 *  - 手牌严格隔离：p1 永远收不到 p2.handCards，反之亦然
 *
 * 大厅模式（参考 QQ 游戏大厅）：
 *  - 5 个独立桌并行，每桌 2 座（p1/p2），可同时进行 5 个独立对局
 *  - 玩家进大厅看 5 桌状态，选空座坐下
 *  - 坐下后点「准备」按钮，双方都准备才开局
 *  - 每桌用 socket.io room `table-${id}` 隔离事件广播
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
  PouchType,
} from '../assets/scripts/core/types';
import { HP_MAX } from '../assets/scripts/core/BattleState';
import { createAuthRouter } from './auth/routes';
import { verifyToken, getUserByUid, guestNickname } from './auth/authService';
import { getDb, getLeaderboard, getRecord, updateRecord } from './auth/db';
import { getRecordSummary, settleGame } from './auth/recordService';
import {
  createMonitorRouter,
  httpMiddleware,
  startMonitor,
  stopMonitor,
  dashboardHandler,
} from './monitor/monitor';
import { createAdminRouter, adminDashboardHandler } from './admin/admin';
import { initBotSystem, shutdownBots, getBotSocketIds, isBotSocketId, ensureBotOpponent } from './bots/botManager';

/** 旁观者: 桌id -> socket id 集合(用于 roomState 推送) */
const spectators = new Map<number, Set<string>>();
/** 旁观者视角: socket id -> 旁观槽位(p1/p2) */
const spectatorSlots = new Map<string, Slot>();

// ============================================================
// 配置
// ============================================================
const PORT = Number(process.env.PORT || 3000);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0'; // 局域网/公网均需 0.0.0.0
const TABLE_COUNT = 10; // 大厅并行桌数

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
// 桌模型（5 桌并行大厅）
// ============================================================
type Slot = 'p1' | 'p2';
interface TableSlot {
  socketId: string | null;
  pid: PlayerId;
  name: string;
  /** 登录用户稳定标识(正式用户 u<id>,游客 g<hex>);用于断线重连按身份恢复槽位 */
  userId: string | null;
  /** 准备状态（坐下后手动点准备，双方都准备才开局）*/
  ready: boolean;
}
interface Table {
  id: number; // 1..TABLE_COUNT
  engine: GameEngine;
  started: boolean;
  players: Record<Slot, TableSlot>;
  /** 对局结束后「再来一局」确认标记（双方都点才重开） */
  rematch: Record<Slot, boolean>;
  /** 断线重连超时定时器(对局中离线超过 90s 未重连 → 按强退处理) */
  offlineTimers: Partial<Record<Slot, ReturnType<typeof setTimeout> | null>>;
}
interface TableSeatView {
  /** null=空座；有玩家时显示昵称 */
  name: string | null;
  ready: boolean;
  /** 在线(true)/掉线重连中(false) */
  present: boolean;
}
interface TableSummary {
  id: number;
  started: boolean;
  /** 对局是否已结束(gameOver,等待「再来一局」) */
  gameOver: boolean;
  p1: TableSeatView;
  p2: TableSeatView;
}

const tables: Table[] = Array.from({ length: TABLE_COUNT }, (_, i) => ({
  id: i + 1,
  engine: new GameEngine(),
  started: false,
  players: {
    p1: { socketId: null, pid: 0, name: '玩家1', userId: null, ready: false },
    p2: { socketId: null, pid: 1, name: '玩家2', userId: null, ready: false },
  },
  rematch: { p1: false, p2: false },
  offlineTimers: {},
}));

/** 桌 room 名（socket.io room）*/
function tableRoom(id: number): string {
  return `table-${id}`;
}

/** 清空指定座位
 *  - keepIdentity=true：仅清 socketId（断线保留 userId/姓名供重连）
 *  - keepIdentity=false：完全清空（换座/站起/大厅离线）
 */
function clearSeat(table: Table, slot: Slot, keepIdentity: boolean): void {
  const seat = table.players[slot];
  seat.socketId = null;
  if (!keepIdentity) {
    seat.userId = null;
    seat.ready = false;
    seat.name = slot === 'p1' ? '玩家1' : '玩家2';
  }
}

/** 整桌重置（引擎重建、started/ready 复位、座位清空、重连超时清理）*/
function resetTable(table: Table): void {
  table.engine = new GameEngine();
  table.started = false;
  for (const s of ['p1', 'p2'] as Slot[]) {
    clearSeat(table, s, false);
  }
  table.rematch = { p1: false, p2: false };
  for (const s of ['p1', 'p2'] as Slot[]) {
    if (table.offlineTimers[s]) { clearTimeout(table.offlineTimers[s]!); table.offlineTimers[s] = null; }
  }
}

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
  /** 智者锦囊标记（含本人可用的选项；对手视角仅显示标记有无） */
  pouches: Array<{
    strategistId: string;
    strategistName: string;
    que: boolean;
    can: boolean;
    ji: boolean;
    options?: Array<{ pouch: string; pouchName: string; choices: Array<{ choice: string; name: string; desc: string }> }>;
  }>;
  /** 鱼鳞阵状态 */
  yulin: { active: boolean; remainingTurns: number };
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
  /** 绝杀急救等待中的 pid */
  ultimateSavePid: PlayerId | null;
  firstPlayerPid: PlayerId;
  guiBeiProtectorPid: PlayerId | null;
  guiBeiLayers: number;
  guiBeiRemainingTurns: number;
  combatScores: [number, number];
  deckCount: number;
  discardCount: number;
  /** 桌面已打出卡牌数（回合结束清入弃牌堆） */
  tableCount: number;
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
  table: Table,
): PlayerView {
  const slotInfo = table.players[slot];
  const p: PlayerState = table.engine.state.players[slotInfo.pid];
  const isMe = slotInfo.pid === mePid;
  const strategistNames: Record<string, string> = { zhuge: '诸葛亮', zhouyu: '周瑜', simayi: '司马懿' };
  const myOptions = isMe ? table.engine.getPouchOptions(slotInfo.pid) : [];
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
    pouches: Object.keys(p.pouches).map(sid => {
      const st = p.pouches[sid];
      const base = {
        strategistId: sid,
        strategistName: strategistNames[sid] || sid,
        que: !!st.que,
        can: !!st.can,
        ji: !!st.ji,
      };
      if (isMe) {
        return {
          ...base,
          options: myOptions
            .filter(o => o.strategistId === sid)
            .map(o => ({ pouch: o.pouch, pouchName: o.pouchName, choices: o.choices })),
        };
      }
      return base;
    }),
    yulin: { active: p.yulin.active, remainingTurns: p.yulin.remainingTurns },
  };
}

/**
 * 为某个 socket（玩家视角）生成过滤后的桌内状态
 */
function buildRoomState(socketId: string, table: Table): RoomStateView {
  // 找出这个 socket 在 p1 / p2 哪个槽(本人入座优先;否则取旁观视角)
  let yourSlot: Slot | null = null;
  if (table.players.p1.socketId === socketId) yourSlot = 'p1';
  else if (table.players.p2.socketId === socketId) yourSlot = 'p2';
  else yourSlot = spectatorSlots.get(socketId) || null;

  const yourPid: PlayerId | null = yourSlot ? table.players[yourSlot].pid : null;
  const me = yourPid !== null ? buildPlayerView(yourSlot!, yourPid, table) : (null as any);
  // opponent 用另一个槽的 pid 构造（mePid 保持你自己，确保对手 handCards=[]）
  const oppSlot: Slot = yourSlot === 'p1' ? 'p2' : 'p1';
  const opponent = yourPid !== null ? buildPlayerView(oppSlot, yourPid, table) : (null as any);

  const defensePid: PlayerId | null =
    table.engine.turn.isAwaitingDefense() && table.engine.pendingAttack
      ? table.engine.pendingAttack.defender
      : null;
  const isReflect: boolean =
    table.engine.turn.isAwaitingDefense() && table.engine.pendingAttack?.isReflect === true;

  return {
    roomId: tableRoom(table.id),
    started: table.started,
    yourSlot,
    yourPid,
    roundCount: table.engine.state.roundCount,
    turnPhase: table.engine.turn.phase,
    activePid: table.engine.turn.activePlayer,
    defensePid,
    isReflect,
    emergencyHealPid: table.engine.emergencyHealPending,
    ultimateSavePid: table.engine.ultimateSavePending,
    firstPlayerPid: table.engine.state.firstPlayer,
    guiBeiProtectorPid: table.engine.guiBeiProtector,
    guiBeiLayers: table.engine.guiBeiLayers,
    guiBeiRemainingTurns: table.engine.guiBeiRemainingTurns,
    combatScores: [...table.engine.scoreTracker.combatScore] as [number, number],
    deckCount: table.engine.state.deck.length,
    discardCount: table.engine.state.discard.length,
    tableCount: table.engine.state.table.length,
    actionEnded: [...table.engine.state.actionEnded] as [boolean, boolean],
    you: me,
    opponent,
    gameOver: table.engine.state.gameOver,
    winner: table.engine.state.result?.winner ?? null,
    gameOverDetail: table.engine.state.result?.detail ?? null,
    logs: table.engine.logs.slice(-20),
  };
}

function findCardByUid(table: Table, pid: PlayerId, uid: string): CardInstance | null {
  return table.engine.state.players[pid].hand.find(c => c.uid === uid) || null;
}

// ============================================================
// 大厅视图：单桌摘要
// ============================================================
function seatView(table: Table, slot: Slot): TableSeatView {
  const seat = table.players[slot];
  const occupied = seat.socketId !== null || seat.userId !== null;
  return {
    name: occupied ? seat.name : null,
    ready: seat.ready,
    present: seat.socketId !== null,
  };
}
function buildTableSummary(table: Table): TableSummary {
  return {
    id: table.id,
    started: table.started,
    gameOver: table.started && table.engine.state.gameOver,
    p1: seatView(table, 'p1'),
    p2: seatView(table, 'p2'),
  };
}
function buildAllTableSummaries(): TableSummary[] {
  return tables.map(buildTableSummary);
}

// ============================================================
// 桌/座/玩家 路由辅助
// ============================================================
function getTable(socket: Socket): Table | null {
  const tid = (socket.data as any).tableId as number | undefined;
  if (!tid) return null;
  return tables.find(t => t.id === tid) ?? null;
}
function getTableBySocketId(socketId: string): Table | null {
  return tables.find(t => t.players.p1.socketId === socketId || t.players.p2.socketId === socketId) ?? null;
}
function getSlotInTable(socketId: string, table: Table): Slot | null {
  if (table.players.p1.socketId === socketId) return 'p1';
  if (table.players.p2.socketId === socketId) return 'p2';
  return null;
}
function getPidBySocket(socket: Socket): PlayerId | null {
  const table = getTable(socket);
  if (!table) return null;
  const slot = getSlotInTable(socket.id, table);
  return slot ? table.players[slot].pid : null;
}

// ============================================================
// 推送：给某个玩家推送自己视角的 roomState
// ============================================================
function pushRoomStateTo(io: IOServer, table: Table, socketId: string): void {
  io.to(socketId).emit('roomState', buildRoomState(socketId, table));
}
/** 向 p1 / p2 各自推送自己视角的状态（最常用：状态变化后立刻调这个）*/
function broadcastRoomState(io: IOServer, table: Table): void {
  for (const slot of ['p1', 'p2'] as Slot[]) {
    const sid = table.players[slot].socketId;
    if (sid) pushRoomStateTo(io, table, sid);
  }
  // 旁观者同步推送
  const sp = spectators.get(table.id);
  if (sp) {
    for (const sid of sp) pushRoomStateTo(io, table, sid);
  }
}
/** 向桌内双方广播一个游戏事件（不含隐私数据）*/
function broadcastEvent(io: IOServer, table: Table, event: string, payload: any): void {
  io.to(tableRoom(table.id)).emit(event, payload);
}
/** 向全体连接广播桌列表（大厅用）*/
function broadcastTableList(io: IOServer): void {
  io.emit('tableList', buildAllTableSummaries());
}
/** 向全体广播单桌更新（大厅用）*/
function broadcastTableUpdate(io: IOServer, table: Table): void {
  io.emit('tableUpdate', buildTableSummary(table));
}

/** 游戏结束时广播结算并更新战绩 */
function broadcastSettlement(io: IOServer, table: Table): void {
  // 对局结束：重置「再来一局」确认标记
  table.rematch = { p1: false, p2: false };
  const settlement = table.engine.getSettlement();
  // 更新双方战绩
  for (const slot of ['p1', 'p2'] as Slot[]) {
    const uid = table.players[slot].userId;
    const pid = table.players[slot].pid;
    if (uid) settleGame(uid, settlement, pid);
  }
  // 广播结算数据
  broadcastEvent(io, table, 'eventGameSettlement', settlement);
}

/** 行动阶段：当前行动玩家无牌可出时自动结束行动 */
function tryAutoEndAction(io: IOServer, table: Table): void {
  if (table.engine.state.gameOver) return;
  if (!table.engine.turn.isInActionPhase()) return;
  const actor = table.engine.turn.activePlayer;
  if (table.engine.state.actionEnded[actor]) return;
  if (table.engine.canPlayAnyCard(actor)) return;
  // 无牌可出 → 自动结束行动
  const r = table.engine.endActionPhase();
  if (r.ok) {
    broadcastEvent(io, table, 'eventTurnEnd', { message: r.message, gameOver: table.engine.state.gameOver });
    if (table.engine.state.gameOver) {
      broadcastEvent(io, table, 'eventGameOver', {
        winner: table.engine.state.result?.winner ?? null,
        reason: table.engine.state.result?.reason ?? null,
        detail: table.engine.state.result?.detail ?? null,
      });
      broadcastSettlement(io, table);
    }
  }
}

// ============================================================
// Express & Socket.IO 初始化
// ============================================================
const app = express();
app.use(cors());
// 流量监控: 采集所有业务 HTTP 请求(路由/状态码/字节)。
// 必须放在 express.json 之前,否则 body 解析失败的请求(400)不会被统计
app.use(httpMiddleware);
app.use(express.json());
// 用户认证 REST 接口
app.use('/api/auth', createAuthRouter());
// 流量监控 REST 接口(与管理后台统一,ADMIN_TOKEN 保护)
app.use('/api/monitor', createMonitorRouter());
// 管理后台 REST 接口(ADMIN_TOKEN 保护)
app.use('/api/admin', createAdminRouter());

// 排行榜(公开数据,无需鉴权): ?type=score 积分榜 / ?type=active 今日活跃榜,各取前十
app.get('/api/leaderboard', (_req: express.Request, res: express.Response) => {
  const type = _req.query.type === 'active' ? 'active' : 'score';
  res.json({ ok: true, data: getLeaderboard(type, 10) });
});

// 静态托管：基于 process.cwd() 解析 client/dist，兼容 ts-node 和编译后运行
// ts-node 运行 server/server.ts 时 cwd 是项目根
// node dist/server/server.js 运行时 cwd 是项目根
const clientDist = path.resolve(process.cwd(), 'client', 'dist');
app.use(express.static(clientDist));

// 健康检查 / 状态接口（5 桌摘要）
app.get('/__status', (_req: express.Request, res: express.Response) => {
  const summaries = buildAllTableSummaries();
  const lines = summaries.map(t => {
    const p1 = t.p1.name ? `${t.p1.name}${t.p1.ready ? '✓' : ''}${t.p1.present ? '' : '⌛'}` : '空';
    const p2 = t.p2.name ? `${t.p2.name}${t.p2.ready ? '✓' : ''}${t.p2.present ? '' : '⌛'}` : '空';
    return `桌${t.id}[${t.started ? '对战' : '等待'}]: ${p1} vs ${p2}`;
  });
  res.json({ status: lines.join(' ｜ '), tables: summaries });
});

// 流量监控面板页面(数据走受保护的 /api/monitor/*)
app.get('/monitor', dashboardHandler);
// 管理后台页面(数据走受保护的 /api/admin/*)
app.get('/admin', adminDashboardHandler);

// SPA 兜底：所有未匹配路由都返回前端 index.html
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (_req.path.startsWith('/socket.io/')) return next(); // 不拦截 socket.io
  if (_req.path === '/__status') return next();
  if (_req.path === '/monitor') return next();
  if (_req.path.startsWith('/api/monitor')) return next();
  if (_req.path === '/admin') return next();
  if (_req.path.startsWith('/api/admin')) return next();
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

  // ---------- 大厅：坐下 ----------
  // payload: { tableId: number, slot: Slot, name?: string }
  socket.on('sitDown', (payload: { tableId?: number; slot?: Slot; name?: string } = {}, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const tableId = payload?.tableId;
    const slot = payload?.slot;
    if (typeof tableId !== 'number' || (slot !== 'p1' && slot !== 'p2')) {
      return cb(false, { error: '参数错误' });
    }
    const table = tables.find(t => t.id === tableId);
    if (!table) return cb(false, { error: '桌不存在' });
    const auth = (socket.data as any).auth as { uid: string; role: string } | undefined;
    const userId = auth?.uid ?? null;

    // 若已在别桌入座 → 先清旧座（自愿换座，完全清空）
    const oldTable = getTableBySocketId(socket.id);
    if (oldTable) {
      const oldSlot = getSlotInTable(socket.id, oldTable);
      if (oldSlot) {
        if (oldTable.id === table.id && oldSlot === slot) {
          // 同座重复坐下：直接返回当前状态
          return cb(true, { tableId: table.id, slot, pid: table.players[slot].pid, started: table.started });
        }
        clearSeat(oldTable, oldSlot, false);
        socket.leave(tableRoom(oldTable.id));
        broadcastTableUpdate(io, oldTable);
      }
    }

    const seat = table.players[slot];
    // 校验座位是否可入：
    //  - 空（socketId null 且 userId null）→ 可入
    //  - 自己的身份重连（userId 相同且 socketId null）→ 可入（重连）
    //  - 已被在线玩家占用（socketId 非 null）或被他人身份持有（重连等待中）→ 拒绝
    if (seat.socketId !== null) {
      return cb(false, { error: '该座位已被占用' });
    }
    if (seat.userId !== null && (!userId || seat.userId !== userId)) {
      return cb(false, { error: '该座位等待原玩家重连' });
    }

    // 入座
    seat.socketId = socket.id;
    seat.userId = userId;
    // 登录用户优先使用账号昵称；游客回退到 payload.name 或自动生成的游客名
    let resolvedName: string | null = null;
    if (userId) {
      const userRes = getUserByUid(userId);
      if (userRes.ok && userRes.user?.nickname) resolvedName = userRes.user.nickname;
    }
    if (resolvedName) seat.name = resolvedName;
    else if (payload?.name) seat.name = payload.name;
    else if (userId && userId.startsWith('g')) seat.name = guestNickname(userId);
    // 重连场景不重置 ready（对局进行中 ready 无意义；大厅重连保留原 ready）
    if (!table.started) seat.ready = false;

    (socket.data as any).tableId = table.id;
    (socket.data as any).slot = slot;
    socket.join(tableRoom(table.id));
    // 重连成功: 取消断线超时定时器
    if (table.offlineTimers[slot]) {
      clearTimeout(table.offlineTimers[slot]!);
      table.offlineTimers[slot] = null;
    }
    console.log(`[IO] ${socket.id} 入桌${table.id} -> ${slot} (pid=${seat.pid})${table.started ? ' · 重连' : ''}`);

    cb(true, {
      tableId: table.id,
      slot,
      pid: seat.pid,
      started: table.started,
    });

    // 重连场景：对局进行中，主动给重连的 socket 补发 eventGameStart + roomState
    if (table.started) {
      io.to(socket.id).emit('eventGameStart', {
        firstPlayerPid: table.engine.state.firstPlayer,
      });
      pushRoomStateTo(io, table, socket.id);
    }

    // 真人入座且对面是空座 → 调度模拟玩家来陪(避免真人干等)
    if (!table.started && !isBotSocketId(socket.id)) {
      const other: Slot = slot === 'p1' ? 'p2' : 'p1';
      if (!table.players[other].socketId) {
        ensureBotOpponent();
      }
    }

    broadcastTableUpdate(io, table);
    broadcastTableList(io);
  });

  // ---------- 大厅：站起（离开座位）----------
  socket.on('standUp', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(true, { ok: true }); // 未入桌，无操作
    const slot = getSlotInTable(socket.id, table);
    if (!slot) return cb(true, { ok: true });
    clearSeat(table, slot, false);
    socket.leave(tableRoom(table.id));
    (socket.data as any).tableId = null;
    (socket.data as any).slot = null;
    // 两座都空 → 重置整桌
    if (!table.players.p1.socketId && !table.players.p2.socketId) {
      resetTable(table);
    }
    broadcastTableUpdate(io, table);
    broadcastTableList(io);
    cb(true, { ok: true });
  });

  // ---------- 对局中主动离开（强退）：扣 50 分;模拟玩家留桌,桌重置为未准备 ----------
  socket.on('leaveGame', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(true, { ok: true }); // 未入桌，无操作
    const slot = getSlotInTable(socket.id, table);
    if (!slot) return cb(true, { ok: true });
    const auth = (socket.data as any).auth as { uid: string; role: string } | undefined;
    const uid = auth?.uid ?? null;
    const wasStarted = table.started;
    const gameInProgress = table.started && !table.engine.state.gameOver;
    const nick = table.players[slot].name;
    // 强退扣 50 分(仅对局进行中且非游客;对局结束后的离开不算强退)
    if (gameInProgress && uid && !uid.startsWith('g')) {
      const rec = getRecord(uid);
      updateRecord(uid, { totalScore: Math.max(0, (rec.totalScore || 0) - 50) });
      console.log(`[IO] ${nick} 对局中离开(强退) · 扣 50 分`);
    }
    // 释放自己的座位
    clearSeat(table, slot, false);
    socket.leave(tableRoom(table.id));
    (socket.data as any).tableId = null;
    (socket.data as any).slot = null;
    // 对局进行中 → 终止对局: 引擎重置,桌回到「未准备」状态,对手(模拟玩家)留桌
    if (gameInProgress) {
      table.engine = new GameEngine();
      table.started = false;
      table.rematch = { p1: false, p2: false };
      table.players.p1.ready = false;
      table.players.p2.ready = false;
      console.log(`[Game] 桌${table.id} ${nick} 对局中离开 · 对局终止 · 桌重置为未准备(对手留桌)`);
      broadcastEvent(io, table, 'eventGameAborted', { bySlot: slot, byName: nick });
      broadcastEvent(io, table, 'eventRoomReset', {});
    }
    // 两座都空 → 重置整桌
    if (!table.players.p1.socketId && !table.players.p2.socketId) {
      resetTable(table);
    }
    broadcastTableUpdate(io, table);
    broadcastTableList(io);
    cb(true, { ok: true });
  });

  // ---------- 大厅：准备 ----------
  socket.on('ready', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    if (table.started) return cb(false, { error: '对局已开始' });
    const slot = getSlotInTable(socket.id, table);
    if (!slot) return cb(false, { error: '未入桌' });
    table.players[slot].ready = true;
    cb(true, { ok: true });
    broadcastTableUpdate(io, table);

    // 双方都在线且都准备 → 开局
    const bothPresent = table.players.p1.socketId && table.players.p2.socketId;
    const bothReady = table.players.p1.ready && table.players.p2.ready;
    if (bothPresent && bothReady && !table.started) {
      table.engine = new GameEngine();
      table.engine.initGame();
      table.started = true;
      // 开局后准备态清空（下一局需重新准备）
      table.players.p1.ready = false;
      table.players.p2.ready = false;
      console.log(`[Game] 桌${table.id} 双方准备就绪 · 对局开始 · 先手=玩家${table.engine.state.firstPlayer + 1}`);
      broadcastEvent(io, table, 'eventGameStart', {
        firstPlayerPid: table.engine.state.firstPlayer,
      });
      broadcastRoomState(io, table);
      broadcastTableUpdate(io, table);
    }
  });

  // ---------- 大厅：取消准备 ----------
  socket.on('cancelReady', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    if (table.started) return cb(false, { error: '对局已开始' });
    const slot = getSlotInTable(socket.id, table);
    if (!slot) return cb(false, { error: '未入桌' });
    table.players[slot].ready = false;
    cb(true, { ok: true });
    broadcastTableUpdate(io, table);
  });

  // ---------- 大厅：拉取桌列表 ----------
  socket.on('getTableList', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    cb(true, buildAllTableSummaries());
  });

  // ---------- 通用：出牌 ----------
  // payload: { cardUid: string }
  socket.on('playCard', (payload: { cardUid: string }, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (!table.started) return cb(false, { error: '对局未开始' });

    const card = findCardByUid(table, pid, payload.cardUid);
    if (!card) return cb(false, { error: '手牌中找不到该卡（可能已打出）' });

    const before = { ...card.def }; // 广播用
    const r = applyCardEffect(table.engine, card, pid);
    if (!r.ok) {
      cb(false, { error: r.message });
      return;
    }
    // 广播「有玩家打出了某张牌」（双方可见）
    // 计算结算后攻击力（武将 → pendingAttack.damage，绝杀 → card.def.value）
    let attackPower: number | undefined;
    if (r.triggeredDamage && table.engine.pendingAttack) {
      attackPower = table.engine.pendingAttack.damage;
    } else if (r.triggeredUltimate) {
      attackPower = before.value;
    }
    broadcastEvent(io, table, 'eventPlayCard', {
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
      broadcastEvent(io, table, 'eventDamage', { message: r.message });
    }
    if (table.engine.state.gameOver) {
      broadcastEvent(io, table, 'eventGameOver', {
        winner: table.engine.state.result?.winner ?? null,
        reason: table.engine.state.result?.reason ?? null,
        detail: table.engine.state.result?.detail ?? null,
      });
      broadcastSettlement(io, table);
    }
    cb(true, r);

    // 自动防御结算：
    // 1. 防具累计 >= 攻击伤害 → 自动通过
    // 2. 防御方手中没有防具牌也没有八卦阵 → 自动承受
    if (table.engine.turn.isAwaitingDefense()
      && !table.engine.baguaTriggered
      && table.engine.pendingAttack) {
      const atk = table.engine.pendingAttack;
      const defender = table.engine.state.players[atk.defender];
      const hasArmor = defender.hand.some((c: CardInstance) => c.def.category === CardCategory.Armor);
      const hasBagua = defender.hand.some((c: CardInstance) =>
        c.def.category === CardCategory.Formation && c.def.subtype === FormationType.BaGua);
      const shouldAuto = table.engine.defensePool >= atk.damage || (!hasArmor && !hasBagua);
      if (shouldAuto) {
        const dr = table.engine.defenderPass();
        if (dr.ok) {
          broadcastEvent(io, table, 'eventDamage', { message: dr.message });
          if (table.engine.state.gameOver) {
            broadcastEvent(io, table, 'eventGameOver', {
              winner: table.engine.state.result?.winner ?? null,
              reason: table.engine.state.result?.reason ?? null,
              detail: table.engine.state.result?.detail ?? null,
            });
            broadcastSettlement(io, table);
          }
        }
      }
    }

    // 行动阶段：无牌可出时自动结束行动
    tryAutoEndAction(io, table);

    broadcastRoomState(io, table);
  });

  // ---------- 使用智者锦囊 ----------
  // payload: { strategistId: 'zhuge'|'zhouyu'|'simayi', pouch: 'que'|'can'|'ji', choice: '选项id' }
  socket.on('usePouch', (payload: { strategistId?: string; pouch?: string; choice?: string }, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (!table.started) return cb(false, { error: '对局未开始' });
    const pouch = payload?.pouch;
    if (!pouch || (pouch !== 'que' && pouch !== 'can' && pouch !== 'ji')) {
      return cb(false, { error: '参数错误' });
    }
    const r = table.engine.usePouch(
      pid,
      String(payload?.strategistId || ''),
      pouch as PouchType,
      String(payload?.choice || ''),
    );
    if (!r.ok) return cb(false, { error: r.message });
    if (r.pouchUsed) {
      broadcastEvent(io, table, 'eventPouchUsed', { actorPid: pid, message: r.message });
    }
    broadcastRoomState(io, table);
    cb(true, { message: r.message, cardName: r.card?.def?.name });
  });

  // ---------- 使用补气按钮 ----------
  // payload: { type: 'normal' | 'big' | 'burst' }
  socket.on('useBonus', (payload: { type: 'normal' | 'big' | 'burst' }, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (!table.started) return cb(false, { error: '对局未开始' });
    let r: any;
    if (payload.type === 'normal') r = table.engine.useNormalQiButton(pid);
    else if (payload.type === 'big') r = table.engine.useBigQiButton(pid);
    else if (payload.type === 'burst') r = table.engine.useManualBurst(pid);
    else return cb(false, { error: '未知 bonus type' });
    if (!r.ok) return cb(false, { error: r.message });
    broadcastEvent(io, table, 'eventBuffChange', {
      actorPid: pid,
      type: payload.type,
      message: r.message,
    });
    cb(true, r);
    // 行动阶段：无牌可出时自动结束行动
    tryAutoEndAction(io, table);
    broadcastRoomState(io, table);
  });

  // ---------- 受击阶段：防御方确认（结束防御 / 放弃防御）----------
  socket.on('confirmDefend', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (!table.engine.turn.isAwaitingDefense()) return cb(false, { error: '非受击防御阶段' });
    if (table.engine.pendingAttack?.defender !== pid) return cb(false, { error: '你不是当前防御方' });
    const r = table.engine.defenderPass();
    if (!r.ok) return cb(false, { error: r.message });
    broadcastEvent(io, table, 'eventDamage', { actorPid: pid, message: r.message });
    if (table.engine.state.gameOver) {
      broadcastEvent(io, table, 'eventGameOver', {
        winner: table.engine.state.result?.winner ?? null,
        reason: table.engine.state.result?.reason ?? null,
        detail: table.engine.state.result?.detail ?? null,
      });
      broadcastSettlement(io, table);
    }
    cb(true, r);
    broadcastRoomState(io, table);
  });

  // ---------- 紧急救血阶段：接受败北（不补血）----------
  socket.on('giveUpEmergencyHeal', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (table.engine.emergencyHealPending !== pid) return cb(false, { error: '非紧急救血阶段' });
    const r = table.engine.emergencyHealGiveUp();
    if (!r.ok) return cb(false, { error: r.message });
    broadcastEvent(io, table, 'eventGameOver', {
      winner: table.engine.state.result?.winner ?? null,
      reason: table.engine.state.result?.reason ?? null,
      detail: table.engine.state.result?.detail ?? null,
    });
    broadcastSettlement(io, table);
    cb(true, r);
    broadcastRoomState(io, table);
  });

  // ---------- 绝杀急救阶段：使用急锦囊自救 ----------
  socket.on('useUltimatePouch', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (table.engine.ultimateSavePending !== pid) return cb(false, { error: '非绝杀急救阶段' });
    const r = table.engine.useUltimatePouch(pid);
    if (!r.ok) return cb(false, { error: r.message });
    broadcastEvent(io, table, 'eventUltimateSave', { actorPid: pid, saved: !!r.saved, message: r.message });
    if (table.engine.state.gameOver) {
      broadcastEvent(io, table, 'eventGameOver', {
        winner: table.engine.state.result?.winner ?? null,
        reason: table.engine.state.result?.reason ?? null,
        detail: table.engine.state.result?.detail ?? null,
      });
      broadcastSettlement(io, table);
    }
    cb(true, r);
    broadcastRoomState(io, table);
  });

  // ---------- 绝杀急救阶段：放弃自救，接受败北 ----------
  socket.on('giveUpUltimateSave', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (table.engine.ultimateSavePending !== pid) return cb(false, { error: '非绝杀急救阶段' });
    const r = table.engine.giveUpUltimateSave(pid);
    if (!r.ok) return cb(false, { error: r.message });
    broadcastEvent(io, table, 'eventUltimateSave', { actorPid: pid, saved: false, message: r.message });
    broadcastEvent(io, table, 'eventGameOver', {
      winner: table.engine.state.result?.winner ?? null,
      reason: table.engine.state.result?.reason ?? null,
      detail: table.engine.state.result?.detail ?? null,
    });
    broadcastSettlement(io, table);
    cb(true, r);
    broadcastRoomState(io, table);
  });

  // ---------- 当前行动玩家：结束行动（操作权交给对方或触发回合终局）----------
  socket.on('readyNextTurn', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const pid = getPidBySocket(socket);
    if (pid === null) return cb(false, { error: '未入桌' });
    if (!table.engine.turn.isInActionPhase()) return cb(false, { error: '当前不在行动阶段' });
    if (table.engine.turn.activePlayer !== pid) return cb(false, { error: '不是你的行动阶段' });
    if (table.engine.turn.isAwaitingDefense()) return cb(false, { error: '请先完成防御响应' });
    if (table.engine.emergencyHealPending !== null) return cb(false, { error: '等待紧急救血处理' });
    const roundBefore = table.engine.state.roundCount;
    const r = table.engine.endActionPhase();
    if (!r.ok) return cb(false, { error: r.message });
    // roundCount 变化意味着回合真的结束了（endTurn 被触发）
    if (table.engine.state.roundCount !== roundBefore) {
      broadcastEvent(io, table, 'eventTurnEnd', {
        nextRoundCount: table.engine.state.roundCount,
        nextFirstPid: table.engine.state.firstPlayer,
        gameOver: table.engine.state.gameOver,
      });
    }
    if (table.engine.state.gameOver) {
      broadcastEvent(io, table, 'eventGameOver', {
        winner: table.engine.state.result?.winner ?? null,
        reason: table.engine.state.result?.reason ?? null,
        detail: table.engine.state.result?.detail ?? null,
      });
      broadcastSettlement(io, table);
    }
    cb(true, r);
    broadcastRoomState(io, table);
  });

  // ---------- 再来一局（对局结束后,双方都确认才开启）----------
  socket.on('resetRoom', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const table = getTable(socket);
    if (!table) return cb(false, { error: '未入桌' });
    const slot = getSlotInTable(socket.id, table);
    if (!slot) return cb(false, { error: '未入桌' });
    if (!table.started || !table.engine.state.gameOver) {
      return cb(false, { error: '对局未结束,暂不可再来一局' });
    }
    table.rematch[slot] = true;
    const other: Slot = slot === 'p1' ? 'p2' : 'p1';
    if (!table.rematch[other]) {
      // 单方确认 → 等待对方
      broadcastEvent(io, table, 'eventRematchRequest', { slot });
      cb(true, { waiting: true, message: '已请求再来一局 · 等待对方确认' });
      broadcastRoomState(io, table);
      broadcastTableUpdate(io, table);
      return;
    }
    // 双方都确认 → 重开新对局
    table.rematch = { p1: false, p2: false };
    table.engine = new GameEngine();
    table.engine.initGame();
    table.started = true;
    table.players.p1.ready = false;
    table.players.p2.ready = false;
    console.log(`[Game] 桌${table.id} 双方确认再来一局 · 新对局开始 · 先手=玩家${table.engine.state.firstPlayer + 1}`);
    broadcastEvent(io, table, 'eventRoomReset', {});
    broadcastEvent(io, table, 'eventGameStart', {
      firstPlayerPid: table.engine.state.firstPlayer,
    });
    cb(true, { message: '双方确认 · 新对局开始' });
    broadcastRoomState(io, table);
    broadcastTableUpdate(io, table);
  });

  // ---------- 对局旁观 ----------
  // payload: { tableId, pid(0/1 选择视角) }
  socket.on('spectate', (payload: { tableId?: number; pid?: number }, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const tableId = payload?.tableId;
    const pid = payload?.pid;
    if (typeof tableId !== 'number' || (pid !== 0 && pid !== 1)) {
      return cb(false, { error: '参数错误' });
    }
    const table = tables.find(t => t.id === tableId);
    if (!table) return cb(false, { error: '桌不存在' });
    if (!table.started) return cb(false, { error: '对局未开始,暂不可旁观' });
    // 已入座玩家不能旁观(需先站起),避免视角冲突
    if (getTableBySocketId(socket.id)) return cb(false, { error: '请先站起再旁观' });
    const slot: Slot = pid === 0 ? 'p1' : 'p2';
    (socket.data as any).spectateTable = tableId;
    (socket.data as any).spectateSlot = slot;
    spectatorSlots.set(socket.id, slot);
    let set = spectators.get(tableId);
    if (!set) { set = new Set(); spectators.set(tableId, set); }
    set.add(socket.id);
    socket.join(tableRoom(tableId));
    console.log(`[IO] ${socket.id} 旁观桌${tableId}(${slot} 视角)`);
    io.to(socket.id).emit('eventGameStart', { firstPlayerPid: table.engine.state.firstPlayer });
    pushRoomStateTo(io, table, socket.id);
    cb(true, { tableId, slot });
  });

  // ---------- 退出旁观 ----------
  socket.on('spectateExit', (_payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const tid = (socket.data as any).spectateTable as number | undefined;
    if (tid) {
      const set = spectators.get(tid);
      if (set) { set.delete(socket.id); if (set.size === 0) spectators.delete(tid); }
      socket.leave(tableRoom(tid));
    }
    spectatorSlots.delete(socket.id);
    (socket.data as any).spectateTable = null;
    (socket.data as any).spectateSlot = null;
    cb(true, { ok: true });
  });

  // ---------- 查询战绩 ----------
  // payload.pid: 指定玩家 pid（用于查看对手战绩）；不传则查自己
  socket.on('getRecord', (payload: { pid?: number } = {}, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const auth = (socket.data as any).auth as { uid: string; role: string } | undefined;
    const myUid = auth?.uid ?? null;
    let targetUid = myUid;
    if (payload?.pid !== undefined && payload.pid !== null) {
      // 按 pid 找当前桌内对应玩家的 userId（联机对手战绩）
      const table = getTable(socket);
      if (table) {
        const slot = (['p1', 'p2'] as Slot[]).find(s => table.players[s].pid === payload.pid);
        if (slot) targetUid = table.players[slot].userId;
      }
    }
    if (!targetUid || targetUid.startsWith('g')) {
      return cb(true, null); // 游客/AI 无战绩
    }
    const summary = getRecordSummary(targetUid);
    cb(true, summary);
  });

  // ---------- 单机模式提交结算 ----------
  socket.on('submitSettlement', (payload: any, ack) => {
    const cb: (ok: boolean, data: any) => void = typeof ack === 'function' ? ack : () => {};
    const auth = (socket.data as any).auth as { uid: string; role: string } | undefined;
    const uid = auth?.uid ?? null;
    if (!uid || uid.startsWith('g')) {
      return cb(true, { skipped: true }); // 游客不计战绩
    }
    settleGame(uid, payload.settlement, payload.myPid);
    cb(true, { ok: true });
  });

  // ---------- 断开连接 ----------
  socket.on('disconnect', () => {
    console.log(`[IO] 断开：${socket.id}`);
    // 旁观者清理
    const spTid = (socket.data as any).spectateTable as number | undefined;
    if (spTid) {
      const set = spectators.get(spTid);
      if (set) { set.delete(socket.id); if (set.size === 0) spectators.delete(spTid); }
      socket.leave(tableRoom(spTid));
    }
    spectatorSlots.delete(socket.id);
    const table = getTableBySocketId(socket.id);
    if (!table) return;
    const slot = getSlotInTable(socket.id, table);
    if (!slot) return;
    // 对局进行中：仅清 socketId，保留 userId/姓名供重连；否则完全清空
    clearSeat(table, slot, table.started);
    (socket.data as any).tableId = null;
    (socket.data as any).slot = null;
    socket.leave(tableRoom(table.id));
    console.log(`[IO] 桌${table.id} ${slot} 已离线${table.started ? '（保留重连）' : ''}`);
    broadcastEvent(io, table, 'eventPlayerLeave', { slot });

    // 对局进行中: 启动断线超时(90s 未重连 → 按强退处理: 扣分 + 终止对局 + 对手留桌)
    if (table.started && !table.engine.state.gameOver) {
      if (table.offlineTimers[slot]) clearTimeout(table.offlineTimers[slot]!);
      const seat = table.players[slot];
      table.offlineTimers[slot] = setTimeout(() => {
        table.offlineTimers[slot] = null;
        // 若仍重连中(座位 socketId 空且 userId 保留) → 按强退处理
        if (table.players[slot].socketId) return; // 已重连
        const uid = seat.userId;
        const nick = seat.name;
        if (uid && !uid.startsWith('g')) {
          const rec = getRecord(uid);
          updateRecord(uid, { totalScore: Math.max(0, (rec.totalScore || 0) - 50) });
          console.log(`[IO] 桌${table.id} ${nick} 离线超时(强退) · 扣 50 分`);
        }
        clearSeat(table, slot, false);
        if (table.started) {
          table.engine = new GameEngine();
          table.started = false;
          table.rematch = { p1: false, p2: false };
          table.players.p1.ready = false;
          table.players.p2.ready = false;
          console.log(`[Game] 桌${table.id} ${nick} 离线超时 · 对局终止 · 桌重置为未准备(对手留桌)`);
          broadcastEvent(io, table, 'eventGameAborted', { bySlot: slot, byName: nick });
          broadcastEvent(io, table, 'eventRoomReset', {});
        }
        if (!table.players.p1.socketId && !table.players.p2.socketId) {
          resetTable(table);
        }
        broadcastTableUpdate(io, table);
        broadcastTableList(io);
      }, 90000).unref?.();
    }

    // 两座都空 → 重置整桌
    if (!table.players.p1.socketId && !table.players.p2.socketId) {
      resetTable(table);
      console.log(`[IO] 桌${table.id} 全部离线 · 已重置`);
    }
    broadcastTableUpdate(io, table);
    broadcastTableList(io);
  });
});

// ============================================================
// 启动
// ============================================================
async function main() {
  // 初始化用户数据库(建表)
  try {
    getDb();
    console.log('[DB] SQLite 初始化成功');
  } catch (e) {
    console.error('[DB] SQLite 初始化失败：', e);
    throw e;
  }
  const ip = getLanIp();
  const lanUrl = `http://${ip}:${PORT}`;
  // 流量监控: 注入实时采样(在线连接数、对局中桌数;区分模拟玩家口径)
  startMonitor(() => {
    const botIds = getBotSocketIds();
    const started = tables.filter(t => t.started);
    const bothBot = (t: Table): boolean =>
      !!t.players.p1.socketId && !!t.players.p2.socketId &&
      botIds.has(t.players.p1.socketId) && botIds.has(t.players.p2.socketId);
    return {
      online: io.engine.clientsCount,
      onlineBots: botIds.size,
      activeTables: started.length,
      activeTablesBots: started.filter(bothBot).length,
    };
  });
  server.listen(PORT, BIND_HOST, async () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     三国卡牌对战 · Socket.IO 联机服务已启动      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  服务监听：       ${BIND_HOST}:${PORT}                        ║`);
    console.log(`║  本机访问：       ${lanUrl.padEnd(37)}║`);
    console.log(`║  大厅桌数：       ${TABLE_COUNT} 桌并行（每桌 2 座）            ║`);    console.log('║  公网部署：访问服务分配的域名（如 xxx.zeabur.app）║');
    console.log('║  局域网部署：访问本机 IP + 端口                  ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  前端入口：打开网页选择「单机 vs AI」或「联机」  ║');
    console.log('║  监控面板：/monitor   管理后台：/admin           ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    const adminToken = process.env.ADMIN_TOKEN;
    console.log(adminToken
      ? '[ADMIN] 管理后台 /admin 与监控面板 /monitor 共用 ADMIN_TOKEN(已配置)'
      : '[ADMIN] 管理后台与监控面板共用 ADMIN_TOKEN · 警告: 未配置,生产环境(NODE_ENV=production)下将禁用');
    // v6.0 模拟玩家系统: 预建/每日新增/唤醒第一批(连接本机)
    try {
      initBotSystem(`http://127.0.0.1:${PORT}`);
    } catch (e) {
      console.error('[BOT] 模拟玩家系统启动失败:', e);
    }
  });
}

main().catch(err => {
  console.error('=== 服务启动失败 ===');
  console.error('错误类型:', err?.constructor?.name || typeof err);
  console.error('错误消息:', err?.message || err);
  if (err?.stack) console.error('堆栈:', err.stack);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('=== uncaughtException ===', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('=== unhandledRejection ===', reason);
  process.exit(1);
});

// 优雅退出: 收到 SIGTERM/SIGINT(Zeabur 重新部署/停止时发送 SIGTERM)先落盘监控数据
function shutdown(signal: string): void {
  console.log(`[SERVER] 收到 ${signal},正在保存监控数据并退出...`);
  shutdownBots();
  stopMonitor();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
