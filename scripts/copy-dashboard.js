/**
 * 构建辅助: 把 server/monitor/dashboard.html 复制到编译产物目录
 * tsc 只输出 .js,不会拷贝 .html,运行时(node dist/server/server.js)需要此文件与 monitor.js 同目录
 */
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', 'server', 'monitor', 'dashboard.html');
const destDir = path.resolve(__dirname, '..', 'dist', 'server', 'monitor');
const dest = path.join(destDir, 'dashboard.html');

if (!fs.existsSync(src)) {
  console.error('[copy-dashboard] 源文件不存在:', src);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-dashboard] dashboard.html -> dist/server/monitor/dashboard.html');
