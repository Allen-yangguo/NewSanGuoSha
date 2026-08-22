# 三国卡牌对战 · 107 张定稿版

> 基于「吞食天地」题材的三国 1V1 卡牌对战 · 双人热座
> 核心逻辑引擎无关，同时提供 **Web 测试版**（立即可玩）与 **Cocos-Creator 微信小游戏版**

## 一、项目结构

```
new sanguosha/
├── assets/scripts/
│   ├── core/                    # 引擎无关核心逻辑（Cocos/Web 通用）
│   │   ├── types.ts             # 全部类型定义（卡牌/玩家/状态/回合阶段）
│   │   ├── cards.ts             # 107 张卡牌数据 + 配色规范
│   │   ├── GameState.ts         # 全局状态对象（血/气/手牌/牌库/弃牌/兵法）
│   │   ├── BattleState.ts      # 战斗状态（缺血/残血/残爆）+ 伤害结算公式
│   │   ├── CardEffect.ts       # 卡牌效果分发表
│   │   ├── TurnMachine.ts      # 回合时序状态机
│   │   └── GameEngine.ts       # 主控制器（集齐上述，对外暴露 API）
│   └── cocos/                  # Cocos-Creator 3.x UI 层
│       ├── CardView.ts         # 单张卡牌程序化渲染
│       └── GameController.ts   # 主控制器（程序化构建整个对战界面）
├── web-test/                   # Web 测试版（不依赖 Cocos 即可玩）
│   ├── index.html
│   ├── styles.css
│   ├── ui.ts                   # Web UI 控制器
│   └── bundle.js               # esbuild 打包产物（运行 npm run build:web 生成）
├── test/                       # 自动化测试
│   ├── verify-deck.ts          # 107 张牌库对账
│   └── verify-engine.ts        # 引擎核心逻辑测试
├── scripts/
│   └── build-web.js            # Web 打包脚本（esbuild）
├── package.json
└── tsconfig.json
```

## 二、核心规则实现清单（与官方文档逐条对应）

| 文档章节 | 实现位置 | 状态 |
|---|---|---|
| 一·基础数值（血6/上限10/气6/无上限） | [BattleState.ts](assets/scripts/core/BattleState.ts) `HP_INIT/QI_INIT/HP_MAX` | ✓ |
| 一·先手互换 + 追风阵篡改 | [GameState.ts](assets/scripts/core/GameState.ts) `setFirstPlayerForRound` | ✓ |
| 二·开局洗牌+各5张手牌 | [GameState.ts](assets/scripts/core/GameState.ts) `initDeck/dealInitialHands` | ✓ |
| 三·回合时序 行动→受击→结算→补牌→换先手 | [TurnMachine.ts](assets/scripts/core/TurnMachine.ts) + [GameEngine.ts](assets/scripts/core/GameEngine.ts) `endTurn` | ✓ |
| 三·攻击权交替（一方攻击结束→轮到另一方，除非对方无武将牌） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `switchActiveAfterAttackResolve` | ✓ |
| 三·全局回气+1 / 兵法倒计时-1 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `endTurn` | ✓ |
| 三·补牌规则（空4有3） | [GameState.ts](assets/scripts/core/GameState.ts) `drawForTurn` | ✓ |
| 四·玩家专属按钮（普通+2/大+3/各限1次） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `useNormalQiButton/useBigQiButton` | ✓ |
| 五·107张牌库（38+23+34+3+5+4） | [cards.ts](assets/scripts/core/cards.ts) `buildFullDeck` + `assertDeckSize` | ✓ |
| 六·缺血/残血/残爆三态互斥 | [BattleState.ts](assets/scripts/core/BattleState.ts) `getBattleState` | ✓ |
| 六·残爆覆盖残血但保留0费特权 | [BattleState.ts](assets/scripts/core/BattleState.ts) `calcGeneralCost` | ✓ |
| 六·伤害结算公式（基础+兵法+状态） | [BattleState.ts](assets/scripts/core/BattleState.ts) `calcGeneralDamage` | ✓ |
| 七·掉血补气（每次有效扣血+1） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `applyDamage` | ✓ |
| 七·无伤格挡/反弹不补气 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `applyDamage` 仅 `actualLoss>0` 时补气 | ✓ |
| 七·满血补血转气 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `playFunctionHp` | ✓ |
| 八·绝杀/倚天剑击杀不可急救 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `applyDamage` 绝杀分支 | ✓ |
| 八·普通攻击打至0血可急救 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `emergencyHealPending` | ✓ |
| 八·牌库耗尽胜负判定 | [GameState.ts](assets/scripts/core/GameState.ts) `checkGameOver` | ✓ |
| 五·4·兵法独立倒计时（不只记总层数） | [types.ts](assets/scripts/core/types.ts) `StrategyRecord` + [BattleState.ts](assets/scripts/core/BattleState.ts) `tickStrategies` | ✓ |
| 五·6·八卦阵全额反弹（不可反弹绝杀） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `resolvePendingAttack` | ✓ |
| 五·6·追风阵强制下回合仍先手 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `playFormation` + [GameState.ts](assets/scripts/core/GameState.ts) `setFirstPlayerForRound` | ✓ |

