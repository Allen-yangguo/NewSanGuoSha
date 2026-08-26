/**
 * 战绩服务 · 级别计算 + 局末战绩更新
 */
import { GameSettlement, PlayerId } from '../../assets/scripts/core/types';
import { getRecord, updateRecord, RecordRow } from './db';

/** 级别配置：累计分区间 */
interface LevelDef {
  lv: number;
  name: string;
  min: number;
  max: number;
}

const LEVELS: LevelDef[] = [
  { lv: 1, name: '新兵', min: 0, max: 499 },
  { lv: 2, name: '步卒', min: 500, max: 1199 },
  { lv: 3, name: '校尉', min: 1200, max: 2099 },
  { lv: 4, name: '偏将', min: 2100, max: 3299 },
  { lv: 5, name: '大将', min: 3300, max: 4799 },
  { lv: 6, name: '军师', min: 4800, max: 6599 },
  { lv: 7, name: '枭雄', min: 6600, max: 999999 },
];

/** 根据累计分获取级别信息 */
export function getLevel(totalScore: number): LevelDef {
  return LEVELS.find(l => totalScore >= l.min && totalScore <= l.max) || LEVELS[0];
}

/** 获取用户战绩摘要（含级别） */
export function getRecordSummary(uid: string) {
  const rec = getRecord(uid);
  const level = getLevel(rec.totalScore);
  const winRate = rec.totalGames > 0 ? Math.round((rec.wins / rec.totalGames) * 100) : 0;
  return {
    ...rec,
    level: level.lv,
    levelName: level.name,
    winRate,
    nextLevelScore: level.lv < 7 ? LEVELS[level.lv].min - rec.totalScore : 0,
  };
}

/** 局末结算：更新用户战绩 */
export function settleGame(uid: string | null, settlement: GameSettlement, myPid: PlayerId): void {
  if (!uid) return; // 游客不计战绩
  const rec = getRecord(uid);
  const myScore = settlement.scores[myPid];
  const isWin = settlement.winner === myPid;
  const isDraw = settlement.winner === null;
  const isLoss = !isWin && !isDraw;

  const patch: Partial<RecordRow> = {
    totalGames: rec.totalGames + 1,
    wins: rec.wins + (isWin ? 1 : 0),
    losses: rec.losses + (isLoss ? 1 : 0),
    draws: rec.draws + (isDraw ? 1 : 0),
    totalScore: Math.max(0, rec.totalScore + myScore),
    firstBloods: rec.firstBloods + (settlement.breakdown[myPid].firstBlood > 0 ? 1 : 0),
    successfulAttacks: rec.successfulAttacks + (settlement.breakdown[myPid].combatScore > 0 ? 1 : 0),
    ultimateKills: rec.ultimateKills,
  };
  updateRecord(uid, patch);
}
