"use client";

import { useState, useMemo, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import FilterBar from "@/components/FilterBar";
import ArrivalTable from "@/components/ArrivalTable";
import DistributionTable from "@/components/DistributionTable";
import SummaryCards from "@/components/SummaryCards";
import LaborPlanTable from "@/components/LaborPlanTable";
import { parseFile, ParseResult } from "@/lib/parser";
import { computeArrivalPattern, computeArrivalPattern15, formatHour, formatSlot, getMatrixTotal, getForecastWeekDates, getForecastWeekDatesLong } from "@/lib/arrival";
import { ForecastModel, forecastVolume, FORECAST_MODELS } from "@/lib/forecast";
import {
  StaffingModel,
  calculateStaffing,
  calculateBlendedStaffing,
  StaffingParams,
  DEFAULT_STAFFING_PARAMS,
  STAFFING_MODELS,
} from "@/lib/staffing";

type TabId = "hourly" | "15min";

export default function Home() {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTeam, setSelectedTeam] = useState("__all__");
  const [selectedOrigin, setSelectedOrigin] = useState("__all__");
  const [forecastModel, setForecastModel] = useState<ForecastModel>("wma");
  const [staffingModel, setStaffingModel] = useState<StaffingModel>("erlang_c");
  const [staffingParams, setStaffingParams] = useState<StaffingParams>(DEFAULT_STAFFING_PARAMS);
  const [activeTab, setActiveTab] = useState<TabId>("hourly");

  const isChat = selectedOrigin.toLowerCase() === "chat";
  const isEmail = selectedOrigin.toLowerCase() === "email";
  const isAll = !isChat && !isEmail;

  const handleOriginChange = useCallback((origin: string) => {
    setSelectedOrigin(origin);
    const o = origin.toLowerCase();
    if (o === "chat") {
      setForecastModel("double_exp");
      setStaffingModel("erlang_c");
    } else if (o === "email") {
      setForecastModel("double_exp");
      setStaffingModel("workload_spread");
    }
  }, []);

  const handleFileLoaded = useCallback(
    async (buffer: ArrayBuffer, name: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await parseFile(buffer, name);
        setParseResult(result);
        setFileName(name);
        setSelectedTeam("__all__");
        setSelectedOrigin("__all__");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to parse file");
        setParseResult(null);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const team = selectedTeam === "__all__" ? undefined : selectedTeam;
  const origin = selectedOrigin === "__all__" ? undefined : selectedOrigin;
  const teamLabel = selectedTeam === "__all__" ? "All Teams" : selectedTeam;

  // --- Per-origin arrival + forecast (always computed for blended AHT and All Origins staffing) ---
  const chatArrivalHourly = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern(parseResult.rows, team, "Chat");
  }, [parseResult, team]);

  const emailArrivalHourly = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern(parseResult.rows, team, "Email");
  }, [parseResult, team]);

  const chatForecastHourly = useMemo(() => {
    if (!chatArrivalHourly) return null;
    return forecastVolume(forecastModel, chatArrivalHourly.matrix, chatArrivalHourly.weeklyBreakdown);
  }, [chatArrivalHourly, forecastModel]);

  const emailForecastHourly = useMemo(() => {
    if (!emailArrivalHourly) return null;
    return forecastVolume(forecastModel, emailArrivalHourly.matrix, emailArrivalHourly.weeklyBreakdown);
  }, [emailArrivalHourly, forecastModel]);

  const chatArrival15 = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern15(parseResult.rows, team, "Chat");
  }, [parseResult, team]);

  const emailArrival15 = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern15(parseResult.rows, team, "Email");
  }, [parseResult, team]);

  const chatForecast15 = useMemo(() => {
    if (!chatArrival15) return null;
    return forecastVolume(forecastModel, chatArrival15.matrix, chatArrival15.weeklyBreakdown);
  }, [chatArrival15, forecastModel]);

  const emailForecast15 = useMemo(() => {
    if (!emailArrival15) return null;
    return forecastVolume(forecastModel, emailArrival15.matrix, emailArrival15.weeklyBreakdown);
  }, [emailArrival15, forecastModel]);

  // Volume-weighted blended AHT
  const effectiveAht = useMemo(() => {
    if (isChat) return staffingParams.chatAhtSeconds;
    if (isEmail) return staffingParams.emailAhtSeconds;
    const chatVol = chatForecastHourly ? getMatrixTotal(chatForecastHourly) : 0;
    const emailVol = emailForecastHourly ? getMatrixTotal(emailForecastHourly) : 0;
    const total = chatVol + emailVol;
    if (total === 0) return Math.round((staffingParams.chatAhtSeconds + staffingParams.emailAhtSeconds) / 2);
    return Math.round(
      (chatVol * staffingParams.chatAhtSeconds + emailVol * staffingParams.emailAhtSeconds) / total
    );
  }, [isChat, isEmail, staffingParams.chatAhtSeconds, staffingParams.emailAhtSeconds, chatForecastHourly, emailForecastHourly]);

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
    return computeArrivalPattern(parseResult.rows, team, origin);
  }, [parseResult, team, origin]);

  const forecastMatrix = useMemo(() => {
    if (!arrivalData) return null;
    return forecastVolume(forecastModel, arrivalData.matrix, arrivalData.weeklyBreakdown);
  }, [arrivalData, forecastModel]);

  const staffingMatrix = useMemo(() => {
    if (!forecastMatrix) return null;
    if (isAll && chatForecastHourly && emailForecastHourly) {
      return calculateBlendedStaffing(
        chatForecastHourly, emailForecastHourly,
        { ...staffingParams, intervalMinutes: 60 },
        staffingParams.chatAhtSeconds, staffingParams.emailAhtSeconds,
      );
    }
    return calculateStaffing(staffingModel, forecastMatrix, { ...mainParams, intervalMinutes: 60 }, isChat);
  }, [forecastMatrix, staffingModel, mainParams, isChat, isAll, chatForecastHourly, emailForecastHourly, staffingParams]);

  // --- 15-min pipeline (96x7) ---
  const arrivalData15 = useMemo(() => {
    if (!parseResult) return null;
    return computeArrivalPattern15(parseResult.rows, team, origin);
  }, [parseResult, team, origin]);

  const forecastMatrix15 = useMemo(() => {
    if (!arrivalData15) return null;
    return forecastVolume(forecastModel, arrivalData15.matrix, arrivalData15.weeklyBreakdown);
  }, [arrivalData15, forecastModel]);

  const staffingMatrix15 = useMemo(() => {
    if (!forecastMatrix15) return null;
    if (isAll && chatForecast15 && emailForecast15) {
      return calculateBlendedStaffing(
        chatForecast15, emailForecast15,
        { ...staffingParams, intervalMinutes: 15 },
        staffingParams.chatAhtSeconds, staffingParams.emailAhtSeconds,
      );
    }
    return calculateStaffing(staffingModel, forecastMatrix15, { ...mainParams, intervalMinutes: 15 }, isChat);
  }, [forecastMatrix15, staffingModel, mainParams, isChat, isAll, chatForecast15, emailForecast15, staffingParams]);

  // --- Per-origin 15-min staffing for Labor Plan ---
  const chatStaffing15 = useMemo(() => {
    if (!chatForecast15) return null;
    return calculateStaffing("erlang_c", chatForecast15, { ...chatParams, intervalMinutes: 15 }, true);
  }, [chatForecast15, chatParams]);

  const emailStaffing15 = useMemo(() => {
    if (!emailForecast15) return null;
    return calculateStaffing("workload_spread", emailForecast15, { ...emailParams, intervalMinutes: 15 }, false);
  }, [emailForecast15, emailParams]);

  // --- Labels ---
  const activeForecastLabel = FORECAST_MODELS.find((m) => m.id === forecastModel)?.label ?? "";
  const activeStaffingLabel = isAll
    ? "Blended (Erlang-C + Workload Spread)"
    : (STAFFING_MODELS.find((m) => m.id === staffingModel)?.label ?? "");
  const filterParts: string[] = [];
  if (selectedTeam !== "__all__") filterParts.push(selectedTeam);
  if (selectedOrigin !== "__all__") filterParts.push(selectedOrigin);
  const filterLabel = filterParts.length > 0 ? ` \u2014 ${filterParts.join(" / ")}` : "";
  const concLabel = isChat && staffingParams.concurrency > 1 ? `, Concurrency: ${staffingParams.concurrency}` : "";

  const ahtLabel = isChat
    ? `Chat AHT ${staffingParams.chatAhtSeconds}s`
    : isEmail
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
    return getForecastWeekDates(aData.weeklyBreakdown);
  }, [aData]);

  const forecastDatesLong = useMemo(() => {
    if (!aData) return undefined;
    return getForecastWeekDatesLong(aData.weeklyBreakdown);
  }, [aData]);

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
          <FileUpload onFileLoaded={handleFileLoaded} isLoading={isLoading} fileName={fileName} />
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400">
              {error}
            </div>
          )}
          {parseResult && (
            <FilterBar
              teams={parseResult.teams}
              selectedTeam={selectedTeam}
              onTeamChange={setSelectedTeam}
              origins={parseResult.origins}
              selectedOrigin={selectedOrigin}
              onOriginChange={handleOriginChange}
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

            {hasData && (
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
                    subtitle={`${activeForecastLabel}${filterLabel} (${intervalLabel})`}
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
