import type { MatchType } from "../types.js";

export function getMatchTypeOptions(
  translate: (key: string) => string,
): Array<{ value: MatchType; label: string }> {
  return [
    { value: "singles", label: translate("leaderboard.singles") },
    { value: "doubles", label: translate("leaderboard.doubles") },
  ];
}
