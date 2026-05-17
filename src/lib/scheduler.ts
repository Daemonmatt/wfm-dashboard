// Greedy set-cover shift scheduler with rostering + midnight-wrap support.
//
// Roster constraint (default):
//   For a real roster the same agent is on the same shift every working day.
//   So the count assigned to each shift must be CONSTANT across the working
//   days (e.g., 6 agents on the 06:00 AM shift Mon–Fri, not "8 Mon, 4 Wed").
//   We model this by running greedy against the per-slot PEAK demand across
//   working days and then applying that single count vector to every working
//   day. Lighter days end up over-covered, which is the right WFM tradeoff.
//
// Late shifts (e.g., 16:30, 17:30) span past midnight: their post-midnight
// productive slots fall on the next calendar day. With same-count rostering
// the wrap-in to tomorrow's morning is automatically symmetric Tue–Fri (every
// previous working day contributed the same number of late shifts). The
// Monday morning post-midnight slots have NO wrap-in (Sunday is off), so the
// roster sizes early-morning shifts off Monday's demand (the conservative
// peak), which means Tue–Fri get a small wrap-in bonus on top of the same
// morning shift count.
//
// Algorithm (same-count path, default):
//   1. peakReq[t] = max(target[t][d]) over scheduled days.
//   2. Greedy on peakReq: pick shift maximizing # slots in its `today` mask
//      with peakReq > 0; add 1 to its count; subtract its `today` mask from
//      gap. Repeat until gap empty.
//   3. Apply the single count vector to every scheduled day.
//   4. Materialize the 96×7 scheduled matrix using each shift's `today` and
//      `tomorrow` masks (so wrap-into-next-day is recorded for visualization
//      and stats).
//   5. Polish: try removing one of each shift across the whole roster; drop
//      it only if every scheduled day's coverage (including wrap-ins) still
//      meets or exceeds the target on every slot.

import { ArrivalMatrix } from "./arrival";
import { Shift, getCoverageMask, CoverageMask, SLOTS_PER_DAY } from "./shifts";

export interface DayShiftCounts {
  [shiftId: string]: number;
}

export interface ShiftSchedule {
  /** Unique shifts that ended up with ≥ 1 agent on any day. */
  shifts: Shift[];
  /** perDay[d][shiftId] = agent count on day d (0 = Sun ... 6 = Sat). */
  perDay: DayShiftCounts[];
  /** 96 × 7 actual agents-on-floor matrix (sum of masks × counts). */
  scheduledMatrix: number[][];
  /** Carbon-copy of the input requirement (after buffer is applied) for charts. */
  targetMatrix: number[][];
  /** Working days included in the schedule (e.g., [1,2,3,4,5]). */
  daysScheduled: number[];
  /** Max agents working on any single scheduled day (= total HC needed under M-F roster). */
  totalAgents: number;
  /** Sum of (count × 8.5h) across the week. */
  totalPaidHours: number;
  /** Sum of productive hours scheduled (count × 7.5h). */
  totalProductiveHours: number;
  /** Slots × Days where scheduled ≥ requirement (counts only days scheduled). */
  coveragePct: number;
  /** Total surplus agent-slots (over-coverage). Each slot = 15 min. */
  surplusAgentSlots: number;
  /** Total deficit agent-slots (under-coverage). */
  deficitAgentSlots: number;
}

export interface SolveOptions {
  shifts: Shift[];
  /** Days to actually schedule (0..6, 0=Sun, 6=Sat). Default Mon–Fri = [1..5]. */
  daysScheduled?: number[];
  /** Over-coverage buffer (e.g., 0.05 = +5% on each slot). */
  bufferPct?: number;
  /** If true, run the polish pass to remove redundant agents. */
  polish?: boolean;
  /**
   * Manual HC pins per shift start. Map of `startSlot → fixed agent count`.
   * When set, that start uses exactly that many agents (placed on its
   * canonical mid-lunch variant) and the greedy fills the rest of the demand
   * with the remaining starts. Overridden starts are skipped by the polish
   * pass so the user-specified value is preserved.
   */
  startSlotOverrides?: Record<number, number>;
  /**
   * Target total roster size. After greedy fills demand, if the current
   * total is below this value, more agents are added to non-pinned shifts
   * (round-robin, weighted by demand coverage) until the total reaches the
   * target. Lets the dashboard preserve the unconstrained-baseline roster
   * size while the user redistributes individual shifts via pins.
   */
  targetTotalAgents?: number;
}

