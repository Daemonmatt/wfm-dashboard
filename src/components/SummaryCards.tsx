"use client";

import { ArrivalMatrix, DAY_NAMES, formatHour } from "@/lib/arrival";

interface SummaryCardsProps {
  arrivalMatrix: ArrivalMatrix;
  forecastMatrix: ArrivalMatrix;
  staffingMatrix: ArrivalMatrix;
  weekCount: number;
  totalRecords: number;
}

function getMatrixTotal(m: ArrivalMatrix): number {
  return m.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0);
}

function getPeakCell(m: ArrivalMatrix): { hour: number; day: number; value: number } {
  let best = { hour: 0, day: 0, value: 0 };
  for (let h = 0; h < m.length; h++) {
    for (let d = 0; d < m[h].length; d++) {
      if (m[h][d] > best.value) best = { hour: h, day: d, value: m[h][d] };
    }
  }
  return best;
}

function getColPeaks(m: ArrivalMatrix): number[] {
  return DAY_NAMES.map((_, di) => Math.max(...m.map((row) => row[di])));
}

export default function SummaryCards({
  arrivalMatrix,
  forecastMatrix,
  staffingMatrix,
  weekCount,
  totalRecords,
}: SummaryCardsProps) {
  const arrivalTotal = getMatrixTotal(arrivalMatrix);
  const forecastTotal = getMatrixTotal(forecastMatrix);
  const peakArrival = getPeakCell(arrivalMatrix);
  const peakStaffingCell = getPeakCell(staffingMatrix);
  const delta = arrivalTotal > 0 ? ((forecastTotal - arrivalTotal) / arrivalTotal * 100).toFixed(1) : "0.0";

  const colPeaks = getColPeaks(staffingMatrix);
  const overallPeakHC = Math.max(...colPeaks);

  const cards: { label: string; value: string; sub: string; accent: string; border: string }[] = [
    {
      label: "Total Records",
      value: totalRecords.toLocaleString(),
      sub: `${weekCount} weeks of data`,
      accent: "text-slate-800 dark:text-slate-100",
      border: "border-l-slate-400 dark:border-l-slate-500",
    },
    {
      label: "Avg Weekly Volume",
      value: arrivalTotal.toLocaleString(),
      sub: `Peak ${formatHour(peakArrival.hour)} ${DAY_NAMES[peakArrival.day]?.slice(0, 3)}`,
      accent: "text-[#2563eb] dark:text-blue-400",
      border: "border-l-[#2563eb] dark:border-l-blue-400",
    },
    {
      label: "Forecasted Volume",
      value: forecastTotal.toLocaleString(),
      sub: `${Number(delta) >= 0 ? "+" : ""}${delta}% vs actual`,
      accent: "text-[#0d9488] dark:text-teal-400",
      border: "border-l-[#0d9488] dark:border-l-teal-400",
    },
    {
      label: "Peak HC Required",
      value: overallPeakHC.toLocaleString(),
      sub: `At ${formatHour(peakStaffingCell.hour)} ${DAY_NAMES[peakStaffingCell.day]?.slice(0, 3)}`,
      accent: "text-[#c2410c] dark:text-orange-400",
      border: "border-l-[#c2410c] dark:border-l-orange-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900 border-l-[3px] ${c.border}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
            {c.label}
          </p>
          <p className={`text-xl font-semibold tabular-nums ${c.accent}`}>{c.value}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
