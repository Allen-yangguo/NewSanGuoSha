<!--
  卡牌组件（单人手牌、出牌展示通用）
  设计规范：
    - 左上：卡牌名称
    - 右上：卡牌大类标签
    - 居中：大数值（攻击/防御/补气/补血/真实伤害/层数）
    - 下方：小描述
    - 配色按 CardCategory 区分（国风简约）
-->
<template>
  <div
    class="card"
    :class="[`cat-${card.category}`, { clickable, disabled, selected }]"
    @click="onClick"
  >
    <div class="head">
      <span class="title">{{ card.name }}</span>
      <span class="cat-tag">{{ catLabel }}</span>
    </div>
    <div class="big-num" :class="numClass">{{ bigNum }}</div>
    <div class="desc">
      <template v-if="card.category === 'general'">
        耗气 <b class="cost">{{ realCost }}</b> · 预计伤 <b>{{ dmgPreview }}</b>
      </template>
      <template v-else>{{ card.desc }}</template>
    </div>
    <div class="footer" v-if="card.category === 'general' || showCost">
      <span v-if="showCost">耗气 {{ card.cost }}</span>
      <span v-else>&nbsp;</span>
    </div>
    <div v-if="costDiscountBadge" class="badge badge-discount">0费</div>
    <div v-if="damageBoostBadge" class="badge badge-boost">+{{ damageBoostBadge }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CardView } from '../types/protocol';

const props = withDefaults(defineProps<{
  card: CardView;
  clickable?: boolean;
  disabled?: boolean;
  selected?: boolean;
  /** 预览真实耗气（残血 -1）—— 由父组件传；不传则默认 cost */
  previewCost?: number;
  /** 预览最终伤害（武将攻击） */
  previewDamage?: number;
  /** 是否显示「耗气」行 */
  showCost?: boolean;
  /** 显示 +N 增伤徽章 */
  damageBoostBadge?: number;
  /** 显示 0 费徽章 */
  costDiscountBadge?: boolean;
}>(), {
  clickable: false,
  disabled: false,
  selected: false,
  showCost: false,
});
const emit = defineEmits<{
  (e: 'click', card: CardView): void;
}>();

const MAP: Record<string, string> = {
  general: '武将',
  armor: '防具',
  function_qi: '补气',
  function_hp: '补血',
  strategy: '兵法',
  ultimate: '绝杀',
  formation: '阵法',
};
const catLabel = computed(() => MAP[props.card.category] || props.card.category);

const bigNum = computed(() => {
  switch (props.card.category) {
    case 'formation': // 八卦 / 追风 value=0，显示「阵」
      return props.card.id.startsWith('bagua') ? '反' : '先';
    case 'function_hp':
    case 'function_qi':
    case 'armor':
    case 'general':
    case 'strategy':
    case 'ultimate':
    default:
      return props.card.value;
  }
});
const numClass = computed(() => {
  switch (props.card.category) {
    case 'general':   return 'num-atk';
    case 'armor':     return 'num-def';
    case 'function_qi': return 'num-qi';
    case 'function_hp': return 'num-hp';
    case 'strategy':  return 'num-str';
    case 'ultimate':  return 'num-ult';
    case 'formation': return 'num-fmt';
    default:          return '';
  }
});
const realCost = computed(() =>
  (props.previewCost !== undefined ? props.previewCost : props.card.cost) ?? props.card.cost,
);
const dmgPreview = computed(() =>
  props.previewDamage !== undefined ? props.previewDamage : props.card.value,
);

function onClick(): void {
  if (props.disabled) return;
  emit('click', props.card);
}
</script>

<style scoped>
.card {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4.3;
  min-height: 130px;
  padding: 8px 8px 6px;
  border-radius: 10px;
  border: 1.5px solid #705C48;
  background: linear-gradient(180deg, #F8EFDA 0%, #F1E3C3 100%);
  color: #3A2E22;
  box-shadow: 0 3px 0 #B5996A, 0 8px 16px rgba(75, 59, 42, .15);
  display: flex; flex-direction: column;
  overflow: hidden;
  transition: transform .12s ease;
}
.card.clickable { cursor: pointer; }
.card.clickable:active { transform: translateY(2px); box-shadow: 0 1px 0 #B5996A, 0 4px 8px rgba(75,59,42,.15); }
.card.selected {
  outline: 3px solid #B5463A; outline-offset: -1px;
  transform: translateY(-18px);
  box-shadow: 0 8px 16px rgba(181, 70, 58, 0.35);
  z-index: 10;
}
.card.disabled { opacity: .5; filter: grayscale(.25); }

/* 类别配色 */
.cat-general    { background: linear-gradient(180deg, #F3E9D7 0%, #E5D3B0 100%); border-color: #705C48; }
.cat-armor      { background: linear-gradient(180deg, #E6E9EC 0%, #CFD6DD 100%); border-color: #5C6772; }
.cat-function_qi{ background: linear-gradient(180deg, #EBDBC3 0%, #DEBE8E 100%); border-color: #825E3B; }
.cat-function_hp{ background: linear-gradient(180deg, #F2E0DC 0%, #E0B7B0 100%); border-color: #8C4A40; }
.cat-strategy   { background: linear-gradient(180deg, #E8D9BC 0%, #D1B883 100%); border-color: #4B3B2A; }
.cat-ultimate   { background: linear-gradient(180deg, #2A1A16 0%, #120B09 100%); color: #E8C66E; border-color: #C9A227; box-shadow: 0 3px 0 #8A6D29, 0 8px 16px rgba(0,0,0,.3); }
.cat-formation  { background: linear-gradient(180deg, #DAE3E1 0%, #BFCFCC 100%); border-color: #344240; }

.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
.title { font-size: 13px; font-weight: 900; letter-spacing: 1px; }
.cat-ultimate .title { color: #E8C66E; }
.cat-tag {
  font-size: 9px; padding: 1px 5px; border-radius: 4px;
  background: rgba(75, 59, 42, 0.15);
  color: inherit; font-weight: 700;
}

.big-num {
  flex: 1;
  font-size: 42px;
  font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
  letter-spacing: -2px;
  text-shadow: 0 1px 0 rgba(255,255,255,.4);
}
.num-atk { color: #8C3329; }
.num-def { color: #2D5460; }
.num-qi  { color: #8E672A; }
.num-hp  { color: #B5463A; }
.num-str { color: #4B3B2A; }
.num-ult { color: #E8C66E; text-shadow: 0 0 10px rgba(201, 162, 39, .5); }
.num-fmt { color: #2F4644; }

.desc {
  font-size: 11px; line-height: 1.5;
  color: inherit; opacity: .85;
  padding: 2px 2px 4px;
  min-height: 28px;
}
.desc b { color: inherit; font-weight: 900; }
.cat-ultimate .desc { opacity: .92; }

.footer { font-size: 10px; text-align: right; color: inherit; opacity: .7; }

.badge {
  position: absolute;
  top: 4px; right: 4px;
  font-size: 10px; font-weight: 800;
  padding: 2px 6px; border-radius: 999px;
}
.badge-discount { background: #B5463A; color: #FFF4D5; }
.badge-boost    { background: #6A521E; color: #FFE9A7; top: auto; bottom: 4px; right: 4px; }
</style>
