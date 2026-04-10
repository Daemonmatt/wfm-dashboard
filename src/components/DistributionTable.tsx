"use client";

import { useCallback } from "react";
import { ArrivalMatrix, DAY_NAMES, formatHour } from "@/lib/arrival";

interface DistributionTableProps {
  title: string;
  subtitle?: string;
  matrix: ArrivalMatrix;
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "0.0%";
  return ((num / denom) * 100).toFixed(1) + "%";
}

function pctVal(num: number, denom: number): number {
  if (denom === 0) return 0;
  return num / denom;
}

export default function DistributionTable({ title, subtitle, matrix }: DistributionTableProps) {
  const totalWeekly = matrix.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0);
  const colTotals = DAY_NAMES.map((_, di) => matrix.reduce((sum, row) => sum + row[di], 0));
  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));

  const handleExportCSV = useCallback(() => {
    const lines: string[] = [];
    lines.push("Daily Distribution (% of Weekly Volume)");
    lines.push(["Day", ...DAY_NAMES, "Total"].join(","));
    lines.push(["% of Week", ...colTotals.map((c) => pct(c, totalWeekly)), "100.0%"].join(","));
    lines.push("");
    lines.push("Hourly Distribution (% of Daily Volume)");
    lines.push(["Hour", ...DAY_NAMES, "Total"].join(","));
    matrix.forEach((row, hi) => {
      const cells = row.map((val, di) => pct(val, colTotals[di]));
      lines.push([formatHour(hi), ...cells, pct(rowTotals[hi], totalWeekly)].join(","));
    });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "percentage_distribution.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [matrix, colTotals, rowTotals, totalWeekly]);

  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 shrink-0"
          title="Export CSV"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </div>

      <div className="overflow-x-auto">
        {/* Daily Distribution */}
        <table className="w-full text-xs border-b border-zinc-100 dark:border-zinc-800">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/60">
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap bg-inherit border-r border-zinc-100 dark:border-zinc-800">
                Day
              </th>
              {DAY_NAMES.map((day) => (
                <th key={day} className="px-2.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap border-l border-zinc-100 dark:border-zinc-800">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-violet-50/50 dark:bg-violet-950/10">
              <td className="sticky left-0 z-10 bg-violet-50/50 dark:bg-violet-950/10 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap border-r border-zinc-100 dark:border-zinc-800">
                % of Week
              </td>
              {colTotals.map((total, di) => {
                const v = pctVal(total, totalWeekly);
                return (
                  <td key={di} className={`px-2.5 py-1.5 text-center text-[11px] font-semibold tabular-nums ${v > 0.15 ? "text-violet-700 dark:text-violet-300" : "text-zinc-500 dark:text-zinc-400"}`}>
                    {pct(total, totalWeekly)}
                  </td>
                );
              })}
              <td className="px-2.5 py-1.5 text-center text-[11px] font-bold text-zinc-800 dark:text-zinc-100 tabular-nums border-l border-zinc-100 dark:border-zinc-800">
                100.0%
              </td>
            </tr>
          </tbody>
        </table>

        {/* Hourly Distribution */}
        <div className="px-4 pt-2.5 pb-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Hourly % of Daily Volume
          </p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/60">
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap bg-inherit border-r border-zinc-100 dark:border-zinc-800">
                Hour
              </th>
              {DAY_NAMES.map((day) => (
                <th key={day} className="px-2.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap border-l border-zinc-100 dark:border-zinc-800">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, hi) => (
              <tr key={hi} className="border-b border-zinc-50 dark:border-zinc-800/50">
                <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 whitespace-nowrap border-r border-zinc-50 dark:border-zinc-800/50">
                  {formatHour(hi)}
                </td>
                {row.map((val, di) => {
                  const dayTotal = colTotals[di];
                  const v = pctVal(val, dayTotal);
                  const bg =
                    v === 0 ? "" :
                    v < 0.03 ? "bg-violet-50/50 dark:bg-violet-950/10" :
                    v < 0.06 ? "bg-violet-100/60 dark:bg-violet-900/20" :
                    v < 0.09 ? "bg-violet-200/50 dark:bg-violet-800/30" :
                    v < 0.12 ? "bg-violet-300/50 dark:bg-violet-700/40" :
                    v < 0.15 ? "bg-violet-400/50 dark:bg-violet-600/50" :
                    "bg-violet-500/50 dark:bg-violet-500/60";
                  const txt = v >= 0.12 ? "text-violet-900 dark:text-violet-100 font-semibold" : "text-zinc-600 dark:text-zinc-400";

                  return (
                    <td key={di} className={`px-2.5 py-1 text-center text-[11px] tabular-nums ${bg} ${txt}`}>
                      {val > 0 ? pct(val, dayTotal) : <span className="text-zinc-200 dark:text-zinc-700">0.0%</span>}
                    </td>
                  );
                })}
                <td className="px-2.5 py-1 text-center text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30 tabular-nums border-l border-zinc-50 dark:border-zinc-800/50">
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
