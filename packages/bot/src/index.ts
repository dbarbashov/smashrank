import { Bot } from "grammy";
import { initI18n } from "@smashrank/core";
import { getConnection } from "@smashrank/db";
import { loadConfig } from "./config.js";
import type { SmashRankContext } from "./context.js";
import { autoRegister } from "./middleware/auto-register.js";
import { startCommand } from "./commands/start.js";
import { gameCommand } from "./commands/game.js";
import { leaderboardCommand } from "./commands/leaderboard.js";
import { statsCommand } from "./commands/stats.js";
import { helpCommand } from "./commands/help.js";
import { langCommand } from "./commands/lang.js";
import { undoCommand } from "./commands/undo.js";
import { h2hCommand } from "./commands/h2h.js";
import { newgameCommand, newgameCallbackHandler, processNewgameScore } from "./commands/newgame.js";
import { achievementsCommand } from "./commands/achievements.js";
import { settingsCommand } from "./commands/settings.js";
import { doublesCommand } from "./commands/doubles.js";
import { newdoublesCommand, newdoublesCallbackHandler, processNewdoublesScore } from "./commands/newdoubles.js";
import { matchesCommand } from "./commands/matches.js";
import { listAchievementsCommand } from "./commands/list-achievements.js";
import { webCommand } from "./commands/web.js";
import { tournamentCommand } from "./commands/tournament.js";
import { tgameCommand } from "./commands/tgame.js";
import { startScheduler } from "./scheduler.js";

async function main(): Promise<void> {
  // Initialize i18n
  await initI18n();

  // Load config
  const config = loadConfig();

  // Verify DB connection
  const sql = getConnection();
  await sql`SELECT 1`;
  console.log("Database connected.");

  // Create bot
  const bot = new Bot<SmashRankContext>(config.botToken);

  // Middleware
  bot.use(autoRegister);

  // Handle score replies to /newgame and /newdoubles prompts (before commands
  // so plain text messages aren't dropped by grammY's composer chain)
  bot.use(async (ctx, next) => {
    if (ctx.message?.text && !ctx.message.text.startsWith("/")) {
      const handled = await processNewgameScore(ctx as SmashRankContext)
        || await processNewdoublesScore(ctx as SmashRankContext);
      if (handled) return;
    }
    await next();
  });

  // Commands
  bot.command("start", startCommand);
  bot.command("game", gameCommand);
  bot.command("leaderboard", leaderboardCommand);
  bot.command("stats", statsCommand);
  bot.command("help", helpCommand);
  bot.command("lang", langCommand);
  bot.command("undo", undoCommand);
  bot.command("h2h", h2hCommand);
  bot.command("newgame", newgameCommand);
  bot.command("achievements", achievementsCommand);
  bot.command("matches", matchesCommand);
  bot.command("listachievements", listAchievementsCommand);
  bot.command("settings", settingsCommand);
  bot.command("doubles", doublesCommand);
  bot.command("newdoubles", newdoublesCommand);
  bot.command("web", webCommand);
  bot.command("tournament", tournamentCommand);
  bot.command("tgame", tgameCommand);

  // Callback query handler for inline keyboards
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("ng:")) {
      await newgameCallbackHandler(ctx as SmashRankContext);
    } else if (data.startsWith("nd:")) {
      await newdoublesCallbackHandler(ctx as SmashRankContext);
    }
  });

  // Start scheduler
  startScheduler(bot);

  // Start
  console.log("Bot starting...");
  bot.start({
    onStart: () => console.log("Bot is running!"),
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
