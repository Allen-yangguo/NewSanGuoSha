<!--
  桌面展示区（出牌区）
  - 横向排列，每张牌在前一张右边
  - 最新打出的牌高亮（放大+发光）
  - 自己出的牌和对手出的牌有区分色
  - 满 8 张后只保留最后一张，清空前 7 张
-->
<template>
  <div class="played-zone" v-if="cards.length > 0">
    <div
      v-for="(c, i) in cards"
      :key="c.key"
      class="played-card"
      :class="[
        `cat-${c.card.category}`,
        c.isMine ? 'mine' : 'opp',
        { latest: i === cards.length - 1 }
      ]"
    >
      <span class="pc-title">{{ c.card.name }}</span>
      <!-- 八卦阵：绘制太极八卦图，去掉中间的 0 -->
      <span v-if="c.card.id === 'bagua'" class="pc-bagua" aria-label="八卦">
        <svg viewBox="0 0 40 40" class="bagua-svg">
          <!-- 外圈八卦爻 -->
          <g class="trigrams" fill="none" stroke="#2F4644" stroke-width="1.4">
            <!-- 乾 ☰ -->
            <g transform="translate(20,20) rotate(0)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
            <!-- 兑 ☱ -->
            <g transform="translate(20,20) rotate(45)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
            <!-- 离 ☲ -->
            <g transform="translate(20,20) rotate(90)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-0.6" y1="-10.5" x2="0.6" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
            <!-- 震 ☳ -->
            <g transform="translate(20,20) rotate(135)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="-1" y2="-10.5"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
            <!-- 坤 ☷ -->
            <g transform="translate(20,20) rotate(180)"><line x1="-3" y1="-13" x2="-1" y2="-13"/><line x1="1" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="-1" y2="-10.5"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="-1" y2="-8"/><line x1="1" y1="-8" x2="3" y2="-8"/></g>
            <!-- 艮 ☶ -->
            <g transform="translate(20,20) rotate(225)"><line x1="-3" y1="-13" x2="-1" y2="-13"/><line x1="1" y1="-13" x2="3" y2="-13"/><line x1="-0.6" y1="-10.5" x2="0.6" y2="-10.5"/><line x1="-3" y1="-8" x2="-1" y2="-8"/><line x1="1" y1="-8" x2="3" y2="-8"/></g>
            <!-- 坎 ☵ -->
            <g transform="translate(20,20) rotate(270)"><line x1="-3" y1="-13" x2="-1" y2="-13"/><line x1="1" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="-1" y2="-8"/><line x1="1" y1="-8" x2="3" y2="-8"/></g>
            <!-- 巽 ☴ -->
            <g transform="translate(20,20) rotate(315)"><line x1="-3" y1="-13" x2="3" y2="-13"/><line x1="-3" y1="-10.5" x2="-1" y2="-10.5"/><line x1="1" y1="-10.5" x2="3" y2="-10.5"/><line x1="-3" y1="-8" x2="3" y2="-8"/></g>
          </g>
          <!-- 太极图 -->
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
      <span v-else class="pc-num">{{ c.card.value }}</span>
      <span class="pc-cat">{{ catLabel(c.card.category) }}</span>
      <span class="pc-atk" v-if="c.attackPower !== undefined">×{{ c.attackPower }}</span>
    </div>
    <div class="clear-hint" v-if="cards.length >= 6">再出 {{ 9 - cards.length }} 张清空</div>
  </div>
</template>

<script setup lang="ts">
import type { CardView } from '../types/protocol';

export interface PlayedCard {
  key: string;
  card: CardView;
  isMine: boolean;
  actorPid: number;
  attackPower?: number;
}

defineProps<{
  cards: PlayedCard[];
}>();

const CAT_LABELS: Record<string, string> = {
  general: '武将',
  armor: '防具',
  function_qi: '补气',
  function_hp: '补血',
  strategy: '兵法',
  ultimate: '绝杀',
  formation: '阵法',
  charm: '魅惑',
};
function catLabel(cat: string): string {
  return CAT_LABELS[cat] || cat;
}
</script>

<style scoped>
.played-zone {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 90px;
  padding: 10px 16px;
  background:
    radial-gradient(ellipse at center, rgba(255, 248, 220, 0.7) 0%, rgba(232, 217, 188, 0.3) 70%, transparent 100%),
    repeating-linear-gradient(45deg, rgba(180, 150, 100, 0.04) 0px, rgba(180, 150, 100, 0.04) 2px, transparent 2px, transparent 8px);
  border-radius: 12px;
  border: 1px solid rgba(180, 150, 100, 0.25);
}

.played-card {
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
.played-card.opp {
  opacity: 0.82;
  filter: saturate(0.85);
}

/* 自己出的牌 — 正常 */
.played-card.mine {
  border-width: 2px;
}

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

.pc-title { font-size: 9px; line-height: 1.1; text-align: center; padding: 0 2px; }
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

.clear-hint {
  position: absolute;
  bottom: 2px;
  right: 8px;
  font-size: 10px;
  color: #B5463A;
  opacity: 0.7;
}
</style>
