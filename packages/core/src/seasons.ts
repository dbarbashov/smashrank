export interface SeasonInfo {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Last day of a given month (handles leap years). */
function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Seasons:
 *   S2: Mar 1 – Aug 31
 *   S3: Sep 1 – Feb 28/29  (crosses year boundary)
 */
export function getSeasonForDate(date: Date): SeasonInfo {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12

  let sNum: number;
  let startYear: number;
  let startMonth: number;
  let endYear: number;
  let endMonth: number;

  if (month >= 3 && month <= 8) {
    sNum = 2;
    startYear = year;
    startMonth = 3;
    endYear = year;
    endMonth = 8;
  } else if (month >= 9) {
    sNum = 3;
    startYear = year;
    startMonth = 9;
    endYear = year + 1;
    endMonth = 2;
  } else {
    sNum = 3;
    startYear = year - 1;
    startMonth = 9;
    endYear = year;
    endMonth = 2;
  }

  const startStr = `${startYear}-${pad(startMonth)}-01`;
  const endStr = `${endYear}-${pad(endMonth)}-${pad(lastDay(endYear, endMonth))}`;

  // Label year = the year the season starts in.
  const label = `S${sNum} ${startYear} (${MONTH_NAMES[startMonth]}\u2013${MONTH_NAMES[endMonth]})`;

  return { name: label, startDate: startStr, endDate: endStr };
}

export function isSeasonExpired(endDate: string | Date, now: Date = new Date()): boolean {
  const dateStr = typeof endDate === "string" ? endDate : endDate.toISOString().slice(0, 10);
  const end = new Date(dateStr + "T23:59:59.999Z");
  return now > end;
}
