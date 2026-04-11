"use client";

import { useState, useEffect } from "react";
import { ForecastModel, FORECAST_MODELS } from "@/lib/forecast";
import { StaffingModel, STAFFING_MODELS, StaffingParams } from "@/lib/staffing";

interface FilterBarProps {
  teams: string[];
  selectedTeam: string;
  onTeamChange: (team: string) => void;
  origins: string[];
  selectedOrigin: string;
  onOriginChange: (origin: string) => void;
  forecastModel: ForecastModel;
  onForecastModelChange: (model: ForecastModel) => void;
  staffingModel: StaffingModel;
  onStaffingModelChange: (model: StaffingModel) => void;
  staffingParams: StaffingParams;
  onStaffingParamsChange: (params: StaffingParams) => void;
  disabled: boolean;
}

const selectClass =
  "h-7 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 transition-colors hover:border-slate-300 focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/25 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500";

const inputClass =
  "h-7 w-14 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700 text-center transition-colors hover:border-slate-300 focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]/25 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500";

export default function FilterBar({
  teams,
  selectedTeam,
  onTeamChange,
  origins,
  selectedOrigin,
  onOriginChange,
  forecastModel,
  onForecastModelChange,
  staffingModel,
  onStaffingModelChange,
  staffingParams,
  onStaffingParamsChange,
  disabled,
}: FilterBarProps) {
  const isChat = selectedOrigin.toLowerCase() === "chat";
  const isEmail = selectedOrigin.toLowerCase() === "email";
  const chatDisabled = disabled || isEmail;
  const emailDisabled = disabled || isChat;

  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
      <Field label="Team">
        <select value={selectedTeam} onChange={(e) => onTeamChange(e.target.value)} disabled={disabled} className={selectClass}>
          <option value="__all__">All Teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>

      <Field label="Origin">
        <select value={selectedOrigin} onChange={(e) => onOriginChange(e.target.value)} disabled={disabled} className={selectClass}>
          <option value="__all__">All Origins</option>
          {origins.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>

      <Divider />

      <Field label="Forecast">
        <select value={forecastModel} onChange={(e) => onForecastModelChange(e.target.value as ForecastModel)} disabled={disabled} className={selectClass}>
          {FORECAST_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>

      <Field label="Staffing">
        <select value={staffingModel} onChange={(e) => onStaffingModelChange(e.target.value as StaffingModel)} disabled={disabled} className={selectClass}>
          {STAFFING_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>

      {isChat && (
        <Field label="Concurrency">
          <select
            value={staffingParams.concurrency}
            onChange={(e) => onStaffingParamsChange({ ...staffingParams, concurrency: Number(e.target.value) })}
            disabled={disabled}
            className={selectClass.replace("border-slate-200", "border-[#2563eb]/40").replace("dark:border-slate-600", "dark:border-blue-700")}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
      )}

      <Divider />

      <div className={`flex items-end gap-1.5 ${isEmail ? "opacity-40 pointer-events-none" : ""}`}>
        <NumField label="Chat AHT (s)" value={staffingParams.chatAhtSeconds} onCommit={(v) => onStaffingParamsChange({ ...staffingParams, chatAhtSeconds: v })} disabled={chatDisabled} accent="blue" />
      </div>

      <div className={`flex items-end gap-1.5 ${isChat ? "opacity-40 pointer-events-none" : ""}`}>
        <NumField label="Email AHT (s)" value={staffingParams.emailAhtSeconds} onCommit={(v) => onStaffingParamsChange({ ...staffingParams, emailAhtSeconds: v })} disabled={emailDisabled} accent="teal" />
      </div>

      <Divider />

      <NumField label="SL %" value={Math.round(staffingParams.serviceLevelPct * 100)} onCommit={(v) => onStaffingParamsChange({ ...staffingParams, serviceLevelPct: v / 100 })} disabled={disabled} />
      <NumField label="TAT (s)" value={staffingParams.targetAnswerTimeSec} onCommit={(v) => onStaffingParamsChange({ ...staffingParams, targetAnswerTimeSec: v })} disabled={disabled} />
      <NumField label="Shrink %" value={Math.round(staffingParams.shrinkagePct * 100)} onCommit={(v) => onStaffingParamsChange({ ...staffingParams, shrinkagePct: v / 100 })} disabled={disabled} />
      <NumField label="Occ %" value={Math.round(staffingParams.occupancyPct * 100)} onCommit={(v) => onStaffingParamsChange({ ...staffingParams, occupancyPct: v / 100 })} disabled={disabled} />
      <NumField label="Util %" value={Math.round(staffingParams.utilizationPct * 100)} onCommit={(v) => onStaffingParamsChange({ ...staffingParams, utilizationPct: v / 100 })} disabled={disabled} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block h-7 w-px bg-slate-200 dark:bg-slate-700 self-end" />;
}

const ACCENT: Record<string, string> = {
  blue: "border-blue-400 dark:border-blue-600",
  teal: "border-teal-400 dark:border-teal-600",
};

function NumField({
  label,
  value,
  onCommit,
  disabled,
  accent,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  disabled: boolean;
  accent?: string;
}) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = () => {
    const n = Number(local);
    if (!isNaN(n) && n >= 0) {
      onCommit(n);
    } else {
      setLocal(String(value));
    }
  };

  const accentBorder = accent && ACCENT[accent]
    ? inputClass.replace("border-slate-200", ACCENT[accent].split(" ")[0]).replace("dark:border-slate-600", ACCENT[accent].split(" ")[1])
    : inputClass;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        disabled={disabled}
        className={accentBorder}
      />
    </div>
  );
}
