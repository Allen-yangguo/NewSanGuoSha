# 三国卡牌对战 · 音效资源清单

> Web 测试版采用「**本地 MP3 优先 + Web Audio API 合成兜底**」方案
> 无需任何资源文件即可立即听到合成音效，下载真实 MP3 放入此目录即可替换

## 必需的 15 个音效文件

| 文件名 | 用途 | 时长建议 | 推荐搜索关键词 |
|---|---|---|---|
| `play.mp3` | 出牌动作（轻微沙沙声） | 0.1-0.3s | card flip / paper shuffle |
| `attack_light.mp3` | 武将攻击·轻击（攻1-2，简单音效） | 0.2-0.3s | martial arts fast punch |
| `attack_heavy.mp3` | 武将攻击·重击（攻3-5，重击音效） | 0.3-0.5s | strong punch impact |
| `hit_light.mp3` | 伤害命中·轻（小伤害，简单音效） | 0.1-0.2s | air hit / soft punch |
| `hit_heavy.mp3` | 伤害命中·重（大伤害，重击音效） | 0.2-0.4s | strong body punch |
| `armor_light.mp3` | 防具格挡·轻（防1-2，简单音效） | 0.1-0.2s | metallic sword strike |
| `armor_heavy.mp3` | 防具格挡·重（防3-4，重击音效） | 0.2-0.4s | metal hammer hit |
| `qi.mp3` | 补气（铃声） | 0.3-0.5s | chime / bell / coin |
| `heal.mp3` | 补血（药水） | 0.3-0.6s | potion / magic heal |
| `strategy.mp3` | 兵法（书页翻动） | 0.4-0.6s | page turn / book |
| `formation.mp3` | 阵法（符咒） | 0.4-0.8s | magic spell / rune |
| `ultimate.mp3` | 绝杀（剑鸣） | 0.5-1.0s | sword unsheathe / metal ring |
| `win.mp3` | 获胜（凯旋号角） | 0.6-1.5s | medieval fanfare / victory trumpet |
| `lose.mp3` | 败北（低沉下沉） | 0.6-1.2s | player lose / game over |
| `draw.mp3` | 平局（中性收尾） | 0.5-1.0s | notification / neutral chime |

## 免费音效资源下载站

任选以下网站，搜索上述关键词下载 CC0 / 免版税音效：

1. **mixkit.co**（推荐，无需注册，直接下载）
   - https://mixkit.co/free-sound-effects/
   - https://mixkit.co/free-sound-effects/game/

2. **Pixabay Sound Effects**
   - https://pixabay.com/sound-effects/
   - 全部 CC0，可商用

3. **freesound.org**（需注册账号）
   - https://freesound.org/
   - 大量 CC0 / CC BY 资源

4. **OpenGameArt**
   - https://opengameart.org/art-search-advanced?keys=sfx&type=audio
   - 游戏专用 CC0 资源

## 安装步骤

1. 从上述网站下载对应音效的 MP3 文件
2. 重命名为本清单的文件名（如 `card_flip.mp3` → `play.mp3`）
3. 放入此 `web-test/sfx/` 目录
4. 刷新浏览器页面，SoundManager 会自动加载真实音效

## 格式要求

- **格式**：MP3（浏览器通吃，迁移到微信小游戏也兼容）
- **大小**：单个文件 < 200KB 最佳
- **声道**：单声道即可（音效不需要立体声）
- **采样率**：44.1kHz 或 22.05kHz

## 迁移到 Cocos Creator / 微信小游戏

迁移时只需：
1. 将 `sfx/` 目录的 MP3 文件复制到 Cocos 项目的 `assets/resources/sfx/`
2. 在 Cocos 中用 `AudioSource` 组件或 `audioEngine.play` 替代 Web Audio
3. 触发点（哪张卡播什么音效）的映射关系保持不变，参见 `web-test/ui.ts` 的 `playSfxForResult` 方法
