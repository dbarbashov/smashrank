import type postgres from "postgres";
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

// Format: /doubles @partner vs @opp1 @opp2 11-7 11-5
export async function doublesCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const text = ctx.message?.text ?? "";
  const cleaned = text.replace(/^\/doubles\s*/, "").trim();

  // Split on "vs" (case insensitive)
  const vsParts = cleaned.split(/\s+vs\s+/i);
  if (vsParts.length !== 2) {
    await ctx.reply(ctx.t("doubles.usage"));
    return;
  }

  // Left side: @partner
  const partnerMatch = vsParts[0].match(/@(\w+)/);
  if (!partnerMatch) {
    await ctx.reply(ctx.t("doubles.usage"));
    return;
  }

  // Right side: @opp1 @opp2 scores
  const rightMentions = vsParts[1].match(/@(\w+)/g);
  if (!rightMentions || rightMentions.length < 2) {
    await ctx.reply(ctx.t("doubles.usage"));
    return;
  }

  const opp1Username = rightMentions[0].slice(1);
  const opp2Username = rightMentions[1].slice(1);

  // Extract scores from right side (after the last @mention)
  const lastMentionIdx = vsParts[1].lastIndexOf(rightMentions[1]);
  const scoresStr = vsParts[1].slice(lastMentionIdx + rightMentions[1].length).trim();

  if (!scoresStr) {
    await ctx.reply(ctx.t("doubles.usage"));
    return;
  }

  // Parse scores using a fake game command
  const fakeCommand = `/game @dummy ${scoresStr}`;
  const parseResult = parseGameCommand(fakeCommand);
  if (!parseResult.ok) {
    await ctx.reply(ctx.t(`error.${parseResult.error}`));
    return;
  }

  const sql = getConnection();
  const players = playerQueries(sql);
  const groups = groupQueries(sql);

  // Resolve all players
  const partner = await players.findByUsername(partnerMatch[1]);
  if (!partner) {
    await ctx.reply(ctx.t("doubles.partner_not_found", { username: partnerMatch[1] }));
    return;
  }

  const opp1 = await players.findByUsername(opp1Username);
  if (!opp1) {
    await ctx.reply(ctx.t("doubles.opponent_not_found", { username: opp1Username }));
    return;
  }

  const opp2 = await players.findByUsername(opp2Username);
  if (!opp2) {
    await ctx.reply(ctx.t("doubles.opponent_not_found", { username: opp2Username }));
    return;
  }

  // Check no duplicate players
  const allIds = new Set([ctx.player.id, partner.id, opp1.id, opp2.id]);
  if (allIds.size !== 4) {
    await ctx.reply(ctx.t("doubles.self_play"));
    return;
  }

  // Check all resolved players are members of this group
  const [partnerIsMember, opp1IsMember, opp2IsMember] = await Promise.all([
    groups.isMember(ctx.group.id, partner.id),
    groups.isMember(ctx.group.id, opp1.id),
    groups.isMember(ctx.group.id, opp2.id),
  ]);
  if (!partnerIsMember) {
    await ctx.reply(ctx.t("game.not_group_member", { username: partnerMatch[1] }));
    return;
  }
  if (!opp1IsMember) {
    await ctx.reply(ctx.t("game.not_group_member", { username: opp1Username }));
    return;
  }
  if (!opp2IsMember) {
    await ctx.reply(ctx.t("game.not_group_member", { username: opp2Username }));
    return;
  }

  const { data } = parseResult;

  // Reporter is always on the "winning" side for score parsing
  // Reporter won = our team won, Reporter lost = opponents won
  const ourTeamWon = data.winner === "reporter";

  const winner1 = ourTeamWon ? ctx.player : opp1;
  const winner2 = ourTeamWon ? partner : opp2;
  const loser1 = ourTeamWon ? opp1 : ctx.player;
  const loser2 = ourTeamWon ? opp2 : partner;

  // Orient set scores
  const orientedSetScores = data.setScores
    ? data.setScores.map((s) => ({
        w: ourTeamWon ? s.reporterScore : s.opponentScore,
        l: ourTeamWon ? s.opponentScore : s.reporterScore,
      }))
    : null;

  // Get group member stats for all 4 players
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

    const setsInMatch = data.winnerSets + data.loserSets;
    await txGroups.updateGroupDoublesElo(ctx.group!.id, winner1.id, eloResult.winner1NewRating, true, w1Streak.currentStreak, w1Streak.bestStreak, setsInMatch);
    await txGroups.updateGroupDoublesElo(ctx.group!.id, winner2.id, eloResult.winner2NewRating, true, w2Streak.currentStreak, w2Streak.bestStreak, setsInMatch);
    await txGroups.updateGroupDoublesElo(ctx.group!.id, loser1.id, eloResult.loser1NewRating, false, l1Streak.currentStreak, l1Streak.bestStreak, setsInMatch);
    await txGroups.updateGroupDoublesElo(ctx.group!.id, loser2.id, eloResult.loser2NewRating, false, l2Streak.currentStreak, l2Streak.bestStreak, setsInMatch);
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
}
