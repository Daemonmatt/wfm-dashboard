import { ArrivalMatrix } from "./arrival";

export type StaffingModel = "erlang_c" | "simple_ratio";

export const STAFFING_MODELS: {
  id: StaffingModel;
  label: string;
  description: string;
}[] = [
  {
    id: "erlang_c",
    label: "Erlang-C",
    description:
      "Industry-standard model accounting for service level, AHT, and queueing probability",
  },
  {
    id: "simple_ratio",
    label: "Simple Ratio",
    description: "Volume x AHT / interval capacity, adjusted for shrinkage",
  },
];

export interface StaffingParams {
  ahtMinutes: number;
  serviceLevelPct: number;
  targetAnswerTimeSec: number;
  shrinkagePct: number;
  intervalMinutes: number;
  concurrency: number;
}

export const DEFAULT_STAFFING_PARAMS: StaffingParams = {
  ahtMinutes: 15,
  serviceLevelPct: 0.8,
  targetAnswerTimeSec: 60,
  shrinkagePct: 0.3,
  intervalMinutes: 60,
  concurrency: 1,
};

function erlangCProbability(trafficIntensity: number, agents: number): number {
  const A = trafficIntensity;
  const N = agents;
  if (N <= A) return 1;

  const logAn = N * Math.log(A) - logFactorial(N);
  const logDenomTerm = logAn + Math.log(N / (N - A));

  let sumTerms = 0;
  for (let k = 0; k < N; k++) {
    sumTerms += Math.exp(k * Math.log(A) - logFactorial(k));
  }

  const lastTerm = Math.exp(logDenomTerm);
  const pw = lastTerm / (sumTerms + lastTerm);
  return Math.min(1, Math.max(0, pw));
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

function erlangCServiceLevel(
  trafficIntensity: number,
  agents: number,
  targetAnswerTimeSec: number,
  ahtSec: number
): number {
  const pw = erlangCProbability(trafficIntensity, agents);
  return 1 - pw * Math.exp((-(agents - trafficIntensity) * targetAnswerTimeSec) / ahtSec);
}

function erlangCAgents(volume: number, params: StaffingParams): number {
  if (volume <= 0) return 0;

  const ahtSec = params.ahtMinutes * 60;
  const intervalSec = params.intervalMinutes * 60;
  const trafficIntensity = (volume * ahtSec) / intervalSec;

  let agents = Math.max(1, Math.ceil(trafficIntensity) + 1);
  const maxAgents = Math.ceil(trafficIntensity * 5) + 10;

  for (let n = agents; n <= maxAgents; n++) {
    const sl = erlangCServiceLevel(trafficIntensity, n, params.targetAnswerTimeSec, ahtSec);
    if (sl >= params.serviceLevelPct) {
      agents = n;
      break;
    }
    agents = n;
  }

  const withShrinkage = Math.ceil(agents / (1 - params.shrinkagePct));
  return withShrinkage;
}

function simpleRatioAgents(volume: number, params: StaffingParams): number {
  if (volume <= 0) return 0;
  const raw = (volume * params.ahtMinutes) / params.intervalMinutes;
  return Math.ceil(raw / (1 - params.shrinkagePct));
}

/**
 * Apply concurrency: when an agent handles multiple chats simultaneously,
 * the effective HC is reduced by dividing by the concurrency factor.
 */
export function calculateStaffing(
  model: StaffingModel,
  forecastMatrix: ArrivalMatrix,
  params: StaffingParams,
  applyConcurrency: boolean
): ArrivalMatrix {
  const calcFn = model === "erlang_c" ? erlangCAgents : simpleRatioAgents;
  const conc = applyConcurrency && params.concurrency > 1 ? params.concurrency : 1;

  return forecastMatrix.map((row) =>
    row.map((volume) => {
      const raw = calcFn(volume, params);
      return conc > 1 ? Math.ceil(raw / conc) : raw;
    })
  );
}
