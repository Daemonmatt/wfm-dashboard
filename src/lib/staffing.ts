import { ArrivalMatrix } from "./arrival";

export type StaffingModel = "erlang_c" | "erlang_a" | "simple_ratio" | "occupancy" | "production_rate" | "workload";

export const STAFFING_MODELS: {
  id: StaffingModel;
  label: string;
  description: string;
}[] = [
  {
    id: "erlang_c",
    label: "Erlang-C",
    description: "Industry-standard queueing model — assumes no abandonment",
  },
  {
    id: "erlang_a",
    label: "Erlang-A (Abandonments)",
    description: "Extension of Erlang-C that accounts for customer patience / abandonments",
  },
  {
    id: "simple_ratio",
    label: "Simple Ratio",
    description: "Volume x AHT / interval capacity, adjusted for shrinkage",
  },
  {
    id: "occupancy",
    label: "Occupancy-Based",
    description: "Targets a maximum agent occupancy rate",
  },
  {
    id: "production_rate",
    label: "Production Rate",
    description: "HC = volume / (cases per agent per hour), adjusted for shrinkage",
  },
  {
    id: "workload",
    label: "Workload",
    description: "HC = (volume × AHT) / (interval × utilization × (1 − shrinkage))",
  },
];

export interface StaffingParams {
  ahtSeconds: number;
  chatAhtSeconds: number;
  emailAhtSeconds: number;
  serviceLevelPct: number;
  targetAnswerTimeSec: number;
  shrinkagePct: number;
  occupancyPct: number;
  utilizationPct: number;
  intervalMinutes: number;
  concurrency: number;
}

export const DEFAULT_STAFFING_PARAMS: StaffingParams = {
  ahtSeconds: 900,
  chatAhtSeconds: 900,
  emailAhtSeconds: 900,
  serviceLevelPct: 0.8,
  targetAnswerTimeSec: 60,
  shrinkagePct: 0.3,
  occupancyPct: 0.85,
  utilizationPct: 0.85,
  intervalMinutes: 60,
  concurrency: 1,
};

// --- Shared math ---

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

function erlangCProbability(A: number, N: number): number {
  if (N <= A) return 1;
  const logAn = N * Math.log(A) - logFactorial(N);
  const logDenomTerm = logAn + Math.log(N / (N - A));
  let sumTerms = 0;
  for (let k = 0; k < N; k++) {
    sumTerms += Math.exp(k * Math.log(A) - logFactorial(k));
  }
  const lastTerm = Math.exp(logDenomTerm);
  return Math.min(1, Math.max(0, lastTerm / (sumTerms + lastTerm)));
}

function erlangCServiceLevel(A: number, N: number, tat: number, aht: number): number {
  const pw = erlangCProbability(A, N);
  return 1 - pw * Math.exp((-(N - A) * tat) / aht);
}

// --- Model implementations ---

function erlangCAgents(volume: number, p: StaffingParams): number {
  if (volume <= 0) return 0;
  const aht = p.ahtSeconds;
  const interval = p.intervalMinutes * 60;
  const A = (volume * aht) / interval;

  let agents = Math.max(1, Math.ceil(A) + 1);
  const cap = Math.ceil(A * 5) + 10;
  for (let n = agents; n <= cap; n++) {
    if (erlangCServiceLevel(A, n, p.targetAnswerTimeSec, aht) >= p.serviceLevelPct) {
      agents = n;
      break;
    }
    agents = n;
  }
  return Math.ceil(agents / (1 - p.shrinkagePct));
}

function erlangAAgents(volume: number, p: StaffingParams): number {
  if (volume <= 0) return 0;
  const aht = p.ahtSeconds;
  const interval = p.intervalMinutes * 60;
  const A = (volume * aht) / interval;
  const patience = p.targetAnswerTimeSec * 2;

  let agents = Math.max(1, Math.ceil(A) + 1);
  const cap = Math.ceil(A * 5) + 10;

  for (let n = agents; n <= cap; n++) {
    const pw = erlangCProbability(A, n);
    const abandonRate = pw * (1 - Math.exp(-(n - A) * patience / aht));
    const effectiveA = A * (1 - abandonRate * 0.5);
    const sl = 1 - erlangCProbability(effectiveA, n) *
      Math.exp((-(n - effectiveA) * p.targetAnswerTimeSec) / aht);
    if (sl >= p.serviceLevelPct) {
      agents = n;
      break;
    }
    agents = n;
  }
  return Math.ceil(agents / (1 - p.shrinkagePct));
}

function simpleRatioAgents(volume: number, p: StaffingParams): number {
  if (volume <= 0) return 0;
  const ahtMin = p.ahtSeconds / 60;
  const raw = (volume * ahtMin) / p.intervalMinutes;
  return Math.ceil(raw / (1 - p.shrinkagePct));
}

function occupancyAgents(volume: number, p: StaffingParams): number {
  if (volume <= 0) return 0;
  const aht = p.ahtSeconds;
  const interval = p.intervalMinutes * 60;
  const A = (volume * aht) / interval;
  const maxOcc = p.occupancyPct > 0 ? p.occupancyPct : 0.85;
  const raw = Math.ceil(A / maxOcc);
  return Math.ceil(raw / (1 - p.shrinkagePct));
}

function productionRateAgents(volume: number, p: StaffingParams): number {
  if (volume <= 0) return 0;
  const casesPerAgentPerHour = (p.intervalMinutes * 60) / p.ahtSeconds;
  const raw = volume / casesPerAgentPerHour;
  return Math.ceil(raw / (1 - p.shrinkagePct));
}

function workloadAgents(volume: number, p: StaffingParams): number {
  if (volume <= 0) return 0;
  const aht = p.ahtSeconds;
  const interval = p.intervalMinutes * 60;
  const util = p.utilizationPct > 0 ? p.utilizationPct : 0.85;
  const shrink = p.shrinkagePct;
  const raw = (volume * aht) / (interval * util * (1 - shrink));
  return Math.ceil(raw);
}

const MODEL_FNS: Record<StaffingModel, (v: number, p: StaffingParams) => number> = {
  erlang_c: erlangCAgents,
  erlang_a: erlangAAgents,
  simple_ratio: simpleRatioAgents,
  occupancy: occupancyAgents,
  production_rate: productionRateAgents,
  workload: workloadAgents,
};

export function calculateStaffing(
  model: StaffingModel,
  forecastMatrix: ArrivalMatrix,
  params: StaffingParams,
  applyConcurrency: boolean
): ArrivalMatrix {
  const calcFn = MODEL_FNS[model];
  const conc = applyConcurrency && params.concurrency > 1 ? params.concurrency : 1;

  return forecastMatrix.map((row) =>
    row.map((volume) => {
      const raw = calcFn(volume, params);
      return conc > 1 ? Math.ceil(raw / conc) : raw;
    })
  );
}
