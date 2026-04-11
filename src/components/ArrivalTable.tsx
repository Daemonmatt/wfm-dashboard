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
  colorScheme: "blue" | "teal" | "rust";
  valueFormatter?: (v: number) => string;
  usePeakTotals?: boolean;
  formatRowLabel?: (index: number) => string;
  forecastDates?: string[];
}

const SCHEMES = {
  blue: {
    dot: "bg-[#2563eb]",
    badge: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
    head: "bg-slate-50 dark:bg-slate-800/50",
    cell: (i: number) => {
      if (i === 0) return "";
      if (i < 0.2) return "bg-blue-50 dark:bg-blue-950/15";
      if (i < 0.4) return "bg-blue-100 dark:bg-blue-900/25";
      if (i < 0.6) return "bg-blue-200/70 dark:bg-blue-800/30";
      if (i < 0.8) return "bg-blue-300/60 dark:bg-blue-700/35";
      return "bg-blue-400/50 dark:bg-blue-600/40";
    },
  },
  teal: {
    dot: "bg-[#0d9488]",
    badge: "bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300",
    head: "bg-slate-50 dark:bg-slate-800/50",
    cell: (i: number) => {
      if (i === 0) return "";
      if (i < 0.2) return "bg-teal-50 dark:bg-teal-950/15";
      if (i < 0.4) return "bg-teal-100 dark:bg-teal-900/25";
      if (i < 0.6) return "bg-teal-200/70 dark:bg-teal-800/30";
      if (i < 0.8) return "bg-teal-300/60 dark:bg-teal-700/35";
      return "bg-teal-400/50 dark:bg-teal-600/40";
    },
  },
  rust: {
    dot: "bg-[#c2410c]",
    badge: "bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300",
    head: "bg-slate-50 dark:bg-slate-800/50",
    cell: (i: number) => {
      if (i === 0) return "";
      if (i < 0.2) return "bg-orange-50 dark:bg-orange-950/15";
      if (i < 0.4) return "bg-orange-100 dark:bg-orange-900/25";
      if (i < 0.6) return "bg-orange-200/70 dark:bg-orange-800/30";
      if (i < 0.8) return "bg-orange-300/60 dark:bg-orange-700/35";
      return "bg-orange-400/50 dark:bg-orange-600/40";
    },
  },
};

export default function ArrivalTable({
  title,
  subtitle,
  matrix,
  colorScheme,
  valueFormatter = (v) => v.toLocaleString(),
  usePeakTotals = false,
  formatRowLabel = formatHour,
  forecastDates,
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

  const peakHour = rowSums.indexOf(Math.max(...rowSums));
  const peakDay = colSums.indexOf(Math.max(...colSums));

  const totalsLabel = usePeakTotals ? "Peak" : "Total";
  const showDates = forecastDates && forecastDates.length === 7 && forecastDates.some((d) => d);

  const handleExportCSV = useCallback(() => {
    const lines: string[] = [];
    if (showDates) {
      lines.push(["Date", ...DAY_NAMES.map((_, di) => forecastDates![di]), ""].join(","));
    }
    lines.push(["Interval", ...DAY_NAMES, totalsLabel].join(","));
    for (let hi = 0; hi < matrix.length; hi++) {
      lines.push([formatRowLabel(hi), ...matrix[hi], rowTotals[hi]].join(","));
    }
    lines.push([totalsLabel, ...colTotals, grandTotal].join(","));
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matrix, title, rowTotals, colTotals, grandTotal, totalsLabel, formatRowLabel, showDates, forecastDates]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`h-2 w-2 rounded-full ${s.dot} shrink-0`} />
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={`hidden sm:inline-flex rounded px-2 py-0.5 text-[10px] font-medium ${s.badge}`}>
            Peak {formatRowLabel(peakHour)} {DAY_NAMES[peakDay]?.slice(0, 3)}
          </span>
          <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${s.badge}`}>
            {usePeakTotals ? "Peak" : "Total"}: {grandTotal.toLocaleString()}
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
                {DAY_NAMES.map((_, di) => (
                  <th key={di} className="px-2.5 py-1.5 text-center text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {forecastDates![di]}
                  </th>
                ))}
                <th className="px-2.5 py-1.5 text-center text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap border-l border-slate-100 dark:border-slate-800" />
              </tr>
            )}
            <tr className={s.head}>
              <th className="sticky left-0 z-10 px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap bg-inherit border-r border-slate-100 dark:border-slate-800">
                Interval
              </th>
              {DAY_NAMES.map((day) => (
                <th key={day} className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                {totalsLabel}
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
                  const intensity = maxVal > 0 ? val / maxVal : 0;
                  return (
                    <td key={di} className={`px-2.5 py-1 text-center text-[11px] tabular-nums text-slate-700 dark:text-slate-300 ${s.cell(intensity)}`}>
                      {val > 0 ? valueFormatter(val) : <span className="text-slate-200 dark:text-slate-700">-</span>}
                    </td>
                  );
                })}
                <td className="px-2.5 py-1 text-center text-[11px] font-semibold text-slate-600 dark:text-slate-400 tabular-nums bg-slate-50/50 dark:bg-slate-800/30 border-l border-slate-50 dark:border-slate-800/50">
                  {valueFormatter(rowTotals[hi])}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-2 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">
                {totalsLabel}
              </td>
              {colTotals.map((total, di) => (
                <td key={di} className="px-2.5 py-2 text-center text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                  {valueFormatter(total)}
                </td>
              ))}
              <td className="px-2.5 py-2 text-center text-[11px] font-bold text-slate-800 dark:text-slate-100 tabular-nums border-l border-slate-100 dark:border-slate-800">
                {valueFormatter(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
