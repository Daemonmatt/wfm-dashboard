"use client";

import { useCallback, useMemo } from "react";
import { DAY_NAMES } from "@/lib/arrival";
import { ShiftSchedule } from "@/lib/scheduler";
import { Shift, slotToAmPm } from "@/lib/shifts";

interface ShiftStartSummaryProps {
  title: string;
  subtitle?: string;
  schedule: ShiftSchedule;
  /**
   * The full ordered list of allowed start slots. Even starts that ended up
   * with zero scheduled agents are shown so the table is a stable reference
   * of the operations roster.
   */
  startSlots: number[];
  forecastDates?: string[];
  /**
   * Manual HC pins per start slot. Key = start slot index. When set, the
   * scheduler treats that count as a fixed constraint. When undefined or
   * the input is cleared, the value is "Auto" (algorithm-decided).
   */
  overrides?: Record<number, number>;
  onOverridesChange?: (next: Record<number, number>) => void;
}

interface StartRow {
  startSlot: number;
  perDay: number[]; // length 7
  peak: number;
  /** Lunch / break variant breakdown for footnote display. */
  variants: { shift: Shift; perDay: number[] }[];
}

/**
 * Aggregate `schedule.perDay` by shift start slot, summing across lunch
 * variants so each row reflects the total HC needed for that shift start.
 */
function buildRows(schedule: ShiftSchedule, startSlots: number[]): StartRow[] {
  const byStart = new Map<number, StartRow>();
  for (const s of startSlots) {
    byStart.set(s, {
      startSlot: s,
      perDay: Array(7).fill(0),
      peak: 0,
      variants: [],
    });
  }

  for (const shift of schedule.shifts) {
    const row = byStart.get(shift.startSlot);
    if (!row) continue;
    const variantPerDay = DAY_NAMES.map((_, di) => schedule.perDay[di]?.[shift.id] ?? 0);
    for (let di = 0; di < 7; di++) row.perDay[di] += variantPerDay[di];
    row.variants.push({ shift, perDay: variantPerDay });
  }

  for (const row of byStart.values()) {
    row.peak = Math.max(0, ...row.perDay);
  }

  return startSlots.map((s) => byStart.get(s)!);
}

export default function ShiftStartSummary({
  title,
  subtitle,
  schedule,
  startSlots,
  forecastDates,
  overrides,
  onOverridesChange,
}: ShiftStartSummaryProps) {
  const rows = useMemo(() => buildRows(schedule, startSlots), [schedule, startSlots]);
  const showDates = forecastDates && forecastDates.length === 7 && forecastDates.some((d) => d);
  const editable = !!onOverridesChange;

  const handleOverrideChange = (startSlot: number, raw: string) => {
    if (!onOverridesChange) return;
    const next = { ...(overrides ?? {}) };
    if (raw === "" || raw === undefined) {
      delete next[startSlot];
    } else {
      const n = Math.max(0, Math.floor(Number(raw)));
      if (Number.isFinite(n)) next[startSlot] = n;
    }
    onOverridesChange(next);
  };

  const clearAllOverrides = () => onOverridesChange?.({});
  const hasAnyOverride = !!overrides && Object.keys(overrides).length > 0;

  const dayTotals = DAY_NAMES.map((_, di) =>
    rows.reduce((sum, r) => sum + r.perDay[di], 0),
  );
  const peakTotal = schedule.totalAgents;

  const maxCount = Math.max(1, ...rows.map((r) => r.peak));
  const cellShade = (count: number): string => {
    if (count === 0) return "";
    const i = count / maxCount;
    if (i < 0.2) return "bg-indigo-50 dark:bg-indigo-950/15";
    if (i < 0.4) return "bg-indigo-100 dark:bg-indigo-900/25";
    if (i < 0.6) return "bg-indigo-200/70 dark:bg-indigo-800/30";
    if (i < 0.8) return "bg-indigo-300/60 dark:bg-indigo-700/35";
    return "bg-indigo-400/50 dark:bg-indigo-600/40";
  };

  const handleExportCSV = useCallback(() => {
    const lines: string[] = [];
    if (showDates) {
      lines.push(["Date", ...DAY_NAMES.map((_, di) => forecastDates![di]), ""].join(","));
    }
    lines.push(["Shift Start", ...DAY_NAMES, "Peak HC"].join(","));
    for (const r of rows) {
      lines.push([slotToAmPm(r.startSlot), ...r.perDay, r.peak].join(","));
    }
    lines.push(["Day Total", ...dayTotals, peakTotal].join(","));
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, dayTotals, peakTotal, title, showDates, forecastDates]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-2 w-2 rounded-full bg-[#0d9488] shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className="rounded px-2 py-0.5 text-[10px] font-medium bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300">
            Peak HC: {peakTotal.toLocaleString()}
          </span>
          {editable && hasAnyOverride && (
            <button
              onClick={clearAllOverrides}
              className="rounded px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
              title="Clear all manual pins"
            >
              Clear pins
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800"
            title="Export CSV"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {showDates && (
              <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                <th className="sticky left-0 z-10 px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                  Date
                </th>
                {DAY_NAMES.map((_, di) => (
                  <th
                    key={di}
                    className="px-2.5 py-1.5 text-center text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                  >
                    {forecastDates![di]}
                  </th>
                ))}
                <th className="px-2.5 py-1.5 bg-inherit" />
              </tr>
            )}
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                Shift Start
              </th>
              {DAY_NAMES.map((day) => (
                <th
                  key={day}
                  className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap"
                >
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                Peak HC
              </th>
              {editable && (
                <th className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Override
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pinned = overrides?.[r.startSlot];
              const isPinned = pinned !== undefined;
              return (
                <tr
                  key={r.startSlot}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                >
                  <td className="sticky left-0 z-10 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span>{slotToAmPm(r.startSlot)}</span>
                      {isPinned && (
                        <span
                          title="Pinned (manual override)"
                          className="rounded bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 px-1 text-[9px] font-medium uppercase tracking-wider"
                        >
                          Pin
                        </span>
                      )}
                    </div>
                  </td>
                  {r.perDay.map((c, di) => (
                    <td
                      key={di}
                      className={`px-2.5 py-1.5 text-center text-slate-700 dark:text-slate-200 ${cellShade(c)}`}
                    >
                      {c > 0 ? c : <span className="text-slate-300 dark:text-slate-600">·</span>}
                    </td>
                  ))}
                  <td className="px-2.5 py-1.5 text-center font-semibold text-slate-800 dark:text-slate-100 border-l border-slate-100 dark:border-slate-800">
                    {r.peak}
                  </td>
                  {editable && (
                    <td className="px-2.5 py-1.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        placeholder="auto"
                        value={isPinned ? String(pinned) : ""}
                        onChange={(e) => handleOverrideChange(r.startSlot, e.target.value)}
                        className={`w-16 rounded-md border bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-[#4f46e5] ${
                          isPinned
                            ? "border-amber-400 text-amber-700 dark:border-amber-500 dark:text-amber-300"
                            : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                Day Total
              </th>
              {dayTotals.map((dt, di) => (
                <th
                  key={di}
                  className="px-2.5 py-2 text-center font-semibold text-slate-700 dark:text-slate-200"
                >
                  {dt > 0 ? dt : <span className="text-slate-300 dark:text-slate-600">·</span>}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center font-semibold text-slate-800 dark:text-slate-100 border-l border-slate-100 dark:border-slate-800">
                {peakTotal}
              </th>
              {editable && <th className="px-2.5 py-2 bg-inherit" />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
