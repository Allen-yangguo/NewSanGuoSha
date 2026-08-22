/**
 * Web 测试版打包脚本
 * 用 esbuild 将 core + ui 打包为单个 bundle.js
 */
const esbuild = require('esbuild');
const path = require('path');

async function build() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'web-test', 'ui.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    outfile: path.join(__dirname, '..', 'web-test', 'bundle.js'),
    platform: 'browser',
    logLevel: 'info',
  });
  console.log('✓ Web bundle 构建完成：web-test/bundle.js');
}

build().catch(e => { console.error(e); process.exit(1); });
