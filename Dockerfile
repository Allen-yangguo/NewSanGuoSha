# ---- 构建阶段 ----
FROM node:20 AS builder

# 安装原生模块编译工具(better-sqlite3 需要 python3 + make + g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制 package 文件，利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/

# 安装依赖
RUN npm ci
RUN cd client && npm ci

# 复制源码并编译
COPY . .
RUN npm run build:server
RUN cd client && npm run build

# ---- 运行阶段 ----
FROM node:20-slim

WORKDIR /app

# 复制编译产物和依赖
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY package.json ./

# 创建数据目录(SQLite 持久化)
RUN mkdir -p data

EXPOSE 10000

ENV PORT=10000
ENV NODE_ENV=production

CMD ["node", "dist/server/server.js"]
