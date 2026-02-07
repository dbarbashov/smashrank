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

  // Handle score replies to /newgame prompts (before commands so plain
  // text messages aren't dropped by grammY's composer chain)
  bot.use(async (ctx, next) => {
    if (ctx.message?.text && !ctx.message.text.startsWith("/")) {
      const handled = await processNewgameScore(ctx as SmashRankContext);
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

  // Callback query handler for /newgame inline keyboards
  bot.on("callback_query:data", newgameCallbackHandler);

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
