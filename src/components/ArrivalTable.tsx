"use client";

import { useCallback } from "react";
import {
  ArrivalMatrix,
  DAY_NAMES,
  formatHour,
  getMatrixMax,
} from "@/lib/arrival";

interface ArrivalTableProps {
  title: string;
  subtitle?: string;
  matrix: ArrivalMatrix;
  colorScheme: "blue" | "emerald" | "amber";
  valueFormatter?: (v: number) => string;
  /** When true, show Peak (max) instead of Sum in totals row/column — used for HC table */
  usePeakTotals?: boolean;
}

const SCHEMES = {
  blue: {
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    head: "bg-zinc-50 dark:bg-zinc-800/60",
    cell: (i: number) => {
      if (i === 0) return "";
      if (i < 0.15) return "bg-blue-50 dark:bg-blue-950/15";
      if (i < 0.3) return "bg-blue-100 dark:bg-blue-900/25";
      if (i < 0.45) return "bg-blue-200/80 dark:bg-blue-800/35";
      if (i < 0.6) return "bg-blue-300/80 dark:bg-blue-700/45";
      if (i < 0.75) return "bg-blue-400/80 dark:bg-blue-600/55";
      if (i < 0.9) return "bg-blue-500/80 dark:bg-blue-500/65";
      return "bg-blue-600/90 dark:bg-blue-400/75";
    },
    text: (i: number) => i >= 0.6 ? "text-white font-semibold" : "text-zinc-700 dark:text-zinc-300",
  },
  emerald: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    head: "bg-zinc-50 dark:bg-zinc-800/60",
    cell: (i: number) => {
      if (i === 0) return "";
      if (i < 0.15) return "bg-emerald-50 dark:bg-emerald-950/15";
      if (i < 0.3) return "bg-emerald-100 dark:bg-emerald-900/25";
      if (i < 0.45) return "bg-emerald-200/80 dark:bg-emerald-800/35";
      if (i < 0.6) return "bg-emerald-300/80 dark:bg-emerald-700/45";
      if (i < 0.75) return "bg-emerald-400/80 dark:bg-emerald-600/55";
      if (i < 0.9) return "bg-emerald-500/80 dark:bg-emerald-500/65";
      return "bg-emerald-600/90 dark:bg-emerald-400/75";
    },
    text: (i: number) => i >= 0.6 ? "text-white font-semibold" : "text-zinc-700 dark:text-zinc-300",
  },
  amber: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    head: "bg-zinc-50 dark:bg-zinc-800/60",
    cell: (i: number) => {
      if (i === 0) return "";
      if (i < 0.15) return "bg-amber-50 dark:bg-amber-950/15";
      if (i < 0.3) return "bg-amber-100 dark:bg-amber-900/25";
      if (i < 0.45) return "bg-amber-200/80 dark:bg-amber-800/35";
      if (i < 0.6) return "bg-amber-300/80 dark:bg-amber-700/45";
      if (i < 0.75) return "bg-amber-400/80 dark:bg-amber-600/55";
      if (i < 0.9) return "bg-amber-500/80 dark:bg-amber-500/65";
      return "bg-amber-600/90 dark:bg-amber-400/75";
    },
    text: (i: number) => i >= 0.6 ? "text-white font-semibold" : "text-zinc-700 dark:text-zinc-300",
  },
};

export default function ArrivalTable({
  title,
  subtitle,
  matrix,
  colorScheme,
  valueFormatter = (v) => v.toLocaleString(),
  usePeakTotals = false,
}: ArrivalTableProps) {
  const maxVal = getMatrixMax(matrix);
  const s = SCHEMES[colorScheme];

  const rowSums = matrix.map((row) => row.reduce((a, v) => a + v, 0));
  const colSums = DAY_NAMES.map((_, di) => matrix.reduce((sum, row) => sum + row[di], 0));

  const rowPeaks = matrix.map((row) => Math.max(...row));
  const colPeaks = DAY_NAMES.map((_, di) => Math.max(...matrix.map((row) => row[di])));

  const rowTotals = usePeakTotals ? rowPeaks : rowSums;
  const colTotals = usePeakTotals ? colPeaks : colSums;
  const grandTotal = usePeakTotals
    ? Math.max(...colPeaks)
    : matrix.reduce((sum, row) => sum + row.reduce((a, v) => a + v, 0), 0);
  const totalWeekly = grandTotal;

  const peakHour = rowSums.indexOf(Math.max(...rowSums));
  const peakDay = colSums.indexOf(Math.max(...colSums));

  const totalsLabel = usePeakTotals ? "Peak" : "Total";

  const handleExportCSV = useCallback(() => {
    const header = ["Hour", ...DAY_NAMES, totalsLabel].join(",");
    const rows = matrix.map((row, hi) => [formatHour(hi), ...row, rowTotals[hi]].join(","));
    const totalsRow = [totalsLabel, ...colTotals, grandTotal].join(",");
    const csv = [header, ...rows, totalsRow].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matrix, title, rowTotals, colTotals, totalWeekly]);

  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`h-2 w-2 rounded-full ${s.dot} shrink-0`} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={`hidden sm:inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ${s.badge}`}>
            Peak {formatHour(peakHour)} {DAY_NAMES[peakDay]?.slice(0, 3)}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${s.badge}`}>
            {usePeakTotals ? "Peak" : "Total"}: {grandTotal.toLocaleString()}
          </span>
          <button
            onClick={handleExportCSV}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
            title="Export CSV"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className={s.head}>
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap bg-inherit border-r border-zinc-100 dark:border-zinc-800">
                Hour
              </th>
              {DAY_NAMES.map((day) => (
                <th key={day} className="px-2.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap border-l border-zinc-100 dark:border-zinc-800">
                {totalsLabel}
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
                  const intensity = maxVal > 0 ? val / maxVal : 0;
                  return (
                    <td key={di} className={`px-2.5 py-1 text-center text-[11px] tabular-nums ${s.cell(intensity)} ${s.text(intensity)}`}>
                      {val > 0 ? valueFormatter(val) : <span className="text-zinc-200 dark:text-zinc-700">-</span>}
                    </td>
                  );
                })}
                <td className="px-2.5 py-1 text-center text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 tabular-nums bg-zinc-50/50 dark:bg-zinc-800/30 border-l border-zinc-50 dark:border-zinc-800/50">
                  {valueFormatter(rowTotals[hi])}
                </td>
              </tr>
            ))}
            <tr className="bg-zinc-50 dark:bg-zinc-800/60">
              <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-2 text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400 border-r border-zinc-100 dark:border-zinc-800">
                {totalsLabel}
              </td>
              {colTotals.map((total, di) => (
                <td key={di} className="px-2.5 py-2 text-center text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 tabular-nums">
                  {valueFormatter(total)}
                </td>
              ))}
              <td className="px-2.5 py-2 text-center text-[11px] font-bold text-zinc-800 dark:text-zinc-100 tabular-nums border-l border-zinc-100 dark:border-zinc-800">
                {valueFormatter(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
