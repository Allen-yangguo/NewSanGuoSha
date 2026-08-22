/**
 * 三国卡牌对战 · Cocos-Creator 3.x 主控制器
 * 程序化构建整个对战界面，无需手动搭场景/预制体
 *
 * 使用方式：
 * 1. 在 Cocos Creator 中新建空场景
 * 2. 在 Canvas 下创建空节点 GameRoot
 * 3. 将此脚本挂到 GameRoot 上
 * 4. 运行即可
 *
 * 架构：UI 只读取 engine.state 做显示，所有业务逻辑调用 engine 方法
 */
import {
  _decorator,
  Component,
  Node,
  UITransform,
  Label,
  Sprite,
  Graphics,
  Color,
  Vec3,
  Size,
  view,
  Button,
  Layout,
  instantiate,
  tween,
  UIOpacity,
  find,
  director,
} from 'cc';
import { GameEngine } from '../core/GameEngine';
import { applyCardEffect } from '../core/CardEffect';
import { CARD_COLORS } from '../core/cards';
import { CardView, CARD_VIEW_SIZE } from './CardView';
import {
  CardCategory,
  CardDef,
  CardInstance,
  PlayerId,
  TurnPhase,
  UltimateType,
  FormationType,
  BattleState,
} from '../core/types';
import { getBattleState, totalStrategyLayers, calcGeneralCost, HP_MAX } from '../core/BattleState';

