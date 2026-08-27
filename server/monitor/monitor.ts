/**
 * 流量监控模块 (Traffic Monitor)
 *
 * 功能:
 *  - HTTP 请求统计: 路由 / 状态码 / QPS / 响应字节,Express 中间件采集
 *  - 活跃玩家与对局: 定时采样在线连接数、对局中桌数(由 server.ts 注入采样函数)
 *  - 存储: 内存 1 分钟滚动桶(保留最近 24 小时) + 每小时落盘 JSON(data/monitor/monitor-YYYY-MM-DD.json)
 *    - 重启后自动加载历史文件,窗口内数据无缝衔接,超窗历史按日归档可查
 *  - 对外接口:
 *    GET /api/monitor/summary   实时快照(在线/对局/今日请求/QPS/流量/内存/运行时长)
 *    GET /api/monitor/series    时间序列(分钟级 ≤24h,小时级 >24h)+ 窗口内 Top 路由/状态码
 *    GET /api/monitor/status    轻量健康检查
 *  - 鉴权: 与管理后台统一,只配置 ADMIN_TOKEN 一个环境变量(见 ../auth/adminAuth)
 *      - 已配置  -> 所有 /api/monitor/* 需 ?token= 或 Authorization: Bearer
 *      - 未配置  -> 生产环境直接禁用(403),开发环境放行(便于本地调试)
 *  - Web 面板: GET /monitor 托管 dashboard.html(数据仍走受保护的 API)
 */
import * as fs from 'fs';
import * as path from 'path';
import { Router, Request, Response, NextFunction } from 'express';
import { checkAdminAuth, isAdminAuthConfigured } from '../auth/adminAuth';

// ============================================================
// 配置
// ============================================================
const WINDOW_MINUTES = 1440; // 内存保留最近 24 小时(分钟级)
const SAMPLE_INTERVAL_MS = 5000; // 在线/对局采样间隔
const FLUSH_INTERVAL_MS = 60 * 60 * 1000; // 每小时落盘一次
const MONITOR_DIR = path.resolve(process.cwd(), 'data', 'monitor');

// ============================================================
// 数据结构
// ============================================================
interface HttpStats {
  total: number;
  byRoute: Record<string, number>;
  byStatus: Record<string, number>;
  bytesOut: number;
  bytesIn: number;
}

interface MinuteBucket {
  /** 分钟对齐时间戳(ms) */
  ts: number;
  http: HttpStats;
  /** 该分钟内在线连接峰值 */
  online: number;
  /** 该分钟内对局中桌数峰值 */
  activeTables: number;
}

interface LiveState {
  online: number;
  activeTables: number;
}

// ============================================================
// 状态
// ============================================================
/** 最近窗口内的分钟桶(时间升序) */
let buckets: MinuteBucket[] = [];
/** 历史归档: 日期 -> 分钟桶(来自落盘文件 + 窗口淘汰),用于 >24h 查询 */
const history = new Map<string, MinuteBucket[]>();
/** 启动以来的累计值 */
let totalRequests = 0;
let totalBytesOut = 0;
let totalBytesIn = 0;
const startedAt = Date.now();
/** 当前在线/对局快照(由采样器刷新) */
const liveNow: LiveState = { online: 0, activeTables: 0 };

let sampler: (() => LiveState) | null = null;
let sampleTimer: NodeJS.Timeout | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let loaded = false;
/** 有数据变化的日期(YYYY-MM-DD),落盘后清空,避免每次新桶都重写全部历史文件 */
const dirtyDays = new Set<string>();

function markDirty(ts: number): void {
  dirtyDays.add(dateStrOf(ts));
}

// ============================================================
// 工具函数
// ============================================================
function bucketKeyOf(ts: number): number {
  return Math.floor(ts / 60000) * 60000;
}

