type PrimaryNavItem = {
  key:
    | "leaderboard"
    | "matches"
    | "achievements"
    | "seasons"
    | "tournaments"
    | "records";
  segment: string;
  end?: boolean;
};

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { key: "leaderboard", segment: "", end: true },
  { key: "matches", segment: "matches" },
  { key: "achievements", segment: "achievements" },
  { key: "seasons", segment: "seasons" },
  { key: "tournaments", segment: "tournaments" },
  { key: "records", segment: "records" },
];

export function getPrimaryNavIndex(pathname: string): number {
  const section = pathname.split("/")[3] ?? "";
  const index = PRIMARY_NAV_ITEMS.findIndex((item) => item.segment === section);
  return index === -1 ? 0 : index;
}
