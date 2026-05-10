// Shift catalog generation for the workforce planner.
//
// Operating model (set with the user):
//   - 8h work + 30min lunch + 2 × 15min rest breaks = 8.5h paid, 7.5h productive
//   - Multi-skill agents (chat + email)
//   - Mon–Fri default working week, Sat/Sun off
//   - Shift starts every 30 min, lunch placement varies per candidate so the
//     greedy scheduler can pick variants that drop their lunch on low-demand
//     slots (de-facto break optimization).

export const SLOTS_PER_DAY = 96;

// 8.5h × 4 slots/h = 34 slots
export const SHIFT_TOTAL_SLOTS = 34;
// 7.5h × 4 slots/h = 30 slots
export const SHIFT_PRODUCTIVE_SLOTS = 30;

// Lunch is two consecutive 15-min slots (= 30 min)
export const LUNCH_SLOT_LEN = 2;
// Each rest break is one slot (= 15 min)
export const BREAK_SLOT_LEN = 1;

export interface Shift {
  id: string;
  startSlot: number;       // 0..95
  endSlot: number;         // exclusive; may exceed SLOTS_PER_DAY for late shifts
  lunchStart: number;      // first slot of the 30-min lunch (may exceed SLOTS_PER_DAY → wraps)
  break1: number;          // single-slot rest break (1st half)
  break2: number;          // single-slot rest break (2nd half)
  spansMidnight: boolean;  // true if endSlot > SLOTS_PER_DAY
}

/**
 * A shift's productive coverage split across two days. `today` is the slots
 * that fall on the start day; `tomorrow` is the slots that wrap past midnight
 * onto the next calendar day. Both arrays are length SLOTS_PER_DAY (96).
 */
export interface CoverageMask {
  today: boolean[];
  tomorrow: boolean[];
}

