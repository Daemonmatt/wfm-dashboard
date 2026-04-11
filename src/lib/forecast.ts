import { ArrivalMatrix, WeeklyBreakdown } from "./arrival";

export type ForecastModel = "wma" | "holt_winters" | "sma" | "linear_regression" | "double_exp";

export const FORECAST_MODELS: { id: ForecastModel; label: string; description: string }[] = [
  {
    id: "wma",
    label: "Weighted Moving Average",
    description: "Weights recent weeks more heavily using exponential decay",
  },
  {
    id: "holt_winters",
    label: "Holt-Winters",
    description: "Triple exponential smoothing with weekly seasonality",
  },
  {
    id: "sma",
    label: "Simple Moving Average",
    description: "Straight arithmetic mean across all weeks",
  },
  {
    id: "linear_regression",
    label: "Linear Regression Trend",
    description: "Fits a least-squares trend line per hour/day slot and extrapolates",
  },
  {
    id: "double_exp",
    label: "Double Exponential Smoothing",
    description: "Holt's method with level and trend components, no seasonality",
  },
];

function simpleMovingAverage(arrivalMatrix: ArrivalMatrix): ArrivalMatrix {
  return arrivalMatrix.map((row) => [...row]);
}

function weightedMovingAverage(weeklyBreakdown: WeeklyBreakdown): ArrivalMatrix {
  const weeks = Object.keys(weeklyBreakdown).sort();
  const n = weeks.length;
  if (n === 0) return Array.from({ length: 24 }, () => Array(7).fill(0));

  const alpha = 0.3;
  const rawWeights = weeks.map((_, i) => Math.pow(1 - alpha, n - 1 - i));
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map((w) => w / weightSum);

  const result: ArrivalMatrix = Array.from({ length: 24 }, () => Array(7).fill(0));
  for (let wi = 0; wi < n; wi++) {
    const wd = weeklyBreakdown[weeks[wi]];
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < 7; d++) {
        result[h][d] += wd[h][d] * weights[wi];
      }
    }
  }
  for (let h = 0; h < 24; h++) for (let d = 0; d < 7; d++) result[h][d] = Math.round(result[h][d]);
  return result;
}

function holtWinters(weeklyBreakdown: WeeklyBreakdown): ArrivalMatrix {
  const weeks = Object.keys(weeklyBreakdown).sort();
  const n = weeks.length;
  if (n === 0) return Array.from({ length: 24 }, () => Array(7).fill(0));

  const result: ArrivalMatrix = Array.from({ length: 24 }, () => Array(7).fill(0));
  const SEASON = 7;
  const alphaHW = 0.3, beta = 0.1, gamma = 0.3;

  for (let h = 0; h < 24; h++) {
    const series: number[] = [];
    for (const wk of weeks) for (let d = 0; d < 7; d++) series.push(weeklyBreakdown[wk][h][d]);

    const T = series.length;
    if (T < SEASON) {
      for (let d = 0; d < 7; d++) {
        let sum = 0, cnt = 0;
        for (const wk of weeks) { sum += weeklyBreakdown[wk][h][d]; cnt++; }
        result[h][d] = cnt > 0 ? Math.round(sum / cnt) : 0;
      }
      continue;
    }

    let level = series.slice(0, SEASON).reduce((a, b) => a + b, 0) / SEASON;
    let trend = 0;
    if (T >= 2 * SEASON) {
      const m1 = series.slice(0, SEASON).reduce((a, b) => a + b, 0) / SEASON;
      const m2 = series.slice(SEASON, 2 * SEASON).reduce((a, b) => a + b, 0) / SEASON;
      trend = (m2 - m1) / SEASON;
    }

    const seasonal = new Array(SEASON);
    for (let i = 0; i < SEASON; i++) seasonal[i] = series[i] - level;

    for (let t = 0; t < T; t++) {
      const si = t % SEASON;
      const prevLevel = level;
      level = alphaHW * (series[t] - seasonal[si]) + (1 - alphaHW) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      seasonal[si] = gamma * (series[t] - level) + (1 - gamma) * seasonal[si];
    }

    for (let d = 0; d < 7; d++) {
      result[h][d] = Math.max(0, Math.round(level + (d + 1) * trend + seasonal[d % SEASON]));
    }
  }
  return result;
}

/**
 * Linear Regression Trend: for each (hour, day) slot, fit a least-squares
 * line through the weekly values and extrapolate one step ahead.
 */
function linearRegression(weeklyBreakdown: WeeklyBreakdown): ArrivalMatrix {
  const weeks = Object.keys(weeklyBreakdown).sort();
  const n = weeks.length;
  if (n === 0) return Array.from({ length: 24 }, () => Array(7).fill(0));

  const result: ArrivalMatrix = Array.from({ length: 24 }, () => Array(7).fill(0));

  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      const ys = weeks.map((wk) => weeklyBreakdown[wk][h][d]);
      const xMean = (n - 1) / 2;
      const yMean = ys.reduce((a, b) => a + b, 0) / n;

      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (i - xMean) * (ys[i] - yMean);
        den += (i - xMean) * (i - xMean);
      }
      const slope = den !== 0 ? num / den : 0;
      const intercept = yMean - slope * xMean;
      result[h][d] = Math.max(0, Math.round(slope * n + intercept));
    }
  }
  return result;
}

/**
 * Double Exponential Smoothing (Holt's method): tracks level + trend
 * without seasonality. Applied per (hour, day) slot across weeks.
 */
function doubleExponentialSmoothing(weeklyBreakdown: WeeklyBreakdown): ArrivalMatrix {
  const weeks = Object.keys(weeklyBreakdown).sort();
  const n = weeks.length;
  if (n === 0) return Array.from({ length: 24 }, () => Array(7).fill(0));

  const alpha = 0.3, beta = 0.2;
  const result: ArrivalMatrix = Array.from({ length: 24 }, () => Array(7).fill(0));

  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      const ys = weeks.map((wk) => weeklyBreakdown[wk][h][d]);

      let level = ys[0];
      let trend = n >= 2 ? ys[1] - ys[0] : 0;

      for (let i = 1; i < n; i++) {
        const prevLevel = level;
        level = alpha * ys[i] + (1 - alpha) * (prevLevel + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
      }

      result[h][d] = Math.max(0, Math.round(level + trend));
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
    case "linear_regression":
      return linearRegression(weeklyBreakdown);
    case "double_exp":
      return doubleExponentialSmoothing(weeklyBreakdown);
    default:
      return simpleMovingAverage(arrivalMatrix);
  }
}
