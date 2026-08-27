"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLevel = getLevel;
exports.getRecordSummary = getRecordSummary;
exports.settleGame = settleGame;
const db_1 = require("./db");
const LEVELS = [
    { lv: 1, name: '新兵', min: 0, max: 499 },
    { lv: 2, name: '步卒', min: 500, max: 1199 },
    { lv: 3, name: '校尉', min: 1200, max: 2099 },
    { lv: 4, name: '偏将', min: 2100, max: 3299 },
    { lv: 5, name: '大将', min: 3300, max: 4799 },
    { lv: 6, name: '军师', min: 4800, max: 6599 },
    { lv: 7, name: '枭雄', min: 6600, max: 999999 },
];
/** 根据累计分获取级别信息 */
function getLevel(totalScore) {
    return LEVELS.find(l => totalScore >= l.min && totalScore <= l.max) || LEVELS[0];
}
/** 获取用户战绩摘要（含级别） */
function getRecordSummary(uid) {
    const rec = (0, db_1.getRecord)(uid);
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
function settleGame(uid, settlement, myPid) {
    if (!uid)
        return; // 游客不计战绩
    const rec = (0, db_1.getRecord)(uid);
    const myScore = settlement.scores[myPid];
    const isWin = settlement.winner === myPid;
    const isDraw = settlement.winner === null;
    const isLoss = !isWin && !isDraw;
    const patch = {
        totalGames: rec.totalGames + 1,
        wins: rec.wins + (isWin ? 1 : 0),
        losses: rec.losses + (isLoss ? 1 : 0),
        draws: rec.draws + (isDraw ? 1 : 0),
        totalScore: Math.max(0, rec.totalScore + myScore),
        firstBloods: rec.firstBloods + (settlement.breakdown[myPid].firstBlood > 0 ? 1 : 0),
        successfulAttacks: rec.successfulAttacks + (settlement.breakdown[myPid].combatScore > 0 ? 1 : 0),
        ultimateKills: rec.ultimateKills,
    };
    (0, db_1.updateRecord)(uid, patch);
}
//# sourceMappingURL=recordService.js.map