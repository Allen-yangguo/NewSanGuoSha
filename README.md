# 三国卡牌对战 · V2.1

> 基于「吞食天地」题材的三国 1V1 卡牌对战
> 单机 vs AI · 局域网联机 · Web 浏览器立即可玩
> 104 张牌库定稿 · 完整战斗规则 · Socket.IO 实时对战

## 一、版本演进

| 版本 | 主要内容 |
|---|---|
| V1.0 | 单机热座版（Web 测试版 + Cocos 引擎核心） |
| V2.0 | 联机对战版（Socket.IO 服务端 + Vue3 前端） + 补气系统优化 |
| V2.1 | 紧急救血规则重做（overkill 溢出伤害判定）+ 胜负/绝杀过场动画 |

## 二、项目结构

```
new sanguosha/
├── assets/scripts/
│   └── core/                    # 引擎无关核心逻辑（服务端/单机/前端通用）
│       ├── types.ts             # 全部类型定义（卡牌/玩家/状态/回合阶段）
│       ├── cards.ts             # 104 张卡牌数据 + 配色规范
│       ├── GameState.ts         # 全局状态对象（血/气/手牌/牌库/弃牌/兵法）
│       ├── BattleState.ts       # 战斗状态（缺血/残血/残爆）+ 伤害结算公式
│       ├── CardEffect.ts        # 卡牌效果分发表
│       ├── TurnMachine.ts       # 回合时序状态机
│       └── GameEngine.ts        # 主控制器（对外暴露 API）
│
├── server/                      # Socket.IO 联机服务端
│   └── server.ts                # Express + Socket.IO + 单房间对战 + 视角隔离
│
├── client/                      # Vue3 + Vite 前端
│   ├── src/
│   │   ├── App.vue              # 主容器（模式选择/对战界面/过场动画）
│   │   ├── main.ts
│   │   ├── api/socket.ts        # Socket.IO 客户端封装
│   │   ├── audio/SoundManager.ts# 音效管理
│   │   ├── engine/localEngine.ts# 单机模式本地引擎
│   │   ├── store/gameStore.ts   # 响应式状态 + 事件分发
│   │   ├── styles/global.css    # 全局国风样式 + 动画
│   │   ├── types/protocol.ts    # 前后端协议类型
│   │   └── components/
│   │       ├── EntryScreen.vue  # 入口模式选择
│   │       ├── LobbyScreen.vue  # 局域网大厅
│   │       ├── PlayerPanel.vue  # 玩家面板（血/气/兵法/状态）
│   │       ├── GameCard.vue     # 卡牌组件
│   │       ├── PlayedCardsZone.vue # 桌面出牌展示
│   │       ├── VictoryAnim.vue  # 胜利过场动画（旗帜飘扬）
│   │       └── DefeatAnim.vue   # 失败过场动画（武将跪地）
│   ├── public/sfx/              # 音效资源
│   ├── dist/                    # 构建产物
│   └── package.json
│
├── test/                        # 自动化测试
│   ├── verify-deck.ts           # 104 张牌库对账
│   ├── verify-engine.ts         # 引擎核心逻辑（84 项测试）
│   └── integration-smoke.ts     # 联机集成冒烟测试
│
├── web-test/                    # V1.0 Web 测试版（双人热座）
├── scripts/
│   ├── build-web.js             # Web 测试版打包（esbuild）
│   └── download-sfx.ps1         # 音效下载脚本
└── package.json
```

## 三、快速启动

### 1. 安装依赖
```bash
npm install
cd client && npm install
```

### 2. 运行自动化测试
```bash
npm run test:deck       # 牌库 104 张对账
npm run test:engine     # 引擎 84 项逻辑测试
```

### 3. 启动联机服务端
```bash
npm run start:server
# 控制台打印局域网 URL + 二维码，手机同 WiFi 扫码即可加入
```

### 4. 构建前端
```bash
cd client
npm run build          # 产物输出到 client/dist，由 server.ts 静态托管
```

### 5. 访问游戏
- 电脑：浏览器打开 `http://localhost:3000`
- 手机：扫描终端二维码，或访问 `http://<电脑IP>:3000`

### 6. 单机模式（无需服务端）
直接打开前端页面，在入口选「单机 vs AI」即可。

## 四、核心规则实现

| 规则 | 实现位置 | 状态 |
|---|---|---|
| 基础数值（血6/上限10/气6） | [BattleState.ts](assets/scripts/core/BattleState.ts) | ✓ |
| 104 张牌库（38+23+12+19+3+5+4） | [cards.ts](assets/scripts/core/cards.ts) `buildFullDeck` | ✓ |
| 回合时序（行动→受击→结算→补牌→换先手） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `endTurn` | ✓ |
| 攻击权交替（无武将牌则连击） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `switchActiveAfterAttackResolve` | ✓ |
| 每 2 回合全局回气 +1 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `endTurn` `qiRecovery` | ✓ |
| 兵法独立倒计时（3 回合到期清除） | [BattleState.ts](assets/scripts/core/BattleState.ts) `tickStrategies` | ✓ |
| 缺血(2血)/残血(1血)/残爆三态互斥 | [BattleState.ts](assets/scripts/core/BattleState.ts) `getBattleState` | ✓ |
| 残爆覆盖残血但保留 0 费特权 | [BattleState.ts](assets/scripts/core/BattleState.ts) `calcGeneralCost` | ✓ |
| 伤害结算公式（基础+兵法+状态） | [BattleState.ts](assets/scripts/core/BattleState.ts) `calcGeneralDamage` | ✓ |
| 掉血补气（有效扣血 +1 气） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `applyDamage` | ✓ |
| 满血补血转气 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `playFunctionHp` | ✓ |
| 八卦阵全额反弹（不可反弹绝杀） | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `resolvePendingAttack` | ✓ |
| 追风阵强制下回合仍先手 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `playFormation` | ✓ |
| 绝杀击杀直接判负 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `applyDamage` | ✓ |
| 紧急救血：overkill 机制 | [GameEngine.ts](assets/scripts/core/GameEngine.ts) `applyDamage + playFunctionHp` | ✓ |
| 牌库耗尽胜负判定 | [GameState.ts](assets/scripts/core/GameState.ts) `checkGameOver` | ✓ |

