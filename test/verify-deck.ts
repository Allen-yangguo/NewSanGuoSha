/**
 * 牌库数量与配置自检
 * 运行：npm run test:deck
 */
import { buildFullDeck, assertDeckSize, CARD_COLORS } from '../assets/scripts/core/cards';
import { CardCategory } from '../assets/scripts/core/types';

function main(): void {
  const deck = buildFullDeck();
  assertDeckSize(deck);
  console.log(`✓ 牌库总数：${deck.length} 张（预期 104）`);

  // 分类统计
  const counter: Record<string, { count: number; expected: number; names: Set<string> }> = {
    [CardCategory.General]:    { count: 0, expected: 38, names: new Set() },
    [CardCategory.Armor]:      { count: 0, expected: 23, names: new Set() },
    [CardCategory.FunctionQi]: { count: 0, expected: 12, names: new Set() },
    [CardCategory.FunctionHp]: { count: 0, expected: 19, names: new Set() },
    [CardCategory.Strategy]:   { count: 0, expected: 3, names: new Set() },
    [CardCategory.Ultimate]:   { count: 0, expected: 5, names: new Set() },
    [CardCategory.Formation]:  { count: 0, expected: 4, names: new Set() },
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
  console.log(`✓ 全武将基础总攻击：${totalAtk}（预期 81）`);
  console.log(`✓ 全武将基础总耗气：${totalCost}（预期 80）`);

  // 防具总防御
  const armors = deck.filter(c => c.category === CardCategory.Armor);
  const totalDef = armors.reduce((s, c) => s + c.value, 0);
  console.log(`✓ 全防具总防御值：${totalDef}（预期 46）`);

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

  // ID 唯一性
  const ids = new Set<string>();
  let dup = 0;
  for (const c of deck) {
    if (ids.has(c.id)) { dup++; console.log(`✗ 重复 ID：${c.id}`); }
    ids.add(c.id);
  }
  console.log(`\n✓ 卡牌 ID 唯一性：${dup === 0 ? '通过' : `${dup} 个重复`}`);

  if (allOk && totalAtk === 81 && totalCost === 80 && totalDef === 46 && totalQi === 32 && totalHp === 31 && totalUlt === 6) {
    console.log('\n🎉 全部对账通过，牌库配置正确！');
  } else {
    console.log('\n⚠️ 存在对账不一致，请检查');
    process.exit(1);
  }
}

main();
