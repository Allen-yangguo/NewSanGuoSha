<!--
  游戏说明页 · 全屏 modal
  在登录页(未登录)点击「游戏说明」入口弹出,无需登录即可查看
-->
<template>
  <div class="guide-mask" @click.self="$emit('close')">
    <div class="guide-card">
      <button class="guide-close" @click="$emit('close')">✕</button>
      <div class="guide-title">新三国杀 · 游戏说明</div>
      <div class="guide-body">
        <section>
          <h3>一、游戏目标</h3>
          <p>双方对战，将对方主公体力（HP）降为 <b>0</b> 即获胜。</p>
        </section>
        <section>
          <h3>二、基础概念</h3>
          <ul>
            <li><b>HP（体力）</b>：归 0 即败北，初始 8，上限 12。</li>
            <li><b>气（出牌消耗）</b>：武将牌需消耗气才能打出。每 <b>2 回合</b>自动恢复 1 气；<b>受伤时补 1 气</b>（每次有效扣血 +1）；满血时打补血牌可转为气；另有补气牌与补气按钮可主动补气。</li>
            <li><b>回合制</b>：先手方/后手方交替行动，每回合分「行动 → 结算 → 摸牌」。</li>
          </ul>
        </section>
        <section>
          <h3>三、卡牌类型</h3>
          <table class="card-table">
            <thead><tr><th>类型</th><th>作用</th></tr></thead>
            <tbody>
              <tr><td>武将</td><td>攻击对方，造成伤害（需消耗气）</td></tr>
              <tr><td>防具</td><td>抵消等额伤害</td></tr>
              <tr><td>兵法</td><td>叠加增伤层数：孟德新书 +1 层 / 孙子兵法 +2 层，持续 3 回合</td></tr>
              <tr><td>绝杀</td><td>神兵 · 真实伤害 1-2 点，无视防具不可防御，消耗 0；击杀不可急救</td></tr>
              <tr><td>补血</td><td>恢复 HP；满血可转为气；0 血时紧急救血续命</td></tr>
              <tr><td>补气</td><td>恢复自身气</td></tr>
              <tr><td>阵法</td><td>八卦阵（反弹剩余伤害）/ 龟背阵（受到伤害 -1，持续 3 回合）</td></tr>
              <tr><td>魅惑</td><td>对方兵法层 -1；若兵法层为 0 则对方 -3 气</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>四、状态系统（缺血 / 残血 / 残爆）</h3>
          <ul>
            <li><b>缺血（HP = 2）</b>：武将攻击状态增伤 <b>+1</b></li>
            <li><b>残血（HP = 1）</b>：状态增伤 <b>+1</b>，且武将牌出牌消耗 <b>-1</b></li>
            <li><b>残爆（HP = 1 且有兵法层数）</b>：状态增伤 +2（覆盖残血，保留费用 -1 特权）</li>
          </ul>
          <p class="formula">真实伤害 = 武将基础攻击 + 全部兵法层数 + 状态增伤<br/>（绝杀 / 倚天剑不吃任何状态加成，单独结算）</p>
        </section>
        <section>
          <h3>五、战斗流程</h3>
          <ol>
            <li>行动方出武将牌攻击 → 对方进入防御阶段</li>
            <li>防御方可出防具/八卦阵应对，或不出（承受伤害）</li>
            <li>确认防御后结算伤害（防具抵消 → 八卦阵反弹 → 剩余扣 HP）</li>
            <li>回合结束 → 摸牌 → 轮到对方</li>
          </ol>
        </section>
        <section>
          <h3>六、特殊机制</h3>
          <ul>
            <li><b>八卦阵反弹</b>：防具先抵消，剩余伤害反弹给攻击方</li>
            <li><b>龟背阵</b>：激活后受到伤害 -1，持续 3 回合</li>
            <li><b>紧急救血</b>：被打至 0 血时，若手牌有补血牌可紧急打出续命，补血量需超过溢出伤害才能救活</li>
            <li><b>补气按钮</b>：普通补气（第 4 回合解锁，+2 气）/ 大补气（第 7 回合解锁，+3 气），未激活时置灰显示进度</li>
            <li><b>绝杀（神兵）</b>：消耗 0，造成 1-2 点真实伤害，<b>无视防具不可防御</b>；击杀不可急救</li>
          </ul>
        </section>
        <section>
          <h3>七、积分系统（登录用户）</h3>
          <ul>
            <li>攻击得血 +10 分，胜利结算（战斗分 + 胜利分 + 速胜奖励 + 残血奖励）</li>
            <li>500 分升一级，难度递增</li>
            <li>游客不计积分</li>
          </ul>
        </section>
        <section>
          <h3>八、模式</h3>
          <ul>
            <li><b>单机</b>：对战 AI</li>
            <li><b>联机</b>：分享网址邀请好友加入房间</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ (e: 'close'): void }>();
</script>

<style scoped>
.guide-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.guide-card {
  width: 100%;
  max-width: 460px;
  max-height: 86vh;
  background: linear-gradient(180deg, #FFFBEE 0%, #F3E4C6 100%);
  border: 2px solid #B5463A;
  border-radius: 16px;
  padding: 22px 22px 18px;
  box-shadow: 0 10px 40px rgba(92, 42, 36, 0.35);
  position: relative;
  display: flex;
  flex-direction: column;
}
.guide-close {
  position: absolute;
  top: 10px;
  right: 12px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: #8E734F;
  cursor: pointer;
  line-height: 1;
}
.guide-close:hover { color: #B5463A; }
.guide-title {
  font-size: 18px;
  font-weight: 900;
  color: #3A2E22;
  text-align: center;
  letter-spacing: 2px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1.5px solid #C9B68A;
}
.guide-body {
  overflow-y: auto;
  padding-right: 4px;
}
.guide-body section {
  margin-bottom: 14px;
}
.guide-body h3 {
  font-size: 14px;
  font-weight: 700;
  color: #B5463A;
  margin: 0 0 6px;
}
.guide-body p,
.guide-body ul,
.guide-body ol {
  font-size: 13px;
  color: #3A2E22;
  line-height: 1.7;
  margin: 0;
  padding-left: 18px;
}
.guide-body li { margin-bottom: 3px; }
.card-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.card-table th,
.card-table td {
  border: 1px solid #C9B68A;
  padding: 5px 8px;
  text-align: left;
}
.card-table th {
  background: #E8D5B0;
  color: #3A2E22;
  font-weight: 700;
}
.card-table td:first-child {
  font-weight: 700;
  color: #B5463A;
  white-space: nowrap;
}
.guide-body b { color: #B5463A; }
.formula {
  margin-top: 6px;
  padding: 8px 10px;
  background: #FFF6D9;
  border-left: 3px solid #B5463A;
  border-radius: 4px;
  font-size: 12px;
  color: #3A2E22;
  line-height: 1.7;
}
.guide-body::-webkit-scrollbar { width: 6px; }
.guide-body::-webkit-scrollbar-thumb { background: #C9B68A; border-radius: 3px; }
</style>
