import type postgres from "postgres";
import { closeConnection, getConnection } from "./connection.js";

const SEED_GROUP = {
  chatId: -1000000000002,
  name: "SmashRank Demo",
  slug: "demo",
};

const SEED_PLAYERS = [
  { telegramId: 910000001, username: "mila_smash", displayName: "Мила Орлова", elo: 1487, games: 128, wins: 91, streak: 8 },
  { telegramId: 910000002, username: "pavel_spin", displayName: "Павел Громов", elo: 1421, games: 117, wins: 76, streak: 4 },
  { telegramId: 910000003, username: "sonya_ping", displayName: "Соня Власова", elo: 1364, games: 103, wins: 62, streak: 2 },
  { telegramId: 910000004, username: "igor_topspin", displayName: "Игорь Соколов", elo: 1298, games: 96, wins: 49, streak: 1 },
  { telegramId: 910000005, username: "lera_rally", displayName: "Лера Белова", elo: 1235, games: 88, wins: 38, streak: 0 },
] as const;

async function seed(): Promise<void> {
  const sql = getConnection();

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const groups = await txSql<{ id: string }[]>`
      INSERT INTO groups (chat_id, name, slug, language)
      VALUES (${SEED_GROUP.chatId}, ${SEED_GROUP.name}, ${SEED_GROUP.slug}, 'ru')
      ON CONFLICT (slug) DO UPDATE SET slug = groups.slug
      RETURNING id
    `;
    const groupId = groups[0].id;

    for (const player of SEED_PLAYERS) {
      const players = await txSql<{ id: string }[]>`
        INSERT INTO players (telegram_id, telegram_username, display_name, language, last_active)
        VALUES (${player.telegramId}, ${player.username}, ${player.displayName}, 'ru', NOW())
        ON CONFLICT (telegram_id) DO UPDATE
        SET
          telegram_username = EXCLUDED.telegram_username,
          display_name = EXCLUDED.display_name,
          language = EXCLUDED.language,
          last_active = EXCLUDED.last_active
        RETURNING id
      `;
      const playerId = players[0].id;
      const losses = player.games - player.wins;

      await txSql`
        INSERT INTO group_members (
          group_id, player_id, elo_rating, games_played, wins, losses,
          current_streak, best_streak, doubles_elo_rating, doubles_games_played,
          doubles_wins, doubles_losses, doubles_current_streak, doubles_best_streak, sets_played
        )
        VALUES (
          ${groupId}, ${playerId}, ${player.elo}, ${player.games}, ${player.wins}, ${losses},
          ${player.streak}, ${Math.max(player.streak, 10)}, ${player.elo - 35}, ${Math.floor(player.games / 2)},
          ${Math.floor(player.wins / 2)}, ${Math.floor(losses / 2)}, ${Math.min(player.streak, 3)},
          ${Math.max(player.streak, 5)}, ${player.games * 3}
        )
        ON CONFLICT (group_id, player_id) DO UPDATE
        SET
          elo_rating = EXCLUDED.elo_rating,
          games_played = EXCLUDED.games_played,
          wins = EXCLUDED.wins,
          losses = EXCLUDED.losses,
          current_streak = EXCLUDED.current_streak,
          best_streak = EXCLUDED.best_streak,
          doubles_elo_rating = EXCLUDED.doubles_elo_rating,
          doubles_games_played = EXCLUDED.doubles_games_played,
          doubles_wins = EXCLUDED.doubles_wins,
          doubles_losses = EXCLUDED.doubles_losses,
          doubles_current_streak = EXCLUDED.doubles_current_streak,
          doubles_best_streak = EXCLUDED.doubles_best_streak,
          sets_played = EXCLUDED.sets_played
      `;
    }

    await txSql`
      INSERT INTO player_achievements (group_id, player_id, achievement_id)
      SELECT ${groupId}, p.id, ad.id
      FROM players p
      CROSS JOIN achievement_definitions ad
      WHERE p.telegram_id IN ${txSql(SEED_PLAYERS.map((player) => player.telegramId))}
      ON CONFLICT (group_id, player_id, achievement_id) WHERE group_id IS NOT NULL DO NOTHING
    `;
  });

  console.log(
    `Seeded ${SEED_PLAYERS.length} demo players in ${SEED_GROUP.slug}; each has every available achievement.`,
  );
  await closeConnection();
}

seed().catch(async (error: unknown) => {
  console.error("Seed failed:", error);
  await closeConnection();
  process.exit(1);
});
