import { ParsedRow } from "./parser";

export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const SLOTS_15 = Array.from({ length: 96 }, (_, i) => i);

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

// N rows x 7 columns (days), each cell = average volume
// 24 rows for hourly, 96 rows for 15-min
export type ArrivalMatrix = number[][];

export interface WeeklyBreakdown {
  [weekKey: string]: number[][];
}

function getWeekKey(localDate: string, dayOfWeek: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dayOfWeek);
  const sy = dt.getFullYear();
  const sm = String(dt.getMonth() + 1).padStart(2, "0");
  const sd = String(dt.getDate()).padStart(2, "0");
  return `${sy}-${sm}-${sd}`;
}

function filterRows(rows: ParsedRow[], team?: string, origin?: string | string[], specialization?: string | string[]): ParsedRow[] {
  let filtered = rows;
  if (team) filtered = filtered.filter((r) => r.team === team);
  if (origin) {
    if (Array.isArray(origin)) {
      const set = new Set(origin);
      filtered = filtered.filter((r) => set.has(r.origin));
    } else {
      filtered = filtered.filter((r) => r.origin === origin);
    }
  }
  if (specialization) {
    if (Array.isArray(specialization)) {
      const set = new Set(specialization);
      filtered = filtered.filter((r) => set.has(r.specialization));
    } else {
      filtered = filtered.filter((r) => r.specialization === specialization);
    }
  }
  return filtered;
}

/** Hourly arrival pattern: 24 x 7 matrix */
export function computeArrivalPattern(
  rows: ParsedRow[],
  team?: string,
  origin?: string | string[],
  specialization?: string | string[],
): { matrix: ArrivalMatrix; weeklyBreakdown: WeeklyBreakdown; weekCount: number } {
  const filtered = filterRows(rows, team, origin, specialization);
  const weeklyBreakdown: WeeklyBreakdown = {};
  const weekSet = new Set<string>();

  for (const row of filtered) {
    const hour = row.hour;
    const day = row.dayOfWeek;
    const wk = getWeekKey(row.localDate, day);
    weekSet.add(wk);

    if (!weeklyBreakdown[wk]) {
      weeklyBreakdown[wk] = Array.from({ length: 24 }, () => Array(7).fill(0));
    }
    weeklyBreakdown[wk][hour][day]++;
  }

  const weekCount = weekSet.size;
  const matrix = averageBreakdown(weeklyBreakdown, 24, weekCount);
  return { matrix, weeklyBreakdown, weekCount };
}

/** 15-minute interval arrival pattern: 96 x 7 matrix */
export function computeArrivalPattern15(
  rows: ParsedRow[],
  team?: string,
  origin?: string | string[],
  specialization?: string | string[],
): { matrix: ArrivalMatrix; weeklyBreakdown: WeeklyBreakdown; weekCount: number } {
  const filtered = filterRows(rows, team, origin, specialization);
  const weeklyBreakdown: WeeklyBreakdown = {};
  const weekSet = new Set<string>();

  for (const row of filtered) {
    const slot = row.hour * 4 + Math.floor(row.minute / 15);
    const day = row.dayOfWeek;
    const wk = getWeekKey(row.localDate, day);
    weekSet.add(wk);

    if (!weeklyBreakdown[wk]) {
      weeklyBreakdown[wk] = Array.from({ length: 96 }, () => Array(7).fill(0));
    }
    weeklyBreakdown[wk][slot][day]++;
  }

  const weekCount = weekSet.size;
  const matrix = averageBreakdown(weeklyBreakdown, 96, weekCount);
  return { matrix, weeklyBreakdown, weekCount };
}

