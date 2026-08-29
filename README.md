# 三国卡牌对战 · V6.0

> 基于「吞食天地」题材的三国 1V1 卡牌对战
> 单机 vs AI · 局域网联机 · Web 浏览器立即可玩
> 135 张牌库定稿 · 完整战斗规则 · Socket.IO 实时对战 · 模拟玩家系统 · 对局旁观

## 一、版本演进

| 版本 | 主要内容 |
|---|---|
| V1.0 | 单机热座版（Web 测试版 + Cocos 引擎核心） |
| V2.0 | 联机对战版（Socket.IO 服务端 + Vue3 前端） + 补气系统优化 |
| V2.1 | 紧急救血规则重做（overkill 溢出伤害判定）+ 胜负/绝杀过场动画 |
| V4.0+ | 账号/战绩系统 + 流量监控 + 管理后台（统一 ADMIN_TOKEN 鉴权） |
| V5.0 | 智者锦囊 / 盾系列防具 / 回合清桌 / 限定卡 15 张 |
| V6.0 | 模拟玩家系统（AI 扮演真人）+ 对局旁观 + 10 桌并行 |

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
5. 环境变量：`PORT=10000`（可选：`ADMIN_TOKEN=你的后台密码`，见「十二、流量监控模块」「十三、管理后台」，两处共用这一个变量）

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

## 十二、流量监控模块

服务端内置轻量流量监控，无需额外依赖：

### 监控内容
- **HTTP 请求统计**：每个路由 / 状态码的请求数、QPS、响应/请求字节数
- **活跃玩家与对局**：当前在线连接数（Socket.IO）、5 桌中对局中桌数

### 数据存储
- 内存保留最近 **24 小时**（分钟级粒度）
- 每小时自动落盘到 `data/monitor/monitor-YYYY-MM-DD.json`（纯 JSON，与用户数据同一目录）
- 服务重启自动加载历史文件，超过 24 小时的数据按小时粒度聚合可查
- 收到 `SIGTERM/SIGINT`（如 Zeabur 重新部署）时先落盘再退出

### 接口（需鉴权）
| 接口 | 说明 |
| --- | --- |
| `GET /api/monitor/summary` | 实时快照：在线、对局、今日请求、QPS、流量、内存、运行时长 |
| `GET /api/monitor/series?minutes=120` | 时间序列（`minutes` 最大 10080，超过 24h 自动聚合为小时）+ Top 路由/状态码 |
| `GET /api/monitor/status` | 轻量健康检查 |

鉴权方式：`Authorization: Bearer <token>` 或查询参数 `?token=<token>`。

### Web 面板
访问 `https://你的域名/monitor` 查看可视化面板（请求曲线、在线/对局曲线、流量、路由与状态码分布），页面每 5 秒自动刷新，支持 1 小时 / 6 小时 / 24 小时 / 7 天时间范围。

### 部署配置（重要）
流量监控**不再独立鉴权**，与管理后台统一使用 `ADMIN_TOKEN`（见「十三、管理后台」），只需配置一个环境变量：
- 已配置 `ADMIN_TOKEN` → 监控面板与接口均需该 token
- **未配置** → 生产环境（`NODE_ENV=production`）下监控接口直接返回 403 禁用，防止流量数据公开展示；开发环境（本地 `npm run start:server`）未配置时放行，便于调试

### 本地验证
```bash
PORT=10000 NODE_ENV=development ADMIN_TOKEN=test123 npm run start:server
# 浏览器打开 http://localhost:10000/monitor ，输入 test123 查看面板
```

## 十三、管理后台

服务端内置管理后台，包含**用户管理**与**等级设置**，并可直接跳转流量监控面板。

### 访问
```
https://你的域名/admin
```
页面内两个模块 + 顶部「📊 流量监控」入口链接。

### 部署配置（重要）
### 部署配置（重要）
在 Zeabur 环境变量中添加（**唯一需要配置的后台变量**，监控面板 `/monitor` 与管理后台 `/admin` 共用）：
```
ADMIN_TOKEN=你的后台密码
```
- 已配置 → 管理后台与流量监控的接口均需该 token
- **未配置** → 生产环境（`NODE_ENV=production`）下两者接口直接返回 403 禁用；开发环境放行便于调试

### 用户管理
- 列表 / 按 id、手机号、用户名、昵称搜索，附战绩摘要（对局数、胜场、总分、等级）
- 重置密码（新密码需 ≥8 位且含字母和数字）
- 删除用户（同时删除其战绩）

### 等级设置
- 等级按**累计积分区间**划分，默认 **14 级**：新兵 → 步卒 → 校尉 → 偏将 → 大将 → 军师 → 统帅 → 霸主 → 枭雄 → 王侯 → 帝王 → 圣君 → 传说 → 不朽
- 积分区间逐级加宽（500 → 700 → … → 7000 分），级别越高升级所需分数越多；「不朽」为开放上限
- 可修改等级名称与分数区间，**保存后立即生效**，无需重启（存 `data/levels.json` 热加载，重启后仍保留）
- **支持新增 / 删除等级**：新增默认追加到最高级之上；删除时分数区间自动并入相邻级并重排，保证区间始终连续
- 校验规则：lv 从 1 连续递增、第 1 级下限必须为 0、各级区间必须连续（上一级上限 + 1 = 下一级下限）、名称 ≤12 字
- 「恢复默认」一键回到内置 14 级配置

