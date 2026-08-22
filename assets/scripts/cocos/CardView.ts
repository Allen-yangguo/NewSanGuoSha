/**
 * 三国卡牌对战 · Cocos-Creator 3.x 卡牌视图组件
 * 程序化渲染单张卡牌（背景色+边框+名称+数值+描述），无需美术资源
 *
 * 使用方式：将此脚本挂到空节点上，调用 setup(cardDef) 即可
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
  Size,
  Vec3,
  UIOpacity,
  tween,
} from 'cc';
import { CardDef, CardCategory } from '../core/types';
import { CARD_COLORS } from '../core/cards';

const { ccclass, property } = _decorator;

const CARD_WIDTH = 110;
const CARD_HEIGHT = 154;

@ccclass('CardView')
export class CardView extends Component {
  private bgNode!: Node;
  private borderGraphics!: Node;
  private nameLabel!: Label;
  private catLabel!: Label;
  private valueLabel!: Label;
  private costLabel!: Label;
  private descLabel!: Label;
  private cardDef: CardDef | null = null;
  private playable: boolean = false;
  private onClickCallback: ((card: CardDef) => void) | null = null;

  onLoad(): void {
    this.buildView();
  }

  private buildView(): void {
    const transform = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    transform.setContentSize(CARD_WIDTH, CARD_HEIGHT);

    // 背景色块
    this.bgNode = new Node('CardBg');
    this.bgNode.parent = this.node;
    const bgTransform = this.bgNode.addComponent(UITransform);
    bgTransform.setContentSize(CARD_WIDTH - 4, CARD_HEIGHT - 4);
    const bgSprite = this.bgNode.addComponent(Sprite);
    bgSprite.spriteFrame = null; // 纯色
    bgSprite.color = new Color(255, 255, 255, 255);

    // 边框（用 Graphics 绘制矩形框）
    this.borderGraphics = new Node('CardBorder');
    this.borderGraphics.parent = this.node;
    const borderTransform = this.borderGraphics.addComponent(UITransform);
    borderTransform.setContentSize(CARD_WIDTH, CARD_HEIGHT);
    const g = this.borderGraphics.addComponent(Graphics);
    g.strokeColor = new Color(120, 100, 80, 255);
    g.lineWidth = 3;
    g.rect(-CARD_WIDTH / 2 + 1.5, -CARD_HEIGHT / 2 + 1.5, CARD_WIDTH - 3, CARD_HEIGHT - 3);
    g.stroke();

    // 类别标签（左上）
    const catNode = new Node('CatLabel');
    catNode.parent = this.node;
    catNode.setPosition(0, CARD_HEIGHT / 2 - 14, 0);
    const catT = catNode.addComponent(UITransform);
    catT.setContentSize(CARD_WIDTH - 10, 14);
    this.catLabel = catNode.addComponent(Label);
    this.catLabel.fontSize = 10;
    this.catLabel.lineHeight = 14;
    this.catLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

    // 名称
    const nameNode = new Node('NameLabel');
    nameNode.parent = this.node;
    nameNode.setPosition(0, CARD_HEIGHT / 2 - 30, 0);
    const nameT = nameNode.addComponent(UITransform);
    nameT.setContentSize(CARD_WIDTH - 10, 18);
    this.nameLabel = nameNode.addComponent(Label);
    this.nameLabel.fontSize = 14;
    this.nameLabel.lineHeight = 18;
    this.nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    // 中央数值
    const valueNode = new Node('ValueLabel');
    valueNode.parent = this.node;
    valueNode.setPosition(0, 0, 0);
    const valueT = valueNode.addComponent(UITransform);
    valueT.setContentSize(CARD_WIDTH - 10, 36);
    this.valueLabel = valueNode.addComponent(Label);
    this.valueLabel.fontSize = 26;
    this.valueLabel.lineHeight = 36;
    this.valueLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

    // 耗气（右上角）
    const costNode = new Node('CostLabel');
    costNode.parent = this.node;
    costNode.setPosition(CARD_WIDTH / 2 - 18, CARD_HEIGHT / 2 - 14, 0);
    const costT = costNode.addComponent(UITransform);
    costT.setContentSize(28, 14);
    this.costLabel = costNode.addComponent(Label);
    this.costLabel.fontSize = 10;
    this.costLabel.lineHeight = 14;
    this.costLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
    this.costLabel.string = '';

    // 描述（底部）
    const descNode = new Node('DescLabel');
    descNode.parent = this.node;
    descNode.setPosition(0, -CARD_HEIGHT / 2 + 18, 0);
    const descT = descNode.addComponent(UITransform);
    descT.setContentSize(CARD_WIDTH - 10, 28);
    this.descLabel = descNode.addComponent(Label);
    this.descLabel.fontSize = 9;
    this.descLabel.lineHeight = 11;
    this.descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.descLabel.verticalAlign = Label.VerticalAlign.BOTTOM;
  }

  /** 配置卡牌显示 */
  setup(def: CardDef, playable: boolean, onClick?: (card: CardDef) => void): void {
    this.cardDef = def;
    this.playable = playable;
    this.onClickCallback = onClick || null;

    const color = CARD_COLORS[def.category];

    // 背景色
    const bgSprite = this.bgNode.getComponent(Sprite)!;
    bgSprite.color = this.parseColor(color.bg);

    // 边框色
    const g = this.borderGraphics.getComponent(Graphics)!;
    g.clear();
    g.strokeColor = this.parseColor(color.border);
    g.lineWidth = 3;
    g.rect(-CARD_WIDTH / 2 + 1.5, -CARD_HEIGHT / 2 + 1.5, CARD_WIDTH - 3, CARD_HEIGHT - 3);
    g.stroke();

    // 文本
    this.catLabel.string = color.label;
    this.catLabel.color = this.parseColor(color.border);
    this.nameLabel.string = def.name;
    this.valueLabel.string = this.formatValue(def);
    this.descLabel.string = def.desc;

    // 耗气（仅武将牌）
    if (def.category === CardCategory.General) {
      this.costLabel.string = `耗气${def.cost}`;
    } else {
      this.costLabel.string = '';
    }

    // 可点击状态
    const opacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
    opacity.opacity = playable ? 255 : 180;

    // 绝杀牌用浅色文字
    if (def.category === CardCategory.Ultimate) {
      this.nameLabel.color = new Color(245, 230, 211, 255);
      this.valueLabel.color = new Color(245, 230, 211, 255);
    } else {
      this.nameLabel.color = new Color(43, 38, 32, 255);
      this.valueLabel.color = new Color(43, 38, 32, 255);
    }
  }

  private formatValue(def: CardDef): string {
    switch (def.category) {
      case CardCategory.General:    return `攻 ${def.value}`;
      case CardCategory.Armor:      return `防 ${def.value}`;
      case CardCategory.FunctionQi: return `+${def.value}气`;
      case CardCategory.FunctionHp: return `+${def.value}血`;
      case CardCategory.Strategy:   return `+${def.value}层`;
      case CardCategory.Ultimate:    return `${def.value}真伤`;
      case CardCategory.Formation:  return def.subtype === 'bagua' ? '反弹' : '篡先';
      default: return '';
    }
  }

  private parseColor(hex: string): Color {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return new Color(r, g, b, 255);
  }

  /** 触摸抬起回调 */
  onCardClick(): void {
    if (!this.playable || !this.cardDef || !this.onClickCallback) return;
    // 点击动画：抬起再回落
    const opacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
    tween(this.node)
      .to(0.08, { position: new Vec3(this.node.position.x, this.node.position.y + 10, 0) })
      .to(0.08, { position: new Vec3(this.node.position.x, this.node.position.y, 0) })
      .start();
    this.onClickCallback(this.cardDef);
  }
}

export const CARD_VIEW_SIZE = new Size(CARD_WIDTH, CARD_HEIGHT);
