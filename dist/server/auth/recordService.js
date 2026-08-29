"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecordSummary = getRecordSummary;
exports.settleGame = settleGame;
const db_1 = require("./db");
const levels_1 = require("./levels");
/** 根据累计分获取用户战绩摘要（含级别） */
function getRecordSummary(uid) {
    const rec = (0, db_1.getRecord)(uid);
    const level = (0, levels_1.getLevel)(rec.totalScore);
    const levels = (0, levels_1.getLevels)();
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
function settleGame(uid, settlement, myPid) {
    if (!uid)
        return; // 游客不计战绩
    const rec = (0, db_1.getRecord)(uid);
    const myScore = settlement.scores[myPid];
    const isWin = settlement.winner === myPid;
    const isDraw = settlement.winner === null;
    const isLoss = !isWin && !isDraw;
    const todayKey = (0, db_1.localDateStr)(); // 北京时间(固定 UTC+8)
    const patch = {
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
    (0, db_1.updateRecord)(uid, patch);
}
//# sourceMappingURL=recordService.js.map