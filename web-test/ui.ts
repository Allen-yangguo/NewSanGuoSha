/**
 * 三国卡牌对战 · Web 测试版 UI 控制器
 * 双人热座对战 · 用于不依赖 Cocos 即可验证规则
 *
 * 设计：UI 只读取 engine.state 做显示，所有业务逻辑调用 engine 方法
 */
import { GameEngine } from '../assets/scripts/core/GameEngine';
import { applyCardEffect } from '../assets/scripts/core/CardEffect';
import { CARD_COLORS } from '../assets/scripts/core/cards';
import {
  CardCategory,
  CardInstance,
  PlayerId,
  TurnPhase,
  UltimateType,
  FormationType,
  BattleState,
} from '../assets/scripts/core/types';
import { getBattleState, totalStrategyLayers, calcGeneralCost } from '../assets/scripts/core/BattleState';
import { SoundManager, soundManager, SfxType } from './sfx/SoundManager';

const HP_MAX = 10;

export class WebUI {
  engine: GameEngine;
  root: HTMLElement;
  sound: SoundManager = soundManager;
  /** 用户是否已首次交互（用于解锁音频自动播放策略） */
  private audioUnlocked: boolean = false;
  /** 上一帧的 gameOver 状态（用于检测游戏结束的瞬间并播放音效） */
  private wasGameOver: boolean = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.engine = new GameEngine();
    this.engine.initGame();
    this.render();
  }

  // ============ 渲染 ============

  render(): void {
    const e = this.engine;
    const s = e.state;
    this.root.innerHTML = '';

    // 顶部状态栏
    const topBar = this.el('div', 'top-bar');
    topBar.appendChild(this.el('span', '', `回合 ${s.roundCount}`));
    topBar.appendChild(this.el('span', '', this.phaseLabel()));
    topBar.appendChild(this.el('span', '', `牌库剩余 ${s.deck.length}`));
    topBar.appendChild(this.el('span', '', `弃牌堆 ${s.discard.length}`));
    if (s.zhuiFengActive) topBar.appendChild(this.el('span', 'tag tag-zhuifeng', '追风阵生效中'));

    // 音量控制
    const soundCtl = this.el('div', 'sound-ctl');
    const muteBtn = this.el('button', `btn btn-sound${this.sound.muted ? ' muted' : ''}`, this.sound.muted ? '🔇 已静音' : '🔊 音效');
    muteBtn.addEventListener('click', () => {
      this.ensureAudioUnlocked();
      const muted = this.sound.toggleMute();
      muteBtn.textContent = muted ? '🔇 已静音' : '🔊 音效';
      muteBtn.classList.toggle('muted', muted);
    });
    soundCtl.appendChild(muteBtn);
    topBar.appendChild(soundCtl);
    this.root.appendChild(topBar);

    // 玩家2 面板（上方）
    this.root.appendChild(this.renderPlayerPanel(1));
    this.root.appendChild(this.renderHand(1));

    // 中央交互区
    this.root.appendChild(this.renderCenter());

    // 玩家1 手牌 + 面板（下方）
    this.root.appendChild(this.renderHand(0));
    this.root.appendChild(this.renderPlayerPanel(0));

    // 日志
    this.root.appendChild(this.renderLog());

    // 游戏结束遮罩
    if (s.gameOver) {
      this.root.appendChild(this.renderGameOver());
      // 检测从「未结束」变为「结束」的瞬间，播放胜负音效
      if (!this.wasGameOver) {
        this.playGameOverSfx();
      }
    }
    this.wasGameOver = s.gameOver;
  }

  /** 根据胜负结果播放对应音效 */
  private playGameOverSfx(): void {
    const result = this.engine.state.result;
    if (!result) return;
    if (result.winner === null) {
      this.sound.play('draw');
    } else {
      this.sound.play('win');
      // 败北音效延迟叠加，营造胜负对比
      setTimeout(() => this.sound.play('lose'), 200);
    }
  }

  phaseLabel(): string {
    const e = this.engine;
    if (e.emergencyHealPending !== null) return `紧急救血 · 玩家${e.emergencyHealPending + 1}`;
    if (e.turn.isAwaitingDefense()) {
      return `受击防御 · 玩家${e.pendingAttack?.defender! + 1} 响应`;
    }
    switch (e.turn.phase) {
      case TurnPhase.Action: return `行动阶段 · 玩家${e.turn.activePlayer + 1}`;
      case TurnPhase.Settle: return '回合结算中';
      case TurnPhase.Draw: return '补牌阶段';
      case TurnPhase.SwitchFirst: return '互换先手';
    }
    return '';
  }

  renderPlayerPanel(id: PlayerId): HTMLElement {
    const e = this.engine;
    const p = e.state.players[id];
    const isActive = e.turn.activePlayer === id && e.turn.isInActionPhase();
    const wrap = this.el('div', `player-panel player-${id}${isActive ? ' active' : ''}`);

    // 名称
    const head = this.el('div', 'pp-head');
    head.appendChild(this.el('span', 'pp-name', `玩家 ${id + 1}${id === e.state.firstPlayer ? ' · 先手' : ''}`));
    if (isActive) head.appendChild(this.el('span', 'tag tag-active', '行动中'));
    const bs = getBattleState(p);
    if (bs !== BattleState.Normal) {
      head.appendChild(this.el('span', 'tag tag-state', e.getBattleStateLabel(id)));
    }
    wrap.appendChild(head);

    // 血量条
    const hpRow = this.el('div', 'pp-row');
    hpRow.appendChild(this.el('span', 'pp-label', '血'));
    const hpBar = this.el('div', 'hp-bar');
    const hpFill = this.el('div', 'hp-fill');
    hpFill.style.width = `${(p.hp / HP_MAX) * 100}%`;
    hpBar.appendChild(hpFill);
    hpRow.appendChild(hpBar);
    hpRow.appendChild(this.el('span', 'pp-value', `${p.hp}/${HP_MAX}`));
    wrap.appendChild(hpRow);

    // 气量
    const qiRow = this.el('div', 'pp-row');
    qiRow.appendChild(this.el('span', 'pp-label', '气'));
    qiRow.appendChild(this.el('span', 'pp-value', `${p.qi}`));
    wrap.appendChild(qiRow);

    // 兵法层数
    const stratLayers = totalStrategyLayers(p);
    const stratRow = this.el('div', 'pp-row');
    stratRow.appendChild(this.el('span', 'pp-label', '兵法'));
    stratRow.appendChild(this.el('span', 'pp-value', `${stratLayers} 层`));
    if (p.strategies.length > 0) {
      const detail = p.strategies.map(s => `${s.type === 'mengde' ? '孟' : '孙'}${s.layers}(${s.remainingTurns}回)`).join(' ');
      stratRow.appendChild(this.el('span', 'pp-sub', detail));
    }
    wrap.appendChild(stratRow);

    // 固有能力按钮
    const btnRow = this.el('div', 'pp-buttons');
    const canUseAbility = isActive && !e.turn.isAwaitingDefense() && e.emergencyHealPending === null;
    btnRow.appendChild(this.makeButton(
      `普通补气 +2${p.usedNormalQi ? ' (已用)' : ''}`,
      () => {
        this.ensureAudioUnlocked();
        const r = this.engine.useNormalQiButton(id);
        if (r.ok) this.sound.play('qi');
        else this.flash(r.message);
        this.render();
      },
      canUseAbility && !p.usedNormalQi,
    ));
    btnRow.appendChild(this.makeButton(
      `大补气 +3${p.usedBigQi ? ' (已用)' : ''}`,
      () => {
        this.ensureAudioUnlocked();
        const r = this.engine.useBigQiButton(id);
        if (r.ok) this.sound.play('qi');
        else this.flash(r.message);
        this.render();
      },
      canUseAbility && !p.usedBigQi,
    ));
    btnRow.appendChild(this.makeButton(
      `手动爆气 -6气 +1层兵法`,
      () => {
        this.ensureAudioUnlocked();
        const r = this.engine.useManualBurst(id);
        if (r.ok) this.sound.play('strategy');
        else this.flash(r.message);
        this.render();
      },
      canUseAbility && p.qi >= 6,
    ));
    wrap.appendChild(btnRow);

    return wrap;
  }

  renderHand(id: PlayerId): HTMLElement {
    const e = this.engine;
    const p = e.state.players[id];
    const wrap = this.el('div', `hand-area hand-${id}`);

    // 判定手牌是否可点击
    let canPlay = false;
    if (e.emergencyHealPending === id) {
      // 紧急救血阶段：仅可打补血牌
      canPlay = true;
    } else if (e.turn.isAwaitingDefense()) {
      // 防御响应阶段：防御方可打防具/八卦阵
      canPlay = e.pendingAttack?.defender === id;
    } else if (e.turn.isInActionPhase() && e.turn.activePlayer === id) {
      // 行动阶段：先手可打牌
      canPlay = true;
    }

    for (const card of p.hand) {
      const playable = canPlay && this.isCardPlayable(card, id);
      wrap.appendChild(this.renderCard(card, playable, () => this.onCardClick(card, id)));
    }
    if (p.hand.length === 0) {
      wrap.appendChild(this.el('div', 'hand-empty', '（无手牌）'));
    }
    return wrap;
  }

  isCardPlayable(card: CardInstance, id: PlayerId): boolean {
    const e = this.engine;
    if (e.emergencyHealPending === id) {
      // 紧急救血阶段仅允许补血牌
      return card.def.category === CardCategory.FunctionHp;
    }
    if (e.turn.isAwaitingDefense()) {
      // 防御响应阶段：仅防具 / 八卦阵
      if (card.def.category === CardCategory.Armor) return true;
      if (card.def.category === CardCategory.Formation && card.def.subtype === FormationType.BaGua) return true;
      return false;
    }
    // 行动阶段：武将(需气)、补气、补血、兵法、绝杀、追风阵
    if (card.def.category === CardCategory.General) {
      const cost = calcGeneralCost(card.def, e.state.players[id]);
      return e.state.players[id].qi >= cost;
    }
    return [
      CardCategory.FunctionQi,
      CardCategory.FunctionHp,
      CardCategory.Strategy,
      CardCategory.Ultimate,
      CardCategory.Formation,
    ].includes(card.def.category);
  }

  renderCard(card: CardInstance, playable: boolean, onClick: () => void): HTMLElement {
    const color = CARD_COLORS[card.def.category];
    const el = this.el('div', `card${playable ? ' playable' : ''}`);
    el.style.backgroundColor = color.bg;
    el.style.borderColor = color.border;

    const catLabel = this.el('div', 'card-cat', color.label);
    catLabel.style.color = color.border;
    el.appendChild(catLabel);

    // 绝杀牌特殊布局：中央展示武器名 + 真伤
    if (card.def.category === CardCategory.Ultimate) {
      const center = this.el('div', 'card-value ultimate-center');
      const nameEl = this.el('div', 'ultimate-name', card.def.name);
      const dmgEl = this.el('div', 'ultimate-dmg', `${card.def.value} 真伤`);
      center.appendChild(nameEl);
      center.appendChild(dmgEl);
      el.appendChild(center);
    } else {
      el.appendChild(this.el('div', 'card-name', card.def.name));

      // 中央大号数值
      let displayValue = '';
      switch (card.def.category) {
        case CardCategory.General:    displayValue = `攻 ${card.def.value}`; break;
        case CardCategory.Armor:      displayValue = `防 ${card.def.value}`; break;
        case CardCategory.FunctionQi: displayValue = `+${card.def.value} 气`; break;
        case CardCategory.FunctionHp: displayValue = `+${card.def.value} 血`; break;
        case CardCategory.Strategy:   displayValue = `+${card.def.value} 层`; break;
        case CardCategory.Formation:  displayValue = card.def.subtype === FormationType.BaGua ? '反弹' : '篡先'; break;
      }
      el.appendChild(this.el('div', 'card-value', displayValue));
    }

    // 耗气标记（武将牌）
    if (card.def.category === CardCategory.General) {
      const cost = calcGeneralCost(card.def, this.engine.state.players[this.engine.turn.activePlayer]);
      el.appendChild(this.el('div', 'card-cost', `耗气 ${cost}`));
    }

    el.appendChild(this.el('div', 'card-desc', card.def.desc));

    if (playable) {
      el.addEventListener('click', onClick);
    }
    return el;
  }

  renderCenter(): HTMLElement {
    const e = this.engine;
    const wrap = this.el('div', 'center-area');

    // 提示信息
    const hint = this.el('div', 'center-hint', this.getHint());
    wrap.appendChild(hint);

    // 待结算攻击信息
    if (e.pendingAttack) {
      const atk = e.pendingAttack;
      const info = this.el('div', 'pending-attack');
      info.appendChild(this.el('span', '', `玩家${atk.attacker + 1} → 玩家${atk.defender + 1}`));
      info.appendChild(this.el('span', 'tag tag-damage', `${atk.damage} 伤害`));
      if (e.defensePool > 0) info.appendChild(this.el('span', 'tag tag-def', `已防 ${e.defensePool}`));
      if (e.baguaTriggered) info.appendChild(this.el('span', 'tag tag-bagua', '八卦阵待反弹'));
      wrap.appendChild(info);

      // 防御方操作按钮
      if (e.pendingAttack.defender !== null) {
        const defId = e.pendingAttack.defender;
        const btns = this.el('div', 'center-buttons');
        btns.appendChild(this.makeButton(
          '结束防御 · 承受伤害',
          () => {
            this.ensureAudioUnlocked();
            // 按当前攻击伤害值决定轻重音效
            const dmg = this.engine.pendingAttack?.damage ?? 0;
            this.sound.play(dmg >= 3 ? 'hitHeavy' : 'hitLight');
            this.engine.defenderPass();
            this.render();
          },
          true,
        ));
        wrap.appendChild(btns);
        void defId;
      }
    }

    // 紧急救血按钮
    if (e.emergencyHealPending !== null) {
      const id = e.emergencyHealPending;
      const btns = this.el('div', 'center-buttons');
      btns.appendChild(this.makeButton(
        '放弃救血 · 接受败北',
        () => {
          this.ensureAudioUnlocked();
          // 放弃救血 = 击杀，用重击音效
          this.sound.play('hitHeavy');
          this.engine.emergencyHealGiveUp();
          this.render();
        },
        true,
      ));
      wrap.appendChild(btns);
      void id;
    }

    // 行动阶段按钮
    if (e.turn.isInActionPhase() && !e.turn.isAwaitingDefense() && e.emergencyHealPending === null) {
      const btns = this.el('div', 'center-buttons');
      btns.appendChild(this.makeButton(
        '结束行动 · 进入回合结算',
        () => {
          this.ensureAudioUnlocked();
          this.sound.play('play');
          this.engine.endActionPhase();
          this.render();
        },
        true,
      ));
      wrap.appendChild(btns);
    }

    return wrap;
  }

  getHint(): string {
    const e = this.engine;
    if (e.state.gameOver) return '游戏结束';
    if (e.emergencyHealPending !== null) {
      return `玩家${e.emergencyHealPending + 1} 被打至 0 血 · 可打出补血牌续命，或放弃接受败北`;
    }
    if (e.turn.isAwaitingDefense()) {
      const def = e.pendingAttack?.defender;
      return `玩家${(def ?? 0) + 1} 受击 · 可打出防具/八卦阵，或结束防御承受伤害`;
    }
    if (e.turn.isInActionPhase()) {
      const ap = e.turn.activePlayer;
      const opp = (1 - ap) as 0 | 1;
      const apHasGen = e.hasGeneralInHand(ap);
      const oppHasGen = e.hasGeneralInHand(opp);
      let hint = `玩家${ap + 1} 行动 · 可打出补气/补血/兵法/阵法/绝杀/武将攻击`;
      // 提示攻击权交替规则
      if (!apHasGen && !oppHasGen) {
        hint += ` · 双方均无武将牌，可结束行动`;
      } else if (apHasGen && oppHasGen) {
        hint += ` · 攻击后攻权切换给对方`;
      }
      return hint;
    }
    return '';
  }

  renderLog(): HTMLElement {
    const wrap = this.el('div', 'log-area');
    const head = this.el('div', 'log-head', '战况日志');
    wrap.appendChild(head);
    const body = this.el('div', 'log-body');
    const logs = this.engine.logs.slice(-30);
    for (const l of logs) {
      body.appendChild(this.el('div', 'log-line', l));
    }
    body.scrollTop = body.scrollHeight;
    wrap.appendChild(body);
    return wrap;
  }

  renderGameOver(): HTMLElement {
    const e = this.engine;
    const overlay = this.el('div', 'gameover-overlay');
    const r = e.state.result;
    const card = this.el('div', 'gameover-card');
    card.appendChild(this.el('div', 'gameover-title', r?.winner === null ? '平局' : `玩家 ${r!.winner! + 1} 获胜`));
    card.appendChild(this.el('div', 'gameover-reason', r?.detail ?? ''));
    const btn = this.el('button', 'btn btn-restart', '重新开始');
    btn.addEventListener('click', () => {
      this.engine = new GameEngine();
      this.engine.initGame();
      this.wasGameOver = false;
      this.render();
    });
    card.appendChild(btn);
    overlay.appendChild(card);
    return overlay;
  }

  // ============ 事件处理 ============

  onCardClick(card: CardInstance, id: PlayerId): void {
    this.ensureAudioUnlocked();
    const e = this.engine;
    // 校验当前是否该玩家行动
    if (!this.isActorValid(id)) {
      this.flash(`非玩家${id + 1}的回合`);
      return;
    }
    const result = applyCardEffect(e, card, id);
    if (!result.ok) {
      this.flash(result.message);
      return;
    }
    // 根据卡牌类型播放对应音效
    this.playSfxForCard(card, result);
    this.render();
  }

  /** 根据卡牌类型与效果结果播放对应音效（按数值轻重分级） */
  private playSfxForCard(card: CardInstance, result: ReturnType<typeof applyCardEffect>): void {
    // 出牌动作基础音
    this.sound.play('play');

    // 卡牌专属音效
    switch (card.def.category) {
      case CardCategory.General: {
        // 攻击力分级：≥3 重击，否则轻击
        const atk = card.def.value;
        const isHeavy = atk >= 3;
        this.sound.play(isHeavy ? 'attackHeavy' : 'attackLight');
        if (result.triggeredDamage) {
          // 命中音效与攻击同步轻重
          setTimeout(() => this.sound.play(isHeavy ? 'hitHeavy' : 'hitLight'), 200);
        }
        break;
      }
      case CardCategory.Armor: {
        // 防御值分级：≥3 重防，否则轻防
        const def = card.def.value;
        this.sound.play(def >= 3 ? 'armorHeavy' : 'armorLight');
        break;
      }
      case CardCategory.FunctionQi:
        this.sound.play('qi');
        break;
      case CardCategory.FunctionHp:
        this.sound.play('heal');
        break;
      case CardCategory.Strategy:
        this.sound.play('strategy');
        break;
      case CardCategory.Formation:
        this.sound.play('formation');
        break;
      case CardCategory.Ultimate:
        this.sound.play('ultimate');
        // 绝杀固定走重击命中音效
        if (result.triggeredDamage) {
          setTimeout(() => this.sound.play('hitHeavy'), 300);
        }
        break;
    }
  }

  /** 解锁音频自动播放策略（首次用户交互时调用） */
  private ensureAudioUnlocked(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.sound.init();
  }

  isActorValid(id: PlayerId): boolean {
    const e = this.engine;
    if (e.state.gameOver) return false;
    if (e.emergencyHealPending !== null) return id === e.emergencyHealPending;
    if (e.turn.isAwaitingDefense()) return id === e.pendingAttack?.defender;
    return e.turn.isInActionPhase() && id === e.turn.activePlayer;
  }

  flash(msg: string): void {
    const existing = document.querySelector('.flash-msg');
    if (existing) existing.remove();
    const f = this.el('div', 'flash-msg', msg);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  // ============ 辅助 ============

  el(tag: string, cls: string = '', text: string = ''): HTMLElement {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  makeButton(label: string, onClick: () => void, enabled: boolean): HTMLElement {
    const btn = this.el('button', `btn${enabled ? '' : ' btn-disabled'}`, label) as HTMLButtonElement;
    btn.disabled = !enabled;
    if (enabled) {
      btn.addEventListener('click', () => {
        const r = onClick();
        void r;
      });
    }
    return btn;
  }
}

// 自启动：DOM 就绪后挂载 UI（同时暴露到 window 便于调试）
function bootstrap(): void {
  const root = document.getElementById('app');
  if (!root) {
    console.error('未找到 #app 容器');
    return;
  }
  (window as any).ui = new WebUI(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