/** Convert a slot index to a "06:30" 24h label. */
export function slotToTime(slot: number): string {
  const s = ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY;
  const h = Math.floor(s / 4);
  const m = (s % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Slot → "06:30 AM". */
export function slotToAmPm(slot: number): string {
  const s = ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY;
  const h = Math.floor(s / 4);
  const m = (s % 4) * 15;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

export function shiftLabel(shift: Shift): string {
  const endLabel = shift.spansMidnight
    ? `${slotToAmPm(shift.endSlot)} (+1)`
    : slotToAmPm(shift.endSlot);
  return `${slotToAmPm(shift.startSlot)} – ${endLabel}`;
}

export function shiftDescription(shift: Shift): string {
  const lunch = `Lunch ${slotToAmPm(shift.lunchStart)}`;
  const b1 = `Brk ${slotToAmPm(shift.break1)}`;
  const b2 = `Brk ${slotToAmPm(shift.break2)}`;
  return `${lunch} · ${b1} · ${b2}`;
}

/**
 * Productive coverage mask split into today / tomorrow. Slots where the
 * agent is on the floor (and not on lunch/break) are true. Late shifts whose
 * span crosses midnight have their post-midnight slots in `tomorrow`.
 */
export function getCoverageMask(shift: Shift): CoverageMask {
  const today = new Array<boolean>(SLOTS_PER_DAY).fill(false);
  const tomorrow = new Array<boolean>(SLOTS_PER_DAY).fill(false);

  for (let t = shift.startSlot; t < shift.endSlot; t++) {
    if (t < SLOTS_PER_DAY) today[t] = true;
    else tomorrow[t - SLOTS_PER_DAY] = true;
  }

  const remove = (slot: number) => {
    if (slot < SLOTS_PER_DAY) today[slot] = false;
    else tomorrow[slot - SLOTS_PER_DAY] = false;
  };
  remove(shift.lunchStart);
  remove(shift.lunchStart + 1);
  remove(shift.break1);
  remove(shift.break2);

  return { today, tomorrow };
}

/**
 * Span mask (paid time, including lunch + breaks), split into today/tomorrow.
 */
export function getSpanMask(shift: Shift): CoverageMask {
  const today = new Array<boolean>(SLOTS_PER_DAY).fill(false);
  const tomorrow = new Array<boolean>(SLOTS_PER_DAY).fill(false);
  for (let t = shift.startSlot; t < shift.endSlot; t++) {
    if (t < SLOTS_PER_DAY) today[t] = true;
    else tomorrow[t - SLOTS_PER_DAY] = true;
  }
  return { today, tomorrow };
}

export interface CatalogOptions {
  /**
   * Explicit list of allowed start slots. If supplied, takes precedence over
   * `earliestStartSlot` / `latestStartSlot` / `startStepSlots` and constrains
   * the catalog to exactly these starts (typical for ops with a fixed shift
   * board).
   */
  startSlots?: number[];
  /** Earliest slot index a shift may start (inclusive). */
  earliestStartSlot?: number;
  /** Latest slot index a shift may start (inclusive). */
  latestStartSlot?: number;
  /** Step between candidate starts in slots. 2 = every 30 min. */
  startStepSlots?: number;
  /**
   * Lunch offset variants in slots from start. Three positions ≈ 4h / 4.5h /
   * 5h after start let the greedy solver pick lunches that land on slots with
   * lower demand.
   */
  lunchOffsetsSlots?: number[];
  /** Break 1 offset from start in slots (default 8 = 2h after start). */
  break1OffsetSlots?: number;
  /** Break 2 offset from start in slots (default 26 = 6.5h after start). */
  break2OffsetSlots?: number;
  /**
   * If true, allow shifts whose span exceeds 24h (i.e., cross midnight).
   * Required for late starts like 16:30 / 17:30 whose 8.5h span ends at
   * 01:00 / 02:00 the following day.
   */
  allowMidnightWrap?: boolean;
}

/**
 * Generate every candidate shift in the catalog.
 *
 *  - If `startSlots` is supplied, only those starts are considered.
 *  - Otherwise candidates are enumerated from `earliestStartSlot` to
 *    `latestStartSlot` in steps of `startStepSlots`.
 *  - For each start, multiple lunch placement variants are produced; the
 *    greedy solver picks variants whose lunch lands on lower-demand slots.
 *  - Late shifts that cross midnight are included only if
 *    `allowMidnightWrap` is true.
 */
export function generateShiftCatalog(opts: CatalogOptions): Shift[] {
  const lunchOffsetsSlots = opts.lunchOffsetsSlots ?? [16, 18, 20]; // 4h / 4.5h / 5h
  const break1OffsetSlots = opts.break1OffsetSlots ?? 8;             // 2h
  const break2OffsetSlots = opts.break2OffsetSlots ?? 26;            // 6.5h
  const allowWrap = opts.allowMidnightWrap ?? false;

  let starts: number[];
  if (opts.startSlots && opts.startSlots.length > 0) {
    starts = [...opts.startSlots].sort((a, b) => a - b);
  } else {
    const earliest = opts.earliestStartSlot ?? 0;
    const latest = opts.latestStartSlot ?? SLOTS_PER_DAY - SHIFT_TOTAL_SLOTS;
    const step = opts.startStepSlots ?? 2;
    starts = [];
    for (let s = earliest; s <= latest; s += step) starts.push(s);
  }

  const shifts: Shift[] = [];
  for (const start of starts) {
    if (start < 0 || start >= SLOTS_PER_DAY) continue;
    const end = start + SHIFT_TOTAL_SLOTS;
    const spansMidnight = end > SLOTS_PER_DAY;
    if (!allowWrap && spansMidnight) continue;

    for (const lunchOff of lunchOffsetsSlots) {
      const lunchStart = start + lunchOff;
      if (lunchStart + 1 >= end) continue;

      const break1 = start + break1OffsetSlots;
      const break2 = start + break2OffsetSlots;
      if (break1 >= end || break2 >= end) continue;

      const collidesLunch = (s: number) => s >= lunchStart && s <= lunchStart + 1;
      if (collidesLunch(break1) || collidesLunch(break2)) continue;
      if (break1 === break2) continue;

      shifts.push({
        id: `s${start}_l${lunchOff}`,
        startSlot: start,
        endSlot: end,
        lunchStart,
        break1,
        break2,
        spansMidnight,
      });
    }
  }
  return shifts;
}

/**
 * Auto-detect the operating window from a 96×7 staffing requirement matrix.
 * Returns the first / last slot index where any day has > 0 demand.
 */
export function detectOperatingWindow(requirement: number[][]): { firstSlot: number; lastSlot: number } {
  let firstSlot = SLOTS_PER_DAY;
  let lastSlot = -1;
  for (let t = 0; t < SLOTS_PER_DAY; t++) {
    let total = 0;
    for (let d = 0; d < 7; d++) total += requirement[t]?.[d] ?? 0;
    if (total > 0) {
      if (t < firstSlot) firstSlot = t;
      if (t > lastSlot) lastSlot = t;
    }
  }
  if (lastSlot < 0) {
    // Fallback: 6 AM – 5 PM
    return { firstSlot: 24, lastSlot: 68 };
  }
  return { firstSlot, lastSlot };
}
