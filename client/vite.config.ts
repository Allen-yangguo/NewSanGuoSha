import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

/**
 * 开发代理：前端 5173，Socket.IO /api 全代理到服务端 3000
 * 生产构建：产物输出到 dist/，由 Node 服务端同一端口 3000 托管
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../assets/scripts/core'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
      '/__qr': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/__qr_data': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
