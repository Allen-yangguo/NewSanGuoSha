<!--
  桌面展示区（牌桌 · 固定高度）
  - 固定高度单行横向展示，最多同时可见 10 张
  - 超出 10 张时，最旧的牌折叠成左侧「牌堆」按钮（点击展开查看）
  - 最新打出的牌高亮（放大+发光）；自己/对手出牌有区分色
  - 牌桌区始终占位（空桌也渲染），避免布局上下跳动
-->
<template>
  <div class="played-zone">
    <div class="pz-scroll" ref="scrollEl">
      <!-- 折叠的旧牌堆 -->
      <div class="fold-pile" v-if="foldedCount > 0" @click="showFolded = !showFolded" :title="'点击展开查看 ' + foldedCount + ' 张旧牌'">
        <div class="pile-stack">
          <span class="pile-count">+{{ foldedCount }}</span>
        </div>
        <span class="pile-label">折叠</span>
      </div>

      <!-- 可见牌（最多 10 张） -->
      <div
        v-for="(c, i) in visibleCards"
        :key="c.key"
        class="played-card"
        :class="[
          `cat-${c.card.category}`,
          c.isMine ? 'mine' : 'opp',
          { latest: i === visibleCards.length - 1 }
        ]"
      >
        <span class="pc-title">{{ c.card.name }}</span>
        <span v-if="c.card.id === 'bagua'" class="pc-bagua" aria-label="八卦">
          <svg viewBox="0 0 40 40" class="bagua-svg">
            <g class="trigrams" fill="none" stroke="#2F4644" stroke-width="1.4">
              <g transform="translate(20,20) rotate(0)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
              <g transform="translate(20,20) rotate(45)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
              <g transform="translate(20,20) rotate(90)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-0.6" y1="-10.5" x2="0.6" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
              <g transform="translate(20,20) rotate(135)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="-1" y2="-10.5"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
              <g transform="translate(20,20) rotate(180)"><line x1="-3" y1="-13" x2="-1" y2="-13"/><line x1="1" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="-1" y2="-10.5"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="-1" y2="-8"/><line x1="1" y1="-8" x2="3" y2="-8"/></g>
              <g transform="translate(20,20) rotate(225)"><line x1="-3" y1="-13" x2="-1" y2="-13"/><line x1="1" y1="-13" x2="3" y2="-13"/><line x1="-0.6" y1="-10.5" x2="0.6" y2="-10.5"/><line x1="-3" y1="-8" x2="-1" y2="-8"/><line x1="1" y1="-8" x2="3" y2="-8"/></g>
              <g transform="translate(20,20) rotate(270)"><line x1="-3" y1="-13" x2="-1" y2="-13"/><line x1="1" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="-1" y2="-8"/><line x1="1" y1="-8" x2="3" y2="-8"/></g>
              <g transform="translate(20,20) rotate(315)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="-1" y2="-10.5"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
            </g>
            <g class="taiji">
              <circle cx="20" cy="20" r="5" fill="#FFFFFF" stroke="#2F4644" stroke-width="0.6"/>
              <path d="M20 15 A5 5 0 0 1 20 25 A2.5 2.5 0 0 1 20 20 A2.5 2.5 0 0 0 20 15 Z" fill="#2F4644"/>
              <circle cx="20" cy="17.5" r="0.7" fill="#FFFFFF"/>
              <circle cx="20" cy="22.5" r="0.7" fill="#2F4644"/>
            </g>
          </svg>
        </span>
        <span v-else-if="c.card.category === 'formation'" class="pc-num">阵</span>
        <span v-else-if="c.card.category === 'charm'" class="pc-num">惑</span>
        <span v-else-if="c.card.category === 'strategist'" class="pc-num">智</span>
        <span v-else class="pc-num">{{ c.card.value }}</span>
        <span class="pc-cat">{{ catLabel(c.card.category) }}</span>
        <span class="pc-atk" v-if="c.attackPower !== undefined">×{{ c.attackPower }}</span>
      </div>

      <!-- 空桌提示 -->
      <div v-if="cards.length === 0" class="empty-hint">牌桌空 · 打出卡牌将在此展示（回合结束清入弃牌堆）</div>
    </div>

    <!-- 折叠牌堆展开列表 -->
    <div class="folded-panel" v-if="showFolded && foldedCount > 0" @click="showFolded = false">
      <div class="fp-title">本回合旧牌（{{ foldedCount }} 张）</div>
      <div class="fp-list">
        <span v-for="c in foldedCards" :key="c.key" class="fp-item" :class="c.isMine ? 'mine' : 'opp'">
          {{ c.isMine ? '我' : '对手' }} · {{ c.card.name }}
        </span>
      </div>
      <div class="fp-close">点击关闭</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { CardView } from '../types/protocol';

