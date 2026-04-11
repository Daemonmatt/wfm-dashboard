"use client";

import { useState, useMemo, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import FilterBar from "@/components/FilterBar";
import ArrivalTable from "@/components/ArrivalTable";
import DistributionTable from "@/components/DistributionTable";
import SummaryCards from "@/components/SummaryCards";
import { parseFile, ParseResult } from "@/lib/parser";
import { computeArrivalPattern } from "@/lib/arrival";
import { ForecastModel, forecastVolume, FORECAST_MODELS } from "@/lib/forecast";
import {
  StaffingModel,
  calculateStaffing,
  StaffingParams,
  DEFAULT_STAFFING_PARAMS,
  STAFFING_MODELS,
} from "@/lib/staffing";

export default function Home() {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTeam, setSelectedTeam] = useState("__all__");
  const [selectedOrigin, setSelectedOrigin] = useState("__all__");
  const [forecastModel, setForecastModel] = useState<ForecastModel>("wma");
  const [staffingModel, setStaffingModel] = useState<StaffingModel>("erlang_c");
  const [staffingParams, setStaffingParams] = useState<StaffingParams>(
    DEFAULT_STAFFING_PARAMS
  );

  const isChat = selectedOrigin.toLowerCase() === "chat";

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

  const arrivalData = useMemo(() => {
    if (!parseResult) return null;
    const team = selectedTeam === "__all__" ? undefined : selectedTeam;
    const origin = selectedOrigin === "__all__" ? undefined : selectedOrigin;
    return computeArrivalPattern(parseResult.rows, team, origin);
  }, [parseResult, selectedTeam, selectedOrigin]);

  const forecastMatrix = useMemo(() => {
    if (!arrivalData) return null;
    return forecastVolume(forecastModel, arrivalData.matrix, arrivalData.weeklyBreakdown);
  }, [arrivalData, forecastModel]);

  const staffingMatrix = useMemo(() => {
    if (!forecastMatrix) return null;
    return calculateStaffing(staffingModel, forecastMatrix, staffingParams, isChat);
  }, [forecastMatrix, staffingModel, staffingParams, isChat]);

  const activeForecastLabel = FORECAST_MODELS.find((m) => m.id === forecastModel)?.label ?? "";
  const activeStaffingLabel = STAFFING_MODELS.find((m) => m.id === staffingModel)?.label ?? "";
  const filterParts: string[] = [];
  if (selectedTeam !== "__all__") filterParts.push(selectedTeam);
  if (selectedOrigin !== "__all__") filterParts.push(selectedOrigin);
  const filterLabel = filterParts.length > 0 ? ` \u2014 ${filterParts.join(" / ")}` : "";

  const concLabel = isChat && staffingParams.concurrency > 1
    ? `, Concurrency: ${staffingParams.concurrency}`
    : "";

  return (
    <div className="min-h-screen bg-[#f8f9fb] dark:bg-zinc-950 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto max-w-[1920px] px-6 lg:px-8">
          <div className="flex h-12 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold">
                W
              </div>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                WFM Dashboard
              </span>
            </div>
            {parseResult && (
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                  {parseResult.totalRows.toLocaleString()}
                </span>
                <span>records</span>
                <span className="mx-1 text-zinc-300 dark:text-zinc-700">/</span>
                <span>{parseResult.dateRange.min.toLocaleDateString()} &ndash; {parseResult.dateRange.max.toLocaleDateString()}</span>
                <span className="mx-1 text-zinc-300 dark:text-zinc-700">/</span>
                <span>{parseResult.teams.length} teams</span>
                {arrivalData && (
                  <>
                    <span className="mx-1 text-zinc-300 dark:text-zinc-700">/</span>
                    <span>{arrivalData.weekCount} weeks</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1920px] px-6 lg:px-8 py-5 space-y-4">
        {/* Controls */}
        <section className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3 dark:border-zinc-800 dark:bg-zinc-900">
          <FileUpload onFileLoaded={handleFileLoaded} isLoading={isLoading} fileName={fileName} />
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400">
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
              onOriginChange={setSelectedOrigin}
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
            <div className="h-12 w-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Upload your data to get started</p>
            <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500 max-w-md leading-relaxed">
              Drop an Excel or CSV file with <code className="bg-zinc-100 dark:bg-zinc-800 rounded px-1 text-[11px] font-mono">created_at</code> and <code className="bg-zinc-100 dark:bg-zinc-800 rounded px-1 text-[11px] font-mono">team</code> columns.
            </p>
          </div>
        )}

        {/* Dashboard content */}
        {arrivalData && forecastMatrix && staffingMatrix && (
          <div className="space-y-4">
            <SummaryCards
              arrivalMatrix={arrivalData.matrix}
              forecastMatrix={forecastMatrix}
              staffingMatrix={staffingMatrix}
              weekCount={arrivalData.weekCount}
              totalRecords={parseResult!.totalRows}
            />

            {/* Row 1: Arrival + Distribution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ArrivalTable
                title="Volume Arrival Pattern"
                subtitle={`Avg weekly volume${filterLabel} (${arrivalData.weekCount} wk)`}
                matrix={arrivalData.matrix}
                colorScheme="blue"
              />
              <DistributionTable
                title="% Distribution"
                subtitle={`Hourly % of daily volume${filterLabel}`}
                matrix={arrivalData.matrix}
              />
            </div>

            {/* Row 2: Forecast + Headcount */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ArrivalTable
                title="Forecasted Volume"
                subtitle={`${activeForecastLabel}${filterLabel}`}
                matrix={forecastMatrix}
                colorScheme="emerald"
              />
              <ArrivalTable
                title="Headcount Required"
                subtitle={`${activeStaffingLabel} (AHT ${staffingParams.ahtSeconds}s, SL ${Math.round(staffingParams.serviceLevelPct * 100)}%, Shrink ${Math.round(staffingParams.shrinkagePct * 100)}%${concLabel})${filterLabel}`}
                matrix={staffingMatrix}
                colorScheme="amber"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
