import { ParsedRow } from "./parser";

export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DayName = (typeof DAY_NAMES)[number];

// 24 rows (hours) x 7 columns (days), each cell = average volume
export type ArrivalMatrix = number[][];

export interface WeeklyBreakdown {
  // weekKey -> 24x7 raw count matrix for that week
  [weekKey: string]: number[][];
}

/**
 * Compute the Sunday-start week key from a YYYY-MM-DD local date string
 * and the pre-computed day-of-week, using pure arithmetic -- no Date object.
 */
function getWeekKey(localDate: string, dayOfWeek: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dayOfWeek);
  const sy = dt.getFullYear();
  const sm = String(dt.getMonth() + 1).padStart(2, "0");
  const sd = String(dt.getDate()).padStart(2, "0");
  return `${sy}-${sm}-${sd}`;
}

export function computeArrivalPattern(
  rows: ParsedRow[],
  team?: string,
  origin?: string
): { matrix: ArrivalMatrix; weeklyBreakdown: WeeklyBreakdown; weekCount: number } {
  let filtered = rows;
  if (team) filtered = filtered.filter((r) => r.team === team);
  if (origin) filtered = filtered.filter((r) => r.origin === origin);

  const weeklyBreakdown: WeeklyBreakdown = {};
  const weekSet = new Set<string>();

  for (const row of filtered) {
    const hour = row.hour;
    const day = row.dayOfWeek;
    const wk = getWeekKey(row.localDate, day);

    weekSet.add(wk);

    if (!weeklyBreakdown[wk]) {
      weeklyBreakdown[wk] = Array.from({ length: 24 }, () =>
        Array(7).fill(0)
      );
    }
    weeklyBreakdown[wk][hour][day]++;
  }

  const weekCount = weekSet.size;

  // Average across all weeks
  const matrix: ArrivalMatrix = Array.from({ length: 24 }, () =>
    Array(7).fill(0)
  );

  for (const wk of Object.keys(weeklyBreakdown)) {
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < 7; d++) {
        matrix[h][d] += weeklyBreakdown[wk][h][d];
      }
    }
  }

  if (weekCount > 0) {
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < 7; d++) {
        matrix[h][d] = Math.round(matrix[h][d] / weekCount);
      }
    }
  }

  return { matrix, weeklyBreakdown, weekCount };
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function getMatrixTotal(matrix: ArrivalMatrix): number {
  let total = 0;
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      total += matrix[h][d];
    }
  }
  return total;
}

export function getMatrixMax(matrix: ArrivalMatrix): number {
  let max = 0;
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      if (matrix[h][d] > max) max = matrix[h][d];
    }
  }
  return max;
}
