/**
 * 等级配置存储 · 支持管理后台动态调整
 *
 *  - 默认 7 级内置(与历史版本一致)
 *  - 管理后台可保存自定义配置到 data/levels.json,运行时热加载,无需重启
 *  - 配置非法时回退默认值并给出警告
 */
import * as fs from 'fs';
import * as path from 'path';

export interface LevelDef {
  lv: number;
  name: string;
  /** 分数下限(含) */
  min: number;
  /** 分数上限(含) */
  max: number;
}

const LEVELS_FILE = path.resolve(process.cwd(), 'data', 'levels.json');

export const DEFAULT_LEVELS: LevelDef[] = [
  { lv: 1, name: '新兵', min: 0, max: 499 },
  { lv: 2, name: '步卒', min: 500, max: 1199 },
  { lv: 3, name: '校尉', min: 1200, max: 2099 },
  { lv: 4, name: '偏将', min: 2100, max: 3299 },
  { lv: 5, name: '大将', min: 3300, max: 4799 },
  { lv: 6, name: '军师', min: 4800, max: 6599 },
  { lv: 7, name: '统帅', min: 6600, max: 8699 },
  { lv: 8, name: '霸主', min: 8700, max: 10999 },
  { lv: 9, name: '枭雄', min: 11000, max: 13999 },
  { lv: 10, name: '王侯', min: 14000, max: 17999 },
  { lv: 11, name: '帝王', min: 18000, max: 22999 },
  { lv: 12, name: '圣君', min: 23000, max: 28999 },
  { lv: 13, name: '传说', min: 29000, max: 35999 },
  { lv: 14, name: '不朽', min: 36000, max: 999999 },
];

let _levels: LevelDef[] | null = null;

/** 校验等级配置;返回 null 表示合法,否则返回错误信息 */
export function validateLevels(list: unknown): string | null {
  if (!Array.isArray(list) || list.length === 0) return '等级列表不能为空';
  const items = list as LevelDef[];
  for (let i = 0; i < items.length; i++) {
    const l = items[i];
    if (!l || typeof l !== 'object') return `第 ${i + 1} 条: 格式错误`;
    if (typeof l.lv !== 'number' || !Number.isInteger(l.lv) || l.lv < 1) return `第 ${i + 1} 条: lv 必须为正整数`;
    if (l.lv !== i + 1) return `第 ${i + 1} 条: lv 必须从 1 开始连续递增`;
    if (typeof l.name !== 'string' || !l.name.trim()) return `第 ${i + 1} 条: 名称不能为空`;
    if (l.name.trim().length > 12) return `第 ${i + 1} 条: 名称最长 12 字`;
    if (typeof l.min !== 'number' || !Number.isInteger(l.min) || l.min < 0) return `第 ${i + 1} 条: 分数下限必须是非负整数`;
    if (typeof l.max !== 'number' || !Number.isInteger(l.max)) return `第 ${i + 1} 条: 分数上限必须为整数`;
    if (l.min > l.max) return `第 ${i + 1} 条: 下限不能大于上限`;
    if (i > 0 && l.min !== items[i - 1].max + 1) return `第 ${i + 1} 条: 必须与上一级区间连续(上一级上限 + 1 = 本级下限)`;
  }
  if (items[0].min !== 0) return '第 1 级: 下限必须为 0';
  return null;
}

function loadLevels(): LevelDef[] {
  if (_levels) return _levels;
  try {
    if (fs.existsSync(LEVELS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf-8'));
      if (validateLevels(raw) === null) {
        _levels = raw as LevelDef[];
        return _levels;
      }
      console.warn('[LEVELS] data/levels.json 配置非法,已回退默认等级');
    }
  } catch {
    // 文件不存在或解析失败 → 用默认
  }
  _levels = DEFAULT_LEVELS;
  return _levels;
}

/** 当前等级配置(副本,防止外部篡改) */
export function getLevels(): LevelDef[] {
  return loadLevels().map(l => ({ ...l }));
}

/** 根据累计分获取级别;超过最高级上限时取最高级 */
export function getLevel(totalScore: number): LevelDef {
  const levels = loadLevels();
  const last = levels[levels.length - 1];
  if (totalScore > last.max) return last;
  return levels.find(l => totalScore >= l.min && totalScore <= l.max) || levels[0];
}

/** 保存等级配置(校验通过后落盘并热更新) */
export function saveLevels(list: unknown): { ok: boolean; message: string } {
  const err = validateLevels(list);
  if (err) return { ok: false, message: err };
  try {
    const dir = path.dirname(LEVELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    _levels = list as LevelDef[];
    return { ok: true, message: '等级配置已保存并生效' };
  } catch (e: any) {
    return { ok: false, message: '保存失败: ' + (e?.message || e) };
  }
}

/** 恢复默认等级(删除配置文件) */
export function resetLevels(): { ok: boolean; message: string } {
  try {
    if (fs.existsSync(LEVELS_FILE)) fs.unlinkSync(LEVELS_FILE);
    _levels = null;
    return { ok: true, message: '已恢复默认等级' };
  } catch (e: any) {
    return { ok: false, message: '恢复失败: ' + (e?.message || e) };
  }
}
