/**
 * 构建辅助: 把服务端内置的独立页面(监控面板 / 管理后台)复制到编译产物目录
 * tsc 只输出 .js,不会拷贝 .html,运行时(node dist/server/server.js)需要这些文件与对应模块同目录
 */
const fs = require('fs');
const path = require('path');

const pages = [
  { src: ['server', 'monitor', 'dashboard.html'], dest: ['dist', 'server', 'monitor', 'dashboard.html'] },
  { src: ['server', 'admin', 'admin.html'], dest: ['dist', 'server', 'admin', 'admin.html'] },
];

for (const p of pages) {
  const src = path.resolve(__dirname, '..', ...p.src);
  const dest = path.resolve(__dirname, '..', ...p.dest);
  if (!fs.existsSync(src)) {
    console.error('[copy-pages] 源文件不存在:', src);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[copy-pages] ${p.src[p.src.length - 1]} -> ${p.dest.join('/')}`);
}
