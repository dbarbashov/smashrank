import { Context } from "grammy";
import type { Player, Group, Season } from "@smashrank/db";

export interface SmashRankFlavor {
  player: Player;
  group: Group | null;
  season: Season | null;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export type SmashRankContext = Context & SmashRankFlavor;
