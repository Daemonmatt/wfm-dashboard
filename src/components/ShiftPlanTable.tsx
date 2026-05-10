"use client";

import { useCallback } from "react";
import { DAY_NAMES } from "@/lib/arrival";
import { ShiftSchedule } from "@/lib/scheduler";
import { Shift, shiftLabel, shiftDescription, slotToAmPm } from "@/lib/shifts";

interface ShiftPlanTableProps {
  title: string;
  subtitle?: string;
  schedule: ShiftSchedule;
  forecastDates?: string[];
}

/**
 * Sort shifts by start slot, then by lunch slot, so the table reads
 * top-to-bottom from earliest to latest start.
 */
function sortShifts(shifts: Shift[]): Shift[] {
  return [...shifts].sort((a, b) => {
    if (a.startSlot !== b.startSlot) return a.startSlot - b.startSlot;
    return a.lunchStart - b.lunchStart;
  });
}

export default function ShiftPlanTable({
  title,
  subtitle,
  schedule,
  forecastDates,
}: ShiftPlanTableProps) {
  const shifts = sortShifts(schedule.shifts);
  const showDates = forecastDates && forecastDates.length === 7 && forecastDates.some((d) => d);

  // Per-day totals (across all shifts on that day)
  const dayTotals: number[] = DAY_NAMES.map((_, di) =>
    Object.values(schedule.perDay[di] ?? {}).reduce((a, b) => a + b, 0),
  );
  const grandTotal = schedule.totalAgents;

  // Heatmap intensity baseline
  const maxCount = Math.max(
    1,
    ...shifts.map((s) =>
      Math.max(...DAY_NAMES.map((_, di) => schedule.perDay[di]?.[s.id] ?? 0)),
    ),
  );

  const handleExportCSV = useCallback(() => {
    const lines: string[] = [];
    if (showDates) {
      lines.push(["Date", ...DAY_NAMES.map((_, di) => forecastDates![di]), ""].join(","));
    }
    lines.push(["Shift", "Start", "End", "Lunch", "Break 1", "Break 2", ...DAY_NAMES, "Total"].join(","));
    for (const s of shifts) {
      const counts = DAY_NAMES.map((_, di) => schedule.perDay[di]?.[s.id] ?? 0);
      const total = counts.reduce((a, b) => a + b, 0);
      lines.push(
        [
          shiftLabel(s),
          slotToAmPm(s.startSlot),
          slotToAmPm(s.endSlot),
          slotToAmPm(s.lunchStart),
          slotToAmPm(s.break1),
          slotToAmPm(s.break2),
          ...counts,
          total,
        ].join(","),
      );
    }
    lines.push(["Total", "", "", "", "", "", ...dayTotals, grandTotal].join(","));
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [shifts, schedule, dayTotals, grandTotal, title, showDates, forecastDates]);

  const cellShade = (count: number): string => {
    if (count === 0) return "";
    const i = count / maxCount;
    if (i < 0.2) return "bg-indigo-50 dark:bg-indigo-950/15";
    if (i < 0.4) return "bg-indigo-100 dark:bg-indigo-900/25";
    if (i < 0.6) return "bg-indigo-200/70 dark:bg-indigo-800/30";
    if (i < 0.8) return "bg-indigo-300/60 dark:bg-indigo-700/35";
    return "bg-indigo-400/50 dark:bg-indigo-600/40";
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-2 w-2 rounded-full bg-[#4f46e5] shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className="rounded px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300">
            Total HC: {grandTotal.toLocaleString()}
          </span>
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
                <th className="px-2.5 py-1.5 bg-inherit" />
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
                Shift
              </th>
              <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Lunch / Breaks
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
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={DAY_NAMES.length + 3} className="px-3 py-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
                  No shifts scheduled — check that there is forecasted demand.
                </td>
              </tr>
            ) : (
              shifts.map((s) => {
                const counts = DAY_NAMES.map((_, di) => schedule.perDay[di]?.[s.id] ?? 0);
                const total = counts.reduce((a, b) => a + b, 0);
                return (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="sticky left-0 z-10 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                      {shiftLabel(s)}
                    </td>
                    <td className="px-2.5 py-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {shiftDescription(s)}
                    </td>
                    {counts.map((c, di) => (
                      <td
                        key={di}
                        className={`px-2.5 py-1.5 text-center text-slate-700 dark:text-slate-200 ${cellShade(c)}`}
                      >
                        {c > 0 ? c : <span className="text-slate-300 dark:text-slate-600">·</span>}
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 text-center font-semibold text-slate-700 dark:text-slate-200 border-l border-slate-100 dark:border-slate-800">
                      {total}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                Day Total
              </th>
              <th className="px-2.5 py-2 bg-inherit" />
              {dayTotals.map((dt, di) => (
                <th
                  key={di}
                  className="px-2.5 py-2 text-center font-semibold text-slate-700 dark:text-slate-200"
                >
                  {dt > 0 ? dt : <span className="text-slate-300 dark:text-slate-600">·</span>}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center font-semibold text-slate-700 dark:text-slate-200 border-l border-slate-100 dark:border-slate-800">
                {grandTotal}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
