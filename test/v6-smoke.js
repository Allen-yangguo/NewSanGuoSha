// v6.0 端到端验证: 真人坐入等待的机器人桌对战 + 旁观机器人互对局
const { io } = require('socket.io-client');

const SERVER = 'http://127.0.0.1:10000';
let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.log('  ✗ ' + m); } };

async function guestToken() {
  const r = await fetch(SERVER + '/api/auth/guest', { method: 'POST' });
  const j = await r.json();
  if (!j.ok || !j.token) throw new Error('guest failed');
  return j.token;
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(SERVER, { transports: ['websocket'], auth: { token } });
    const t = setTimeout(() => reject(new Error('connect timeout')), 8000);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('connect_error', (e) => { clearTimeout(t); reject(new Error(e.message)); });
  });
}
const emitAck = (s, evt, payload) => new Promise(res => s.emit(evt, payload, (ok, data) => res({ ok, data })));
const waitEvent = (s, evt, ms = 8000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout ' + evt)), ms);
  s.once(evt, d => { clearTimeout(t); resolve(d); });
});

(async () => {
  // ===== 1. 真人 vs 机器人 =====
  console.log('=== 真人落座对战机器人 ===');
  const tReal = await guestToken();
  const real = await connect(tReal);
  let realState = null;
  real.on('roomState', s => realState = s);
  const { data: tables } = await emitAck(real, 'getTableList', {});
  // 优先找「机器人独占等待」的桌;低谷时段可能没有 → 退化为坐空桌等机器人来陪
  let target = tables.find(t => !t.started && ((t.p1.name && !t.p2.name) || (t.p2.name && !t.p1.name)));
  if (!target) {
    console.log('  ⚠ 无机器人独占等待桌(低谷时段),尝试坐空桌等机器人');
    target = tables.find(t => !t.started && !t.p1.name && !t.p2.name);
  }
  assert(!!target, '有空桌可坐');
  if (!target) { process.exit(1); }
  const botName = (target.p1.name || target.p2.name) || '（等待机器人入座）';
  const mySlot = target.p1.name ? 'p2' : 'p1';
  const sit = await emitAck(real, 'sitDown', { tableId: target.id, slot: mySlot, name: '真人测试' });
  assert(sit.ok, `真人落座桌${target.id}(${mySlot})，对面是「${botName}」`);
  const rd = await emitAck(real, 'ready', {});
  assert(rd.ok, '真人准备');
  // 等开局: 机器人入座+准备(思考节奏 0.5~3.5s + 准备延迟),最多 25s
  let gameStarted = false;
  for (let i = 0; i < 30; i++) {
    if (realState && realState.started) { gameStarted = true; break; }
    await new Promise(r => setTimeout(r, 800));
  }
  assert(gameStarted, '对局开始（真人 vs 机器人）');
  if (!gameStarted) { real.disconnect(); process.exit(1); }
  assert(realState.opponent && realState.opponent.name !== null, `对手已入座「${realState.opponent?.name}」(真人无感知)`);
  // 真人行动: 若轮到真人且手牌有牌,打一张
  if (realState.turnPhase === 'action' && realState.activePid === realState.yourPid) {
    const card = realState.you.handCards.find(c => c.category !== 'general' || realState.you.qi >= c.cost);
    if (card) {
      const pr = await emitAck(real, 'playCard', { cardUid: card.uid });
      assert(pr.ok, '真人出牌成功');
    } else {
      console.log('  ⚠ 无合适手牌,跳过出牌');
    }
  }
  real.disconnect();

  // ===== 2. 旁观机器人互对局 =====
  console.log('\n=== 旁观机器人互对局 ===');
  const tSp = await guestToken();
  const sp = await connect(tSp);
  let spState = null;
  sp.on('roomState', s => spState = s);
  const { data: tables2 } = await emitAck(sp, 'getTableList', {});
  const botGame = tables2.find(t => t.started);
  assert(!!botGame, '存在进行中的对局(含机器人互对)可旁观');
  if (!botGame) { process.exit(1); }
  const spR = await emitAck(sp, 'spectate', { tableId: botGame.id, pid: 0 });
  assert(spR.ok, `旁观桌${botGame.id} p1 视角`);
  await new Promise(r => setTimeout(r, 800));
  assert(spState && spState.started, '旁观收到对局状态');
  assert(spState.yourPid === 0 && spState.yourSlot === 'p1', '旁观视角 = p1');
  console.log('  DEBUG you:', JSON.stringify({ pid: spState.you && spState.you.pid, handCount: spState.you && spState.you.handCount, handCards: spState.you && spState.you.handCards.map(c => c.name).slice(0, 3), opponent: spState.opponent && spState.opponent.name }));
  assert(spState.you.handCards.length > 0, '旁观可看到该方手牌(p1 视角)');
  // 旁观不可出牌
  const badPlay = spState.you.handCards[0];
  const pr2 = await emitAck(sp, 'playCard', { cardUid: badPlay.uid });
  assert(!pr2.ok, '旁观者不能出牌(服务端拒绝)');
  const ex = await emitAck(sp, 'spectateExit', {});
  assert(ex.ok, '退出旁观');
  sp.disconnect();

  console.log(`\n通过：${passed} · 失败：${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
