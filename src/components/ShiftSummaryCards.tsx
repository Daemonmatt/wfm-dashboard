"use client";

import { ShiftSchedule } from "@/lib/scheduler";

interface ShiftSummaryCardsProps {
  schedule: ShiftSchedule;
  /** Optional secondary schedule for the second week, shown alongside week 1. */
  weeks?: number;
}

export default function ShiftSummaryCards({ schedule, weeks = 1 }: ShiftSummaryCardsProps) {
  const totalAgents = schedule.totalAgents;
  const paidHours = Math.round(schedule.totalPaidHours);
  const productiveHours = Math.round(schedule.totalProductiveHours);
  const coverage = (schedule.coveragePct * 100).toFixed(1);
  const surplusHours = (schedule.surplusAgentSlots / 4).toFixed(1);
  const deficitHours = (schedule.deficitAgentSlots / 4).toFixed(1);
  const utilization = paidHours > 0 ? ((productiveHours / paidHours) * 100).toFixed(1) : "0.0";

  const cards: { label: string; value: string; sub: string; accent: string; border: string }[] = [
    {
      label: "Total Agents",
      value: totalAgents.toLocaleString(),
      sub: weeks > 1 ? `Mon–Fri roster · ${weeks}-week plan` : "Mon–Fri roster (Sat/Sun off)",
      accent: "text-[#4f46e5] dark:text-indigo-400",
      border: "border-l-[#4f46e5] dark:border-l-indigo-400",
    },
    {
      label: "Paid Hours / Week",
      value: paidHours.toLocaleString(),
      sub: `Productive ${productiveHours.toLocaleString()}h · ${utilization}% util`,
      accent: "text-slate-800 dark:text-slate-100",
      border: "border-l-slate-400 dark:border-l-slate-500",
    },
    {
      label: "Coverage",
      value: `${coverage}%`,
      sub:
        Number(coverage) >= 99.5
          ? "Requirement met across all slots"
          : `${schedule.deficitAgentSlots} slot-agents short`,
      accent:
        Number(coverage) >= 99.5
          ? "text-[#0d9488] dark:text-teal-400"
          : "text-[#c2410c] dark:text-orange-400",
      border:
        Number(coverage) >= 99.5
          ? "border-l-[#0d9488] dark:border-l-teal-400"
          : "border-l-[#c2410c] dark:border-l-orange-400",
    },
    {
      label: "Surplus / Deficit",
      value: `+${surplusHours}h / −${deficitHours}h`,
      sub: "Agent-hours over / under requirement",
      accent: "text-slate-800 dark:text-slate-100",
      border: "border-l-slate-400 dark:border-l-slate-500",
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