### 接口（需鉴权）
| 接口 | 说明 |
| --- | --- |
| `GET /api/admin/users?keyword=` | 用户列表/搜索（含战绩摘要） |
| `PUT /api/admin/users/:uid/reset-password` | 重置密码 `{ newPassword }` |
| `DELETE /api/admin/users/:uid` | 删除用户 |
| `GET /api/admin/levels` | 当前等级配置 + 默认配置 |
| `PUT /api/admin/levels` | 保存等级配置 `{ levels: [{lv,name,min,max}] }` |
| `POST /api/admin/levels/reset` | 恢复默认等级 |

鉴权方式：`Authorization: Bearer <token>` 或查询参数 `?token=<token>`。

### 本地验证
```bash
PORT=10000 NODE_ENV=development ADMIN_TOKEN=admin123 npm run start:server
# 浏览器打开 http://localhost:10000/admin ，输入 admin123 进入后台
# 监控面板 http://localhost:10000/monitor 也使用同一个 admin123
```

## 十四、v5.0 规则改动（智者锦囊 / 盾防具 / 回合清桌）

### 回合 & 场上清牌
- **删除旧规则**：手牌满 8 张触发清牌（引擎中从未实现，无迁移）
- **新规则**：每回合结束直接清空桌面所有已打出实体卡牌（武将/防具/阵法/功能牌）统一进弃牌堆；玩家手牌保留
- 状态标记（爆气层数、缺血/残血、锦囊、阵法增减益）**回合结束不清空**，依靠回合计时衰减或效果消耗

### 盾系列防具（B2）
- 新增平行防具【盾系列】：木盾 8 张防 1 / 铜盾 5 张防 2 / 铁盾 3 张防 3 / 钢盾 2 张防 4；甲系列：皮甲 8 / 铜甲 5 / 铁甲 4 / 钢甲 3
- 机制不变：一次性消耗品，受攻击时打出抵消伤害

### 智者牌（诸葛亮 / 周瑜 / 司马懿，各 1 张，0 耗气）
打出智者获得**锦囊标记**；标记**使用才消耗，跨回合保留**；使用锦囊后**系统随机给出一张内置卡牌**（玩家不可自选），产出的卡牌均为实体手牌。

| 智者 | 缺锦囊（缺血 hp=2 / 残血 hp=1 可用） | 残锦囊（残血 hp=1） | 急锦囊（急救阶段） |
| --- | --- | --- | --- |
| 诸葛亮 | 八卦阵 / 龟背阵 / 奇门遁甲（兵法+3·3回合） | 蛇矛张飞·偃月关羽·龙胆赵云（攻6耗5）/ 方天吕布（攻7耗5）/ 三英（攻8耗5） | 还魂丹 / 绝疗丹（保 1 血） |
| 周瑜 | 火烧连营（兵法+3·3回合）/ 鱼鳞阵（防具防御+1·3回合） | 大乔（清空敌方气量）/ 孙尚香（偷敌方急锦囊） | — |
| 司马懿 | 龟背阵 / 坚壁清野（2 层减攻-2·3回合） | 红血许褚·红血典韦·红血徐晃（攻6耗5） | — |

- **绝杀致死自救**：遭遇绝杀触发急锦囊，50% 抽到绝疗丹保 1 血、抽到还魂丹直接死亡；手牌已有绝疗丹也可直接保命（全游戏唯一可应对绝杀致死的手段）
- 还魂丹仅救普通攻击致死；绝疗丹普通攻击与绝杀均有效

### 新增武将（入初始公共牌库）
- 一流武将（曹操阵营，攻 4 耗 4）：许褚、典韦、徐晃
- 二流武将（攻 3 耗 3）新增：颜良、文丑、华雄、庞德（张辽已在牌库）

### 阵法定稿
八卦阵（反弹）/ 龟背阵（减攻 1 层·3 回合，可叠加）/ 奇门遁甲（兵法+3）/ 火烧连营（兵法+3）/ 鱼鳞阵（防具+1·3回合，牌库 1 张）/ 坚壁清野（减攻 2 层·3 回合）

### 限定产出卡（15 张，不在初始牌库，仅锦囊产出）
蛇矛张飞、偃月关羽、龙胆赵云、方天吕布、三英、大乔、孙尚香、红血许褚、红血典韦、红血徐晃、还魂丹、绝疗丹、奇门遁甲、火烧连营、坚壁清野

### 边界规则
1. 实体卡牌打出场后进桌面，回合结束统一进弃牌堆
2. 状态标记跨回合保留，按回合计时衰减/效果增减
3. 绝杀牌无视阵法减攻与普通防具；仅绝疗丹可应对绝杀致死

