"use client";

import { ArrivalMatrix, DAY_NAMES, formatHour, getMatrixMax } from "@/lib/arrival";

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

export default function SummaryCards({
  arrivalMatrix,
  forecastMatrix,
  staffingMatrix,
  weekCount,
  totalRecords,
}: SummaryCardsProps) {
  const arrivalTotal = getMatrixTotal(arrivalMatrix);
  const forecastTotal = getMatrixTotal(forecastMatrix);
  const staffingTotal = getMatrixTotal(staffingMatrix);
  const peakArrival = getPeakCell(arrivalMatrix);
  const peakStaffing = getMatrixMax(staffingMatrix);
  const delta = arrivalTotal > 0 ? ((forecastTotal - arrivalTotal) / arrivalTotal * 100).toFixed(1) : "0.0";

  const cards: { label: string; value: string; sub: string; accent: string }[] = [
    {
      label: "Total Records",
      value: totalRecords.toLocaleString(),
      sub: `${weekCount} weeks of data`,
      accent: "text-zinc-900 dark:text-zinc-100",
    },
    {
      label: "Avg Weekly Volume",
      value: arrivalTotal.toLocaleString(),
      sub: `Peak ${formatHour(peakArrival.hour)} ${DAY_NAMES[peakArrival.day]?.slice(0, 3)}`,
      accent: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Forecasted Volume",
      value: forecastTotal.toLocaleString(),
      sub: `${Number(delta) >= 0 ? "+" : ""}${delta}% vs actual`,
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Total HC Required",
      value: staffingTotal.toLocaleString(),
      sub: `Peak ${peakStaffing} agents/hr`,
      accent: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
            {c.label}
          </p>
          <p className={`text-xl font-semibold tabular-nums ${c.accent}`}>{c.value}</p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
