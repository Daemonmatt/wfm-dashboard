import { ArrivalMatrix } from "./arrival";

export type StaffingModel = "erlang_c" | "erlang_a" | "simple_ratio" | "occupancy" | "production_rate" | "workload" | "workload_spread" | "workload_spread_back";

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
    description: "HC = ⌈(volume × AHT) / (interval × occupancy)⌉ / (1 − shrinkage)",
  },
  {
    id: "workload_spread",
    label: "Workload Spread (Forward)",
    description: "Spreads email workload forward across intervals when AHT > interval, then calculates FTE",
  },
  {
    id: "workload_spread_back",
    label: "Workload Spread (Backward)",
    description: "Rolling average of raw workload over a dynamic window of ceil(AHT/interval)+1 slots",
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
  const occ = p.occupancyPct > 0 ? p.occupancyPct : 0.85;
  const rawBeforeShrink = (volume * aht) / (interval * occ);
  return Math.ceil(rawBeforeShrink / (1 - p.shrinkagePct));
}

/**
 * Workload Spread: distributes email work forward across intervals when AHT
 * exceeds the interval length. Operates per-day across all slots.
 *
 * For each slot where emails arrive:
 *   total_work = volume × AHT (seconds)
 *   spread that work across ceil(AHT / interval) consecutive slots,
 *   proportional to how much time falls in each slot.
 *
 * After spreading, convert cumulative workload per slot to HC:
 *   HC = ceil( spread_work / (interval × occupancy) / (1 − shrinkage) )
 */
function calculateWorkloadSpread(
  forecastMatrix: ArrivalMatrix,
  params: StaffingParams,
): ArrivalMatrix {
  const slots = forecastMatrix.length;
  const intervalSec = params.intervalMinutes * 60;
  const aht = params.ahtSeconds;
  const occ = params.occupancyPct > 0 ? params.occupancyPct : 0.85;
  const shrink = params.shrinkagePct;

  const result: ArrivalMatrix = Array.from({ length: slots }, () => Array(7).fill(0));

  for (let d = 0; d < 7; d++) {
    const spreadWork = new Array(slots).fill(0);

    for (let s = 0; s < slots; s++) {
      const vol = forecastMatrix[s][d];
      if (vol <= 0) continue;

      const totalWork = vol * aht;
      let remaining = totalWork;
      let target = s;

      while (remaining > 0 && target < slots) {
        const chunk = Math.min(remaining, intervalSec);
        spreadWork[target] += chunk;
        remaining -= chunk;
        target++;
      }
    }

    for (let s = 0; s < slots; s++) {
      if (spreadWork[s] <= 0) {
        result[s][d] = 0;
        continue;
      }
      const rawFte = spreadWork[s] / (intervalSec * occ);
      result[s][d] = Math.ceil(rawFte / (1 - shrink));
    }
  }

  return result;
}

/**
 * Workload Spread (Backward): rolling average of raw workload over a
 * dynamic window. Window size N = ceil(AHT / interval) + 1 (includes
 * current slot + preceding slots that the work spans).
 *
 * For each slot s:
 *   start = max(0, s - N + 1)
 *   spreadWork[s] = sum(rawWork[start..s]) / N
 *   HC = ceil( spreadWork / (interval × occupancy) / (1 − shrinkage) )
 */
function calculateWorkloadSpreadBack(
  forecastMatrix: ArrivalMatrix,
  params: StaffingParams,
): ArrivalMatrix {
  const slots = forecastMatrix.length;
  const intervalSec = params.intervalMinutes * 60;
  const aht = params.ahtSeconds;
  const occ = params.occupancyPct > 0 ? params.occupancyPct : 0.85;
  const shrink = params.shrinkagePct;
  const N = Math.ceil(aht / intervalSec) + 1;

  const result: ArrivalMatrix = Array.from({ length: slots }, () => Array(7).fill(0));

  for (let d = 0; d < 7; d++) {
    const rawWork = new Array(slots).fill(0);
    for (let s = 0; s < slots; s++) {
      rawWork[s] = forecastMatrix[s][d] * aht;
    }

    for (let s = 0; s < slots; s++) {
      const start = Math.max(0, s - N + 1);
      let sum = 0;
      for (let i = start; i <= s; i++) {
        sum += rawWork[i];
      }
      const spreadWork = sum / N;
      if (spreadWork <= 0) {
        result[s][d] = 0;
        continue;
      }
      const rawFte = spreadWork / (intervalSec * occ);
      result[s][d] = Math.ceil(rawFte / (1 - shrink));
    }
  }

  return result;
}

const MODEL_FNS: Record<StaffingModel, (v: number, p: StaffingParams) => number> = {
  erlang_c: erlangCAgents,
  erlang_a: erlangAAgents,
  simple_ratio: simpleRatioAgents,
  occupancy: occupancyAgents,
  production_rate: productionRateAgents,
  workload: workloadAgents,
  workload_spread: workloadAgents,
  workload_spread_back: workloadAgents,
};

export function calculateStaffing(
  model: StaffingModel,
  forecastMatrix: ArrivalMatrix,
  params: StaffingParams,
  applyConcurrency: boolean
): ArrivalMatrix {
  if (model === "workload_spread") {
    return calculateWorkloadSpread(forecastMatrix, params);
  }
  if (model === "workload_spread_back") {
    return calculateWorkloadSpreadBack(forecastMatrix, params);
  }

  const calcFn = MODEL_FNS[model];
  const conc = applyConcurrency && params.concurrency > 1 ? params.concurrency : 1;

  return forecastMatrix.map((row) =>
    row.map((volume) => {
      const raw = calcFn(volume, params);
      return conc > 1 ? Math.ceil(raw / conc) : raw;
    })
  );
}

/**
 * Blended staffing: runs Erlang-C on chat forecast + Workload Spread on email forecast,
 * then sums cell-by-cell. Used when "All Origins" is selected.
 */
export function calculateBlendedStaffing(
  chatForecast: ArrivalMatrix,
  emailForecast: ArrivalMatrix,
  params: StaffingParams,
  chatAhtSeconds: number,
  emailAhtSeconds: number,
): ArrivalMatrix {
  const chatP = { ...params, ahtSeconds: chatAhtSeconds };
  const emailP = { ...params, ahtSeconds: emailAhtSeconds };
  const conc = params.concurrency > 1 ? params.concurrency : 1;

  const emailSpread = calculateWorkloadSpreadBack(emailForecast, emailP);

  const slots = chatForecast.length;
  const result: ArrivalMatrix = Array.from({ length: slots }, () => Array(7).fill(0));

  for (let s = 0; s < slots; s++) {
    for (let d = 0; d < 7; d++) {
      const chatRaw = erlangCAgents(chatForecast[s][d], chatP);
      const chatHc = conc > 1 ? Math.ceil(chatRaw / conc) : chatRaw;
      result[s][d] = chatHc + emailSpread[s][d];
    }
  }
  return result;
}