### 牌库对账
初始牌库 **135 张**（武将 44 + 防具 38 + 补气 12 + 补血 22 + 兵法 3 + 绝杀 5 + 阵法 6 + 魅惑 2 + 智者 3），限定卡 15 张。测试：`npm run test:deck`、`npm run test:engine`、`npm run test:v43`。

### 说明（实现取舍）
- 龟背阵改为**层数制**（可叠加）：龟背阵 +1 层、坚壁清野 +2 层，减伤 = 层数，最低到 0，对绝杀无效
- 「兵法乘数 +3」按现有兵法层数机制实现为 **+3 层兵法**（持续 3 回合）
- 大乔/孙尚香按规格「打出触发」：锦囊产出实体卡到手牌，**打出时**再清空敌方气量/偷取急锦囊
- 二流武将中张辽原本已在牌库，未重复添加；徐晃由二流（攻3）晋升为一流（攻4）

## 十五、v6.0 模拟玩家系统

### 设计目标
模拟玩家（AI 机器人）**与真人走完全相同的 Socket.IO 协议**（坐桌/准备/出牌/结算），真人完全无法感知对方是 AI——可在 AI 独占等待的桌落座，与 AI 正常对战。

### 核心机制
- **预建 20 个模拟玩家**：启动时自动创建（昵称由三国风前缀+后缀随机生成），写入用户表（`isBot` 标记），积分结算与真人完全一致
- **每日新增 2-3 个**：跨日自动补充（`data/bots-meta.json` 记录），模拟玩家池持续增长
- **同时活跃上限 10 个**：休眠-唤醒轮换（3 分钟一轮），超出上限的自动休眠，需要时再唤醒
- **分时段活跃密度**：黄金时段（18:00–24:00、0:00–1:00）10 个全开；低谷时段 4 个；**凌晨 1:00–6:00 所有模拟玩家不出现**（在线 0 个）
- **每日对局上限 30 局**：单个模拟玩家一天打完 30 局后不再被激活，跨日重置
- **入座优先级**：陪真人 > 独占空桌等真人（最多 6 桌）> 机器人互相对局（最多 4 桌），保证真人始终有位置
- **AI 行为拟真**：大厅闲逛（空闲轮询 10-20s）、入座错峰（0.5-3.5s）、打牌启发式（攻击/防御/急救/锦囊）、对局结束自动记战绩并回到大厅

### 技术实现
- `server/bots/botManager.ts`：昵称生成、`ensureBots` 预建、`dailyAddBots` 每日补充、`currentMaxActive` 时段计算、`rotateActive` 休眠/唤醒、`lobbyLoop` 入座调度、`botAction/botDefend/botEmergency` 打牌启发式、`eventGameOver` 每日计数、`startLoopWatchdog` 事件循环停滞看门狗
- 机器人使用**真实的 socket.io-client 连接**（服务端进程内），与真人协议完全一致；`activeBotSocketIds` 追踪在线机器人（监控区分用）
- 战绩由服务端 `broadcastSettlement` 统一结算，机器人自动累计积分

### 监控与管理
- 监控面板新增「包含模拟玩家」checkbox（默认勾选，localStorage 记忆）：勾选时在线/对局数包含机器人，取消勾选只看真人
- `GET /api/monitor/summary` 返回 `onlineReal/onlineBots/activeTablesReal/activeTablesBots` 拆分字段
- 管理后台用户列表：模拟玩家昵称旁带「机器人」徽章，可按需筛选

## 十六、v6.0 对局旁观

- 大厅桌卡：**对局进行中**（且非自己所在桌）显示「👁 旁观」按钮，点击后弹出 p1/p2 两个视角按钮
- 任选一方视角进入旁观：可实时看到该方手牌、场上出牌与血量变化（服务端按旁观槽位生成视角）
- 可旁观 **AI 之间**的对局（机器人互打时同样可旁观）
- 旁观者**不能出牌**（服务端拒绝旁观者的任何操作事件）
- 顶部横幅提示「旁观中 · 桌N（p1 视角）」，点击「退出旁观」返回大厅
- 实现：服务端 `spectatorSlots` + `spectators` 映射、`buildRoomState` 视角回退到旁观槽位、`broadcastRoomState` 额外推送旁观者；客户端 `gameStore.spectate/exitSpectate` + `App.vue` 旁观模式

## 十七、v6.0 验证

```bash
# 服务端构建 + 客户端构建
npm run build:server
cd client && npm run build

# 牌库 / 引擎 / v4.3 机制回归
npm run test:deck
npm run test:engine
npm run test:v43

# v6.0 端到端冒烟（需先启动服务端）
npm run test:v6   # 真人 vs 机器人 6 项 + 旁观 6 项
```

### 本地启动
```bash
PORT=10000 NODE_ENV=development ADMIN_TOKEN=admin123 npm run start:server
```
- 浏览器访问 `http://localhost:10000`（游戏）、`/monitor`（监控，可切换包含模拟玩家）、`/admin`（后台，可见机器人徽章）
- 启动后观察控制台：机器人上线/入桌/开局日志正常，凌晨 1-6 点全部休眠
