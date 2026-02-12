import {
  getConnection,
  groupQueries,
} from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

const VALID_KEYS: Record<string, string[]> = {
  commentary: ["on", "off"],
  achievements: ["on", "off"],
  digest: ["daily", "weekly", "off"],
  matchup_of_day: ["on", "off"],
  elo_decay: ["on", "off"],
  rematch_prompt: ["on", "off"],
  match_confirmation: ["on", "off"],
};

export async function settingsCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  // Check admin status
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (chatId && userId) {
    try {
      const member = await ctx.api.getChatMember(chatId, userId);
      if (!["creator", "administrator"].includes(member.status)) {
        await ctx.reply(ctx.t("settings.admin_only"));
        return;
      }
    } catch {
      // If we can't check, allow it (bot might not have permissions to check)
    }
  }

  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/settings\s*/, "").trim().split(/\s+/);

  // No args = show current settings
  if (!args[0] || args.length < 2) {
    if (!args[0]) {
      const settings = ctx.group.settings ?? {};
      await ctx.reply(ctx.t("settings.current_all", {
        commentary: settings.commentary !== false ? "on" : "off",
        achievements: settings.achievements !== false ? "on" : "off",
        digest: (settings.digest as string) ?? "off",
        matchup_of_day: (settings.matchup_of_day as string) === "on" ? "on" : "off",
        elo_decay: (settings.elo_decay as string) === "on" ? "on" : "off",
        rematch_prompt: (settings.rematch_prompt as string) === "off" ? "off" : "on",
        match_confirmation: (settings.match_confirmation as string) === "on" ? "on" : "off",
      }));
      return;
    }
    await ctx.reply(ctx.t("settings.usage_all"));
    return;
  }

  const key = args[0].toLowerCase();
  const value = args[1].toLowerCase();

  if (!VALID_KEYS[key] || !VALID_KEYS[key].includes(value)) {
    await ctx.reply(ctx.t("settings.invalid_value"));
    return;
  }

  const sql = getConnection();
  const groups = groupQueries(sql);

  let settingValue: unknown;
  if (key === "digest" || key === "matchup_of_day" || key === "elo_decay" || key === "rematch_prompt" || key === "match_confirmation") {
    settingValue = value;
  } else {
    settingValue = value === "on";
  }

  await groups.updateSettings(ctx.group.id, { [key]: settingValue });

  // Update local group object so subsequent calls in this message see the change
  (ctx.group.settings as Record<string, unknown>)[key] = settingValue;

  await ctx.reply(ctx.t("settings.updated"));
}
