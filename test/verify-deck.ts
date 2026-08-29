/**
 * 牌库数量与配置自检（v4.3：140 张初始牌库 + 15 张限定卡）
 * 运行：npm run test:deck
 */
import { buildFullDeck, buildLimitedCards, assertDeckSize, getPouchChoices, CARD_COLORS } from '../assets/scripts/core/cards';
import { CardCategory, PouchType, StrategistType } from '../assets/scripts/core/types';

function main(): void {
  const deck = buildFullDeck();
  assertDeckSize(deck);
  console.log(`✓ 牌库总数：${deck.length} 张（预期 132）`);

  // 分类统计
  const counter: Record<string, { count: number; expected: number; names: Set<string> }> = {
    [CardCategory.General]:    { count: 0, expected: 44, names: new Set() },
    [CardCategory.Armor]:      { count: 0, expected: 38, names: new Set() },
    [CardCategory.FunctionQi]: { count: 0, expected: 12, names: new Set() },
    [CardCategory.FunctionHp]: { count: 0, expected: 19, names: new Set() },
    [CardCategory.Strategy]:   { count: 0, expected: 3, names: new Set() },
    [CardCategory.Ultimate]:   { count: 0, expected: 5, names: new Set() },
    [CardCategory.Formation]:  { count: 0, expected: 6, names: new Set() },
    [CardCategory.Charm]:      { count: 0, expected: 2, names: new Set() },
    [CardCategory.Strategist]: { count: 0, expected: 3, names: new Set() },
  };
  for (const c of deck) {
    counter[c.category].count++;
    counter[c.category].names.add(c.name);
  }

  console.log('\n=== 分类对账 ===');
  let allOk = true;
  for (const cat of Object.keys(counter)) {
    const info = counter[cat];
    const ok = info.count === info.expected;
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} ${CARD_COLORS[cat as CardCategory].label.padEnd(10)} 数量 ${String(info.count).padStart(2)} / ${info.expected} · 唯一名 ${info.names.size} 种：${[...info.names].join('、')}`);
  }

  // 武将攻击/耗气汇总
  const generals = deck.filter(c => c.category === CardCategory.General);
  const totalAtk = generals.reduce((s, c) => s + c.value, 0);
  const totalCost = generals.reduce((s, c) => s + c.cost, 0);
  console.log(`\n=== 武将统计 ===`);
  console.log(`✓ 全武将基础总攻击：${totalAtk}（预期 102）`);
  console.log(`✓ 全武将基础总耗气：${totalCost}（预期 101）`);

  // 一流/二流/盾系列点名
  const names = new Set(generals.map(g => g.name));
  const firstRate = ['许褚', '典韦', '徐晃'];
  const secondRate = ['颜良', '文丑', '张辽', '华雄', '庞德'];
  for (const n of firstRate) {
    const ok = names.has(n);
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} 一流武将 ${n}（攻4耗4）`);
  }
  for (const n of secondRate) {
    const ok = names.has(n);
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} 二流武将 ${n}（攻3耗3）`);
  }

  // 盾系列防具
  const shieldNames = ['木盾', '铜盾', '铁盾', '钢盾'];
  for (const n of shieldNames) {
    const ok = deck.some(c => c.category === CardCategory.Armor && c.name === n);
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} 盾系列 ${n}`);
  }

  // 防具总防御（甲42 + 盾35）
  const armors = deck.filter(c => c.category === CardCategory.Armor);
  const totalDef = armors.reduce((s, c) => s + c.value, 0);
  console.log(`✓ 全防具总防御值：${totalDef}（预期 77）`);

  // 补气总量
  const qiCards = deck.filter(c => c.category === CardCategory.FunctionQi);
  const totalQi = qiCards.reduce((s, c) => s + c.value, 0);
  console.log(`✓ 卡牌直接总补气：${totalQi}（预期 32）`);

  // 补血总量
  const hpCards = deck.filter(c => c.category === CardCategory.FunctionHp);
  const totalHp = hpCards.reduce((s, c) => s + c.value, 0);
  console.log(`✓ 全补血总回血量：${totalHp}（预期 31）`);

  // 绝杀总穿透
  const ults = deck.filter(c => c.category === CardCategory.Ultimate);
  const totalUlt = ults.reduce((s, c) => s + c.value, 0);
  console.log(`✓ 绝杀总穿透伤害：${totalUlt}（预期 6）`);

  // 智者牌
  const strategists = deck.filter(c => c.category === CardCategory.Strategist);
  console.log(`✓ 智者牌：${strategists.map(s => s.name).join('、')}（预期 3 张）`);

  // 限定卡：15 张（不在初始牌库）
  const limited = buildLimitedCards();
  console.log(`✓ 限定产出卡：${limited.length} 张（预期 15）`);
  const limitedNames = limited.map(c => c.name);
  console.log(`  限定卡名单：${[...new Set(limitedNames)].join('、')}`);
  // 限定卡必须不在初始牌库
  const deckIds = new Set(deck.map(d => d.id));
  for (const l of limited) {
    if (deckIds.has(l.id)) {
      allOk = false;
      console.log(`✗ 限定卡 ${l.id} 不应出现在初始牌库`);
    }
  }

  // 锦囊产出表完整性
  const pouchChecks: Array<[StrategistType, PouchType, number]> = [
    [StrategistType.ZhugeLiang, PouchType.Que, 3],
    [StrategistType.ZhugeLiang, PouchType.Can, 5],
    [StrategistType.ZhugeLiang, PouchType.Ji, 2],
    [StrategistType.ZhouYu, PouchType.Que, 2],
    [StrategistType.ZhouYu, PouchType.Can, 2],
    [StrategistType.SimaYi, PouchType.Que, 2],
    [StrategistType.SimaYi, PouchType.Can, 3],
  ];
  for (const [s, p, n] of pouchChecks) {
    const defs = getPouchChoices(s, p);
    const ok = defs.length === n;
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} 锦囊产出 ${s}·${p}：${defs.length} 项（预期 ${n}）`);
  }

  // ID 唯一性
  const ids = new Set<string>();
  let dup = 0;
  for (const c of deck) {
    if (ids.has(c.id)) { dup++; console.log(`✗ 重复 ID：${c.id}`); }
    ids.add(c.id);
  }
  console.log(`\n✓ 卡牌 ID 唯一性：${dup === 0 ? '通过' : `${dup} 个重复`}`);

  if (allOk && totalAtk === 102 && totalCost === 101 && totalDef === 77 && totalQi === 32 && totalHp === 31 && totalUlt === 6) {
    console.log('\n🎉 全部对账通过，牌库配置正确！');
  } else {
    console.log('\n⚠️ 存在对账不一致，请检查');
    process.exit(1);
  }
}

main();
