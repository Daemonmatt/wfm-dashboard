"use client";

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
  "h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:border-zinc-600";

const inputClass =
  "h-8 w-[4.5rem] rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 shadow-sm text-center transition-colors hover:border-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:border-zinc-600";

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

  return (
    <div className="flex flex-wrap items-end gap-2.5">
      {/* -- Filters -- */}
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

      {/* -- Models -- */}
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

      <Divider />

      {/* -- Staffing params -- */}
      <NumField label="AHT (min)" value={staffingParams.ahtMinutes} onChange={(v) => onStaffingParamsChange({ ...staffingParams, ahtMinutes: v })} min={1} max={120} step={1} disabled={disabled} />
      <NumField label="SL %" value={Math.round(staffingParams.serviceLevelPct * 100)} onChange={(v) => onStaffingParamsChange({ ...staffingParams, serviceLevelPct: v / 100 })} min={50} max={100} step={5} disabled={disabled} />
      <NumField label="TAT (s)" value={staffingParams.targetAnswerTimeSec} onChange={(v) => onStaffingParamsChange({ ...staffingParams, targetAnswerTimeSec: v })} min={10} max={600} step={10} disabled={disabled} />
      <NumField label="Shrink %" value={Math.round(staffingParams.shrinkagePct * 100)} onChange={(v) => onStaffingParamsChange({ ...staffingParams, shrinkagePct: v / 100 })} min={0} max={60} step={5} disabled={disabled} />

      {/* Concurrency -- only shown when Chat origin is selected */}
      {isChat && (
        <>
          <Divider />
          <Field label="Concurrency">
            <select
              value={staffingParams.concurrency}
              onChange={(e) => onStaffingParamsChange({ ...staffingParams, concurrency: Number(e.target.value) })}
              disabled={disabled}
              className={selectClass.replace("border-zinc-200", "border-blue-300").replace("dark:border-zinc-700", "dark:border-blue-700")}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block h-5 w-px bg-zinc-200 dark:bg-zinc-700 self-center" />;
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  highlight,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-[10px] font-medium uppercase tracking-wider ${highlight ? "text-blue-500 dark:text-blue-400" : "text-zinc-400 dark:text-zinc-500"}`}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={highlight
          ? inputClass.replace("border-zinc-200", "border-blue-300").replace("dark:border-zinc-700", "dark:border-blue-700")
          : inputClass}
      />
    </div>
  );
}
