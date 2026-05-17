"use client";

import { useState, useMemo, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import FilterBar from "@/components/FilterBar";
import ArrivalTable from "@/components/ArrivalTable";
import DistributionTable from "@/components/DistributionTable";
import SummaryCards from "@/components/SummaryCards";
import LaborPlanTable from "@/components/LaborPlanTable";
import MonthlySummaryCards from "@/components/MonthlySummaryCards";
import ShiftPlanTable from "@/components/ShiftPlanTable";
import ShiftSummaryCards from "@/components/ShiftSummaryCards";
import ShiftStartSummary from "@/components/ShiftStartSummary";
import { parseFile, ParseResult, ParseProgress } from "@/lib/parser";
import {
  computeArrivalPattern,
  computeArrivalPattern15,
  computeWeeklyDailyTotals,
  formatHour,
  formatSlot,
  formatYearWeek,
  getMatrixTotal,
  getForecastWeekDates,
  getForecastWeekDatesLong,
  getForecastYearStart,
  buildMonthlyBuckets,
} from "@/lib/arrival";
import { ForecastModel, forecastVolume, forecastYearlyDaily, FORECAST_MODELS } from "@/lib/forecast";
import { ArrivalMatrix } from "@/lib/arrival";
import {
  StaffingModel,
  calculateStaffing,
  calculateBlendedStaffing,
  calculateYearlyStaffing,
  StaffingParams,
  DEFAULT_STAFFING_PARAMS,
  STAFFING_MODELS,
} from "@/lib/staffing";
import {
  generateShiftCatalog,
  detectOperatingWindow,
  slotToTime,
  slotToAmPm,
} from "@/lib/shifts";
import { solveShiftCoverage } from "@/lib/scheduler";

// Fixed shift start times for the operations roster, in 15-min slot indices:
//   05:00 = 20, 06:00 = 24, 07:00 = 28, 08:00 = 32,
//   09:00 = 36, 16:30 = 66, 17:30 = 70.
// Late starts span past midnight (17:30 + 8.5h = 02:00 next day).
const FIXED_SHIFT_STARTS_SLOTS = [20, 24, 28, 32, 36, 66, 70] as const;

type TabId = "hourly" | "15min" | "yearly" | "shifts";
type PlanHorizon = 1 | 2;

function applyFactor(matrix: ArrivalMatrix, factor: number): ArrivalMatrix {
  if (factor === 1) return matrix;
  return matrix.map((row) => row.map((v) => Math.round(v * factor)));
}

export default function Home() {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);

  const [selectedTeam, setSelectedTeam] = useState("__all__");
  const [selectedSpecializations, setSelectedSpecializations] = useState<string[]>([]);
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
  // Defaults: Double Exponential forecast for every origin selection. The
  // staffing model defaults to "Blended" (Erlang-C on chat + Workload Spread
  // Back on email, summed) which is the right model for combined volume.
  // When the user picks a single origin, the Origin-change handler swaps the
  // staffing model to the right single-stream default (Erlang-C for chat,
  // Workload Spread Back for email). The dropdown is always honoured.
  const [forecastModel, setForecastModel] = useState<ForecastModel>("double_exp");
  const [staffingModel, setStaffingModel] = useState<StaffingModel>("blended");
  const [staffingParams, setStaffingParams] = useState<StaffingParams>({
    ...DEFAULT_STAFFING_PARAMS,
    concurrency: 2,
  });
  const [activeTab, setActiveTab] = useState<TabId>("hourly");

  // Shift-planning controls (used only on the "Shift Plan" tab)
  const [planHorizon, setPlanHorizon] = useState<PlanHorizon>(1);
  const [coverageBufferPct, setCoverageBufferPct] = useState<number>(0); // 0..1
  // Selected weekdays to schedule (0=Sun ... 6=Sat). Default Mon–Fri.
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  // Manual HC pins per shift start. Empty = use auto-computed value.
  // Map key is the start slot index (e.g., 36 for 09:00 AM).
  const [shiftOverrides, setShiftOverrides] = useState<Record<number, number>>({});

  // `selectedOrigins` is now an explicit list of what is checked. An empty
  // array means "no origins selected" (no rows match), while a list equal to
  // every available origin is treated as "all" (no filter).
  const allOrigins = parseResult?.origins ?? [];
  const isAll = allOrigins.length > 0 && selectedOrigins.length === allOrigins.length;
  const isOnlyChat = selectedOrigins.length === 1 && selectedOrigins[0].toLowerCase() === "chat";
  const isOnlyEmail = selectedOrigins.length === 1 && selectedOrigins[0].toLowerCase() === "email";
  const chatIncluded = selectedOrigins.some((o) => o.toLowerCase() === "chat");
  const emailIncluded = selectedOrigins.some((o) => o.toLowerCase() === "email");
  const isBothIncluded = chatIncluded && emailIncluded && !isOnlyChat && !isOnlyEmail;

  const handleOriginsChange = useCallback(
    (origins: string[]) => {
      setSelectedOrigins(origins);
      // Forecasting default is Double Exponential across every origin
      // selection. Staffing model auto-switches based on which origins are
      // included; concurrency = 2 whenever chat is part of the selection.
      setForecastModel("double_exp");

      const lower = origins.map((o) => o.toLowerCase());
      const includesChat = lower.includes("chat");
      const includesEmail = lower.includes("email");
      const isAllSelected =
        parseResult !== null && origins.length === parseResult.origins.length;

      if (origins.length === 1) {
        if (lower[0] === "chat") {
          setStaffingModel("erlang_c");
          setStaffingParams((prev) => ({ ...prev, concurrency: 2 }));
        } else if (lower[0] === "email") {
          setStaffingModel("workload_spread_back");
          setStaffingParams((prev) => ({ ...prev, concurrency: 1 }));
        }
        return;
      }

      // Combined selections (All Origins, or any subset that includes both
      // chat and email) default to the "Blended" staffing model so chat and
      // email each get the right queue dynamics. The dropdown is honoured
      // afterwards — pick a different model and the math switches.
      if (isAllSelected || (includesChat && includesEmail)) {
        setStaffingModel("blended");
        setStaffingParams((prev) => ({ ...prev, concurrency: 2 }));
        return;
      }

      // Subset that includes chat but not email: stay on Erlang-C.
      if (includesChat) {
        setStaffingModel("erlang_c");
        setStaffingParams((prev) => ({ ...prev, concurrency: 2 }));
      } else {
        // Subset that doesn't include chat (e.g., Email + Web): drop
        // concurrency and use the email-friendly default.
        setStaffingModel("workload_spread_back");
        setStaffingParams((prev) => ({ ...prev, concurrency: 1 }));
      }
    },
    [parseResult],
  );

  const handleFileLoaded = useCallback(
    async (buffer: ArrayBuffer, name: string) => {
      setIsLoading(true);
      setError(null);
      setParseProgress(null);
      try {
        const result = await parseFile(buffer, name, (progress) => {
          setParseProgress(progress);
        });
        setParseResult(result);
        setFileName(name);
        setSelectedTeam("__all__");
        // Initialize multi-selects to every available option so the dashboard
        // starts in an "All ..." state (canonical: every option checked).
        setSelectedSpecializations(result.specializations);
        setSelectedOrigins(result.origins);
        // Combined volume → Blended staffing by default (Erlang-C for chat
        // slice + Workload Spread Back for email slice). User can override.
        setForecastModel("double_exp");
        setStaffingModel("blended");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to parse file");
        setParseResult(null);
      } finally {
        setIsLoading(false);
        setParseProgress(null);
      }
    },
    []
  );

  const team = selectedTeam === "__all__" ? undefined : selectedTeam;
  const teamLabel = selectedTeam === "__all__" ? "All Teams" : selectedTeam;

  // Specializations available given the currently-selected team.
  // When a team is selected we only show specializations that have rows for that team.
  const availableSpecializations = useMemo(() => {
    if (!parseResult) return [];
    if (!team) return parseResult.specializations;
    const set = new Set<string>();
    for (const r of parseResult.rows) {
      if (r.team === team && r.specialization && r.specialization !== "Unknown") {
        set.add(r.specialization);
      }
    }
    return Array.from(set).sort();
  }, [parseResult, team]);

  // If the team changes, prune selected specializations to those still valid
  // for the new team. If pruning leaves the list empty (none of the previous
  // selections apply) we default back to "all available for new team" so the
  // user isn't accidentally left with a no-data view.
  const handleTeamChange = useCallback(
    (newTeam: string) => {
      setSelectedTeam(newTeam);
      if (!parseResult) return;

      let newAvailable: string[];
      if (newTeam === "__all__") {
        newAvailable = parseResult.specializations;
      } else {
        const set = new Set<string>();
        for (const r of parseResult.rows) {
          if (r.team === newTeam && r.specialization && r.specialization !== "Unknown") {
            set.add(r.specialization);
          }
        }
        newAvailable = Array.from(set).sort();
      }

      setSelectedSpecializations((prev) => {
        if (prev.length === 0) return prev; // user explicitly deselected all → keep
        const allowedSet = new Set(newAvailable);
        const filtered = prev.filter((s) => allowedSet.has(s));
        return filtered.length === 0 ? newAvailable : filtered;
      });
    },
    [parseResult]
  );

  // A filter is only applied when the selection is a strict subset. If every
  // option is selected we pass `undefined` (no filter) for performance and
  // clarity. An empty selection means "no rows match" and is passed through
  // explicitly so the result table goes blank as expected.
  const allSpecsSelected = availableSpecializations.length > 0 && selectedSpecializations.length === availableSpecializations.length;
  const allOriginsSelected = allOrigins.length > 0 && selectedOrigins.length === allOrigins.length;
  const spec: string[] | undefined = allSpecsSelected ? undefined : selectedSpecializations;
  const originFilter: string[] | undefined = allOriginsSelected ? undefined : selectedOrigins;

  // --- Per-origin arrival + forecast (always computed for blended AHT and blended staffing) ---
  const chatArrivalHourly = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern(parseResult.rows, team, "Chat", spec);
  }, [parseResult, team, spec]);

  const emailArrivalHourly = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern(parseResult.rows, team, "Email", spec);
  }, [parseResult, team, spec]);

  const mf = staffingParams.multiplyFactor;

  const chatForecastHourly = useMemo(() => {
    if (!chatArrivalHourly) return null;
    return applyFactor(forecastVolume(forecastModel, chatArrivalHourly.matrix, chatArrivalHourly.weeklyBreakdown), mf);
  }, [chatArrivalHourly, forecastModel, mf]);

  const emailForecastHourly = useMemo(() => {
    if (!emailArrivalHourly) return null;
    return applyFactor(forecastVolume(forecastModel, emailArrivalHourly.matrix, emailArrivalHourly.weeklyBreakdown), mf);
  }, [emailArrivalHourly, forecastModel, mf]);

  const chatArrival15 = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern15(parseResult.rows, team, "Chat", spec);
  }, [parseResult, team, spec]);

  const emailArrival15 = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern15(parseResult.rows, team, "Email", spec);
  }, [parseResult, team, spec]);

  const chatForecast15 = useMemo(() => {
    if (!chatArrival15) return null;
    return applyFactor(forecastVolume(forecastModel, chatArrival15.matrix, chatArrival15.weeklyBreakdown), mf);
  }, [chatArrival15, forecastModel, mf]);

  const emailForecast15 = useMemo(() => {
    if (!emailArrival15) return null;
    return applyFactor(forecastVolume(forecastModel, emailArrival15.matrix, emailArrival15.weeklyBreakdown), mf);
  }, [emailArrival15, forecastModel, mf]);

  // Volume-weighted blended AHT
  const effectiveAht = useMemo(() => {
    if (isOnlyChat) return staffingParams.chatAhtSeconds;
    if (isOnlyEmail) return staffingParams.emailAhtSeconds;
    const chatVol = chatForecastHourly ? getMatrixTotal(chatForecastHourly) : 0;
    const emailVol = emailForecastHourly ? getMatrixTotal(emailForecastHourly) : 0;
    const total = chatVol + emailVol;
    if (total === 0) return Math.round((staffingParams.chatAhtSeconds + staffingParams.emailAhtSeconds) / 2);
    return Math.round(
      (chatVol * staffingParams.chatAhtSeconds + emailVol * staffingParams.emailAhtSeconds) / total
    );
  }, [isOnlyChat, isOnlyEmail, staffingParams.chatAhtSeconds, staffingParams.emailAhtSeconds, chatForecastHourly, emailForecastHourly]);

  const mainParams = useMemo(
    () => ({ ...staffingParams, ahtSeconds: effectiveAht }),
    [staffingParams, effectiveAht]
  );

  const chatParams = useMemo(
    () => ({ ...staffingParams, ahtSeconds: staffingParams.chatAhtSeconds }),
    [staffingParams]
  );

  const emailParams = useMemo(
    () => ({ ...staffingParams, ahtSeconds: staffingParams.emailAhtSeconds }),
    [staffingParams]
  );

  // --- Hourly pipeline (24x7) ---
  const arrivalData = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern(parseResult.rows, team, originFilter, spec);
  }, [parseResult, team, originFilter, spec]);

  const forecastMatrix = useMemo(() => {
    if (!arrivalData) return null;
    return applyFactor(forecastVolume(forecastModel, arrivalData.matrix, arrivalData.weeklyBreakdown), mf);
  }, [arrivalData, forecastModel, mf]);

  const staffingMatrix = useMemo(() => {
    if (!forecastMatrix) return null;
    // Blended path runs only when the user explicitly picks "blended" from
    // the staffing dropdown AND both chat and email forecasts are available.
    if (staffingModel === "blended" && chatForecastHourly && emailForecastHourly) {
      return calculateBlendedStaffing(
        chatForecastHourly, emailForecastHourly,
        { ...staffingParams, intervalMinutes: 60 },
        staffingParams.chatAhtSeconds, staffingParams.emailAhtSeconds,
      );
    }
    return calculateStaffing(staffingModel, forecastMatrix, { ...mainParams, intervalMinutes: 60 }, isOnlyChat);
  }, [forecastMatrix, staffingModel, mainParams, isOnlyChat, chatForecastHourly, emailForecastHourly, staffingParams]);

  // --- 15-min pipeline (96x7) ---
  const arrivalData15 = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern15(parseResult.rows, team, originFilter, spec);
  }, [parseResult, team, originFilter, spec]);

  const forecastMatrix15 = useMemo(() => {
    if (!arrivalData15) return null;
    return applyFactor(forecastVolume(forecastModel, arrivalData15.matrix, arrivalData15.weeklyBreakdown), mf);
  }, [arrivalData15, forecastModel, mf]);

  const staffingMatrix15 = useMemo(() => {
    if (!forecastMatrix15) return null;
    if (staffingModel === "blended" && chatForecast15 && emailForecast15) {
      return calculateBlendedStaffing(
        chatForecast15, emailForecast15,
        { ...staffingParams, intervalMinutes: 15 },
        staffingParams.chatAhtSeconds, staffingParams.emailAhtSeconds,
      );
    }
    return calculateStaffing(staffingModel, forecastMatrix15, { ...mainParams, intervalMinutes: 15 }, isOnlyChat);
  }, [forecastMatrix15, staffingModel, mainParams, isOnlyChat, chatForecast15, emailForecast15, staffingParams]);

  // --- Per-origin 15-min staffing for Labor Plan ---
  const chatStaffing15 = useMemo(() => {
    if (!chatForecast15) return null;
    return calculateStaffing("erlang_c", chatForecast15, { ...chatParams, intervalMinutes: 15 }, true);
  }, [chatForecast15, chatParams]);

  const emailStaffing15 = useMemo(() => {
    if (!emailForecast15) return null;
    return calculateStaffing("workload_spread_back", emailForecast15, { ...emailParams, intervalMinutes: 15 }, false);
  }, [emailForecast15, emailParams]);

  // --- Shift Plan pipeline ---
  // Auto-detect the operating window from the forecasted requirement so the
  // shift catalog only generates candidates that can actually start in that
  // window. Operations are mostly 6 AM PT chat-window with some out-of-hours
  // demand; the detected bounds adapt automatically.
  const operatingWindow = useMemo(() => {
    if (!staffingMatrix15) return null;
    return detectOperatingWindow(staffingMatrix15);
  }, [staffingMatrix15]);

  // Fixed shift catalog: 8 allowed starts (4 AM – 9 AM hourly + 16:30 / 17:30
  // late shifts). Late shifts wrap past midnight; the scheduler accounts for
  // their post-midnight productive slots on the next day.
  const shiftCatalog = useMemo(() => {
    return generateShiftCatalog({
      startSlots: [...FIXED_SHIFT_STARTS_SLOTS],
      allowMidnightWrap: true,
    });
  }, []);

  // Baseline schedule: what the scheduler would build with NO manual pins.
  // We keep this around so that when the user does pin a shift, the new
  // schedule can stay locked to the same overall headcount and rebalance
  // across the other (non-pinned) shifts instead of just shrinking.
  const baselineShiftSchedule = useMemo(() => {
    if (!staffingMatrix15 || shiftCatalog.length === 0) return null;
    return solveShiftCoverage(staffingMatrix15, {
      shifts: shiftCatalog,
      daysScheduled: scheduleDays,
      bufferPct: coverageBufferPct,
      polish: true,
    });
  }, [staffingMatrix15, shiftCatalog, scheduleDays, coverageBufferPct]);

  const shiftSchedule = useMemo(() => {
    if (!staffingMatrix15 || shiftCatalog.length === 0) return null;
    const hasOverrides = Object.keys(shiftOverrides).length > 0;
    const targetTotalAgents = hasOverrides ? baselineShiftSchedule?.totalAgents : undefined;
    return solveShiftCoverage(staffingMatrix15, {
      shifts: shiftCatalog,
      daysScheduled: scheduleDays,
      bufferPct: coverageBufferPct,
      polish: true,
      startSlotOverrides: shiftOverrides,
      targetTotalAgents,
    });
  }, [
    staffingMatrix15,
    shiftCatalog,
    scheduleDays,
    coverageBufferPct,
    shiftOverrides,
    baselineShiftSchedule,
  ]);

  // --- Yearly pipeline (52 weeks x 7 days) ---
  const yearlyHistory = useMemo(() => {
    if (!parseResult) return null;
    return computeWeeklyDailyTotals(parseResult.rows, team, originFilter, spec);
  }, [parseResult, team, originFilter, spec]);

  const yearlyForecast = useMemo(() => {
    if (!yearlyHistory) return null;
    return applyFactor(forecastYearlyDaily(yearlyHistory, 52), mf);
  }, [yearlyHistory, mf]);

  const yearlyStaffing = useMemo(() => {
    if (!yearlyForecast) return null;
    return calculateYearlyStaffing(yearlyForecast, mainParams, 8);
  }, [yearlyForecast, mainParams]);

  const yearStartDate = useMemo(() => {
    if (!yearlyHistory) return null;
    return getForecastYearStart(yearlyHistory);
  }, [yearlyHistory]);

  const monthlyBuckets = useMemo(() => {
    if (!yearStartDate) return null;
    return buildMonthlyBuckets(yearStartDate, 52);
  }, [yearStartDate]);

  const formatYearRow = useCallback(
    (idx: number) => {
      if (!yearStartDate) return `W${idx + 1}`;
      return formatYearWeek(idx, yearStartDate);
    },
    [yearStartDate],
  );

  // --- Labels ---
  const activeForecastLabel = FORECAST_MODELS.find((m) => m.id === forecastModel)?.label ?? "";
  // The staffing label always tracks the user's dropdown selection now —
  // there is no implicit override. "Blended" is just one of the options.
  const activeStaffingLabel = STAFFING_MODELS.find((m) => m.id === staffingModel)?.label ?? "";
  const filterParts: string[] = [];
  if (selectedTeam !== "__all__") filterParts.push(selectedTeam);
  if (selectedSpecializations.length > 0 && !allSpecsSelected) {
    filterParts.push(selectedSpecializations.join(", "));
  }
  if (selectedOrigins.length > 0 && !allOriginsSelected) {
    filterParts.push(selectedOrigins.join(", "));
  }
  const filterLabel = filterParts.length > 0 ? ` \u2014 ${filterParts.join(" / ")}` : "";
  const concLabel = isOnlyChat && staffingParams.concurrency > 1 ? `, Concurrency: ${staffingParams.concurrency}` : "";
  const factorLabel = mf !== 1 ? `, Factor: ${mf}×` : "";

  const ahtLabel = isOnlyChat
    ? `Chat AHT ${staffingParams.chatAhtSeconds}s`
    : isOnlyEmail
      ? `Email AHT ${staffingParams.emailAhtSeconds}s`
      : `Blended AHT ${effectiveAht}s (vol-weighted)`;

  // Pick active data based on tab
  const isHourly = activeTab === "hourly";
  const aData = isHourly ? arrivalData : arrivalData15;
  const fMatrix = isHourly ? forecastMatrix : forecastMatrix15;
  const sMatrix = isHourly ? staffingMatrix : staffingMatrix15;
  const rowFormatter = isHourly ? formatHour : formatSlot;
  const intervalLabel = isHourly ? "60 min" : "15 min";

  const forecastDates = useMemo(() => {
    if (!aData) return undefined;
    // Pass the actual last date from data so forecast starts from the next day
    const lastDate = parseResult?.dateRange?.max;
    return getForecastWeekDates(aData.weeklyBreakdown, lastDate);
  }, [aData, parseResult?.dateRange?.max]);

  const forecastDatesLong = useMemo(() => {
    if (!aData) return undefined;
    const lastDate = parseResult?.dateRange?.max;
    return getForecastWeekDatesLong(aData.weeklyBreakdown, lastDate);
  }, [aData, parseResult?.dateRange?.max]);

  const hasData = aData && fMatrix && sMatrix;

  return (
    <div className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto max-w-[1920px] px-6 lg:px-8">
          <div className="flex h-12 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-[11px] font-bold tracking-tight">
                WF
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
                WFM Dashboard
              </span>
            </div>
            {parseResult && (
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {parseResult.totalRows.toLocaleString()}
                </span>
                <span>records</span>
                <span className="mx-1 text-slate-300 dark:text-slate-700">/</span>
                <span>{parseResult.dateRange.min.toLocaleDateString()} &ndash; {parseResult.dateRange.max.toLocaleDateString()}</span>
                <span className="mx-1 text-slate-300 dark:text-slate-700">/</span>
                <span>{parseResult.teams.length} teams</span>
                {aData && (
                  <>
                    <span className="mx-1 text-slate-300 dark:text-slate-700">/</span>
                    <span>{aData.weekCount} weeks</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1920px] px-6 lg:px-8 py-5 space-y-4">
        {/* Controls */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
          <FileUpload onFileLoaded={handleFileLoaded} isLoading={isLoading} fileName={fileName} progress={parseProgress} />
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400">
              {error}
            </div>
          )}
          {parseResult && (
            <FilterBar
              teams={parseResult.teams}
              selectedTeam={selectedTeam}
              onTeamChange={handleTeamChange}
              specializations={availableSpecializations}
              selectedSpecializations={selectedSpecializations}
              onSpecializationsChange={setSelectedSpecializations}
              origins={parseResult.origins}
              selectedOrigins={selectedOrigins}
              onOriginsChange={handleOriginsChange}
              forecastModel={forecastModel}
              onForecastModelChange={setForecastModel}
              staffingModel={staffingModel}
              onStaffingModelChange={setStaffingModel}
              staffingParams={staffingParams}
              onStaffingParamsChange={setStaffingParams}
              disabled={isLoading}
            />
          )}
        </section>

        {/* Empty state */}
        {!parseResult && !isLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Upload your data to get started</p>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 max-w-md leading-relaxed">
              Drop an Excel or CSV file with <code className="bg-slate-100 dark:bg-slate-800 rounded px-1 text-[11px] font-mono">created_at</code> and <code className="bg-slate-100 dark:bg-slate-800 rounded px-1 text-[11px] font-mono">team</code> columns.
            </p>
          </div>
        )}

        {/* Dashboard content */}
        {parseResult && (
          <div className="space-y-4">
            {/* Tab Switcher */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800/60 p-1 w-fit">
              {([
                { id: "hourly" as TabId, label: "Hourly Requirement" },
                { id: "15min" as TabId, label: "15 Min Requirement" },
                { id: "yearly" as TabId, label: "Yearly Forecast" },
                { id: "shifts" as TabId, label: "Shift Plan" },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "yearly" && yearlyForecast && yearlyStaffing && monthlyBuckets && yearlyHistory && (
              <div className="space-y-4">
                <MonthlySummaryCards
                  buckets={monthlyBuckets}
                  volumeMatrix={yearlyForecast}
                  hcMatrix={yearlyStaffing}
                />

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ArrivalTable
                    title="Yearly Volume Forecast"
                    subtitle={`Damped-trend daily forecast${factorLabel}${filterLabel} (52 wk, ${yearlyHistory.length} wk history)`}
                    matrix={yearlyForecast}
                    colorScheme="teal"
                    formatRowLabel={formatYearRow}
                  />
                  <ArrivalTable
                    title="Yearly Headcount Required"
                    subtitle={`Workload (8h/day, ${ahtLabel}, Shrink ${Math.round(staffingParams.shrinkagePct * 100)}%, Occ ${Math.round(staffingParams.occupancyPct * 100)}%)${filterLabel}`}
                    matrix={yearlyStaffing}
                    colorScheme="rust"
                    usePeakTotals
                    formatRowLabel={formatYearRow}
                  />
                </div>

                {yearlyHistory.length < 8 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
                    Long-term forecast quality improves with more history. You currently have {yearlyHistory.length} week{yearlyHistory.length === 1 ? "" : "s"} of data — yearly seasonality and major shifts can&rsquo;t be inferred from short windows. The model uses damped-trend smoothing per day-of-week to project conservative trajectories.
                  </p>
                )}
              </div>
            )}

            {activeTab === "shifts" && shiftSchedule && operatingWindow && staffingMatrix15 && (
              <div className="space-y-4">
                {/* Planning controls */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                        Plan Horizon
                      </label>
                      <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px]">
                        {([1, 2] as PlanHorizon[]).map((h) => (
                          <button
                            key={h}
                            onClick={() => setPlanHorizon(h)}
                            className={`px-3 py-1.5 transition-colors ${
                              planHorizon === h
                                ? "bg-[#4f46e5] text-white"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            {h} Week{h > 1 ? "s" : ""}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                        Working Days
                      </label>
                      <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px]">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, di) => {
                          const active = scheduleDays.includes(di);
                          return (
                            <button
                              key={d}
                              onClick={() => {
                                setScheduleDays((prev) =>
                                  prev.includes(di) ? prev.filter((x) => x !== di) : [...prev, di].sort(),
                                );
                              }}
                              className={`px-2.5 py-1.5 border-r border-slate-200 dark:border-slate-700 last:border-r-0 transition-colors ${
                                active
                                  ? "bg-[#4f46e5]/10 text-[#4f46e5] font-medium dark:bg-indigo-500/20 dark:text-indigo-300"
                                  : "bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                              }`}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                        Buffer %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        value={Math.round(coverageBufferPct * 100)}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(50, Number(e.target.value) || 0));
                          setCoverageBufferPct(v / 100);
                        }}
                        className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#4f46e5]"
                      />
                    </div>

                    <div className="flex-1 min-w-[260px] text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      <div>
                        <span className="font-medium text-slate-600 dark:text-slate-300">Allowed starts:</span>{" "}
                        {FIXED_SHIFT_STARTS_SLOTS.map((s) => slotToAmPm(s)).join(" · ")}
                      </div>
                      <div className="mt-0.5 text-slate-400 dark:text-slate-500">
                        8h work + 30m lunch + 2×15m breaks · {shiftCatalog.length} candidates · data window {slotToTime(operatingWindow.firstSlot)}–{slotToTime(operatingWindow.lastSlot + 1)}
                      </div>
                    </div>
                  </div>
                </div>

                <ShiftSummaryCards schedule={shiftSchedule} weeks={planHorizon} />

                <ShiftStartSummary
                  title="HC by Shift Start"
                  subtitle={`Agents needed at each start time to crunch forecasted volume${filterLabel} · pin a value to lock that shift · total stays at baseline, others rebalance`}
                  schedule={shiftSchedule}
                  startSlots={[...FIXED_SHIFT_STARTS_SLOTS]}
                  forecastDates={forecastDates}
                  overrides={shiftOverrides}
                  onOverridesChange={setShiftOverrides}
                  lockedTotal={baselineShiftSchedule?.totalAgents}
                />

                <ShiftPlanTable
                  title="Shift Coverage Plan"
                  subtitle={`Greedy set-cover · 8.5h shift · multi-skill (chat + email)${filterLabel}`}
                  schedule={shiftSchedule}
                  forecastDates={forecastDates}
                />

                {/* Coverage vs Requirement: side-by-side heatmaps */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ArrivalTable
                    title="Required Headcount (per slot)"
                    subtitle={`Demand from staffing model${filterLabel} (15 min)`}
                    matrix={shiftSchedule.targetMatrix}
                    colorScheme="rust"
                    usePeakTotals
                    formatRowLabel={formatSlot}
                    forecastDates={forecastDates}
                  />
                  <ArrivalTable
                    title="Scheduled Headcount (per slot)"
                    subtitle={`Agents on the floor after the shift plan (15 min)`}
                    matrix={shiftSchedule.scheduledMatrix}
                    colorScheme="teal"
                    usePeakTotals
                    formatRowLabel={formatSlot}
                    forecastDates={forecastDates}
                  />
                </div>

                {/* Sat/Sun demand notice */}
                {(() => {
                  let weekendDemand = 0;
                  for (let t = 0; t < 96; t++) {
                    weekendDemand += (staffingMatrix15[t]?.[0] ?? 0) + (staffingMatrix15[t]?.[6] ?? 0);
                  }
                  const sched = scheduleDays;
                  const skipWeekend = !sched.includes(0) && !sched.includes(6);
                  if (skipWeekend && weekendDemand > 0) {
                    return (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
                        Sat/Sun show forecasted staffing demand but are excluded from the working-day rotation.
                        If weekend coverage is required, enable those days above to schedule a separate
                        rotation (e.g., Tue–Sat or Sun–Thu agents).
                      </p>
                    );
                  }
                  return null;
                })()}

                {planHorizon === 2 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2">
                    The 2-week view repeats this plan for both weeks (steady-state forecast).
                    Adjust the Multiply Factor to model promotions or campaign weeks separately.
                  </p>
                )}
              </div>
            )}

            {(activeTab === "hourly" || activeTab === "15min") && hasData && (
              <div className="space-y-4">
                <SummaryCards
                  arrivalMatrix={aData.matrix}
                  forecastMatrix={fMatrix}
                  staffingMatrix={sMatrix}
                  weekCount={aData.weekCount}
                  totalRecords={parseResult.totalRows}
                />

                {/* Row 1: Arrival + Distribution */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ArrivalTable
                    title="Volume Arrival Pattern"
                    subtitle={`Avg weekly volume${filterLabel} (${aData.weekCount} wk, ${intervalLabel})`}
                    matrix={aData.matrix}
                    colorScheme="blue"
                    formatRowLabel={rowFormatter}
                  />
                  <DistributionTable
                    title="% Distribution"
                    subtitle={`Interval % of daily volume${filterLabel}`}
                    matrix={aData.matrix}
                    formatRowLabel={rowFormatter}
                  />
                </div>

                {/* Row 2: Forecast + Headcount */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ArrivalTable
                    title="Forecasted Volume"
                    subtitle={`${activeForecastLabel}${factorLabel}${filterLabel} (${intervalLabel})`}
                    matrix={fMatrix}
                    colorScheme="teal"
                    formatRowLabel={rowFormatter}
                    forecastDates={forecastDates}
                  />
                  <ArrivalTable
                    title="Headcount Required"
                    subtitle={`${activeStaffingLabel} (${ahtLabel}, SL ${Math.round(staffingParams.serviceLevelPct * 100)}%, Shrink ${Math.round(staffingParams.shrinkagePct * 100)}%, Occ ${Math.round(staffingParams.occupancyPct * 100)}%${concLabel})${filterLabel}`}
                    matrix={sMatrix}
                    colorScheme="rust"
                    usePeakTotals
                    formatRowLabel={rowFormatter}
                    forecastDates={forecastDates}
                  />
                </div>

                {/* Labor Plan — 15-min tab only */}
                {!isHourly && chatStaffing15 && emailStaffing15 && (
                  <LaborPlanTable
                    title="Labor Plan"
                    subtitle={`15-min interval staffing by origin${filterLabel}`}
                    teamLabel={teamLabel}
                    chatMatrix={chatStaffing15}
                    emailMatrix={emailStaffing15}
                    forecastDates={forecastDatesLong}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
