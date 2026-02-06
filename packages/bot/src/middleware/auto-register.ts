import type { NextFunction } from "grammy";
import {
  getConnection,
  playerQueries,
  groupQueries,
} from "@smashrank/db";
import { getT } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";

const defaultLang = process.env.DEFAULT_LANG ?? "ru";

export async function autoRegister(
  ctx: SmashRankContext,
  next: NextFunction,
): Promise<void> {
  const from = ctx.from;
  if (!from || from.is_bot) return;

  const sql = getConnection();
  const players = playerQueries(sql);
  const groups = groupQueries(sql);

  // Find or create player
  let player = await players.findByTelegramId(from.id);
  if (!player) {
    player = await players.create({
      telegram_id: from.id,
      telegram_username: from.username ?? null,
      display_name: from.first_name + (from.last_name ? ` ${from.last_name}` : ""),
      language: defaultLang,
    });
  }
  ctx.player = player;

  // Handle group context
  const chat = ctx.chat;
  if (chat && (chat.type === "group" || chat.type === "supergroup")) {
    let group = await groups.findByChatId(chat.id);
    if (!group) {
      group = await groups.create({
        chat_id: chat.id,
        name: chat.title ?? null,
        language: defaultLang,
      });
    }
    await groups.ensureMembership(group.id, player.id);
    ctx.group = group;
  } else {
    ctx.group = null;
  }

  // Set translation function
  const lang = ctx.group?.language ?? ctx.player.language ?? defaultLang;
  ctx.t = getT(lang);
  ctx.season = null;

  await next();
}
