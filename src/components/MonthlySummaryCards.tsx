"use client";

import { ArrivalMatrix, MonthlyBucket } from "@/lib/arrival";

interface MonthlySummaryCardsProps {
  buckets: MonthlyBucket[];
  volumeMatrix: ArrivalMatrix;
  hcMatrix: ArrivalMatrix;
}

interface MonthlyMetric {
  label: string;
  totalVolume: number;
  peakHC: number;
}

function aggregateBuckets(
  buckets: MonthlyBucket[],
  volume: ArrivalMatrix,
  hc: ArrivalMatrix,
): MonthlyMetric[] {
  return buckets.map((b) => {
    let total = 0;
    let peak = 0;
    for (const { week, day } of b.cells) {
      total += volume[week]?.[day] ?? 0;
      const v = hc[week]?.[day] ?? 0;
      if (v > peak) peak = v;
    }
    return { label: b.label, totalVolume: total, peakHC: peak };
  });
}

export default function MonthlySummaryCards({
  buckets,
  volumeMatrix,
  hcMatrix,
}: MonthlySummaryCardsProps) {
  const metrics = aggregateBuckets(buckets, volumeMatrix, hcMatrix);
  const maxVolume = Math.max(...metrics.map((m) => m.totalVolume), 1);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Monthly Summary
        </h3>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          Forecasted volume + peak daily HC per month
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {metrics.map((m) => {
          const intensity = m.totalVolume / maxVolume;
          return (
            <div
              key={m.label}
              className="rounded-md border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/50"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {m.label}
              </p>
              <p className="text-base font-semibold tabular-nums text-[#0d9488] dark:text-teal-400 mt-0.5">
                {m.totalVolume.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Peak HC <span className="font-semibold text-[#c2410c] dark:text-orange-400 tabular-nums">{m.peakHC}</span>
              </p>
              <div className="mt-1.5 h-1 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0d9488]/70 dark:bg-teal-500/60"
                  style={{ width: `${Math.max(2, intensity * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
