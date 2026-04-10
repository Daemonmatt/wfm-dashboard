import { ArrivalMatrix, WeeklyBreakdown } from "./arrival";

export type ForecastModel = "wma" | "holt_winters" | "sma";

export const FORECAST_MODELS: { id: ForecastModel; label: string; description: string }[] = [
  {
    id: "wma",
    label: "Weighted Moving Average",
    description: "Weights recent weeks more heavily using exponential decay",
  },
  {
    id: "holt_winters",
    label: "Holt-Winters Exponential Smoothing",
    description: "Triple exponential smoothing with weekly seasonality",
  },
  {
    id: "sma",
    label: "Simple Moving Average",
    description: "Straight arithmetic mean across all weeks",
  },
];

/**
 * Simple Moving Average: the arrival pattern matrix itself is already the SMA.
 */
function simpleMovingAverage(arrivalMatrix: ArrivalMatrix): ArrivalMatrix {
  return arrivalMatrix.map((row) => [...row]);
}

/**
 * Weighted Moving Average: weight each week with exponentially decaying weights
 * (most recent week = highest weight).
 */
function weightedMovingAverage(
  weeklyBreakdown: WeeklyBreakdown
): ArrivalMatrix {
  const weeks = Object.keys(weeklyBreakdown).sort();
  const n = weeks.length;

  if (n === 0) return Array.from({ length: 24 }, () => Array(7).fill(0));

  // Exponential decay weights: most recent week gets highest weight
  const alpha = 0.3;
  const rawWeights = weeks.map((_, i) => Math.pow(1 - alpha, n - 1 - i));
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map((w) => w / weightSum);

  const result: ArrivalMatrix = Array.from({ length: 24 }, () =>
    Array(7).fill(0)
  );

  for (let wi = 0; wi < n; wi++) {
    const weekData = weeklyBreakdown[weeks[wi]];
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < 7; d++) {
        result[h][d] += weekData[h][d] * weights[wi];
      }
    }
  }

  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      result[h][d] = Math.round(result[h][d]);
    }
  }

  return result;
}

/**
 * Holt-Winters Triple Exponential Smoothing with additive seasonality.
 * Seasonality period = 7 (weekly cycle) applied per-hour.
 */
function holtWinters(weeklyBreakdown: WeeklyBreakdown): ArrivalMatrix {
  const weeks = Object.keys(weeklyBreakdown).sort();
  const n = weeks.length;

  if (n === 0) return Array.from({ length: 24 }, () => Array(7).fill(0));

  const result: ArrivalMatrix = Array.from({ length: 24 }, () =>
    Array(7).fill(0)
  );

  const SEASON = 7;
  const alphaHW = 0.3;
  const beta = 0.1;
  const gamma = 0.3;

  for (let h = 0; h < 24; h++) {
    // Build a time series: for each week, 7 daily values
    const series: number[] = [];
    for (const wk of weeks) {
      for (let d = 0; d < 7; d++) {
        series.push(weeklyBreakdown[wk][h][d]);
      }
    }

    const T = series.length;
    if (T < SEASON) {
      // Not enough data, fall back to simple average
      for (let d = 0; d < 7; d++) {
        let sum = 0;
        let cnt = 0;
        for (const wk of weeks) {
          sum += weeklyBreakdown[wk][h][d];
          cnt++;
        }
        result[h][d] = cnt > 0 ? Math.round(sum / cnt) : 0;
      }
      continue;
    }

    // Initialize level and trend from first season
    let level =
      series.slice(0, SEASON).reduce((a, b) => a + b, 0) / SEASON;
    let trend = 0;
    if (T >= 2 * SEASON) {
      const firstMean =
        series.slice(0, SEASON).reduce((a, b) => a + b, 0) / SEASON;
      const secondMean =
        series.slice(SEASON, 2 * SEASON).reduce((a, b) => a + b, 0) / SEASON;
      trend = (secondMean - firstMean) / SEASON;
    }

    // Initialize seasonal components
    const seasonal = new Array(SEASON);
    for (let i = 0; i < SEASON; i++) {
      seasonal[i] = series[i] - level;
    }

    // Run the smoothing
    const smoothed = new Array(T);
    for (let t = 0; t < T; t++) {
      const seasonIdx = t % SEASON;
      const value = series[t];

      const prevLevel = level;
      level =
        alphaHW * (value - seasonal[seasonIdx]) +
        (1 - alphaHW) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      seasonal[seasonIdx] =
        gamma * (value - level) + (1 - gamma) * seasonal[seasonIdx];
      smoothed[t] = level + trend + seasonal[seasonIdx];
    }

    // Forecast the next season (7 days ahead)
    for (let d = 0; d < 7; d++) {
      const forecast = level + (d + 1) * trend + seasonal[d % SEASON];
      result[h][d] = Math.max(0, Math.round(forecast));
    }
  }

  return result;
}

export function forecastVolume(
  model: ForecastModel,
  arrivalMatrix: ArrivalMatrix,
  weeklyBreakdown: WeeklyBreakdown
): ArrivalMatrix {
  switch (model) {
    case "sma":
      return simpleMovingAverage(arrivalMatrix);
    case "wma":
      return weightedMovingAverage(weeklyBreakdown);
    case "holt_winters":
      return holtWinters(weeklyBreakdown);
    default:
      return simpleMovingAverage(arrivalMatrix);
  }
}
