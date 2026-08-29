/**
 * 排行榜 HTTP API 封装(/api/leaderboard)
 * 公开数据,无需鉴权
 */
export interface LeaderboardRow {
  rank: number;
  uid: string;
  nickname: string;
  isBot: boolean;
  totalScore: number;
  totalGames: number;
  wins: number;
  todayGames: number;
}

export async function fetchLeaderboard(type: 'score' | 'active'): Promise<LeaderboardRow[]> {
  try {
    const res = await fetch(`/api/leaderboard?type=${type}`);
    const j = await res.json();
    return j.ok && Array.isArray(j.data) ? (j.data as LeaderboardRow[]) : [];
  } catch {
    return [];
  }
}