export interface PlayedCard {
  key: string;
  card: CardView;
  isMine: boolean;
  actorPid: number;
  attackPower?: number;
}

const props = defineProps<{
  cards: PlayedCard[];
}>();

/** 最多同时可见的牌数 */
const MAX_VISIBLE = 10;
const showFolded = ref(false);
const scrollEl = ref<HTMLElement | null>(null);

/** 折叠的旧牌（最早打出的） */
const foldedCards = computed(() =>
  props.cards.length > MAX_VISIBLE ? props.cards.slice(0, props.cards.length - MAX_VISIBLE) : [],
);
const foldedCount = computed(() => foldedCards.value.length);
/** 可见的最近 10 张 */
const visibleCards = computed(() => props.cards.slice(-MAX_VISIBLE));

// 新牌打出时滚动到最右（展示最新）
watch(() => props.cards.length, () => {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollLeft = scrollEl.value.scrollWidth;
  });
});

const CAT_LABELS: Record<string, string> = {
  general: '武将',
  armor: '防具',
  function_qi: '补气',
  function_hp: '补血',
  strategy: '兵法',
  ultimate: '绝杀',
  formation: '阵法',
  charm: '魅惑',
  strategist: '智者',
};
function catLabel(cat: string): string {
  return CAT_LABELS[cat] || cat;
}
</script>

<style scoped>
/* 牌桌区：固定高度（容纳一张牌），始终占位 */
.played-zone {
  position: relative;
  height: 108px;
  padding: 8px 12px;
  background:
    radial-gradient(ellipse at center, rgba(255, 248, 220, 0.7) 0%, rgba(232, 217, 188, 0.3) 70%, transparent 100%),
    repeating-linear-gradient(45deg, rgba(180, 150, 100, 0.04) 0px, rgba(180, 150, 100, 0.04) 2px, transparent 2px, transparent 8px);
  border-radius: 12px;
  border: 1px solid rgba(180, 150, 100, 0.25);
  flex: 0 0 auto;
}

/* 单行横向滚动（固定高度，不撑高页面） */
.pz-scroll {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scroll-behavior: smooth;
}
.pz-scroll::-webkit-scrollbar { height: 4px; }
.pz-scroll::-webkit-scrollbar-thumb { background: rgba(180, 150, 100, 0.5); border-radius: 2px; }

.empty-hint {
  flex: 1;
  text-align: center;
  color: rgba(139, 115, 79, 0.65);
  font-size: 12px;
  letter-spacing: 1px;
  white-space: nowrap;
}

