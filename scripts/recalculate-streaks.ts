import { getConnection, closeConnection } from "../packages/db/src/connection.js";
import { matchQueries } from "../packages/db/src/queries/matches.js";

async function main() {
  const sql = getConnection();
  const matches = matchQueries(sql);

  const players = await sql<{ id: string; display_name: string; current_streak: number; best_streak: number }[]>`
    SELECT id, display_name, current_streak, best_streak FROM players WHERE games_played > 0
  `;

  console.log(`Found ${players.length} players with games.\n`);

  for (const player of players) {
    const streaks = await matches.recalculateStreaks(player.id);

    const changed =
      streaks.currentStreak !== player.current_streak ||
      streaks.bestStreak !== player.best_streak;

    if (changed) {
      await sql`
        UPDATE players SET
          current_streak = ${streaks.currentStreak},
          best_streak = ${streaks.bestStreak}
        WHERE id = ${player.id}
      `;
      console.log(
        `FIXED ${player.display_name}: streak ${player.current_streak} → ${streaks.currentStreak}, best ${player.best_streak} → ${streaks.bestStreak}`,
      );
    } else {
      console.log(`OK    ${player.display_name}: streak=${streaks.currentStreak}, best=${streaks.bestStreak}`);
    }
  }

  console.log("\nDone.");
  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