/** Pick the canonical variant for a given start slot (middle by lunch position). */
function canonicalVariant(shifts: Shift[], startSlot: number): Shift | undefined {
  const variants = shifts
    .filter((s) => s.startSlot === startSlot)
    .sort((a, b) => a.lunchStart - b.lunchStart);
  if (variants.length === 0) return undefined;
  return variants[Math.floor(variants.length / 2)];
}

export function solveShiftCoverage(
  requirement: ArrivalMatrix,
  options: SolveOptions,
): ShiftSchedule {
  const daysScheduled = (options.daysScheduled ?? [1, 2, 3, 4, 5])
    .slice()
    .sort((a, b) => a - b);
  const scheduledDaysSet = new Set(daysScheduled);
  const buffer = options.bufferPct ?? 0;
  const polish = options.polish ?? true;
  const shifts = options.shifts;
  const masks: CoverageMask[] = shifts.map((s) => getCoverageMask(s));
  const overrides = options.startSlotOverrides ?? {};
  const overriddenStarts = new Set<number>(
    Object.keys(overrides)
      .map(Number)
      .filter((n) => Number.isFinite(n)),
  );
  // Identifiers of shift variants pinned by an override (so polish skips them).
  const pinnedShiftIds = new Set<string>();

  const perDay: DayShiftCounts[] = Array.from({ length: 7 }, () => ({}));
  const scheduledMatrix: number[][] = Array.from({ length: SLOTS_PER_DAY }, () => Array(7).fill(0));
  const targetMatrix: number[][] = Array.from({ length: SLOTS_PER_DAY }, () => Array(7).fill(0));

  // Pre-compute target (with buffer) for every cell so charts can use it.
  for (let t = 0; t < SLOTS_PER_DAY; t++) {
    for (let d = 0; d < 7; d++) {
      const r = requirement[t]?.[d] ?? 0;
      targetMatrix[t][d] = Math.ceil(r * (1 + buffer));
    }
  }

  // Step 1: per-slot peak demand across scheduled days. The roster has to
  // cover the busiest day, so we size against that.
  const peakReq: number[] = new Array(SLOTS_PER_DAY).fill(0);
  for (let t = 0; t < SLOTS_PER_DAY; t++) {
    let m = 0;
    for (const d of daysScheduled) {
      if (targetMatrix[t][d] > m) m = targetMatrix[t][d];
    }
    peakReq[t] = m;
  }

  // Step 2a: pre-place pinned shifts (manual overrides). For each overridden
  // start, take the canonical mid-lunch variant and lock its count to the
  // user-specified value. Subtract their productive coverage from peak gap.
  const gap = peakReq.slice();
  const counts: DayShiftCounts = {};
  for (const [startStr, rawCount] of Object.entries(overrides)) {
    const startSlot = Number(startStr);
    if (!Number.isFinite(startSlot)) continue;
    const count = Math.max(0, Math.floor(rawCount));
    const canonical = canonicalVariant(shifts, startSlot);
    if (!canonical) continue;
    pinnedShiftIds.add(canonical.id);
    if (count <= 0) continue; // pin = 0 means "this start is excluded"
    counts[canonical.id] = count;
    const idx = shifts.findIndex((s) => s.id === canonical.id);
    if (idx >= 0) {
      const { today } = masks[idx];
      for (let t = 0; t < SLOTS_PER_DAY; t++) {
        if (today[t]) gap[t] -= count;
      }
    }
  }

  // Step 2b: greedy on the remaining gap, considering only NON-overridden
  // shift starts. Pinned starts (including pin=0 to fully exclude) are out
  // of the candidate pool so the algorithm doesn't keep adding them.
  const candidateIdx: number[] = [];
  for (let i = 0; i < shifts.length; i++) {
    if (!overriddenStarts.has(shifts[i].startSlot)) candidateIdx.push(i);
  }
  while (true) {
    let bestIdx = -1;
    let bestScore = 0;
    for (const i of candidateIdx) {
      const { today } = masks[i];
      let score = 0;
      for (let t = 0; t < SLOTS_PER_DAY; t++) {
        if (today[t] && gap[t] > 0) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestScore === 0) break;
    const shift = shifts[bestIdx];
    const { today } = masks[bestIdx];
    counts[shift.id] = (counts[shift.id] || 0) + 1;
    for (let t = 0; t < SLOTS_PER_DAY; t++) if (today[t]) gap[t] -= 1;
  }

  // Step 2c: roster-size lock. If the caller provided a target total roster
  // size (e.g. the unconstrained baseline), top up non-pinned shifts so the
  // overall count is preserved. This is what makes pin reductions get
  // redistributed across other shifts instead of shrinking the total.
  const target = options.targetTotalAgents;
  if (typeof target === "number" && target > 0) {
    const currentTotal = () => Object.values(counts).reduce((a, b) => a + b, 0);

    // Pool: prefer shifts the greedy already chose (so we don't introduce new
    // variants out of nowhere). Fall back to all candidate shifts if there
    // aren't any non-pinned shifts in the schedule yet (e.g., when pins are
    // very heavy).
    const weightOf = (idx: number) => {
      const { today } = masks[idx];
      let w = 0;
      for (let t = 0; t < SLOTS_PER_DAY; t++) if (today[t]) w += peakReq[t];
      // Keep a small base weight so even shifts whose slots are all "quiet"
      // still get topped up rather than being skipped entirely.
      return w + 1;
    };

    type Bucket = { shiftId: string; weight: number };
    let pool: Bucket[] = Object.keys(counts)
      .filter((sid) => !pinnedShiftIds.has(sid))
      .map((sid) => {
        const idx = shifts.findIndex((s) => s.id === sid);
        return { shiftId: sid, weight: idx >= 0 ? weightOf(idx) : 1 };
      });

    if (pool.length === 0) {
      pool = candidateIdx.map((i) => ({ shiftId: shifts[i].id, weight: weightOf(i) }));
    }
    pool.sort((a, b) => b.weight - a.weight);

    if (pool.length > 0) {
      let cursor = 0;
      let guard = 0;
      while (currentTotal() < target && guard < 10_000) {
        const { shiftId } = pool[cursor % pool.length];
        counts[shiftId] = (counts[shiftId] || 0) + 1;
        cursor += 1;
        guard += 1;
      }
    }
  }

  // Step 3 + 4: apply the single count vector to every scheduled day, and
  // materialize the 96 × 7 scheduled matrix (including wrap into tomorrow).
  const applyMatrix = () => {
    for (let t = 0; t < SLOTS_PER_DAY; t++) {
      for (let d = 0; d < 7; d++) scheduledMatrix[t][d] = 0;
    }
    for (const day of daysScheduled) {
      perDay[day] = {};
      const nextDay = (day + 1) % 7;
      for (const [sid, count] of Object.entries(counts)) {
        if (count <= 0) continue;
        perDay[day][sid] = count;
        const idx = shifts.findIndex((s) => s.id === sid);
        if (idx < 0) continue;
        const { today, tomorrow } = masks[idx];
        for (let t = 0; t < SLOTS_PER_DAY; t++) {
          if (today[t]) scheduledMatrix[t][day] += count;
        }
        if (shifts[idx].spansMidnight) {
          for (let t = 0; t < SLOTS_PER_DAY; t++) {
            if (tomorrow[t]) scheduledMatrix[t][nextDay] += count;
          }
        }
      }
    }
  };
  applyMatrix();

  if (polish) {
    // Step 5: roster-wide trim. Try removing one agent from each shift
    // across the whole week; keep the drop only if every scheduled day's
    // coverage (today + wrap-in from prior working day) still meets target.
    //
    // When the caller locks the total roster size, polish must never push the
    // total below that target (otherwise the lock from step 2c would be
    // undone). We honor that here by short-circuiting trims once the current
    // total reaches the lock.
    const targetLock = typeof target === "number" && target > 0 ? target : null;
    let changed = true;
    while (changed) {
      changed = false;
      for (const sid of Object.keys(counts)) {
        if (counts[sid] <= 0) continue;
        if (pinnedShiftIds.has(sid)) continue; // never trim user-pinned shifts
        if (targetLock !== null) {
          const sum = Object.values(counts).reduce((a, b) => a + b, 0);
          if (sum <= targetLock) break;
        }
        const idx = shifts.findIndex((s) => s.id === sid);
        if (idx < 0) continue;
        const shift = shifts[idx];
        const { today, tomorrow } = masks[idx];

        let canDrop = true;
        for (const day of daysScheduled) {
          for (let t = 0; t < SLOTS_PER_DAY; t++) {
            if (today[t] && scheduledMatrix[t][day] - 1 < targetMatrix[t][day]) {
              canDrop = false;
              break;
            }
          }
          if (!canDrop) break;
          if (shift.spansMidnight) {
            const nextDay = (day + 1) % 7;
            if (scheduledDaysSet.has(nextDay)) {
              for (let t = 0; t < SLOTS_PER_DAY; t++) {
                if (tomorrow[t] && scheduledMatrix[t][nextDay] - 1 < targetMatrix[t][nextDay]) {
                  canDrop = false;
                  break;
                }
              }
              if (!canDrop) break;
            }
          }
        }

        if (canDrop) {
          counts[sid] -= 1;
          if (counts[sid] === 0) delete counts[sid];
          applyMatrix();
          changed = true;
        }
      }
    }
  }

  // Stats
  const usedShiftIds = new Set<string>();
  for (const d of perDay) for (const id of Object.keys(d)) usedShiftIds.add(id);
  const usedShifts = shifts.filter((s) => usedShiftIds.has(s.id));

  let totalAgents = 0;
  let totalPaidHours = 0;
  let totalProductiveHours = 0;
  let coveredSlotXdays = 0;
  let totalRequiredSlotXdays = 0;
  let surplusAgentSlots = 0;
  let deficitAgentSlots = 0;

  for (const day of daysScheduled) {
    const dayTotal = Object.values(perDay[day]).reduce((a, b) => a + b, 0);
    if (dayTotal > totalAgents) totalAgents = dayTotal;
    totalPaidHours += dayTotal * 8.5;
    totalProductiveHours += dayTotal * 7.5;
    for (let t = 0; t < SLOTS_PER_DAY; t++) {
      const req = targetMatrix[t][day];
      const sched = scheduledMatrix[t][day];
      if (req > 0) {
        totalRequiredSlotXdays += 1;
        if (sched >= req) coveredSlotXdays += 1;
        else deficitAgentSlots += req - sched;
      }
      if (sched > req) surplusAgentSlots += sched - req;
    }
  }
  const coveragePct = totalRequiredSlotXdays > 0 ? coveredSlotXdays / totalRequiredSlotXdays : 1;

  return {
    shifts: usedShifts,
    perDay,
    scheduledMatrix,
    targetMatrix,
    daysScheduled,
    totalAgents,
    totalPaidHours,
    totalProductiveHours,
    coveragePct,
    surplusAgentSlots,
    deficitAgentSlots,
  };
}