function averageBreakdown(wb: WeeklyBreakdown, slots: number, weekCount: number): ArrivalMatrix {
  const matrix: ArrivalMatrix = Array.from({ length: slots }, () => Array(7).fill(0));
  for (const wk of Object.keys(wb)) {
    for (let s = 0; s < slots; s++) {
      for (let d = 0; d < 7; d++) {
        matrix[s][d] += wb[wk][s][d];
      }
    }
  }
  if (weekCount > 0) {
    for (let s = 0; s < slots; s++) {
      for (let d = 0; d < 7; d++) {
        matrix[s][d] = Math.round(matrix[s][d] / weekCount);
      }
    }
  }
  return matrix;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Format a 15-min slot index (0-95) as HH:MM */
export function formatSlot(slot: number): string {
  const h = Math.floor(slot / 4);
  const m = (slot % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getMatrixTotal(matrix: ArrivalMatrix): number {
  return matrix.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0);
}

export function getMatrixMax(matrix: ArrivalMatrix): number {
  let max = 0;
  for (const row of matrix) {
    for (const v of row) {
      if (v > max) max = v;
    }
  }
  return max;
}

/**
 * Compute the 7 dates for the forecasted week (the week after the last week in data).
 * Returns an array of 7 strings indexed by day-of-week (0=Sun..6=Sat),
 * formatted like "13 Apr 26".
 */
export function getForecastWeekDates(weeklyBreakdown: WeeklyBreakdown): string[] {
  return buildForecastDates(weeklyBreakdown, "short");
}

/**
 * Like getForecastWeekDates but formatted as "Mon 04/06/26" for the labor plan.
 */
export function getForecastWeekDatesLong(weeklyBreakdown: WeeklyBreakdown): string[] {
  return buildForecastDates(weeklyBreakdown, "long");
}

// ─────────────────────────────────────────────────────────────────────────
// Yearly (long-term) forecast helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Per-week daily totals. Each entry holds the Sunday date of the week and
 * 7 daily totals (index 0 = Sun ... 6 = Sat).
 */
export interface WeeklyDailyData {
  weekStartDate: string; // YYYY-MM-DD (Sunday)
  dailyTotals: number[]; // length 7
}

/**
 * Aggregate raw rows to historical weekly daily totals: one entry per week
 * found in the data, each with 7 daily totals.
 */
export function computeWeeklyDailyTotals(
  rows: ParsedRow[],
  team?: string,
  origin?: string | string[],
  specialization?: string | string[],
): WeeklyDailyData[] {
  const filtered = filterRows(rows, team, origin, specialization);
  const byWeek: Record<string, number[]> = {};

  for (const row of filtered) {
    const wk = getWeekKey(row.localDate, row.dayOfWeek);
    if (!byWeek[wk]) byWeek[wk] = Array(7).fill(0);
    byWeek[wk][row.dayOfWeek]++;
  }

  return Object.keys(byWeek)
    .sort()
    .map((wk) => ({ weekStartDate: wk, dailyTotals: byWeek[wk] }));
}

/**
 * Returns the Sunday date that starts the first forecasted week
 * (i.e., the Sunday after the last historical week).
 */
export function getForecastYearStart(history: WeeklyDailyData[]): Date {
  if (history.length === 0) {
    const today = new Date();
    today.setDate(today.getDate() - today.getDay());
    return today;
  }
  const last = history[history.length - 1].weekStartDate;
  const [y, m, d] = last.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 7);
  return dt;
}

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format the start date of forecast week N (0..51) as e.g. "W1 May 11".
 */
export function formatYearWeek(weekIdx: number, baseSunday: Date): string {
  const dt = new Date(baseSunday);
  dt.setDate(dt.getDate() + weekIdx * 7);
  return `W${weekIdx + 1} ${MONTHS_ABBR[dt.getMonth()]} ${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * Build the 12 calendar months starting from the forecast year start.
 * Each entry: { label: "May 26", year, month, weekDayIndices: [{week, day}] }
 * The weekDayIndices list maps cells of the 52x7 forecast matrix back to the
 * calendar month, so we can aggregate volume/HC totals by month.
 */
export interface MonthlyBucket {
  label: string;
  year: number;
  month: number; // 0..11
  cells: { week: number; day: number }[];
}

export function buildMonthlyBuckets(baseSunday: Date, weeks = 52): MonthlyBucket[] {
  const buckets = new Map<string, MonthlyBucket>();

  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(baseSunday);
      dt.setDate(dt.getDate() + w * 7 + d);
      const key = `${dt.getFullYear()}-${dt.getMonth()}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          label: `${MONTHS_ABBR[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`,
          year: dt.getFullYear(),
          month: dt.getMonth(),
          cells: [],
        });
      }
      buckets.get(key)!.cells.push({ week: w, day: d });
    }
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );
}

function buildForecastDates(weeklyBreakdown: WeeklyBreakdown, style: "short" | "long"): string[] {
  const weeks = Object.keys(weeklyBreakdown).sort();
  if (weeks.length === 0) return Array(7).fill("");

  const lastWeekSunday = weeks[weeks.length - 1];
  const [y, m, d] = lastWeekSunday.split("-").map(Number);
  const sundayOfLastWeek = new Date(y, m - 1, d);

  const forecastSunday = new Date(sundayOfLastWeek);
  forecastSunday.setDate(forecastSunday.getDate() + 7);

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dates: string[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const dt = new Date(forecastSunday);
    dt.setDate(dt.getDate() + dow);
    if (style === "long") {
      const dn = DAY_ABBR[dt.getDay()];
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      const yy = String(dt.getFullYear()).slice(2);
      dates.push(`${dn} ${mm}/${dd}/${yy}`);
    } else {
      const dd = dt.getDate();
      const mm = MONTHS_SHORT[dt.getMonth()];
      const yy = String(dt.getFullYear()).slice(2);
      dates.push(`${dd} ${mm} ${yy}`);
    }
  }
  return dates;
}
