import { DAY_ORDER, HOUR_LABELS } from './dataProcessing';

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function erlangC(n, a) {
  if (n <= 0 || a <= 0) return 0;
  if (n <= a) return 1;
  try {
    let invB = 0;
    for (let k = 0; k < n; k++) invB += Math.pow(a, k) / factorial(k);
    const last = (Math.pow(a, n) / factorial(n)) * (n / (n - a));
    const ec = last / (invB + last);
    return Math.max(0, Math.min(ec, 1));
  } catch {
    return 1;
  }
}

function erlangCAgents(volume, ahtSeconds = 300, slTarget = 0.80, answerTime = 30, shrinkage = 0.30) {
  if (volume <= 0) return 0;
  const traffic = (volume * ahtSeconds) / 3600;
  const startAgents = Math.max(1, Math.ceil(traffic));

  for (let n = startAgents; n < startAgents + 500; n++) {
    if (n <= traffic) continue;
    const ec = erlangC(n, traffic);
    const sl = 1 - ec * Math.exp(-(n - traffic) * answerTime / ahtSeconds);
    if (sl >= slTarget) return Math.ceil(n / (1 - shrinkage));
  }
  return Math.ceil((traffic + 1) / (1 - shrinkage));
}

function productivityHC(volume, ahtMinutes = 5, utilization = 0.75, shrinkage = 0.30) {
  if (volume <= 0) return 0;
  return Math.ceil((volume * ahtMinutes) / (60 * utilization * (1 - shrinkage)));
}

export function computeHCTable(forecastTable, params = {}) {
  const {
    model = 'erlang_c',
    ahtSeconds = 300,
    serviceLevel = 0.80,
    targetAnswerTime = 30,
    shrinkage = 0.30,
    utilization = 0.75,
  } = params;

  return forecastTable.map(row => {
    const newRow = { hour: row.hour };
    for (const day of DAY_ORDER) {
      if (row[day] === undefined) continue;
      const vol = row[day];
      if (model === 'erlang_c') {
        newRow[day] = erlangCAgents(vol, ahtSeconds, serviceLevel, targetAnswerTime, shrinkage);
      } else {
        newRow[day] = productivityHC(vol, ahtSeconds / 60, utilization, shrinkage);
      }
    }
    return newRow;
  });
}

export const STAFFING_MODELS = {
  'Erlang-C (recommended)': 'erlang_c',
  'Simple Productivity': 'productivity',
};
