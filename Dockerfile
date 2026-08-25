# 纯 JS 无原生模块，不需要 python/make/g++
FROM node:20-slim

WORKDIR /app

# 复制 package 文件，利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/

# 安装依赖
RUN npm ci
RUN cd client && npm ci

# 复制源码并编译
COPY . .
RUN npm run build:server
RUN cd client && npm run build

# 创建数据目录
RUN mkdir -p data

EXPOSE 10000

ENV PORT=10000
ENV NODE_ENV=production

CMD ["node", "dist/server/server.js"]