## 五、V2.1 紧急救血规则

### 旧规则（V2.0）
普通攻击打至 0 血 → 直接进入紧急救血，可无限补血续命。

### 新规则（V2.1）
1. 普通攻击打至 0 血时，计算 **溢出伤害 overkill** = 实际伤害 - 受击前 HP
2. 检查手牌中所有补血牌总量 `totalHeal`
3. **`totalHeal > overkill`** → 进入紧急救血，补血时先抵消 overkill，剩余才回血
4. **`totalHeal <= overkill`** → 无法挽救，直接判负（不显示「接受败北」按钮）

**示例**：HP=3 受 5 伤害 → overkill=2。手牌补血总量 > 2 才能救；否则直接判负。

## 六、过场动画

| 场景 | 动画 | 实现 |
|---|---|---|
| 绝杀打出 | 金红径向闪光 + "绝杀"文字缩放旋转 | [global.css](client/src/styles/global.css) `.ultimate-overlay` |
| 胜利 | 旗帜飘扬（SVG path 形变 + CSS 飘摆 + 金色光斑） | [VictoryAnim.vue](client/src/components/VictoryAnim.vue) |
| 失败 | 武将跪地（剪影下落 + 鲜血滴落 + 尘土飘散 + 断剑掉落） | [DefeatAnim.vue](client/src/components/DefeatAnim.vue) |
| 平局 | 文字缩放渐显 | [App.vue](client/src/App.vue) `.go-transition-text` |

**特点**：全部纯 SVG + CSS 动画，零图片资源，加载快，可缩放。

## 七、联机架构

```
┌─────────────────┐     Socket.IO      ┌─────────────────┐
│  玩家1 浏览器    │ ←─────────────────→ │  玩家2 浏览器    │
│  (Vue3 前端)    │                     │  (Vue3 前端)    │
└────────┬────────┘                     └────────┬────────┘
         │                                       │
         └─────────────┬─────────────────────────┘
                       │ WebSocket
         ┌─────────────▼─────────────┐
         │  Node.js + Express +     │
         │  Socket.IO 服务端         │
         │  (server/server.ts)      │
         │                          │
         │  · 单房间模式              │
         │  · 视角严格隔离            │
         │  · 直接调用 GameEngine    │
         └──────────────────────────┘
```

### 关键设计
- **视角隔离**：服务端为每个 socket 生成过滤后的 `RoomStateView`，对手手牌永远为空
- **单房间模式**：固定 `ROOM_ID`，两位玩家到齐自动开局
- **断线重连**：localStorage 记录槽位，重连恢复到原 p1/p2
- **重置下一局**：保留双方 socketId，仅重置引擎

## 八、卡牌数量对账（104 张定稿）

| 类别 | 数量 | 汇总 |
|---|---|---|
| 武将攻击 | 38 | 总攻击 81 / 总耗气 80 |
| 防具防御 | 23 | 总防御 46 |
| 功能-补气 | 12 | 总补气 32（兵粮6+整军4+军需2） |
| 功能-补血 | 19 | 总回血 31 |
| 兵法增伤 | 3 | 孟德新书×2 / 孙子兵法×1 |
| 绝杀神兵 | 5 | 总穿透 6（倚天剑占 2） |
| 阵法战术 | 4 | 八卦阵×2 / 追风阵×2 |
| **合计** | **104** | 全量对账通过 |

## 九、部署到云服务器

### Zeabur（推荐，国内可访问）
1. 推送代码到 GitHub
2. [zeabur.com](https://zeabur.com) 新建服务 → 选 GitHub 仓库
3. Build Command：`npm install && cd client && npm install && npm run build`
4. Start Command：`npm run start:server`
5. 环境变量：`PORT=10000`

### Render / Railway / Fly.io
配置同上，但国内访问可能需要代理。

### 自建 VPS（阿里云/腾讯云）
```bash
# 服务器安装 Node.js 18+
git clone <repo>
cd new-sanguosha
npm install && cd client && npm install && npm run build && cd ..
PORT=80 npm run start:server
# 用 PM2 守护：pm2 start "npm run start:server" --name sanguosha
```

## 十、开发命令速查

```bash
# 测试
npm run test:deck           # 牌库对账
npm run test:engine         # 引擎逻辑（84 项）
npm run typecheck           # TypeScript 类型检查

# 联机开发
npm run start:server        # 启动服务端
cd client && npm run dev    # 前端热更新开发
cd client && npm run build  # 前端构建

# 旧版 Web 测试版（双人热座）
npm run build:web           # esbuild 打包到 web-test/bundle.js
```

## 十一、技术栈

- **核心引擎**：TypeScript（引擎无关，服务端/单机/前端通用）
- **服务端**：Node.js + Express 5 + Socket.IO 4
- **前端**：Vue 3 + Vite 6
- **音效**：Web Audio API（13 种音效，自动播放策略处理）
- **动画**：纯 SVG + CSS（旗帜飘扬、武将跪地、绝杀闪光）
- **二维码**：qrcode（控制台 + 数据 URL 双模式）
