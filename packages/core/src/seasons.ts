export interface SeasonInfo {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

const SEASON_BOUNDARIES = [
  { month: 1, day: 1 },   // S1 starts Jan 1
  { month: 3, day: 1 },   // S2 starts Mar 1
  { month: 6, day: 1 },   // S3 starts Jun 1
  { month: 9, day: 1 },   // S4 starts Sep 1
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function getSeasonForDate(date: Date): SeasonInfo {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Find which season we're in
  let seasonIndex = 0;
  for (let i = SEASON_BOUNDARIES.length - 1; i >= 0; i--) {
    const b = SEASON_BOUNDARIES[i];
    if (month > b.month || (month === b.month && day >= b.day)) {
      seasonIndex = i;
      break;
    }
  }

  const seasonNumber = seasonIndex + 1; // S1-S4
  const start = SEASON_BOUNDARIES[seasonIndex];

  // End date is the day before the next season starts (or Dec 31 for S4)
  let endYear = year;
  let endMonth: number;
  let endDay: number;

  if (seasonIndex < SEASON_BOUNDARIES.length - 1) {
    const next = SEASON_BOUNDARIES[seasonIndex + 1];
    // Last day of month before next season
    endMonth = next.month;
    endDay = next.day - 1;
    if (endDay === 0) {
      endMonth -= 1;
      endDay = new Date(year, endMonth, 0).getDate();
    }
  } else {
    endMonth = 12;
    endDay = 31;
  }

  const monthNames = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const startStr = `${year}-${pad(start.month)}-${pad(start.day)}`;
  const endStr = `${endYear}-${pad(endMonth)}-${pad(endDay)}`;

  // Build name like "S1 2026 (Jan-Feb)"
  const startMonthName = monthNames[start.month];
  const endMonthName = monthNames[endMonth];
  const name = `S${seasonNumber} ${year} (${startMonthName}\u2013${endMonthName})`;

  return { name, startDate: startStr, endDate: endStr };
}

export function isSeasonExpired(endDate: string, now: Date = new Date()): boolean {
  const end = new Date(endDate + "T23:59:59.999Z");
  return now > end;
}
