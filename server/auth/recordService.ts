/**
 * 战绩服务 · 级别计算 + 局末战绩更新
 * 级别阈值来自可配置等级(server/auth/levels.ts),管理后台可动态调整
 */
import { GameSettlement, PlayerId } from '../../assets/scripts/core/types';
import { getRecord, updateRecord, RecordRow, localDateStr } from './db';
import { getLevel, getLevels } from './levels';

/** 根据累计分获取用户战绩摘要（含级别） */
export function getRecordSummary(uid: string) {
  const rec = getRecord(uid);
  const level = getLevel(rec.totalScore);
  const levels = getLevels();
  const next = levels.find(l => l.lv === level.lv + 1);
  const winRate = rec.totalGames > 0 ? Math.round((rec.wins / rec.totalGames) * 100) : 0;
  return {
    ...rec,
    level: level.lv,
    levelName: level.name,
    winRate,
    nextLevelScore: next ? Math.max(0, next.min - rec.totalScore) : 0,
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
  const todayKey = localDateStr(); // 北京时间(固定 UTC+8)

  const patch: Partial<RecordRow> = {
    totalGames: rec.totalGames + 1,
    wins: rec.wins + (isWin ? 1 : 0),
    losses: rec.losses + (isLoss ? 1 : 0),
    draws: rec.draws + (isDraw ? 1 : 0),
    totalScore: Math.max(0, rec.totalScore + myScore),
    firstBloods: rec.firstBloods + (settlement.breakdown[myPid].firstBlood > 0 ? 1 : 0),
    successfulAttacks: rec.successfulAttacks + (settlement.breakdown[myPid].combatScore > 0 ? 1 : 0),
    ultimateKills: rec.ultimateKills,
    // 今日活跃累计(跨日重置)
    todayGames: rec.todayKey === todayKey ? (rec.todayGames || 0) + 1 : 1,
    todayKey,
  };
  updateRecord(uid, patch);
}
