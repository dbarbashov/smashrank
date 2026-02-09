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
  // Update avatar if missing or stale (>24h)
  const avatarStale = !player.avatar_updated_at
    || (Date.now() - new Date(player.avatar_updated_at).getTime()) > 24 * 60 * 60 * 1000;
  if (avatarStale) {
    try {
      const photos = await ctx.api.getUserProfilePhotos(from.id, { limit: 1 });
      if (photos.total_count > 0 && photos.photos[0]?.[0]) {
        const fileId = photos.photos[0][0].file_id;
        if (fileId !== player.avatar_file_id) {
          await players.updateAvatar(player.id, fileId);
          player = { ...player, avatar_file_id: fileId, avatar_updated_at: new Date() };
        }
      }
    } catch {
      // Non-critical — ignore avatar fetch failures
    }
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