## 三、快速验证（无需 Cocos IDE）

### 1. 安装依赖
```bash
npm install
```

### 2. 运行自动化测试（牌库对账 + 引擎逻辑）
```bash
npm run test:deck
npm run test:engine
```
预期输出：牌库 107 张全量对账通过 + 引擎 39 项逻辑测试通过。

### 3. 启动 Web 测试版（双人热座可玩）
```bash
npm run build:web
# 任选一种静态服务器：
python -m http.server 8000 --directory web-test
# 浏览器打开 http://localhost:8000/
```

**Web 版操作说明**：
- 顶部状态栏：回合数 / 阶段 / 牌库剩余
- 玩家面板（上下两方）：血量条、气量、兵法层数、战斗状态徽章、专属补气按钮
- 手牌区：可出的牌会高亮且悬停抬起，点击即出
- 中央交互区：当前提示 / 待结算攻击 / 结束行动 / 结束防御 / 放弃救血 等按钮
- 底部日志：最近 30 条战况

## 四、Cocos-Creator 3.x 微信小游戏打包

### 1. 新建 Cocos 项目
- 打开 Cocos Creator 3.x（建议 3.8+）
- 新建空白项目（2D 模板）

### 2. 导入核心逻辑
- 将本仓库 `assets/scripts/core/` 整个文件夹复制到 Cocos 项目的 `assets/scripts/core/`
- Cocos 会自动为每个 .ts 生成 .meta 文件

### 3. 导入 UI 组件
- 将 `assets/scripts/cocos/` 复制到 Cocos 项目的 `assets/scripts/cocos/`

### 4. 搭建场景
- 新建空场景
- 在 Canvas 下新建空节点 `GameRoot`
- 将 `GameController` 脚本挂到 `GameRoot` 上
- 保存场景

### 5. 运行验证
- 点击预览，应自动渲染出完整对战界面（程序化构建，无需预制体）

### 6. 打包微信小游戏
- 菜单 `项目 → 构建发布`
- 平台选「微信小游戏」
- 填入微信 AppID
- 构建后用微信开发者工具打开产物目录即可预览

## 五、架构说明

### 业务与 UI 解耦（按文档要求）
```
┌─────────────────────────────────┐
│  UI 层（Cocos 组件 / Web DOM）   │  仅读取 state 做显示
├─────────────────────────────────┤
│  GameEngine（核心控制器）         │  所有业务逻辑入口
├──────┬──────┬──────┬─────────────┤
│GameState│TurnMachine│BattleState│CardEffect│  各司其职
├──────┴──────┴──────┴─────────────┤
│  cards.ts（107 张数据）+ types.ts │  静态数据
└─────────────────────────────────┘
```

- **GameState**：纯数据，保存双方血/气/手牌/牌库/弃牌/兵法记录/固有能力标记
- **TurnMachine**：回合阶段状态机（行动→受击→结算→补牌→换先手）
- **BattleState**：缺血/残血/残爆三态判定 + 伤害/耗气公式
- **CardEffect**：按卡牌类别路由的分发表
- **GameEngine**：集成上述全部，对外暴露 `playCard/useNormalQiButton/endActionPhase` 等 API

### 关键设计点
1. **兵法独立倒计时**：`StrategyRecord` 记录每张兵法卡的剩余回合，到期自动清除，不合并总层数（文档明确要求）
2. **残爆覆盖残血**：`getBattleState` 中残爆返回 +2 增伤，覆盖残血 +1，但 `calcGeneralCost` 仍保留 0 费特权
3. **掉血补气仅在有效扣血时触发**：`applyDamage` 中 `actualLoss > 0` 才 +1 气，无伤格挡/反弹不补气
4. **绝杀击杀不可急救**：`applyDamage` 中 `source === 'ultimate'` 分支直接判负，普通攻击到 0 血才进入 `emergencyHealPending`

## 六、卡牌数量对账（107 张定稿）

| 类别 | 数量 | 攻击/防御/补气/补血/层数/真伤 汇总 |
|---|---|---|
| 武将攻击 | 38 | 总攻击 81 / 总耗气 80 |
| 防具防御 | 23 | 总防御 46 |
| 功能-补气 | 15 | 总补气 39 |
| 功能-补血 | 19 | 总回血 31 |
| 兵法增伤 | 3 | 孟德新书×2(+1) / 孙子兵法×1(+2) |
| 绝杀神兵 | 5 | 总穿透 6（倚天剑占 2） |
| 阵法战术 | 4 | 八卦阵×2 / 追风阵×2 |
| **合计** | **107** | 全量对账通过 |

## 七、开发命令速查

```bash
npm install              # 安装依赖
npm run test:deck       # 牌库 107 张对账
npm run test:engine     # 引擎 39 项逻辑测试
npm run build:web       # 构建 Web 测试版 bundle.js
npm run typecheck       # TypeScript 类型检查
```
