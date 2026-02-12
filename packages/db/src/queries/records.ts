import type postgres from "postgres";

export interface RecordEntry {
  playerId: string;
  playerName: string;
  value: number;
  detail: string | null;
  matchId: string | null;
  date: string | null;
}

export interface GroupRecords {
  highestElo: RecordEntry | null;
  longestStreak: RecordEntry | null;
  biggestUpset: RecordEntry | null;
  mostMatchesInDay: RecordEntry | null;
  highestEloGain: RecordEntry | null;
  mostGamesPlayed: RecordEntry | null;
}

export function recordQueries(sql: postgres.Sql) {
  return {
    async getGroupRecords(groupId: string): Promise<GroupRecords> {
      // 1. Highest ELO ever achieved
      const highestEloRows = await sql<{
        player_id: string;
        display_name: string;
        value: number;
        match_id: string;
        played_at: string;
      }[]>`
        SELECT
          p.id AS player_id,
          p.display_name,
          GREATEST(m.elo_before_winner + m.elo_change, m.elo_before_loser - m.elo_change) AS value,
          m.id AS match_id,
          m.played_at::text AS played_at
        FROM matches m
        JOIN players p ON p.id = CASE
          WHEN m.elo_before_winner + m.elo_change >= m.elo_before_loser - m.elo_change THEN m.winner_id
          ELSE m.loser_id
        END
        WHERE m.group_id = ${groupId}
          AND m.match_type IN ('singles', 'tournament')
        ORDER BY GREATEST(m.elo_before_winner + m.elo_change, m.elo_before_loser - m.elo_change) DESC
        LIMIT 1
      `;

      // 2. Longest win streak (from group_members best_streak)
      const longestStreakRows = await sql<{
        player_id: string;
        display_name: string;
        value: number;
      }[]>`
        SELECT
          gm.player_id,
          p.display_name,
          gm.best_streak AS value
        FROM group_members gm
        JOIN players p ON p.id = gm.player_id
        WHERE gm.group_id = ${groupId}
          AND gm.best_streak > 0
        ORDER BY gm.best_streak DESC
        LIMIT 1
      `;

      // 3. Biggest upset (underdog with lowest ELO beats higher-rated)
      const biggestUpsetRows = await sql<{
        player_id: string;
        display_name: string;
        value: number;
        match_id: string;
        loser_name: string;
        played_at: string;
      }[]>`
        SELECT
          m.winner_id AS player_id,
          pw.display_name,
          m.elo_before_loser - m.elo_before_winner AS value,
          m.id AS match_id,
          pl.display_name AS loser_name,
          m.played_at::text AS played_at
        FROM matches m
        JOIN players pw ON pw.id = m.winner_id
        JOIN players pl ON pl.id = m.loser_id
        WHERE m.group_id = ${groupId}
          AND m.match_type IN ('singles', 'tournament')
          AND m.elo_before_loser > m.elo_before_winner
        ORDER BY (m.elo_before_loser - m.elo_before_winner) DESC
        LIMIT 1
      `;

      // 4. Most matches in a day
      const mostMatchesDayRows = await sql<{
        player_id: string;
        display_name: string;
        value: number;
        day: string;
      }[]>`
        WITH player_matches AS (
          SELECT m.winner_id AS player_id, DATE(m.played_at) AS day
          FROM matches m WHERE m.group_id = ${groupId} AND m.match_type IN ('singles', 'tournament')
          UNION ALL
          SELECT m.loser_id AS player_id, DATE(m.played_at) AS day
          FROM matches m WHERE m.group_id = ${groupId} AND m.match_type IN ('singles', 'tournament')
        )
        SELECT
          pm.player_id,
          p.display_name,
          COUNT(*)::int AS value,
          pm.day::text AS day
        FROM player_matches pm
        JOIN players p ON p.id = pm.player_id
        GROUP BY pm.player_id, p.display_name, pm.day
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `;

      // 5. Highest single-match ELO gain
      const highestEloGainRows = await sql<{
        player_id: string;
        display_name: string;
        value: number;
        match_id: string;
        played_at: string;
      }[]>`
        SELECT
          m.winner_id AS player_id,
          p.display_name,
          m.elo_change AS value,
          m.id AS match_id,
          m.played_at::text AS played_at
        FROM matches m
        JOIN players p ON p.id = m.winner_id
        WHERE m.group_id = ${groupId}
          AND m.match_type IN ('singles', 'tournament')
        ORDER BY m.elo_change DESC
        LIMIT 1
      `;

      // 6. Most games played
      const mostGamesRows = await sql<{
        player_id: string;
        display_name: string;
        value: number;
      }[]>`
        SELECT
          gm.player_id,
          p.display_name,
          gm.games_played AS value
        FROM group_members gm
        JOIN players p ON p.id = gm.player_id
        WHERE gm.group_id = ${groupId}
          AND gm.games_played > 0
        ORDER BY gm.games_played DESC
        LIMIT 1
      `;

      function toEntry(
        rows: { player_id: string; display_name: string; value: number; match_id?: string; played_at?: string; day?: string; loser_name?: string }[],
        detailFn?: (row: any) => string | null,
      ): RecordEntry | null {
        if (rows.length === 0) return null;
        const row = rows[0];
        return {
          playerId: row.player_id,
          playerName: row.display_name,
          value: row.value,
          detail: detailFn ? detailFn(row) : null,
          matchId: row.match_id ?? null,
          date: row.played_at ?? row.day ?? null,
        };
      }

      return {
        highestElo: toEntry(highestEloRows),
        longestStreak: toEntry(longestStreakRows),
        biggestUpset: toEntry(biggestUpsetRows, (r) => r.loser_name),
        mostMatchesInDay: toEntry(mostMatchesDayRows),
        highestEloGain: toEntry(highestEloGainRows),
        mostGamesPlayed: toEntry(mostGamesRows),
      };
    },
  };
}
