"use client";

import { useCallback, useMemo } from "react";
import { ArrivalMatrix } from "@/lib/arrival";

interface LaborPlanTableProps {
  title: string;
  subtitle?: string;
  teamLabel: string;
  chatMatrix: ArrivalMatrix;
  emailMatrix: ArrivalMatrix;
  forecastDates?: string[];
}

const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSlotAmPm(slot: number): string {
  const h24 = Math.floor(slot / 4);
  const m = (slot % 4) * 15;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

const SLOT_COUNT = 96;
const SLOT_LABELS = Array.from({ length: SLOT_COUNT }, (_, i) => formatSlotAmPm(i));

function fmt(v: number): string {
  return v === 0 ? "0.0" : v % 1 === 0 ? `${v}.0` : v.toFixed(1);
}

export default function LaborPlanTable({
  title,
  subtitle,
  teamLabel,
  chatMatrix,
  emailMatrix,
  forecastDates,
}: LaborPlanTableProps) {
  const chatMax = useMemo(() => {
    let mx = 0;
    for (const row of chatMatrix) for (const v of row) if (v > mx) mx = v;
    return mx;
  }, [chatMatrix]);

  const emailMax = useMemo(() => {
    let mx = 0;
    for (const row of emailMatrix) for (const v of row) if (v > mx) mx = v;
    return mx;
  }, [emailMatrix]);

  const dayDates = forecastDates
    ? DAY_ORDER.map((di) => forecastDates[di])
    : undefined;

  const handleExportCSV = useCallback(() => {
    const lines: string[] = [];
    if (dayDates) {
      const dateRow = [teamLabel, ...DAY_ORDER.flatMap((_, idx) => Array(SLOT_COUNT).fill(dayDates[idx]))];
      lines.push(dateRow.join(","));
    } else {
      const dayRow = [teamLabel, ...DAY_ORDER.flatMap((_, idx) => Array(SLOT_COUNT).fill(DAY_SHORT[idx]))];
      lines.push(dayRow.join(","));
    }
    const tzRow = ["America/Los_Angeles", ...DAY_ORDER.flatMap(() => SLOT_LABELS)];
    lines.push(tzRow.join(","));
    lines.push(["Chat", ...DAY_ORDER.flatMap((di) => chatMatrix.map((row) => fmt(row[di])))].join(","));
    lines.push(["Email", ...DAY_ORDER.flatMap((di) => emailMatrix.map((row) => fmt(row[di])))].join(","));
    lines.push(["Chat (Only Chat Segments)", ...DAY_ORDER.flatMap((di) => chatMatrix.map((row) => fmt(row[di])))].join(","));

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "labor_plan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [chatMatrix, emailMatrix, teamLabel, dayDates]);

  const heatBg = (v: number, mx: number, tier: 0 | 1 | 2) => {
    if (v === 0 || mx === 0) return "";
    const i = v / mx;
    const bands = [
      ["bg-blue-50 dark:bg-blue-950/15", "bg-blue-100 dark:bg-blue-900/20", "bg-blue-200/60 dark:bg-blue-800/25", "bg-blue-300/50 dark:bg-blue-700/30"],
      ["bg-teal-50 dark:bg-teal-950/15", "bg-teal-100 dark:bg-teal-900/20", "bg-teal-200/60 dark:bg-teal-800/25", "bg-teal-300/50 dark:bg-teal-700/30"],
      ["bg-orange-50 dark:bg-orange-950/15", "bg-orange-100 dark:bg-orange-900/20", "bg-orange-200/60 dark:bg-orange-800/25", "bg-orange-300/50 dark:bg-orange-700/30"],
    ];
    const idx = i < 0.25 ? 0 : i < 0.5 ? 1 : i < 0.75 ? 2 : 3;
    return bands[tier][idx];
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-[10px] w-max border-collapse">
          <thead>
            {/* Row 1: Team label + date spans per day */}
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-left text-[10px] font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap border-r border-b border-slate-200 dark:border-slate-700 min-w-[180px]">
                {teamLabel}
              </th>
              {DAY_ORDER.map((di, idx) => (
                <th
                  key={di}
                  colSpan={SLOT_COUNT}
                  className="px-1 py-2 text-center text-[10px] font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 border-l border-slate-200 dark:border-slate-700"
                >
                  {dayDates ? dayDates[idx] : DAY_SHORT[idx]}
                </th>
              ))}
            </tr>
            {/* Row 2: Timezone + time slots */}
            <tr className="bg-slate-50/60 dark:bg-slate-800/30">
              <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 text-left text-[9px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap border-r border-b border-slate-200 dark:border-slate-700">
                America/Los_Angeles
              </th>
              {DAY_ORDER.map((_, dayIdx) =>
                SLOT_LABELS.map((slot, si) => (
                  <th
                    key={`tz-${dayIdx}-${si}`}
                    className={`px-0 py-1.5 text-center text-[7.5px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap border-b border-slate-100 dark:border-slate-800 ${si === 0 ? "border-l border-slate-200 dark:border-slate-700" : ""}`}
                  >
                    {slot}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            <DataRow
              label="Chat"
              dayOrder={DAY_ORDER}
              matrix={chatMatrix}
              max={chatMax}
              heatFn={(v) => heatBg(v, chatMax, 0)}
            />
            <DataRow
              label="Email"
              dayOrder={DAY_ORDER}
              matrix={emailMatrix}
              max={emailMax}
              heatFn={(v) => heatBg(v, emailMax, 1)}
            />
            <DataRow
              label="Chat (Only Chat Segments)"
              dayOrder={DAY_ORDER}
              matrix={chatMatrix}
              max={chatMax}
              heatFn={(v) => heatBg(v, chatMax, 2)}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataRow({
  label,
  dayOrder,
  matrix,
  max,
  heatFn,
}: {
  label: string;
  dayOrder: number[];
  matrix: ArrivalMatrix;
  max: number;
  heatFn: (v: number) => string;
}) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
      <td className="sticky left-0 z-20 bg-white dark:bg-slate-900 px-3 py-1.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap border-r border-slate-200 dark:border-slate-700">
        {label}
      </td>
      {dayOrder.map((di, dayIdx) =>
        matrix.map((row, si) => {
          const v = row[di];
          const bg = heatFn(v);
          return (
            <td
              key={`${dayIdx}-${si}`}
              className={`px-0 py-1 text-center text-[9px] tabular-nums whitespace-nowrap ${bg} text-slate-600 dark:text-slate-400 ${si === 0 ? "border-l border-slate-200 dark:border-slate-700" : ""}`}
              title={`${DAY_SHORT[dayIdx]} ${SLOT_LABELS[si]}: ${fmt(v)}`}
            >
              {fmt(v)}
            </td>
          );
        })
      )}
    </tr>
  );
}
