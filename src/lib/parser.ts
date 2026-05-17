export interface ParsedRow {
  created_at: Date;
  /** Hour (0-23) extracted directly from the created_at string in its original timezone */
  hour: number;
  /** Minute (0-59) extracted directly from the created_at string in its original timezone */
  minute: number;
  /** Day of week (0=Sun, 6=Sat) extracted directly from the created_at string in its original timezone */
  dayOfWeek: number;
  /** ISO date (YYYY-MM-DD) in the original timezone, used for week bucketing */
  localDate: string;
  team: string;
  origin: string;
  specialization: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  teams: string[];
  origins: string[];
  specializations: string[];
  dateRange: { min: Date; max: Date };
  totalRows: number;
}

interface TimestampParts {
  date: Date;
  hour: number;
  minute: number;
  localDate: string;
}

/**
 * Extract hour, minute and date directly from the raw value's string representation
 * so we always use the source timezone, never the browser's local timezone.
 *
 * Supported formats:
 *   - ISO: 2026-04-13T10:30:00 or 2026-04-13 10:30:00
 *   - DD/MM/YYYY HH:MM AM/PM [TZ]  (e.g., 13/04/2026 10:10 AM PDT)
 *   - MM/DD/YYYY HH:MM AM/PM [TZ]  (US format, detected by context)
 *   - Excel serial date number
 */
function parseTimestamp(value: unknown): TimestampParts | null {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "");

  // 1. ISO format: YYYY-MM-DD[T ]HH:MM
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (isoMatch) {
    const localDate = isoMatch[1];
    const hour = parseInt(isoMatch[2], 10);
    const minute = parseInt(isoMatch[3], 10);
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return { date: d, hour, minute, localDate };
    }
  }

  // 2. DD/MM/YYYY or MM/DD/YYYY with 12-hour time + AM/PM + optional timezone
  //    e.g., "13/04/2026 10:10 AM PDT" or "04/13/2026 10:10 AM PDT"
  const slashMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i
  );
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10); // could be DD or MM
    const part2 = parseInt(slashMatch[2], 10); // could be MM or DD
    const year = parseInt(slashMatch[3], 10);
    let hour = parseInt(slashMatch[4], 10);
    const minute = parseInt(slashMatch[5], 10);
    const ampm = (slashMatch[6] || "").toUpperCase();

    // Convert 12-hour to 24-hour if AM/PM present
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;

    // Heuristic: if part1 > 12 it must be a day (DD/MM/YYYY)
    // if part2 > 12 it must be a day (MM/DD/YYYY)
    // if both <= 12, assume DD/MM/YYYY (international format, more common in data exports)
    let day: number, month: number;
    if (part1 > 12) {
      // DD/MM/YYYY
      day = part1;
      month = part2;
    } else if (part2 > 12) {
      // MM/DD/YYYY
      month = part1;
      day = part2;
    } else {
      // Ambiguous, default to DD/MM/YYYY (international)
      day = part1;
      month = part2;
    }

    // Validate
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const localDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // Create a Date object (using UTC to avoid browser TZ shifting)
      const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
      if (!isNaN(d.getTime())) {
        return { date: d, hour, minute, localDate };
      }
    }
  }

  // 3. Excel serial date number
  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    const localDate = d.toISOString().slice(0, 10);
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();
    return { date: d, hour, minute, localDate };
  }

  return null;
}

function dayOfWeekFromDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yr = m < 3 ? y - 1 : y;
  return (yr + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) + t[m - 1] + d) % 7;
}

function findColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function parseFile(
  buffer: ArrayBuffer,
  _fileName: string
): Promise<ParseResult> {
  const XLSX = await import("xlsx");

  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (json.length < 2) {
    throw new Error("File must have at least a header row and one data row.");
  }

  const headers = (json[0] as string[]).map((h) => String(h ?? "").trim());

  const createdIdx = findColumn(headers, [
    "created_at",
    "created_at_pst",
    "created_date",
    "created date",
    "Created Date Period",
  ]);
  const teamIdx = findColumn(headers, ["team", "team_name", "Team"]);
  const originIdx = findColumn(headers, ["origin", "Origin", "channel", "Channel"]);
  const specIdx = findColumn(headers, [
    "case_specialization",
    "Case Specialization",
    "case specialization",
    "specialization",
    "Specialization",
    "specialization_name",
    "spec",
    "Spec",
  ]);

  if (createdIdx === -1) {
    throw new Error(
      'Could not find a "created_at" column. Available columns: ' +
        headers.join(", ")
    );
  }
  if (teamIdx === -1) {
    throw new Error(
      'Could not find a "team" column. Available columns: ' +
        headers.join(", ")
    );
  }

  const rows: ParsedRow[] = [];
  const teamSet = new Set<string>();
  const originSet = new Set<string>();
  const specSet = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (let i = 1; i < json.length; i++) {
    const row = json[i];
    if (!row || row.length === 0) continue;

    const parts = parseTimestamp(row[createdIdx]);
    const team = String(row[teamIdx] ?? "").trim();
    const origin =
      originIdx !== -1 ? String(row[originIdx] ?? "").trim() : "";
    const specialization =
      specIdx !== -1 ? String(row[specIdx] ?? "").trim() : "";

    if (!parts || !team) continue;

    const dow = dayOfWeekFromDate(parts.localDate);

    rows.push({
      created_at: parts.date,
      hour: parts.hour,
      minute: parts.minute,
      dayOfWeek: dow,
      localDate: parts.localDate,
      team,
      origin: origin || "Unknown",
      specialization: specialization || "Unknown",
    });
    teamSet.add(team);
    if (origin) originSet.add(origin);
    if (specialization) specSet.add(specialization);

    if (!minDate || parts.date < minDate) minDate = parts.date;
    if (!maxDate || parts.date > maxDate) maxDate = parts.date;
  }

  if (rows.length === 0) {
    throw new Error("No valid data rows found after parsing.");
  }

  return {
    rows,
    teams: Array.from(teamSet).sort(),
    origins: Array.from(originSet).sort(),
    specializations: Array.from(specSet).sort(),
    dateRange: { min: minDate!, max: maxDate! },
    totalRows: rows.length,
  };
}
