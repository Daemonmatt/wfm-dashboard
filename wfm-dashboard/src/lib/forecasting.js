import { DAY_ORDER, HOUR_LABELS } from './dataProcessing';

function buildHourlySeries(records) {
  if (!records.length) return [];
  const sorted = [...records].sort((a, b) => a.created_at - b.created_at);
  const minH = new Date(sorted[0].created_at);
  minH.setMinutes(0, 0, 0);
  const maxH = new Date(sorted[sorted.length - 1].created_at);
  maxH.setMinutes(0, 0, 0);

  const counts = {};
  for (const r of sorted) {
    const h = new Date(r.created_at);
    h.setMinutes(0, 0, 0);
    const key = h.getTime();
    counts[key] = (counts[key] || 0) + 1;
  }

  const series = [];
  for (let t = minH.getTime(); t <= maxH.getTime(); t += 3600000) {
    series.push({ ts: t, value: counts[t] || 0 });
  }
  return series;
}

function tripleExponentialSmoothing(series, seasonLen, alpha, beta, gamma, steps) {
  const n = series.length;
  if (n < 2 * seasonLen) return simpleMovingAverage(series, steps);

  const level = new Array(n).fill(0);
  const trend = new Array(n).fill(0);
  const seasonal = new Array(n + steps).fill(0);

  let initLevel = 0;
  for (let i = 0; i < seasonLen; i++) initLevel += series[i];
  initLevel /= seasonLen;
  level[0] = initLevel;

  let initTrend = 0;
  for (let i = 0; i < seasonLen; i++) initTrend += (series[seasonLen + i] - series[i]);
  initTrend /= (seasonLen * seasonLen);
  trend[0] = initTrend;

  for (let i = 0; i < seasonLen; i++) {
    seasonal[i] = series[i] - initLevel;
  }

  for (let i = 1; i < n; i++) {
    const val = series[i];
    level[i] = alpha * (val - seasonal[i % seasonLen]) + (1 - alpha) * (level[i - 1] + trend[i - 1]);
    trend[i] = beta * (level[i] - level[i - 1]) + (1 - beta) * trend[i - 1];
    seasonal[i + seasonLen] = gamma * (val - level[i]) + (1 - gamma) * seasonal[i % seasonLen + (i >= seasonLen ? seasonLen : 0)];
  }

  const forecast = [];
  for (let m = 1; m <= steps; m++) {
    const idx = n - 1;
    const fVal = level[idx] + m * trend[idx] + seasonal[idx + m - seasonLen * Math.floor((idx + m) / seasonLen) + seasonLen];
    forecast.push(Math.max(0, fVal));
  }
  return forecast;
}

function simpleMovingAverage(series, steps) {
  const n = series.length;
  const window = Math.min(168, n);
  const pattern = series.slice(-window);
  const forecast = [];
  for (let i = 0; i < steps; i++) {
    forecast.push(Math.max(0, pattern[i % pattern.length]));
  }
  return forecast;
}

function arimaLike(series, steps) {
  const n = series.length;
  if (n < 3) return new Array(steps).fill(0);

  const diff = [];
  for (let i = 1; i < n; i++) diff.push(series[i] - series[i - 1]);

  const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
  let lastVal = series[n - 1];
  const forecast = [];
  const decay = 0.95;

  for (let i = 0; i < steps; i++) {
    lastVal += mean * Math.pow(decay, i);
    forecast.push(Math.max(0, lastVal));
  }
  return forecast;
}

function reshapeToTable(forecastValues, startTs) {
  const table = [];
  const dayBuckets = {};

  for (let i = 0; i < forecastValues.length; i++) {
    const ts = new Date(startTs + (i + 1) * 3600000);
    const dayName = DAY_ORDER[ts.getDay()];
    const hour = ts.getHours();
    if (!dayBuckets[`${hour}_${dayName}`]) dayBuckets[`${hour}_${dayName}`] = [];
    dayBuckets[`${hour}_${dayName}`].push(forecastValues[i]);
  }

  for (let h = 0; h < 24; h++) {
    const row = { hour: HOUR_LABELS[h] };
    for (const day of DAY_ORDER) {
      const vals = dayBuckets[`${h}_${day}`] || [];
      row[day] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
    }
    table.push(row);
  }
  return table;
}

export function forecastArrivalPattern(records, arrivalPattern, modelKey = 'hw') {
  const series = buildHourlySeries(records);
  if (series.length < 48) return arrivalPattern;

  const values = series.map(s => s.value);
  const lastTs = series[series.length - 1].ts;
  const steps = 168;

  let forecast;
  try {
    if (modelKey === 'hw') {
      const sp = values.length >= 336 ? 168 : 24;
      forecast = tripleExponentialSmoothing(values, sp, 0.3, 0.1, 0.1, steps);
    } else if (modelKey === 'arima') {
      forecast = arimaLike(values, steps);
    } else {
      forecast = simpleMovingAverage(values, steps);
    }
  } catch {
    forecast = simpleMovingAverage(values, steps);
  }

  return reshapeToTable(forecast, lastTs);
}

export const FORECAST_MODELS = {
  'Holt-Winters (recommended)': 'hw',
  'ARIMA': 'arima',
  'Weighted Moving Average': 'wma',
};
