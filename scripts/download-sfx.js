/**
 * 三国卡牌对战 · 从 Mixkit 批量下载 9 个免费 CC0 音效
 * 许可证：Mixkit Sound Effects Free License（免署名、可商用）
 * 直链规律：https://assets.mixkit.co/active_storage/sfx/{ID}/{ID}-preview.mp3
 *
 * 运行：node scripts/download-sfx.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDir = path.join(__dirname, '..', 'web-test', 'sfx');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 15 个音效对应的 Mixkit ID（从 mixkit.co 搜索结果收集的真实直链）
// 注：attack_heavy / hit_heavy 已改用 Web Audio API 合成兜底（重声短音），不再下载
const sfxMap = {
  'play.mp3':             166,    // Fast small sweep transition (出牌沙沙声)
  'attack_light.mp3':    2047,   // Martial arts fast punch (武将攻击·轻击)
  'hit_light.mp3':       2161,   // Air in a hit (伤害命中·轻)
  'armor_light.mp3':     2160,   // Metallic sword strike (防具格挡·轻)
  'armor_heavy.mp3':     833,    // Metal hammer hit (防具格挡·重)
  'qi.mp3':              2633,   // Sweeping sparkle presentation (补气上升铃声)
  'heal.mp3':            2608,   // Air zoom vacuum (补血温暖上升)
  'strategy.mp3':        1457,   // Glitch static (兵法书页/电流)
  'formation.mp3':       3115,   // Fast transitions swoosh (阵法神秘)
  'ultimate.mp3':        2908,   // Movie trailer epic impact (绝杀剑鸣大冲击)
  'win.mp3':             767,    // Medieval show fanfare announcement (中世纪号角)
  'lose.mp3':            2042,   // Player losing or failing (败北下沉)
  'draw.mp3':            265,    // Quick positive video game notification (平局中性提示)
};

function download(url, targetPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    const req = https.get(url, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(targetPath);
        return download(res.headers.location, targetPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(targetPath);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    });
    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      reject(err);
    });
    req.setTimeout(30000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function main() {
  console.log('=== Downloading 13 SFX to', targetDir, '===');
  console.log('');

  const entries = Object.entries(sfxMap);
  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const [filename, id] = entries[i];
    const url = `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`;
    const targetPath = path.join(targetDir, filename);

    process.stdout.write(`[${i + 1}/${entries.length}] ${filename} ... (ID: ${id}) `);
    try {
      await download(url, targetPath);
      const size = fs.statSync(targetPath).size;
      if (size < 500) {
        console.log(`X too small (${size} bytes)`);
        fs.unlinkSync(targetPath);
        failCount++;
      } else {
        const sizeKB = (size / 1024).toFixed(1);
        console.log(`OK ${sizeKB} KB`);
        okCount++;
      }
    } catch (err) {
      console.log(`X ${err.message}`);
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      failCount++;
    }
  }

  console.log('');
  console.log('=== Done ===');
  console.log(`OK: ${okCount}  Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('');
    console.log('! Failed SFX will fall back to Web Audio API synth (game still works).');
    console.log('  You can manually download from https://mixkit.co/free-sound-effects/ later.');
  }

  console.log('');
  console.log('SFX files:');
  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.mp3'));
  for (const f of files) {
    const size = fs.statSync(path.join(targetDir, f)).size;
    console.log(`  ${f}  -  ${(size / 1024).toFixed(1)} KB`);
  }
  if (files.length === 0) {
    console.log('  (none - all using synth fallback)');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
