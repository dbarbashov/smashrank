import type postgres from "postgres";
import { InlineKeyboard } from "grammy";
import {
  getConnection,
  playerQueries,
  matchQueries,
  groupQueries,
} from "@smashrank/db";
import {
  parseGameCommand,
  calculateDoublesElo,
  updateStreak,
} from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { ensureActiveSeason } from "../helpers/ensure-season.js";

interface PendingDoubles {
  partnerId: string;
  opp1Id: string;
  opp2Id?: string;
  winnerSide?: "us" | "them";
  expiresAt: number;
  stage: "pick_opp1" | "pick_opp2" | "pick_winner" | "enter_score";
}

const pendingSessions = new Map<string, PendingDoubles>();

function sessionKey(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export async function newdoublesCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const matches = matchQueries(sql);

  // Show recent players in this group as partner options
  const opponents = await matches.getRecentOpponents(ctx.player.id, ctx.group.id);
  if (opponents.length === 0) {
    await ctx.reply(ctx.t("newgame.no_opponents"));
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const opp of opponents) {
    keyboard.text(opp.display_name, `nd:partner:${opp.id}`).row();
  }

  await ctx.reply(ctx.t("newdoubles.pick_partner"), { reply_markup: keyboard });
}

export async function newdoublesCallbackHandler(ctx: SmashRankContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("nd:")) return;

  if (!ctx.group) {
    await ctx.answerCallbackQuery({ text: ctx.t("error.group_only") });
    return;
  }

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;

  const parts = data.split(":");
  const key = sessionKey(chatId, userId);

  if (parts[1] === "partner") {
    const partnerId = parts[2];
    const sql = getConnection();
    const matches = matchQueries(sql);

    // Show opponents to pick from
    const opponents = await matches.getRecentOpponents(ctx.player.id, ctx.group.id);
    const filtered = opponents.filter((o) => o.id !== partnerId && o.id !== ctx.player.id);

    if (filtered.length === 0) {
      await ctx.answerCallbackQuery({ text: "?" });
      return;
    }

    pendingSessions.set(key, {
      partnerId,
      opp1Id: "",
      expiresAt: Date.now() + 5 * 60 * 1000,
      stage: "pick_opp1",
    });

    const keyboard = new InlineKeyboard();
    for (const opp of filtered) {
      keyboard.text(opp.display_name, `nd:opp1:${opp.id}`).row();
    }

    await ctx.editMessageText(ctx.t("newdoubles.pick_opponent1"), { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } else if (parts[1] === "opp1") {
    const session = pendingSessions.get(key);
    if (!session) { await ctx.answerCallbackQuery(); return; }

    session.opp1Id = parts[2];
    session.stage = "pick_opp2";

    const sql = getConnection();
    const matches = matchQueries(sql);
    const opponents = await matches.getRecentOpponents(ctx.player.id, ctx.group.id);
    const filtered = opponents.filter((o) =>
      o.id !== session.partnerId && o.id !== session.opp1Id && o.id !== ctx.player.id,
    );

    if (filtered.length === 0) {
      await ctx.answerCallbackQuery({ text: "?" });
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const opp of filtered) {
      keyboard.text(opp.display_name, `nd:opp2:${opp.id}`).row();
    }

    await ctx.editMessageText(ctx.t("newdoubles.pick_opponent2"), { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } else if (parts[1] === "opp2") {
    const session = pendingSessions.get(key);
    if (!session) { await ctx.answerCallbackQuery(); return; }

    session.opp2Id = parts[2];
    session.stage = "pick_winner";

    const keyboard = new InlineKeyboard()
      .text(ctx.t("newdoubles.we_won"), "nd:win:us")
      .text(ctx.t("newdoubles.they_won"), "nd:win:them");

    await ctx.editMessageText(ctx.t("newdoubles.who_won"), { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } else if (parts[1] === "win") {
    const session = pendingSessions.get(key);
    if (!session) { await ctx.answerCallbackQuery(); return; }

    session.winnerSide = parts[2] as "us" | "them";
    session.stage = "enter_score";

    await ctx.editMessageText(ctx.t("newdoubles.enter_score"));
    await ctx.answerCallbackQuery();
  }
}

export async function processNewdoublesScore(ctx: SmashRankContext): Promise<boolean> {
  if (!ctx.group) return false;

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return false;

  const key = sessionKey(chatId, userId);
  const session = pendingSessions.get(key);
  if (!session || session.stage !== "enter_score") return false;

  if (Date.now() > session.expiresAt) {
    pendingSessions.delete(key);
    return false;
  }

  pendingSessions.delete(key);

  const scoreText = ctx.message?.text?.trim();
  if (!scoreText) return false;

  const fakeCommand = `/game @dummy won ${scoreText}`;
  const parseResult = parseGameCommand(fakeCommand);
  if (!parseResult.ok) {
    await ctx.reply(ctx.t(`error.${parseResult.error}`));
    return true;
  }

  const sql = getConnection();
  const players = playerQueries(sql);

  const partner = await players.findById(session.partnerId);
  const opp1 = await players.findById(session.opp1Id);
  const opp2 = await players.findById(session.opp2Id!);

  if (!partner || !opp1 || !opp2) return false;

  const { data } = parseResult;
  const ourTeamWon = session.winnerSide === "us";

  const winner1 = ourTeamWon ? ctx.player : opp1;
  const winner2 = ourTeamWon ? partner : opp2;
  const loser1 = ourTeamWon ? opp1 : ctx.player;
  const loser2 = ourTeamWon ? opp2 : partner;

  // The "won" format means reporter always wins in parser.
  // reporter = the person typing = on "our team"
  const orientedSetScores = data.setScores
    ? data.setScores.map((s) => ({
        w: ourTeamWon ? s.reporterScore : s.opponentScore,
        l: ourTeamWon ? s.opponentScore : s.reporterScore,
      }))
    : null;

  // Get group member stats for all 4 players
  const groups = groupQueries(sql);
  const [w1Member, w2Member, l1Member, l2Member] = await Promise.all([
    groups.ensureMembership(ctx.group.id, winner1.id),
    groups.ensureMembership(ctx.group.id, winner2.id),
    groups.ensureMembership(ctx.group.id, loser1.id),
    groups.ensureMembership(ctx.group.id, loser2.id),
  ]);

  const season = await ensureActiveSeason(ctx.group.id);

  const eloResult = calculateDoublesElo({
    winner1Rating: w1Member.doubles_elo_rating,
    winner2Rating: w2Member.doubles_elo_rating,
    loser1Rating: l1Member.doubles_elo_rating,
    loser2Rating: l2Member.doubles_elo_rating,
    winner1GamesPlayed: w1Member.doubles_games_played,
    winner2GamesPlayed: w2Member.doubles_games_played,
    loser1GamesPlayed: l1Member.doubles_games_played,
    loser2GamesPlayed: l2Member.doubles_games_played,
  });

  const w1Streak = updateStreak(w1Member.doubles_current_streak, w1Member.doubles_best_streak, true);
  const w2Streak = updateStreak(w2Member.doubles_current_streak, w2Member.doubles_best_streak, true);
  const l1Streak = updateStreak(l1Member.doubles_current_streak, l1Member.doubles_best_streak, false);
  const l2Streak = updateStreak(l2Member.doubles_current_streak, l2Member.doubles_best_streak, false);

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txMatches = matchQueries(txSql);
    const txGroups = groupQueries(txSql);

    await txMatches.create({
      match_type: "doubles",
      season_id: season.id,
      group_id: ctx.group!.id,
      winner_id: winner1.id,
      loser_id: loser1.id,
      winner_partner_id: winner2.id,
      loser_partner_id: loser2.id,
      winner_score: data.winnerSets,
      loser_score: data.loserSets,
      set_scores: orientedSetScores,
      elo_before_winner: w1Member.doubles_elo_rating,
      elo_before_loser: l1Member.doubles_elo_rating,
      elo_before_winner_partner: w2Member.doubles_elo_rating,
      elo_before_loser_partner: l2Member.doubles_elo_rating,
      elo_change: eloResult.change,
      reported_by: ctx.player.id,
    });

    await txGroups.updateGroupDoublesElo(ctx.group!.id, winner1.id, eloResult.winner1NewRating, true, w1Streak.currentStreak, w1Streak.bestStreak);
    await txGroups.updateGroupDoublesElo(ctx.group!.id, winner2.id, eloResult.winner2NewRating, true, w2Streak.currentStreak, w2Streak.bestStreak);
    await txGroups.updateGroupDoublesElo(ctx.group!.id, loser1.id, eloResult.loser1NewRating, false, l1Streak.currentStreak, l1Streak.bestStreak);
    await txGroups.updateGroupDoublesElo(ctx.group!.id, loser2.id, eloResult.loser2NewRating, false, l2Streak.currentStreak, l2Streak.bestStreak);
  });

  const setScoresStr = orientedSetScores
    ? orientedSetScores.map((s) => `${s.w}-${s.l}`).join(", ")
    : null;

  const winners = `${winner1.display_name} & ${winner2.display_name}`;
  const losers = `${loser1.display_name} & ${loser2.display_name}`;

  const templateKey = setScoresStr ? "doubles.result_with_sets" : "doubles.result";
  const message = ctx.t(templateKey, {
    winners,
    losers,
    winnerSets: data.winnerSets,
    loserSets: data.loserSets,
    setScores: setScoresStr,
    change: eloResult.change,
  });

  await ctx.reply(message);
  return true;
}