function dateStrOf(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function emptyHttp(): HttpStats {
  return { total: 0, byRoute: {}, byStatus: {}, bytesOut: 0, bytesIn: 0 };
}

function emptyBucket(ts: number): MinuteBucket {
  return { ts, http: emptyHttp(), online: 0, activeTables: 0 };
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const k of Object.keys(source)) {
    target[k] = (target[k] || 0) + source[k];
  }
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = parseInt(String(v), 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** 路由归一化: 静态资源合并、socket.io 归并,避免动态路径撑爆统计表 */
function normalizeRoute(p: string): string {
  const pathOnly = p.split('?')[0];
  if (pathOnly.startsWith('/socket.io')) return '/socket.io';
  const m = pathOnly.match(/^\/(assets|static|images|audio|fonts|sounds)\//);
  if (m) return `/static/${m[1]}/*`;
  return pathOnly || '/';
}

function currentBucket(): MinuteBucket {
  const key = bucketKeyOf(Date.now());
  let b = buckets[buckets.length - 1];
  if (!b || b.ts !== key) {
    b = emptyBucket(key);
    buckets.push(b);
    markDirty(key);
    // 裁剪超窗桶 → 移入历史归档(并立即落盘,保证不丢)
    while (buckets.length > WINDOW_MINUTES) {
      const old = buckets.shift();
      if (!old) break;
      markDirty(old.ts);
      const d = dateStrOf(old.ts);
      const arr = history.get(d) || [];
      arr.push(old);
      history.set(d, arr);
    }
    flushToDisk();
  }
  return b;
}

/** 合并去重 + 排序(供落盘与查询使用) */
function mergeBuckets(list: MinuteBucket[]): MinuteBucket[] {
  const map = new Map<number, MinuteBucket>();
  for (const b of list) map.set(b.ts, b);
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

// ============================================================
// 持久化
// ============================================================
/**
 * 落盘监控数据。
 * force=false(默认): 只写有变化的日期(dirtyDays);
 * force=true: 全量写(每小时定时器 / 退出前兜底)
 */
function flushToDisk(force = false): void {
  try {
    if (!fs.existsSync(MONITOR_DIR)) fs.mkdirSync(MONITOR_DIR, { recursive: true });
    let days: Set<string>;
    if (force) {
      days = new Set(history.keys());
      for (const b of buckets) days.add(dateStrOf(b.ts));
    } else {
      days = dirtyDays;
    }
    if (days.size === 0) return;
    for (const d of days) {
      const merged = mergeBuckets([...(history.get(d) || []), ...buckets.filter(b => dateStrOf(b.ts) === d)]);
      const finalPath = path.join(MONITOR_DIR, `monitor-${d}.json`);
      const tmpPath = `${finalPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(merged), 'utf-8');
      fs.renameSync(tmpPath, finalPath);
    }
    dirtyDays.clear();
  } catch (e) {
    console.error('[MONITOR] 落盘失败:', e);
  }
}

function loadHistory(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(MONITOR_DIR)) return;
    const files = fs.readdirSync(MONITOR_DIR).filter(f => /^monitor-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    const all: MinuteBucket[] = [];
    for (const f of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(MONITOR_DIR, f), 'utf-8'));
        if (!Array.isArray(raw)) continue;
        for (const item of raw) {
          if (item && typeof item.ts === 'number' && item.http && typeof item.http.total === 'number') {
            all.push({
              ts: item.ts,
              http: {
                total: item.http.total,
                byRoute: item.http.byRoute || {},
                byStatus: item.http.byStatus || {},
                bytesOut: item.http.bytesOut || 0,
                bytesIn: item.http.bytesIn || 0,
              },
              online: item.online || 0,
              activeTables: item.activeTables || 0,
            });
          }
        }
      } catch {
        // 忽略损坏文件
      }
    }
    all.sort((a, b) => a.ts - b.ts);
    const now = Date.now();
    const cutoff = now - WINDOW_MINUTES * 60000;
    for (const b of all) {
      if (b.ts > now + 5 * 60000) continue; // 时钟异常的未来数据跳过
      if (b.ts >= cutoff) buckets.push(b); // 窗口内 → 内存,重启后无缝衔接
      const d = dateStrOf(b.ts);
      const arr = history.get(d) || [];
      arr.push(b);
      history.set(d, arr);
    }
    buckets.sort((a, b) => a.ts - b.ts);
    console.log(`[MONITOR] 历史数据加载完成: ${all.length} 个分钟桶, ${files.length} 个文件`);
  } catch (e) {
    console.error('[MONITOR] 历史数据加载失败:', e);
  }
}

// ============================================================
// 查询
// ============================================================
/** 全部可用桶: 历史归档(已按日) + 当前窗口,按时间升序,去重 */
function allBuckets(): MinuteBucket[] {
  const fromHistory: MinuteBucket[] = [];
  const dates = [...history.keys()].sort();
  for (const d of dates) fromHistory.push(...(history.get(d) || []));
  const windowTs = new Set(buckets.map(b => b.ts));
  const merged = [...fromHistory.filter(b => !windowTs.has(b.ts)), ...buckets];
  merged.sort((a, b) => a.ts - b.ts);
  return merged;
}

function bucketToLight(b: MinuteBucket) {
  return {
    ts: b.ts,
    requests: b.http.total,
    bytesOut: b.http.bytesOut,
    bytesIn: b.http.bytesIn,
    online: b.online,
    activeTables: b.activeTables,
  };
}

function sumOfWindow(list: MinuteBucket[], fromTs: number): { requests: number; bytesOut: number; bytesIn: number } {
  let requests = 0;
  let bytesOut = 0;
  let bytesIn = 0;
  for (const b of list) {
    if (b.ts < fromTs) continue;
    requests += b.http.total;
    bytesOut += b.http.bytesOut;
    bytesIn += b.http.bytesIn;
  }
  return { requests, bytesOut, bytesIn };
}

// ============================================================
// 鉴权(统一使用管理后台 ADMIN_TOKEN,见 ../auth/adminAuth)
// ============================================================
export function createMonitorRouter(): Router {
  const router = Router();
  router.use(checkAdminAuth);

  // 实时快照
  router.get('/summary', (_req: Request, res: Response) => {
    loadHistory();
    const now = Date.now();
    const cur = currentBucket();
    const prev = buckets.length >= 2 ? buckets[buckets.length - 2] : cur;
    const requestsLastMinute = prev.http.total;
    const today = dateStrOf(now);
    const todaySum = sumOfWindow(allBuckets(), new Date(now).setHours(0, 0, 0, 0));
    res.json({
      ok: true,
      ts: now,
      server: {
        uptimeSec: Math.round((now - startedAt) / 1000),
        startedAt: new Date(startedAt).toISOString(),
        node: process.version,
        platform: process.platform,
        memoryRss: process.memoryUsage().rss,
      },
      config: {
        tokenConfigured: isAdminAuthConfigured(),
        retentionMinutes: WINDOW_MINUTES,
        sampleSeconds: Math.round(SAMPLE_INTERVAL_MS / 1000),
      },
      live: {
        online: liveNow.online,
        activeTables: liveNow.activeTables,
        totalRequests,
        requestsLastMinute,
        qps: requestsLastMinute / 60,
        bytesOutTotal: totalBytesOut,
        bytesInTotal: totalBytesIn,
      },
      today: todaySum,
      window: { minutes: WINDOW_MINUTES, buckets: buckets.length },
    });
  });

  // 时间序列: ?minutes=窗口分钟(默认120,最大10080) & bucket=minute|hour|auto
  router.get('/series', (req: Request, res: Response) => {
    loadHistory();
    const minutes = clampInt(req.query.minutes, 120, 1, 10080);
    const bucketMode = String(req.query.bucket || 'auto');
    const useHour = bucketMode === 'hour' || (bucketMode === 'auto' && minutes > WINDOW_MINUTES);
    const now = Date.now();
    const from = now - minutes * 60000;
    const windowed = allBuckets().filter(b => b.ts >= from);

    let series: MinuteBucket[];
    if (useHour) {
      // 聚合成小时桶
      const byHour = new Map<number, MinuteBucket>();
      for (const b of windowed) {
        const hk = Math.floor(b.ts / 3600000) * 3600000;
        let h = byHour.get(hk);
        if (!h) {
          h = emptyBucket(hk);
          byHour.set(hk, h);
        }
        h.http.total += b.http.total;
        h.http.bytesOut += b.http.bytesOut;
        h.http.bytesIn += b.http.bytesIn;
        if (b.online > h.online) h.online = b.online;
        if (b.activeTables > h.activeTables) h.activeTables = b.activeTables;
        mergeCounts(h.http.byRoute, b.http.byRoute);
        mergeCounts(h.http.byStatus, b.http.byStatus);
      }
      series = [...byHour.values()].sort((a, b) => a.ts - b.ts);
    } else {
      series = windowed;
    }

    // 窗口内 Top 路由 / 状态码
    const topRoutes: Record<string, number> = {};
    const topStatus: Record<string, number> = {};
    for (const b of series) {
      mergeCounts(topRoutes, b.http.byRoute);
      mergeCounts(topStatus, b.http.byStatus);
    }
    const topRoutesArr = Object.entries(topRoutes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([route, count]) => ({ route, count }));
    const topStatusArr = Object.entries(topStatus)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count }));

    res.json({
      ok: true,
      from,
      to: now,
      bucket: useHour ? 'hour' : 'minute',
      minutes,
      series: series.map(bucketToLight),
      topRoutes: topRoutesArr,
      topStatus: topStatusArr,
    });
  });

  // 轻量健康检查
  router.get('/status', (_req: Request, res: Response) => {
    res.json({ ok: true, ts: Date.now(), uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
  });

  return router;
}

// ============================================================
// HTTP 采集中间件(挂载到 Express 最前,统计所有业务请求)
// ============================================================
export function httpMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 监控自身接口不参与统计,避免自指噪音
  if (req.path === '/monitor' || req.path.startsWith('/api/monitor')) {
    next();
    return;
  }
  res.on('finish', () => {
    try {
      const b = currentBucket();
      const route = normalizeRoute(req.path);
      b.http.total++;
      b.http.byRoute[route] = (b.http.byRoute[route] || 0) + 1;
      const status = String(res.statusCode);
      b.http.byStatus[status] = (b.http.byStatus[status] || 0) + 1;
      const cl = res.getHeader('Content-Length');
      const bytes = typeof cl === 'number' ? cl : parseInt(String(cl), 10) || 0;
      b.http.bytesOut += bytes;
      totalRequests++;
      totalBytesOut += bytes;
      const reqLen = parseInt(String(req.headers['content-length'] || '0'), 10) || 0;
      if (reqLen > 0) {
        b.http.bytesIn += reqLen;
        totalBytesIn += reqLen;
      }
    } catch {
      // 统计失败不影响业务
    }
  });
  next();
}

// ============================================================
// 生命周期
// ============================================================
/**
 * 启动监控: 加载历史 + 启动采样/落盘定时器
 * @param getLive 由调用方注入的实时采样函数(在线连接数、对局中桌数)
 */
export function startMonitor(getLive: () => LiveState): void {
  loadHistory();
  sampler = getLive;
  if (sampleTimer) clearInterval(sampleTimer);
  if (flushTimer) clearInterval(flushTimer);
  const tick = (): void => {
    if (!sampler) return;
    const s = sampler();
    liveNow.online = s.online;
    liveNow.activeTables = s.activeTables;
    const b = currentBucket();
    if (s.online > b.online) b.online = s.online;
    if (s.activeTables > b.activeTables) b.activeTables = s.activeTables;
  };
  tick();
  sampleTimer = setInterval(tick, SAMPLE_INTERVAL_MS);
  sampleTimer.unref?.();
  flushTimer = setInterval(() => flushToDisk(true), FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
  console.log('[MONITOR] 流量监控已启动(采样 5s / 落盘 1h / 内存窗口 24h)');
}

/** 停止监控并立即落盘(用于 SIGTERM/SIGINT 优雅退出) */
export function stopMonitor(): void {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushToDisk(true);
  console.log('[MONITOR] 监控数据已落盘,服务退出');
}

/** 监控面板页面(数据走受保护 API) */
export function dashboardHandler(_req: Request, res: Response): void {
  res.sendFile(path.join(__dirname, 'dashboard.html'), (err) => {
    if (err) {
      res.status(500).type('html').send('<h1>监控面板资源缺失</h1><p>请重新执行 npm run build:server</p>');
    }
  });
}
