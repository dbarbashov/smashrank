import {
  getConnection,
  groupQueries,
  tournamentQueries,
  playerQueries,
} from "@smashrank/db";
import { sortStandings } from "@smashrank/core";
import type { Standing } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { forceCompleteTournament } from "../helpers/force-complete-tournament.js";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;

async function isGroupAdmin(ctx: SmashRankContext): Promise<boolean> {
  try {
    const member = await ctx.getChatMember(ctx.from!.id);
    return member.status === "administrator" || member.status === "creator";
  } catch {
    return false;
  }
}

export async function tournamentCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const text = ctx.message?.text ?? "";
  const parts = text.replace(/^\/tournament\s*/, "").trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() ?? "";

  const sql = getConnection();
  const tournaments = tournamentQueries(sql);
  const groups = groupQueries(sql);

  switch (subcommand) {
    case "create": {
      if (!await isGroupAdmin(ctx)) {
        await ctx.reply(ctx.t("settings.admin_only"));
        return;
      }

      const existing = await tournaments.findActiveByGroup(ctx.group.id);
      if (existing) {
        await ctx.reply(ctx.t("tournament.already_active"));
        return;
      }

      const name = parts.slice(1).join(" ") || ctx.t("tournament.default_name");
      const tournament = await tournaments.create({
        group_id: ctx.group.id,
        name,
        created_by: ctx.player.id,
        max_players: MAX_PLAYERS,
      });

      // Auto-join the creator
      await tournaments.addParticipant(tournament.id, ctx.player.id);
      await groups.ensureMembership(ctx.group.id, ctx.player.id);

      await ctx.reply(ctx.t("tournament.created", {
        name: tournament.name,
        creator: ctx.player.display_name,
      }));
      break;
    }

    case "join": {
      const tournament = await tournaments.findActiveByGroup(ctx.group.id);
      if (!tournament) {
        await ctx.reply(ctx.t("tournament.none_active"));
        return;
      }
      if (tournament.status !== "open") {
        await ctx.reply(ctx.t("tournament.already_started"));
        return;
      }

      const count = await tournaments.getParticipantCount(tournament.id);
      if (count >= tournament.max_players) {
        await ctx.reply(ctx.t("tournament.full"));
        return;
      }

      const isAlready = await tournaments.isParticipant(tournament.id, ctx.player.id);
      if (isAlready) {
        await ctx.reply(ctx.t("tournament.already_joined"));
        return;
      }

      await tournaments.addParticipant(tournament.id, ctx.player.id);
      await groups.ensureMembership(ctx.group.id, ctx.player.id);

      await ctx.reply(ctx.t("tournament.joined", {
        name: ctx.player.display_name,
        count: count + 1,
      }));
      break;
    }

    case "leave": {
      const tournament = await tournaments.findActiveByGroup(ctx.group.id);
      if (!tournament) {
        await ctx.reply(ctx.t("tournament.none_active"));
        return;
      }
      if (tournament.status !== "open") {
        await ctx.reply(ctx.t("tournament.already_started"));
        return;
      }

      const isParticipant = await tournaments.isParticipant(tournament.id, ctx.player.id);
      if (!isParticipant) {
        await ctx.reply(ctx.t("tournament.not_joined"));
        return;
      }

      await tournaments.removeParticipant(tournament.id, ctx.player.id);
      await ctx.reply(ctx.t("tournament.left", { name: ctx.player.display_name }));
      break;
    }

    case "start": {
      if (!await isGroupAdmin(ctx)) {
        await ctx.reply(ctx.t("settings.admin_only"));
        return;
      }

      const tournament = await tournaments.findActiveByGroup(ctx.group.id);
      if (!tournament) {
        await ctx.reply(ctx.t("tournament.none_active"));
        return;
      }
      if (tournament.status !== "open") {
        await ctx.reply(ctx.t("tournament.already_started"));
        return;
      }

      const count = await tournaments.getParticipantCount(tournament.id);
      if (count < MIN_PLAYERS) {
        await ctx.reply(ctx.t("tournament.not_enough_players", { min: MIN_PLAYERS, count }));
        return;
      }

      await tournaments.updateStatus(tournament.id, "active");
      await tournaments.initStandings(tournament.id);

      const totalFixtures = (count * (count - 1)) / 2;
      const participants = await tournaments.getParticipants(tournament.id);
      const names = participants.map((p) => p.display_name).join(", ");

      await ctx.reply(ctx.t("tournament.started", {
        name: tournament.name,
        count,
        fixtures: totalFixtures,
        players: names,
      }));
      break;
    }

    case "standings": {
      const tournament = await tournaments.findActiveByGroup(ctx.group.id);
      if (!tournament) {
        await ctx.reply(ctx.t("tournament.none_active"));
        return;
      }
      if (tournament.status === "open") {
        // Show participants list
        const participants = await tournaments.getParticipants(tournament.id);
        const lines = participants.map((p, i) => `${i + 1}. ${p.display_name}`);
        await ctx.reply(
          ctx.t("tournament.participants_title", { name: tournament.name }) +
          "\n" + lines.join("\n"),
        );
        return;
      }

      const standings = await tournaments.getStandings(tournament.id);

      // Build H2H for tiebreaking
      const fixtures = await tournaments.getFixtures(tournament.id);
      const h2h = new Map<string, string | null>();
      for (const f of fixtures) {
        const key = f.player1_id < f.player2_id
          ? `${f.player1_id}:${f.player2_id}`
          : `${f.player2_id}:${f.player1_id}`;
        if (f.winner_id && f.winner_score !== f.loser_score) {
          h2h.set(key, f.winner_id);
        } else {
          h2h.set(key, null);
        }
      }

      const sortable: Standing[] = standings.map((s) => ({
        playerId: s.player_id,
        points: s.points,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        setsWon: s.sets_won,
        setsLost: s.sets_lost,
        eloRating: s.elo_rating,
      }));
      const sorted = sortStandings(sortable, h2h);

      const nameMap = new Map(standings.map((s) => [s.player_id, s.display_name]));
      const lines = sorted.map((s, i) => {
        const sd = s.setsWon - s.setsLost;
        const sdStr = sd >= 0 ? `+${sd}` : `${sd}`;
        return `${i + 1}. ${nameMap.get(s.playerId)} — ${s.points}pts (${s.wins}W ${s.draws}D ${s.losses}L, SD:${sdStr})`;
      });

      const remaining = await tournaments.getUnplayedCount(tournament.id);
      await ctx.reply(
        ctx.t("tournament.standings_title", { name: tournament.name }) +
        "\n" + lines.join("\n") +
        "\n\n" + ctx.t("tournament.remaining_fixtures", { count: remaining }),
      );
      break;
    }

    case "fixtures": {
      const tournament = await tournaments.findActiveByGroup(ctx.group.id);
      if (!tournament) {
        await ctx.reply(ctx.t("tournament.none_active"));
        return;
      }
      if (tournament.status === "open") {
        await ctx.reply(ctx.t("tournament.not_started_yet"));
        return;
      }

      const fixtures = await tournaments.getFixtures(tournament.id);
      const lines: string[] = [];

      for (const f of fixtures) {
        if (f.match_id) {
          if (f.winner_score === f.loser_score) {
            lines.push(`${f.player1_name} vs ${f.player2_name}: ${ctx.t("tournament.draw_result")} ${f.winner_score}-${f.loser_score}`);
          } else {
            const winnerName = f.winner_id === f.player1_id ? f.player1_name : f.player2_name;
            const loserName = f.winner_id === f.player1_id ? f.player2_name : f.player1_name;
            lines.push(`${winnerName} ${ctx.t("matches_cmd.beat")} ${loserName} ${f.winner_score}-${f.loser_score}`);
          }
        } else {
          lines.push(`${f.player1_name} vs ${f.player2_name}: ⏳`);
        }
      }

      await ctx.reply(
        ctx.t("tournament.fixtures_title", { name: tournament.name }) +
        "\n" + lines.join("\n"),
      );
      break;
    }

    case "end": {
      if (!await isGroupAdmin(ctx)) {
        await ctx.reply(ctx.t("settings.admin_only"));
        return;
      }

      const tournament = await tournaments.findActiveByGroup(ctx.group.id);
      if (!tournament) {
        await ctx.reply(ctx.t("tournament.none_active"));
        return;
      }

      if (tournament.status === "open") {
        // Cancel an open tournament
        await tournaments.updateStatus(tournament.id, "completed");
        await ctx.reply(ctx.t("tournament.cancelled", { name: tournament.name }));
        return;
      }

      // Force-complete active tournament
      const result = await forceCompleteTournament(tournament, ctx.group.id);

      let message = ctx.t("tournament.force_completed", {
        name: tournament.name,
        forfeited: result.forfeitedFixtures,
      });

      if (result.winnerName) {
        message += "\n" + ctx.t("tournament.champion", { name: result.winnerName });
      }

      if (result.achievements.length > 0) {
        const players = playerQueries(sql);
        const achievementLines: string[] = [];
        for (const a of result.achievements) {
          const player = await players.findById(a.playerId);
          if (player) {
            achievementLines.push(`${player.display_name}: ${ctx.t(`achievement.${a.achievementId}`)}`);
          }
        }
        if (achievementLines.length > 0) {
          message += "\n\n" + ctx.t("achievement.unlocked") + "\n" + achievementLines.join("\n");
        }
      }

      await ctx.reply(message);
      break;
    }

    default: {
      await ctx.reply(ctx.t("tournament.help"));
      break;
    }
  }
}
