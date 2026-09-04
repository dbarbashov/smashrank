export const ACHIEVEMENT_CATEGORIES = [
  "match",
  "rating",
  "opponents",
  "activity",
  "doubles",
  "tournaments",
  "shame",
  "meta",
] as const;

export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];
export type AchievementKind = "positive" | "shame" | "neutral" | "meta";

export interface AchievementCatalogEntry {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  kind: AchievementKind;
  sortOrder: number;
}

function entry(
  id: string,
  name: string,
  description: string,
  emoji: string,
  category: AchievementCategory,
  kind: AchievementKind,
  sortOrder: number,
): AchievementCatalogEntry {
  return { id, name, description, emoji, category, kind, sortOrder };
}

/**
 * The canonical achievement catalogue. Database seeds, bot formatting and API
 * consumers intentionally share these ids and metadata.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementCatalogEntry[] = [
  entry("first_blood", "First Blood", "Win your first match", "🩸", "match", "positive", 10),
  entry("perfect_game", "Flawless", "Win a set 11-0", "✨", "match", "positive", 20),
  entry("heartbreaker", "Heartbreaker", "Win a match after losing the first set", "💔", "match", "positive", 30),
  entry("stolen_victory", "Stolen Victory", "Win every winning set by exactly two points", "🥷", "match", "positive", 40),
  entry("nerves_of_steel", "Nerves of Steel", "Win a set 20-18 or higher", "🧠", "match", "positive", 50),
  entry("cardiologist_approved", "Cardiologist Approved", "Play a match where every set goes beyond 10-10", "🫀", "match", "neutral", 60),
  entry("groundhog_day", "Groundhog Day", "Play three consecutive sets with the same normalized score", "🔁", "match", "neutral", 70),
  entry("rollercoaster", "Rollercoaster", "Both players win an 11-0 set in one match", "🎢", "match", "neutral", 80),
  entry("back_from_the_dead", "Back from the Dead", "Win after losing the first set 0-11", "🧟", "match", "positive", 90),

  entry("giant_killer", "Giant Killer", "Beat a player 200+ ELO above you", "🗡️", "rating", "positive", 10),
  entry("top_dog", "Top Dog", "Reach rank #1", "👑", "rating", "positive", 20),
  entry("small_but_nice", "Small but Nice", "Gain 1 to 3 ELO for a win", "🪙", "rating", "neutral", 30),
  entry("bully", "Bully", "Challenge the current #1 and beat them", "😈", "rating", "shame", 40),
  entry("throne_shaker", "Throne Shaker", "As #2, beat #1 and take the lead", "🫨", "rating", "positive", 50),
  entry("throne_defender", "Throne Defender", "As #1, beat the current #2 three times in a row", "🏰", "rating", "positive", 60),
  entry("robin_hood", "Robin Hood", "Beat a higher-rated player and lose to a lower-rated player in one day", "🏹", "rating", "neutral", 70),

  entry("rivalry", "Rival", "Play the same opponent 10 times", "⚔️", "opponents", "neutral", 10),
  entry("boomerang", "Boomerang", "Alternate winners in five consecutive head-to-head matches", "🪃", "opponents", "neutral", 20),
  entry("broke_the_wall", "Broke the Wall", "Beat an opponent after five consecutive losses to them", "🧱", "opponents", "positive", 30),
  entry("perfect_balance", "Perfect Balance", "Reach an even head-to-head record after at least ten meetings", "⚖️", "opponents", "neutral", 40),
  entry("collector", "Collector", "Beat every active opponent", "🗃️", "opponents", "positive", 50),
  entry("community_player", "Community Player", "Play every active opponent", "🤝", "opponents", "neutral", 60),
  entry("diplomat", "Diplomat", "Play five different opponents in one Moscow calendar day", "🕊️", "opponents", "neutral", 70),

  entry("on_fire", "On Fire", "Win 5 matches in a row", "🔥", "activity", "positive", 10),
  entry("unstoppable", "Unstoppable", "Win 10 matches in a row", "💀", "activity", "positive", 20),
  entry("iron_man", "Iron Man", "Play 50 matches", "🦾", "activity", "positive", 30),
  entry("centurion", "Centurion", "Play 100 matches", "💯", "activity", "positive", 40),
  entry("comeback_kid", "Comeback Kid", "Win after losing 3+ matches in a row", "🔄", "activity", "positive", 50),
  entry("newcomer_threat", "Newcomer Threat", "Win 5 of your first 10 games", "🌟", "activity", "positive", 60),
  entry("lunch_break", "Lunch Break", "Play five matches inside a two-hour window", "🥪", "activity", "neutral", 70),
  entry("night_shift", "Night Shift", "Win between 00:00 and 03:59 Moscow time", "🌙", "activity", "neutral", 80),
  entry("early_bird", "Early Bird", "Win between 04:00 and 09:59 Moscow time", "🐦", "activity", "positive", 90),
  entry("no_day_without_ping_pong", "No Day Without Ping-Pong", "Play on five consecutive Moscow calendar days", "📅", "activity", "positive", 100),
  entry("stable_instability", "Stable Instability", "Alternate wins and losses for eight matches", "〰️", "activity", "neutral", 110),
  entry("lights_out", "Lights Out", "Play in the group's final match on five completed days", "💡", "activity", "neutral", 120),

  entry("well_oiled_pair", "Well-Oiled Pair", "Win five times with the same partner", "⚙️", "doubles", "positive", 10),
  entry("social_butterfly", "Social Butterfly", "Win with five different partners", "🦋", "doubles", "positive", 20),
  entry("office_divorce", "Office Divorce", "Beat your partner from your previous doubles match", "💔", "doubles", "neutral", 30),
  entry("hard_carry", "Hard Carry", "Win with a partner rated at least 200 ELO below you", "🏋️", "doubles", "positive", 40),
  entry("pack_hunt", "Pack Hunt", "Win despite a 200+ combined doubles ELO deficit", "🐺", "doubles", "positive", 50),
  entry("universal_soldier", "Universal Soldier", "Partner every active doubles player", "🪖", "doubles", "neutral", 60),
  entry("shuffle_lineups", "Shuffle Lineups", "Use three different partners in three consecutive doubles matches", "🔀", "doubles", "neutral", 70),

  entry("tournament_champion", "Tournament Champion", "Win a tournament", "🏆", "tournaments", "positive", 10),
  entry("tournament_undefeated", "Undefeated", "Complete a tournament without a loss", "🛡️", "tournaments", "positive", 20),
  entry("tournament_ironman", "Tournament Iron Man", "Play every fixture in a tournament", "🤖", "tournaments", "positive", 30),
  entry("draw_master", "Draw Master", "Draw at least three tournament matches", "🤝", "tournaments", "neutral", 40),
  entry("clean_sweep", "Clean Sweep", "Beat every other tournament participant", "🧹", "tournaments", "positive", 50),
  entry("quiet_start", "Quiet Start", "Lose your first tournament match, then win the tournament", "🤫", "tournaments", "positive", 60),
  entry("by_a_whisker", "By a Whisker", "Win a tournament tied on points with second place", "🐱", "tournaments", "positive", 70),
  entry("wooden_spoon", "Wooden Spoon", "Play every fixture and finish last", "🥄", "tournaments", "shame", 80),
  entry("pacifist", "Pacifist", "Finish winless with at least three draws", "☮️", "tournaments", "neutral", 90),
  entry("party_worker", "Party Worker", "Lead games played at the end of a season", "🏭", "tournaments", "neutral", 100),

  entry("free_fall", "Free Fall", "Lose 5 matches in a row", "📉", "shame", "shame", 10),
  entry("rock_bottom", "Rock Bottom", "Lose 10 matches in a row", "🪨", "shame", "shame", 20),
  entry("punching_bag", "Punching Bag", "Lose to a player 200+ ELO above you", "🥊", "shame", "shame", 30),
  entry("upset_victim", "Upset Victim", "Lose to a player 200+ ELO below you", "🤡", "shame", "shame", 40),
  entry("humbled", "Humbled", "Lose a set 0-11", "😶", "shame", "shame", 50),
  entry("bottled_it", "Bottled It", "Lose after winning the first set", "🫣", "shame", "shame", 60),
  entry("glass_cannon", "Glass Cannon", "Win a set 11-0 but lose the match", "💥", "shame", "shame", 70),
  entry("doormat", "Doormat", "Lose to the same opponent 5 times in a row", "🧽", "shame", "shame", 80),

  entry("jackpot", "Jackpot", "Unlock at least three primary achievements from one match", "🎰", "meta", "meta", 10),
  entry("full_collection", "Full Collection", "Complete any non-meta achievement category", "🗂️", "meta", "meta", 20),
  entry("one_of_a_kind", "One of a Kind", "Remain the sole holder of an achievement for 30 days", "💎", "meta", "meta", 30),
  entry("hero_and_villain", "Hero and Villain", "Unlock a positive and a shame achievement in one match", "🎭", "meta", "meta", 40),
] as const;

export const ACHIEVEMENT_BY_ID = new Map(
  ACHIEVEMENT_CATALOG.map((achievement) => [achievement.id, achievement]),
);
