"use client";

import { useCallback } from "react";
import { ArrivalMatrix, DAY_NAMES, formatHour } from "@/lib/arrival";

interface DistributionTableProps {
  title: string;
  subtitle?: string;
  matrix: ArrivalMatrix;
  formatRowLabel?: (index: number) => string;
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "0.0%";
  return ((num / denom) * 100).toFixed(1) + "%";
}

function pctVal(num: number, denom: number): number {
  if (denom === 0) return 0;
  return num / denom;
}

export default function DistributionTable({
  title,
  subtitle,
  matrix,
  formatRowLabel = formatHour,
}: DistributionTableProps) {
  const totalWeekly = matrix.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0);
  const colTotals = DAY_NAMES.map((_, di) => matrix.reduce((sum, row) => sum + row[di], 0));
  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));

  const handleExportCSV = useCallback(() => {
    const lines: string[] = [];
    lines.push("Daily Distribution (% of Weekly Volume)");
    lines.push(["Day", ...DAY_NAMES, "Total"].join(","));
    lines.push(["% of Week", ...colTotals.map((c) => pct(c, totalWeekly)), "100.0%"].join(","));
    lines.push("");
    lines.push("Interval Distribution (% of Daily Volume)");
    lines.push(["Interval", ...DAY_NAMES, "Total"].join(","));
    matrix.forEach((row, hi) => {
      const cells = row.map((val, di) => pct(val, colTotals[di]));
      lines.push([formatRowLabel(hi), ...cells, pct(rowTotals[hi], totalWeekly)].join(","));
    });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "percentage_distribution.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [matrix, colTotals, rowTotals, totalWeekly, formatRowLabel]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-2 w-2 rounded-full bg-[#6d28d9] shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 shrink-0"
          title="Export CSV"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </div>

      <div className="overflow-x-auto">
        {/* Daily Distribution */}
        <table className="w-full text-xs border-b border-slate-100 dark:border-slate-800">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                Day
              </th>
              {DAY_NAMES.map((day) => (
                <th key={day} className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-purple-50/40 dark:bg-purple-950/10">
              <td className="sticky left-0 z-10 bg-purple-50/40 dark:bg-purple-950/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-r border-slate-100 dark:border-slate-800">
                % of Week
              </td>
              {colTotals.map((total, di) => {
                const v = pctVal(total, totalWeekly);
                return (
                  <td key={di} className={`px-2.5 py-1.5 text-center text-[11px] font-semibold tabular-nums ${v > 0.15 ? "text-purple-700 dark:text-purple-300" : "text-slate-500 dark:text-slate-400"}`}>
                    {pct(total, totalWeekly)}
                  </td>
                );
              })}
              <td className="px-2.5 py-1.5 text-center text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums border-l border-slate-100 dark:border-slate-800">
                100.0%
              </td>
            </tr>
          </tbody>
        </table>

        {/* Interval Distribution */}
        <div className="px-4 pt-2.5 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Interval % of Daily Volume
          </p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                Interval
              </th>
              {DAY_NAMES.map((day) => (
                <th key={day} className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, hi) => (
              <tr key={hi} className="border-b border-slate-50 dark:border-slate-800/50">
                <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap border-r border-slate-50 dark:border-slate-800/50">
                  {formatRowLabel(hi)}
                </td>
                {row.map((val, di) => {
                  const dayTotal = colTotals[di];
                  const v = pctVal(val, dayTotal);
                  const bg =
                    v === 0 ? "" :
                    v < 0.03 ? "bg-purple-50/40 dark:bg-purple-950/10" :
                    v < 0.06 ? "bg-purple-100/50 dark:bg-purple-900/15" :
                    v < 0.09 ? "bg-purple-200/40 dark:bg-purple-800/25" :
                    v < 0.12 ? "bg-purple-300/40 dark:bg-purple-700/30" :
                    v < 0.15 ? "bg-purple-400/35 dark:bg-purple-600/35" :
                    "bg-purple-500/35 dark:bg-purple-500/40";
                  const txt = v >= 0.12 ? "text-purple-900 dark:text-purple-100 font-semibold" : "text-slate-600 dark:text-slate-400";

                  return (
                    <td key={di} className={`px-2.5 py-1 text-center text-[11px] tabular-nums ${bg} ${txt}`}>
                      {val > 0 ? pct(val, dayTotal) : <span className="text-slate-200 dark:text-slate-700">0.0%</span>}
                    </td>
                  );
                })}
                <td className="px-2.5 py-1 text-center text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 tabular-nums border-l border-slate-50 dark:border-slate-800/50">
                  {pct(rowTotals[hi], totalWeekly)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
