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
import { io as createClient, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';
import { listBots, createBotUser, isBotUser } from '../auth/db';
import { createBotToken } from '../auth/authService';

const MAX_ACTIVE = 10;                 // 同时活跃上限
const PEAK_ACTIVE = 10;                // 黄金时间活跃上限
const OFFPEAK_ACTIVE = 4;              // 非黄金时间活跃上限
const NIGHT_START_HOUR = 1;            // 凌晨 1 点起所有模拟玩家不出现
const NIGHT_END_HOUR = 6;              // 早上 6 点起恢复
const DAILY_GAME_CAP = 30;             // 每个模拟玩家每日对局上限(满则当日不再激活)
const TARGET_BOTS = 20;                // 预建数量
const DAILY_ADD = [2, 3];              // 每日新增 2~3 个
const ROTATE_MS = 3 * 60 * 1000;       // 每 3 分钟轮换一批
const MAX_BOT_VS_BOT = 4;              // 机器人互相对局上限(留桌给真人)
const SOLO_WAIT_CAP = 6;               // 独占空桌等真人的机器人上限(其余参与机器人互对)
const META_FILE = path.resolve(process.cwd(), 'data', 'bots-meta.json');

/** 当前应保持活跃的机器人数量(黄金时间多,夜间 1-6 点为 0) */
function currentMaxActive(): number {
  const h = new Date().getHours();
  if (h >= NIGHT_START_HOUR && h < NIGHT_END_HOUR) return 0; // 凌晨 1~6 点: 全部休眠
  if (h >= 18 || h < 1) return PEAK_ACTIVE;                   // 18:00~24:00 黄金时间
  return OFFPEAK_ACTIVE;                                       // 其余时间少量
}

/** 活跃机器人 socket id 集合(供监控区分统计) */
const activeBotSocketIds = new Set<string>();

/** 机器人昵称生成: 三国风 前/后缀 组合 */
const BOT_PREFIX = [
  '千里', '单骑', '卧龙', '凤雏', '锦帆', '白衣', '百骑', '虎痴', '恶来', '鬼谋',
  '温侯', '美髯', '燕人', '子龙', '幼麟', '冢虎', '飞将', '毒士', '陈留', '颍川',
];
const BOT_SUFFIX = [
  '剑客', '豪杰', '谋主', '先锋', '都督', '军师', '猛将', '游侠', '隐士', '名士',
  '虎将', '悍将', '奇才', '神射', '铁骑', '轻骑', '医者', '信使', '商贾', '镖师',
];

function genNickname(): string {
  const p = BOT_PREFIX[Math.floor(Math.random() * BOT_PREFIX.length)];
  const s = BOT_SUFFIX[Math.floor(Math.random() * BOT_SUFFIX.length)];
  return p + s;
}

function readMeta(): { lastDaily: string } {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { lastDaily: '' };
}
function writeMeta(m: { lastDaily: string }): void {
  try {
    fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
    fs.writeFileSync(META_FILE, JSON.stringify(m), 'utf-8');
  } catch (e) {
    console.error('[BOT] meta 保存失败', e);
  }
}

/** 补齐到目标数量(幂等),返回所有机器人用户 */
function ensureBots(): { uid: string; nickname: string }[] {
  let bots = listBots();
  for (let i = bots.length; i < TARGET_BOTS; i++) {
    const nick = genNickname();
    const row = createBotUser(nick);
    bots.push(row);
  }
  return bots.map(b => ({ uid: `u${b.id}`, nickname: b.nickname }));
}

/** 每日新增 2~3 个模拟玩家(日期变更才执行) */
function dailyAddBots(): void {
  const meta = readMeta();
  const today = new Date().toISOString().slice(0, 10);
  if (meta.lastDaily === today) return;
  const count = DAILY_ADD[0] + Math.floor(Math.random() * (DAILY_ADD[1] - DAILY_ADD[0] + 1));
  for (let i = 0; i < count; i++) {
    createBotUser(genNickname());
  }
  writeMeta({ lastDaily: today });
  console.log(`[BOT] 每日新增 ${count} 个模拟玩家 · 当前共 ${listBots().length} 个`);
}

// ============================================================
// 单个机器人的连接与 AI 行为
// ============================================================
interface BotInstance {
  uid: string;
  nickname: string;
  socket: Socket | null;
  /** 连接时的 socket id(断开时 socket.id 可能已被清空,用它来清理集合) */
  connId: string | null;
  state: 'sleep' | 'idle' | 'sitting' | 'playing';
  myPid: number | null;
  lastAttackPower: number;
  lobbyTimer: ReturnType<typeof setTimeout> | null;
  gameOverHandled: boolean;
  /** 当日已完赛局数(每日 30 局上限) */
  gamesToday: number;
  /** 记录 gamesToday 的日期(YYYY-MM-DD) */
  dayKey: string;
  /** 最近坐过的桌(避免立刻重复入座) */
  lastTableId: number | null;
}

const bots: BotInstance[] = [];

function emitAck(socket: Socket, evt: string, payload: any): Promise<{ ok: boolean; data: any }> {
  return new Promise(resolve => {
    try {
      socket.emit(evt, payload, (ok: boolean, data: any) => resolve({ ok, data }));
    } catch {
      resolve({ ok: false, data: null });
    }
  });
}

function schedule(bot: BotInstance, fn: () => void, ms: number): void {
  if (!bot.socket) return;
  const t = setTimeout(fn, ms);
  (t as any).unref?.();
}

/** 进入大厅闲逛: 刷新桌列表,挑桌坐下 */
function lobbyLoop(bot: BotInstance): void {
  const s = bot.socket;
  if (!s || bot.state === 'sleep') return;
  if (bot.state !== 'idle') return;
  (async () => {
    const { ok, data } = await emitAck(s, 'getTableList', {});
    if (!ok || !Array.isArray(data)) return;
    const tables = data as Array<{ id: number; started: boolean; p1: any; p2: any }>;
    const free = tables.filter(t => !t.started);
    // 入座优先级(让真人随时有对手可约 + 保留机器人互对供旁观):
    // 1) 桌上已有 1 个真人(陪真人打) 2) 空桌独占等真人(限量 SOLO_WAIT_CAP)
    // 3) 桌上已有 1 个机器人(机器互打,限量 MAX_BOT_VS_BOT) 4) 闲逛
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
    let target: any = null;
    let slot: 'p1' | 'p2' = 'p1';
    if (humanWait.length > 0) {
      target = humanWait[0];
      slot = !seatTaken(target.p1) ? 'p1' : 'p2';
    } else if (empty.length > 0 && soloWait < SOLO_WAIT_CAP) {
      target = empty[Math.floor(Math.random() * empty.length)];
      slot = 'p1';
    } else if (botWait.length > 0 && bvc < MAX_BOT_VS_BOT) {
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
    if (!bot.socket || bot.state !== 'idle') return;
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

function seatTaken(seat: any): boolean {
  return !!(seat && seat.name !== null);
}

/** 座位上的名字是否某个机器人的昵称(用于区分真人/机器人) */
function seatIsBot(seat: any): boolean {
  if (!seat || !seat.name) return false;
  return bots.some(b => b.nickname === seat.name);
}

/** 当前机器人互相对局数 */
function botVsBotCount(tables: Array<{ started: boolean; p1: any; p2: any }>): number {
  return tables.filter(t => t.started && seatIsBot(t.p1) && seatIsBot(t.p2)).length;
}

// ============ 对局 AI ============
function botEmergency(bot: BotInstance, room: any): void {
  const hand = room.you?.handCards || [];
  const heal = hand.find((c: any) => c.category === 'function_hp');
  if (heal) emitAck(bot.socket!, 'playCard', { cardUid: heal.uid });
  else emitAck(bot.socket!, 'giveUpEmergencyHeal', {});
}

function botDefend(bot: BotInstance, room: any): void {
  const hand = room.you?.handCards || [];
  // 八卦阵反弹(非绝杀时)
  const bagua = hand.find((c: any) => c.category === 'formation' && c.id.startsWith('bagua'));
  if (bagua && bot.lastAttackPower > 0) {
    emitAck(bot.socket!, 'playCard', { cardUid: bagua.uid });
    return;
  }
  // 出一个防具(最高防御),下个 roomState 若仍需防御则继续出或确认
  const armors = hand
    .filter((c: any) => c.category === 'armor')
    .sort((a: any, b: any) => b.value - a.value);
  if (armors.length > 0) {
    emitAck(bot.socket!, 'playCard', { cardUid: armors[0].uid });
    return;
  }
  emitAck(bot.socket!, 'confirmDefend', {});
}

function botAction(bot: BotInstance, room: any): void {
  const hand = room.you?.handCards || [];
  const qi = room.you?.qi ?? 0;
  const hp = room.you?.hp ?? 8;
  const oppHp = room.opponent?.hp ?? 8;
  const myPid = room.yourPid;

  // 0. 残血/缺血有锦囊 → 用锦囊(随机)
  const pouchOpts = (room.you?.pouches || []).flatMap((p: any) =>
    (p.options || []).map((o: any) => ({ sid: p.strategistId, pouch: o.pouch })),
  );
  if (pouchOpts.length > 0) {
    const po = pouchOpts[0];
    emitAck(bot.socket!, 'usePouch', { strategistId: po.sid, pouch: po.pouch, choice: '' });
    return;
  }
  // 1. 绝杀: 对手低血
  const ult = hand.find((c: any) => c.category === 'ultimate');
  if (ult && oppHp <= 3) {
    emitAck(bot.socket!, 'playCard', { cardUid: ult.uid });
    return;
  }
  // 2. 残血补血
  if (hp <= 2) {
    const heal = hand.find((c: any) => c.category === 'function_hp');
    if (heal) { emitAck(bot.socket!, 'playCard', { cardUid: heal.uid }); return; }
  }
  // 3. 气少补气
  if (qi < 3) {
    const q = hand.find((c: any) => c.category === 'function_qi');
    if (q) { emitAck(bot.socket!, 'playCard', { cardUid: q.uid }); return; }
  }
  // 4. 武将攻击(能负担的最高攻)
  const generals = hand
    .filter((c: any) => c.category === 'general')
    .sort((a: any, b: any) => b.value - a.value);
  const general = generals.find((g: any) => qi >= (g.cost || 0));
  if (general) { emitAck(bot.socket!, 'playCard', { cardUid: general.uid }); return; }
  // 5. 智者牌(白嫖锦囊)
  const strategist = hand.find((c: any) => c.category === 'strategist');
  if (strategist) { emitAck(bot.socket!, 'playCard', { cardUid: strategist.uid }); return; }
  // 6. 兵法/阵法
  const aux = hand.find((c: any) => c.category === 'strategy' || c.category === 'formation' || c.category === 'charm');
  if (aux) { emitAck(bot.socket!, 'playCard', { cardUid: aux.uid }); return; }
  // 7. 补气按钮
  if (!room.you?.usedNormalQi) { emitAck(bot.socket!, 'useBonus', { type: 'normal' }); return; }
  if (!room.you?.usedBigQi) { emitAck(bot.socket!, 'useBonus', { type: 'big' }); return; }
  // 8. 结束行动
  emitAck(bot.socket!, 'readyNextTurn', {});
  void myPid;
}

/** 连接机器人 socket 并挂载 AI 监听 */
function connectBot(bot: BotInstance, serverUrl: string): void {
  const token = createBotToken(bot.uid);
  const socket = createClient(serverUrl, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
  });
  bot.socket = socket;
  bot.state = 'idle';
  bot.lastAttackPower = 0;
  bot.gameOverHandled = false;

  socket.on('connect', () => {
    if (socket.id) {
      activeBotSocketIds.add(socket.id);
      bot.connId = socket.id;
    }
    console.log(`[BOT] ${bot.nickname} 上线 (${socket.id}) · 活跃 ${activeBotSocketIds.size}/${currentMaxActive()}`);
    lobbyLoop(bot);
  });

  socket.on('connect_error', (err: Error) => {
    console.log(`[BOT] ${bot.nickname} 连接失败: ${err.message}`);
  });

  socket.on('roomState', (room: any) => {
    if (!room || room.gameOver) return;
    bot.myPid = room.yourPid ?? null;
    if (room.started) bot.state = 'playing';
    if (room.emergencyHealPid === room.yourPid) {
      botEmergency(bot, room);
      return;
    }
    if (room.defensePid === room.yourPid) {
      botDefend(bot, room);
      return;
    }
    if (room.turnPhase === 'action' && room.activePid === room.yourPid && room.actionEnded && !room.actionEnded[room.yourPid]) {
      // 延后决策,避免与防御状态竞争
      setTimeout(() => {
        if (bot.socket && !bot.socket.disconnected) botAction(bot, room);
      }, 500 + Math.random() * 900);
    }
  });

  socket.on('eventPlayCard', (d: any) => {
    if (d && typeof d.attackPower === 'number') bot.lastAttackPower = d.attackPower;
  });

  socket.on('eventGameStart', () => {
    bot.state = 'playing';
    bot.lastAttackPower = 0;
  });

  socket.on('eventGameOver', () => {
    if (bot.gameOverHandled) return;
    bot.gameOverHandled = true;
    // 每日对局计数(跨日重置)
    const today = new Date().toISOString().slice(0, 10);
    if (bot.dayKey !== today) {
      bot.dayKey = today;
      bot.gamesToday = 0;
    }
    bot.gamesToday += 1;
    // 当日对局达到上限 → 不再激活,直接休眠
    if (bot.gamesToday >= DAILY_GAME_CAP) {
      console.log(`[BOT] ${bot.nickname} 今日对局已达 ${DAILY_GAME_CAP} 局上限,今日不再激活`);
      sleepBot(bot);
      return;
    }
    // 局后: 稍等重开(再来一局);失败则离桌回大厅
    schedule(bot, () => {
      emitAck(socket, 'resetRoom', {}).then((r) => {
        if (!r.ok) {
          emitAck(socket, 'standUp', {}).then(() => {
            bot.state = 'idle';
            bot.gameOverHandled = false;
            lobbyLoop(bot);
          });
        } else {
          bot.gameOverHandled = false;
        }
      });
    }, 6000);
  });

  socket.on('eventPlayerLeave', (d: any) => {
    // 对局中对手离开 → 不跟"幽灵"继续打,稍后离桌回大厅
    if (bot.state === 'playing' && d && typeof d.slot === 'string' && bot.myPid !== null) {
      const oppSlot: 'p1' | 'p2' = bot.myPid === 0 ? 'p2' : 'p1';
      if (d.slot === oppSlot) {
        schedule(bot, () => {
          emitAck(socket, 'standUp', {}).then(() => {
            bot.state = 'idle';
            bot.gameOverHandled = false;
            lobbyLoop(bot);
          });
        }, 3000);
      }
    }
  });

  socket.on('disconnect', (reason: string) => {
    if (bot.connId) activeBotSocketIds.delete(bot.connId);
    bot.connId = null;
    bot.socket = null;
    bot.state = 'sleep';
    if (bot.lobbyTimer) clearTimeout(bot.lobbyTimer);
    console.log(`[BOT] ${bot.nickname} 离线 · 原因=${reason}`);
  });
}

/** 唤醒一个沉睡机器人 */
function wakeBot(bot: BotInstance, serverUrl: string): void {
  if (bot.state !== 'sleep' || !bot.socket) {
    if (!bot.socket) connectBot(bot, serverUrl);
    return;
  }
  connectBot(bot, serverUrl);
}

/** 休眠一个机器人(仅非对局中) */
function sleepBot(bot: BotInstance): boolean {
  if (bot.state === 'sleep' || bot.state === 'playing') return false;
  if (bot.lobbyTimer) clearTimeout(bot.lobbyTimer);
  try {
    bot.socket?.disconnect();
  } catch { /* ignore */ }
  bot.state = 'sleep';
  return true;
}

/** 轮换: 按当前时段目标活跃数(黄金多/夜间0)调整,并遵守每日对局上限 */
function rotateActive(serverUrl: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const target = currentMaxActive();
  const activeNow = () => bots.filter(b => b.state !== 'sleep').length;
  // 超限 → 休眠空闲的(idle/sitting 且非对局)
  while (activeNow() > target) {
    const idle = bots.find(b => b.state !== 'sleep' && b.state !== 'playing');
    if (!idle) break;
    sleepBot(idle);
  }
  // 未满 → 唤醒沉睡的(跳过当日达上限的)
  while (activeNow() < target) {
    const sleeping = bots.find(b => {
      if (b.state !== 'sleep') return false;
      if (b.dayKey === today && b.gamesToday >= DAILY_GAME_CAP) return false;
      return true;
    });
    if (!sleeping) break;
    wakeBot(sleeping, serverUrl);
  }
}

/** 事件循环停滞检测(诊断用) */
function startLoopWatchdog(): void {
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
export function initBotSystem(serverUrl: string): void {
  startLoopWatchdog();
  const all = ensureBots();
  dailyAddBots();
  const refreshed = listBots().map(b => ({ uid: `u${b.id}`, nickname: b.nickname }));
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
      gameOverHandled: false,
      gamesToday: 0,
      dayKey: new Date().toISOString().slice(0, 10),
      lastTableId: null,
    });
  }
  console.log(`[BOT] 模拟玩家系统启动 · 共 ${bots.length} 个(当前时段目标活跃 ${currentMaxActive()})`);
  // 唤醒第一批(遵守当前时段上限与每日对局上限)
  const today = new Date().toISOString().slice(0, 10);
  for (const b of bots) {
    if (bots.filter(x => x.state !== 'sleep').length >= currentMaxActive()) break;
    if (b.dayKey === today && b.gamesToday >= DAILY_GAME_CAP) continue;
    wakeBot(b, serverUrl);
  }
  // 周期轮换(休眠空闲 / 唤醒沉睡)
  const t = setInterval(() => rotateActive(serverUrl), ROTATE_MS);
  t.unref?.();
}

/** 关闭所有机器人(服务退出时调用) */
export function shutdownBots(): void {
  for (const b of bots) {
    if (b.lobbyTimer) clearTimeout(b.lobbyTimer);
    try { b.socket?.disconnect(); } catch { /* ignore */ }
    b.socket = null;
    b.state = 'sleep';
  }
  activeBotSocketIds.clear();
}

/** 当前活跃机器人 socket id 集合 */
export function getBotSocketIds(): Set<string> {
  return activeBotSocketIds;
}

/** 判断 socket id 是否机器人 */
export function isBotSocketId(socketId: string): boolean {
  return activeBotSocketIds.has(socketId);
}

/** 判断 uid 是否模拟玩家(供表格/监控用) */
export function isBotUid(uid: string | null): boolean {
  if (!uid) return false;
  return isBotUser(uid);
}