const { ccclass, property } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
  private engine!: GameEngine;

  // UI 节点引用（程序化创建后保存）
  private topBar!: Node;
  private playerPanels: Node[] = [];
  private handAreas: Node[] = [];
  private centerArea!: Node;
  private logArea!: Node;
  private gameOverOverlay: Node | null = null;

  // 卡牌视图缓存：playerId -> uid -> CardView
  private cardViews: Map<string, CardView> = new Map();

  onLoad(): void {
    this.engine = new GameEngine();
    this.engine.initGame();
    this.buildScene();
  }

  start(): void {
    this.render();
  }

  // ============ 场景构建 ============

  private buildScene(): void {
    const designSize = view.getDesignResolutionSize();
    const W = designSize.width;
    const H = designSize.height;

    // 顶部状态栏
    this.topBar = this.createNode('TopBar', this.node, 0, H / 2 - 24, W - 20, 40);
    this.topBar.addComponent(Layout).type = Layout.Type.HORIZONTAL;

    // 玩家2 面板（上方）
    const p2Panel = this.createNode('Player2Panel', this.node, 0, H / 2 - 90, W - 20, 80);
    this.playerPanels[1] = p2Panel;

    // 玩家2 手牌
    const p2Hand = this.createNode('Player2Hand', this.node, 0, H / 2 - 200, W - 20, 160);
    this.handAreas[1] = p2Hand;

    // 中央交互区
    this.centerArea = this.createNode('CenterArea', this.node, 0, 0, W - 20, 200);

    // 玩家1 手牌
    const p1Hand = this.createNode('Player1Hand', this.node, 0, -H / 2 + 200, W - 20, 160);
    this.handAreas[0] = p1Hand;

    // 玩家1 面板
    const p1Panel = this.createNode('Player1Panel', this.node, 0, -H / 2 + 90, W - 20, 80);
    this.playerPanels[0] = p1Panel;

    // 日志
    this.logArea = this.createNode('LogArea', this.node, 0, -H / 2 + 24, W - 20, 40);
  }

  private createNode(name: string, parent: Node, x: number, y: number, w: number, h: number): Node {
    const n = new Node(name);
    n.parent = parent;
    n.setPosition(x, y, 0);
    const t = n.addComponent(UITransform);
    t.setContentSize(w, h);
    return n;
  }

  private createLabel(parent: Node, text: string, fontSize: number, color: Color, w?: number, h?: number): Label {
    const n = new Node('Label');
    n.parent = parent;
    const t = n.addComponent(UITransform);
    if (w && h) t.setContentSize(w, h);
    const label = n.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.floor(fontSize * 1.2);
    label.color = color;
    return label;
  }

  // ============ 渲染 ============

  render(): void {
    this.renderTopBar();
    this.renderPlayerPanel(0);
    this.renderPlayerPanel(1);
    this.renderHand(0);
    this.renderHand(1);
    this.renderCenter();
    this.renderLog();
    if (this.engine.state.gameOver) this.renderGameOver();
  }

  private renderTopBar(): void {
    this.topBar.removeAllChildren();
    const e = this.engine;
    const s = e.state;
    const c = new Color(232, 223, 206, 255);
    this.createLabel(this.topBar, `回合 ${s.roundCount}`, 14, c, 80, 24);
    this.createLabel(this.topBar, this.phaseLabel(), 14, c, 160, 24);
    this.createLabel(this.topBar, `牌库 ${s.deck.length}`, 13, new Color(140, 122, 99, 255), 80, 24);
    this.createLabel(this.topBar, `弃牌 ${s.discard.length}`, 13, new Color(140, 122, 99, 255), 80, 24);
    if (s.zhuiFengActive) {
      this.createLabel(this.topBar, '追风阵生效', 12, new Color(52, 66, 64, 255), 100, 24);
    }
  }

  private phaseLabel(): string {
    const e = this.engine;
    if (e.emergencyHealPending !== null) return `紧急救血·玩家${e.emergencyHealPending + 1}`;
    if (e.turn.isAwaitingDefense()) return `受击防御·玩家${(e.pendingAttack?.defender ?? 0) + 1}`;
    switch (e.turn.phase) {
      case TurnPhase.Action: return `行动·玩家${e.turn.activePlayer + 1}`;
      case TurnPhase.Settle: return '回合结算';
      case TurnPhase.Draw: return '补牌';
      case TurnPhase.SwitchFirst: return '互换先手';
    }
    return '';
  }

  private renderPlayerPanel(id: PlayerId): void {
    const panel = this.playerPanels[id];
    panel.removeAllChildren();
    const e = this.engine;
    const p = e.state.players[id];
    const isActive = e.turn.activePlayer === id && e.turn.isInActionPhase();

    // 名称行
    const headRow = this.createNode('Head', panel, 0, 30, 0, 0);
    let nameStr = `玩家 ${id + 1}`;
    if (id === e.state.firstPlayer) nameStr += ' · 先手';
    if (isActive) nameStr += ' · 行动中';
    this.createLabel(headRow, nameStr, 16, new Color(232, 223, 206, 255), 300, 20);
    const bs = getBattleState(p);
    if (bs !== BattleState.Normal) {
      this.createLabel(headRow, `  [${e.getBattleStateLabel(id)}]`, 12, new Color(200, 90, 80, 255), 200, 20);
    }

    // 血量行
    const hpRow = this.createNode('HpRow', panel, 0, 10, 0, 0);
    this.createLabel(hpRow, `血 ${p.hp}/${HP_MAX}`, 14, new Color(232, 223, 206, 255), 120, 18);
    // 气量
    this.createLabel(hpRow, `  气 ${p.qi}`, 14, new Color(232, 223, 206, 255), 100, 18);
    // 兵法
    const stratLayers = totalStrategyLayers(p);
    this.createLabel(hpRow, `  兵法 ${stratLayers}层`, 13, new Color(200, 156, 90, 255), 120, 18);

    // 固有能力按钮
    const btnRow = this.createNode('BtnRow', panel, 0, -16, 0, 0);
    const canUseAbility = isActive && !e.turn.isAwaitingDefense() && e.emergencyHealPending === null;
    this.makeBtn(btnRow, `普通补气+2${p.usedNormalQi ? '(已用)' : ''}`, -100, () => {
      this.engine.useNormalQiButton(id);
      this.render();
    }, canUseAbility && !p.usedNormalQi);
    this.makeBtn(btnRow, `大补气+3${p.usedBigQi ? '(已用)' : ''}`, 0, () => {
      this.engine.useBigQiButton(id);
      this.render();
    }, canUseAbility && !p.usedBigQi);
    this.makeBtn(btnRow, `爆气-6气+1层`, 100, () => {
      this.engine.useManualBurst(id);
      this.render();
    }, canUseAbility && p.qi >= 6);
  }

  private renderHand(id: PlayerId): void {
    const hand = this.handAreas[id];
    hand.removeAllChildren();
    this.cardViews.clear();
    const e = this.engine;
    const p = e.state.players[id];
    const cards = p.hand;

    // 判定可出牌
    let canPlay = false;
    if (e.emergencyHealPending === id) canPlay = true;
    else if (e.turn.isAwaitingDefense()) canPlay = e.pendingAttack?.defender === id;
    else if (e.turn.isInActionPhase() && e.turn.activePlayer === id) canPlay = true;

    const cardW = CARD_VIEW_SIZE.width;
    const totalW = cards.length * (cardW + 4);
    const startX = -totalW / 2 + cardW / 2;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const playable = canPlay && this.isCardPlayable(card, id);
      const node = new Node(`Card_${card.uid}`);
      node.parent = hand;
      node.setPosition(startX + i * (cardW + 4), 0, 0);
      node.addComponent(UITransform).setContentSize(cardW, CARD_VIEW_SIZE.height);
      const view = node.addComponent(CardView);
      // 延迟 setup 到 next frame（onLoad 完成后）
      this.scheduleOnce(() => {
        view.setup(card.def, playable, (def: CardDef) => this.onCardClick(card, id));
      }, 0);
      this.cardViews.set(card.uid, view);
    }
  }

  private isCardPlayable(card: CardInstance, id: PlayerId): boolean {
    const e = this.engine;
    if (e.emergencyHealPending === id) {
      return card.def.category === CardCategory.FunctionHp;
    }
    if (e.turn.isAwaitingDefense()) {
      if (card.def.category === CardCategory.Armor) return true;
      if (card.def.category === CardCategory.Formation && card.def.subtype === FormationType.BaGua) return true;
      return false;
    }
    if (card.def.category === CardCategory.General) {
      const cost = calcGeneralCost(card.def, e.state.players[id]);
      return e.state.players[id].qi >= cost;
    }
    return true;
  }

  private renderCenter(): void {
    this.centerArea.removeAllChildren();
    const e = this.engine;

    // 提示
    this.createLabel(this.centerArea, this.getHint(), 15, new Color(200, 184, 148, 255), 600, 24)
      .node.setPosition(0, 60, 0);

    // 待结算攻击信息
    if (e.pendingAttack) {
      const atk = e.pendingAttack;
      const infoRow = this.createNode('AtkInfo', this.centerArea, 0, 30, 0, 0);
      this.createLabel(infoRow, `玩家${atk.attacker + 1} → 玩家${atk.defender + 1} · ${atk.damage}伤害`, 14, new Color(245, 216, 208, 255), 400, 20);
      if (e.defensePool > 0) {
        this.createLabel(infoRow, `  已防${e.defensePool}`, 12, new Color(180, 200, 220, 255), 100, 20);
      }
      if (e.baguaTriggered) {
        this.createLabel(infoRow, '  八卦阵待反弹', 12, new Color(192, 216, 208, 255), 150, 20);
      }
      // 防御方按钮
      this.makeBtn(this.centerArea, '结束防御·承受伤害', 0, -10, () => {
        this.engine.defenderPass();
        this.render();
      }, true);
    }

    // 紧急救血
    if (e.emergencyHealPending !== null) {
      this.makeBtn(this.centerArea, '放弃救血·接受败北', 0, -10, () => {
        this.engine.emergencyHealGiveUp();
        this.render();
      }, true);
    }

    // 行动阶段结束按钮
    if (e.turn.isInActionPhase() && !e.turn.isAwaitingDefense() && e.emergencyHealPending === null) {
      this.makeBtn(this.centerArea, '结束行动·进入回合结算', 0, -40, () => {
        this.engine.endActionPhase();
        this.render();
      }, true);
    }
  }

  private getHint(): string {
    const e = this.engine;
    if (e.state.gameOver) return '游戏结束';
    if (e.emergencyHealPending !== null) {
      return `玩家${e.emergencyHealPending + 1} 被打至0血 · 打补血牌续命或放弃`;
    }
    if (e.turn.isAwaitingDefense()) {
      const def = e.pendingAttack?.defender ?? 0;
      return `玩家${def + 1} 受击 · 打防具/八卦阵或结束防御`;
    }
    if (e.turn.isInActionPhase()) {
      const ap = e.turn.activePlayer;
      const opp = (1 - ap) as 0 | 1;
      const apHasGen = e.hasGeneralInHand(ap);
      const oppHasGen = e.hasGeneralInHand(opp);
      let hint = `玩家${ap + 1} 行动 · 出牌攻击/补气/补血/兵法/绝杀`;
      if (!apHasGen && !oppHasGen) hint += ' · 双方均无武将牌，可结束行动';
      else if (apHasGen && oppHasGen) hint += ' · 攻击后攻权切换给对方';
      return hint;
    }
    return '';
  }

  private renderLog(): void {
    this.logArea.removeAllChildren();
    const logs = this.engine.logs.slice(-3);
    const text = logs.join('  |  ');
    this.createLabel(this.logArea, text, 11, new Color(181, 163, 134, 255), 0, 0)
      .node.setPosition(0, 0, 0);
  }

  private renderGameOver(): void {
    if (this.gameOverOverlay) return;
    const e = this.engine;
    const r = e.state.result;
    const overlay = this.createNode('GameOver', this.node, 0, 0, 0, 0);
    const t = overlay.addComponent(UITransform);
    const designSize = view.getDesignResolutionSize();
    t.setContentSize(designSize.width, designSize.height);
    const bgSprite = overlay.addComponent(Sprite);
    bgSprite.color = new Color(0, 0, 0, 180);

    const title = r?.winner === null ? '平局' : `玩家 ${r!.winner! + 1} 获胜`;
    this.createLabel(overlay, title, 32, new Color(245, 230, 211, 255), 400, 40)
      .node.setPosition(0, 30, 0);
    this.createLabel(overlay, r?.detail ?? '', 14, new Color(181, 163, 134, 255), 500, 24)
      .node.setPosition(0, -10, 0);
    this.makeBtn(overlay, '重新开始', 0, -60, () => {
      this.engine = new GameEngine();
      this.engine.initGame();
      if (this.gameOverOverlay) {
        this.gameOverOverlay.destroy();
        this.gameOverOverlay = null;
      }
      this.render();
    }, true);

    this.gameOverOverlay = overlay;
  }

  // ============ 事件处理 ============

  private onCardClick(card: CardInstance, id: PlayerId): void {
    const e = this.engine;
    if (!this.isActorValid(id)) return;
    const result = applyCardEffect(e, card, id);
    this.render();
  }

  private isActorValid(id: PlayerId): boolean {
    const e = this.engine;
    if (e.state.gameOver) return false;
    if (e.emergencyHealPending !== null) return id === e.emergencyHealPending;
    if (e.turn.isAwaitingDefense()) return id === e.pendingAttack?.defender;
    return e.turn.isInActionPhase() && id === e.turn.activePlayer;
  }

  // ============ 辅助 ============

  private makeBtn(parent: Node, label: string, x: number, y: number, onClick: () => void, enabled: boolean): Node {
    const n = new Node(`Btn_${label}`);
    n.parent = parent;
    n.setPosition(x, y, 0);
    const t = n.addComponent(UITransform);
    t.setContentSize(160, 36);
    const sprite = n.addComponent(Sprite);
    sprite.color = enabled ? new Color(74, 64, 53, 255) : new Color(50, 44, 38, 255);
    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    const lbl = this.createLabel(n, label, 12, new Color(232, 223, 206, 255), 150, 24);
    lbl.node.setPosition(0, 0, 0);
    if (enabled) {
      n.on(Button.EventType.CLICK, () => onClick(), this);
    }
    return n;
  }
}
