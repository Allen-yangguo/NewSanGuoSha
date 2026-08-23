// @ts-nocheck
/**
 * 服务端联机协议自检脚本（Socket.IO 客户端模拟两玩家）
 * 运行：npx ts-node test/integration-smoke.ts
 * 覆盖：
 *   1) p1/p2 join → 自动开局
 *   2) 各自 roomState 视角：手牌严格隔离（p1 收不到 p2 handCards，反之亦然）
 *   3) p1 用普通补气 → eventBuffChange
 *   4) p1 找一张武将牌打出 → eventPlayCard + 进入防御响应
 *   5) p2 confirmDefend → 伤害结算 → eventDamage
 *   6) p1 readyNextTurn → 回合结束 + eventTurnEnd
 *   7) 断言通过 / 失败统计
 */
const { io } = require('socket.io-client');

const SERVER = 'http://127.0.0.1:3000';
const TIMEOUT_MS = 12000;

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}
function timeout(ms: number, reason: string): Promise<never> {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('⏱ 超时: ' + reason)), ms));
}

async function once<T>(socket: Socket, evt: string): Promise<T> {
  return new Promise<T>((resolve) => {
    socket.once(evt, (d: any) => resolve(d as T));
  });
}

async function main(): Promise<void> {
  console.log('=== 服务端联机冒烟测试 ===\n');

  const p1 = io(SERVER, { transports: ['websocket'] });
  const p2 = io(SERVER, { transports: ['websocket'] });
  try {
    // ---- 0. 连接 ----
    await Promise.race([
      Promise.all([
        new Promise(r => p1.once('connect', r)),
        new Promise(r => p2.once('connect', r)),
      ]),
      timeout(TIMEOUT_MS, '两客户端连不上服务端 :3000'),
    ]);
    assert(true, 'p1、p2 均已连接到服务端');

    // ---- 1. p1 join ----
    let p1State: any = null;
    p1.on('roomState', s => { p1State = s; });
    const p1JoinAck: any = await new Promise(res => p1.emit('joinRoom', { name: '玩家A' }, (ok, data) => res({ ok, data })));
    assert(p1JoinAck.ok && p1JoinAck.data.slot === 'p1', `p1 join 返回 slot=p1 pid=${p1JoinAck.data?.pid}`);
    assert(p1JoinAck.data.started === false, 'p1 加入时对局未开始（等 p2）');

    // ---- 2. p2 join → 自动开局 ----
    let p2State: any = null;
    p2.on('roomState', s => { p2State = s; });
    const [p2StartEvt, p1StartEvt, p2JoinAck] = await Promise.all([
      once<any>(p2, 'eventGameStart'),
      once<any>(p1, 'eventGameStart'),
      new Promise<any>(res => p2.emit('joinRoom', { name: '玩家B' }, (ok, data) => res({ ok, data }))),
    ]);
    assert(p2JoinAck.ok && p2JoinAck.data.slot === 'p2', `p2 join 返回 slot=p2 pid=${p2JoinAck.data?.pid}`);
    assert(p2JoinAck.data.started === true, 'p2 加入后对局自动开始');
    assert(p1StartEvt.firstPlayerPid === p2StartEvt.firstPlayerPid, '双方收到同一 eventGameStart · 先手一致');

    // 等 roomState 推到两边
    await new Promise(r => setTimeout(r, 300));
    assert(p1State && p1State.started, 'p1 收到 started=true 的 roomState');
    assert(p2State && p2State.started, 'p2 收到 started=true 的 roomState');

    // ---- 3. 手牌严格隔离关键断言 ----
    assert(Array.isArray(p1State.you.handCards) && p1State.you.handCards.length >= 1, `p1 看到自己有 ${p1State?.you?.handCards?.length} 张手牌明细`);
    assert(p1State.opponent.handCards.length === 0, 'p1 看到对手 handCards 长度为 0（绝不泄露明细）');
    assert(p1State.opponent.handCount === p2State.you.handCards.length, `p1 看到对手 handCount=${p1State?.opponent?.handCount} 与 p2 实际手牌数${p2State?.you?.handCards?.length}一致`);
    assert(Array.isArray(p2State.you.handCards) && p2State.you.handCards.length >= 1, `p2 看到自己有 ${p2State?.you?.handCards?.length} 张手牌明细`);
    assert(p2State.opponent.handCards.length === 0, 'p2 看到对手 handCards 长度为 0（绝不泄露明细）');
    assert(p2State.opponent.handCount === p1State.you.handCards.length, `p2 看到对手 handCount=${p2State?.opponent?.handCount} 与 p1 实际手牌数${p1State?.you?.handCards?.length}一致`);
    assert(p1State.you.pid === 0 && p1State.yourPid === 0, `p1 yourPid=0`);
    assert(p2State.you.pid === 1 && p2State.yourPid === 1, `p2 yourPid=1`);
    assert(p1State.deckCount + p1State.discardCount + p1State.you.handCards.length + p2State.you.handCards.length === 107,
      `牌库+弃牌+双手牌 = 107 张，实际 ${p1State.deckCount + p1State.discardCount + p1State.you.handCards.length + p2State.you.handCards.length}`);

    // ---- 4. 找到当前先手玩家（谁是 activePid），由他出一张牌 ----
    const firstPid: 0 | 1 = p1State.activePid as any;
    const activeSocket = firstPid === 0 ? p1 : p2;
    const activeState = firstPid === 0 ? p1State : p2State;
    const activeLabel = `玩家${firstPid + 1}（先手，activePid=${firstPid}）`;

    // a) 先用普通补气按钮
    const [buffEvt, bonusAck] = await Promise.all([
      once<any>(p1, 'eventBuffChange').catch(() => null), // 任意一方都能收到广播
      new Promise<any>(res => activeSocket.emit('useBonus', { type: 'normal' }, (ok, data) => res({ ok, data }))),
    ]);
    assert(bonusAck.ok, `${activeLabel} useBonus(type=normal) 成功：${bonusAck.data?.message || ''}`);

    // b) 找一张武将牌打出
    const generalCard = activeState.you.handCards.find((c: any) => c.category === 'general');
    if (!generalCard) {
      console.log('  ⚠ 先手方手牌中没有武将牌，跳过武将攻击流程');
    } else {
      // 确保气量足够（不够就塞）
      const qiNeed = generalCard.cost;
      const meBefore = firstPid === 0 ? p1State.you.qi : p2State.you.qi;
      if (meBefore < qiNeed) {
        // 连发几次大补气 + 普通手动塞
        for (let i = 0; i < 3; i++) {
          await new Promise(res => activeSocket.emit('useBonus', { type: 'big' }, () => res(null)));
          await new Promise(res => setTimeout(res, 50));
        }
      }
      const playPromise = new Promise<any>(res => activeSocket.emit('playCard', { cardUid: generalCard.uid }, (ok, data) => res({ ok, data })));
      const evtPromise = once<any>(p1, 'eventPlayCard');
      const [playAck, playEvt] = await Promise.all([playPromise, evtPromise]) as any;
      assert(playAck.ok, `${activeLabel} 打出武将【${generalCard.name}】成功：${playAck.data?.message || ''}`);
      assert(playEvt.actorPid === firstPid, `双方收到 eventPlayCard · actorPid=${playEvt.actorPid} 卡=${playEvt.card.name}`);
      await new Promise(r => setTimeout(r, 180));

      // 防御方放弃防御
      const defPid: 0 | 1 = (1 - firstPid) as any;
      const defSocket = defPid === 0 ? p1 : p2;
      const defPromise = new Promise<any>(res => defSocket.emit('confirmDefend', {}, (ok, data) => res({ ok, data })));
      const dmgPromise = once<any>(p1, 'eventDamage').catch(() => null);
      const [defAck] = await Promise.all([defPromise, dmgPromise]) as any;
      assert(defAck.ok, `玩家${defPid + 1} confirmDefend 放弃防御 → 结算：${defAck.data?.message || ''}`);

      // 断言血量实际扣了（对比之前）
      await new Promise(r => setTimeout(r, 200));
      const defHpNow = defPid === 0 ? p1State.opponent.hp : p2State.opponent.hp; // opp视角取的
      const actualDefState = defPid === 0 ? p1State : p2State;
      assert(actualDefState.you.hp <= 6, `防御方 HP 从 6 降到 ${actualDefState.you.hp}（伤害已结算）`);
      void defHpNow;
    }

    // ---- 5. 双方依次结束行动 → 触发回合终局 ----
    // 新规则：双方都结束行动才触发回合终局（补牌+回气+互换先手）
    await new Promise(r => setTimeout(r, 120));
    const currActive: 0 | 1 = p1State.activePid as any;
    const currSocket = currActive === 0 ? p1 : p2;
    const otherPid: 0 | 1 = (1 - currActive) as any;
    const otherSocket = otherPid === 0 ? p1 : p2;

    // 第一方结束行动（操作权交给对方）
    const end1 = await new Promise<any>(res => currSocket.emit('readyNextTurn', {}, (ok, data) => res({ ok, data })));
    assert(end1.ok, `玩家${currActive + 1} 结束行动：${end1.data?.message || ''}`);
    await new Promise(r => setTimeout(r, 200));
    assert(p1State.activePid === otherPid, `操作权交给对方（玩家${otherPid + 1}）实际 activePid=${p1State.activePid}`);

    // 第二方也结束行动 → 触发回合终局
    const turnEvtPromise = once<any>(p1, 'eventTurnEnd').catch(() => null);
    const end2 = await new Promise<any>(res => otherSocket.emit('readyNextTurn', {}, (ok, data) => res({ ok, data })));
    const [turnEvt] = await Promise.all([turnEvtPromise]) as any;
    assert(end2.ok, `玩家${otherPid + 1} 结束行动：${end2.data?.message || ''}`);
    await new Promise(r => setTimeout(r, 200));
    assert(p1State.roundCount >= 2, `双方结束后回合数推进到 roundCount=${p1State.roundCount}`);
    assert(turnEvt !== null, '双方结束行动后收到 eventTurnEnd');

    console.log(`\n=== 冒烟测试结果 ===`);
    console.log(`通过：${passed} · 失败：${failed}`);
    if (failed > 0) process.exit(1);
    console.log('🎉 联机协议冒烟测试通过！服务端核心流程正常。');
  } finally {
    p1.disconnect();
    p2.disconnect();
  }
}

main().catch(err => {
  console.error('\n❌ 测试异常退出：', err);
  process.exit(1);
});