/* 折叠牌堆（旧牌） */
.fold-pile {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
  user-select: none;
}
.pile-stack {
  position: relative;
  width: 44px; height: 60px;
  border-radius: 6px;
  border: 1.5px solid #8A7254;
  background: linear-gradient(180deg, #E8DCC0 0%, #CDB98F 100%);
  box-shadow: -2px -2px 0 rgba(74, 61, 46, 0.25), -4px -4px 0 rgba(74, 61, 46, 0.18), 0 2px 6px rgba(60, 40, 20, 0.25);
  display: flex; align-items: center; justify-content: center;
  transition: transform .12s ease;
}
.fold-pile:hover .pile-stack { transform: translateY(-2px); }
.pile-count {
  font-size: 15px; font-weight: 900; color: #4B3B2A;
  background: #FAF2E0; border: 1px solid #B49769;
  border-radius: 999px; padding: 1px 7px;
}
.pile-label { font-size: 9px; color: #8A7254; }

/* 牌 */
.played-card {
  flex: 0 0 auto;
  position: relative;
  width: 52px;
  height: 74px;
  border-radius: 6px;
  border: 1.5px solid;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-weight: 800;
  box-shadow: 0 2px 6px rgba(60, 40, 20, 0.25);
  animation: dropIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes dropIn {
  from { transform: translateY(-25px) scale(0.85); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

/* 对手出的牌 — 略暗 */
.played-card.opp { opacity: 0.82; filter: saturate(0.85); }
/* 自己出的牌 — 正常 */
.played-card.mine { border-width: 2px; }

/* 最新打出的牌 — 高亮放大 */
.played-card.latest {
  transform: scale(1.12);
  box-shadow: 0 0 12px rgba(201, 162, 39, 0.6), 0 4px 10px rgba(60, 40, 20, 0.3);
  z-index: 10;
}
.played-card.latest.opp {
  box-shadow: 0 0 12px rgba(180, 70, 60, 0.5), 0 4px 10px rgba(60, 40, 20, 0.3);
}

/* 类别配色 */
.cat-general     { background: linear-gradient(180deg, #F3E9D7 0%, #E5D3B0 100%); border-color: #705C48; color: #3A2E22; }
.cat-armor       { background: linear-gradient(180deg, #E6E9EC 0%, #CFD6DD 100%); border-color: #5C6772; color: #2D3845; }
.cat-function_qi { background: linear-gradient(180deg, #EBDBC3 0%, #DEBE8E 100%); border-color: #825E3B; color: #4A3818; }
.cat-function_hp { background: linear-gradient(180deg, #F2E0DC 0%, #E0B7B0 100%); border-color: #8C4A40; color: #5C2A24; }
.cat-strategy    { background: linear-gradient(180deg, #E8D9BC 0%, #D1B883 100%); border-color: #4B3B2A; color: #2E2417; }
.cat-ultimate    { background: linear-gradient(180deg, #2A1A16 0%, #120B09 100%); border-color: #C9A227; color: #E8C66E; }
.cat-formation   { background: linear-gradient(180deg, #DAE3E1 0%, #BFCFCC 100%); border-color: #344240; color: #2F4644; }
.cat-charm       { background: linear-gradient(180deg, #F5DCE6 0%, #E0A8C6 100%); border-color: #8C4A6E; color: #5C2A4E; }
.cat-strategist  { background: linear-gradient(180deg, #E8E2F5 0%, #C9BCE8 100%); border-color: #5A4A8C; color: #3A2A6E; }

.pc-title { font-size: 9px; line-height: 1.1; text-align: center; padding: 0 2px; max-width: 48px; }
.pc-num   { font-size: 22px; line-height: 1; }
.pc-bagua { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
.bagua-svg { width: 36px; height: 36px; animation: baguaSpin 12s linear infinite; }
@keyframes baguaSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
.pc-cat   { font-size: 8px; opacity: 0.7; }

/* 结算攻击力 — 右上角金色徽章 */
.pc-atk {
  position: absolute;
  top: -6px;
  right: -6px;
  background: linear-gradient(135deg, #FFD700, #DAA520);
  color: #3A2E00;
  font-size: 11px;
  font-weight: 900;
  padding: 1px 5px;
  border-radius: 8px;
  border: 1px solid #B8860B;
  box-shadow: 0 1px 4px rgba(218, 165, 32, 0.5);
  z-index: 20;
  animation: atkPop 0.3s ease-out;
}
@keyframes atkPop {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* 折叠牌堆展开面板 */
.folded-panel {
  position: absolute;
  left: 12px; right: 12px; bottom: calc(100% + 6px);
  z-index: 50;
  background: rgba(250, 242, 224, 0.98);
  border: 1px solid #B49769;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(60, 40, 20, 0.25);
  padding: 10px 12px;
  cursor: pointer;
}
.fp-title { font-size: 12px; font-weight: 800; color: #4B3B2A; margin-bottom: 6px; }
.fp-list { display: flex; flex-wrap: wrap; gap: 4px 8px; max-height: 120px; overflow-y: auto; }
.fp-item {
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  background: #EFE3C8; border: 1px solid #CDB98F; color: #4B3B2A;
}
.fp-item.mine { border-color: #705C48; }
.fp-item.opp { opacity: 0.75; }
.fp-close { margin-top: 8px; text-align: center; font-size: 10px; color: #8A7254; }
</style>
