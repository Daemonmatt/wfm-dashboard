const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

export { DAY_ORDER, HOUR_LABELS };

export function parseData(rows) {
  const colNames = Object.keys(rows[0] || {});
  const normalised = colNames.map(c => ({ orig: c, norm: c.trim().toLowerCase().replace(/\s+/g, '_') }));

  const dtPriority = ['created_at', 'timestamp', 'date', 'datetime', 'created', 'time', 'createdat', 'date_time'];
  let dtCol = null;
  for (const candidate of dtPriority) {
    const found = normalised.find(c => c.norm === candidate);
    if (found) { dtCol = found.orig; break; }
  }
  if (!dtCol) {
    for (const { orig } of normalised) {
      const sample = rows.slice(0, 20).map(r => new Date(r[orig]));
      if (sample.filter(d => !isNaN(d.getTime())).length > 10) { dtCol = orig; break; }
    }
  }
  if (!dtCol) return { error: 'No datetime column found. Please ensure your file has a created_at column.' };

  const teamCol = normalised.find(c => c.norm === 'team')?.orig;

  const parsed = [];
  for (const row of rows) {
    const d = new Date(row[dtCol]);
    if (isNaN(d.getTime())) continue;
    parsed.push({
      created_at: d,
      team: teamCol ? String(row[teamCol]).trim() : 'All',
    });
  }

  return { data: parsed, dtCol, teamCol: teamCol || null };
}

export function buildArrivalPattern(records) {
  const counts = {};
  const dayCounts = {};

  for (const r of records) {
    const d = r.created_at;
    const dayName = DAY_ORDER[d.getDay()];
    const hour = d.getHours();
    const dateStr = d.toISOString().slice(0, 10);

    const key = `${hour}_${dayName}`;
    counts[key] = (counts[key] || 0) + 1;

    if (!dayCounts[dayName]) dayCounts[dayName] = new Set();
    dayCounts[dayName].add(dateStr);
  }

  const table = [];
  for (let h = 0; h < 24; h++) {
    const row = { hour: HOUR_LABELS[h] };
    for (const day of DAY_ORDER) {
      const key = `${h}_${day}`;
      const total = counts[key] || 0;
      const nDays = dayCounts[day]?.size || 1;
      row[day] = Math.round((total / nDays) * 10) / 10;
    }
    table.push(row);
  }
  return table;
}

export function generateSampleData(n = 8000, days = 90) {
  const hourWeights = [1, 0.5, 0.5, 0.5, 0.5, 1, 2, 4, 6, 8, 9, 8, 7, 6, 7, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.5];
  const total = hourWeights.reduce((a, b) => a + b, 0);
  const hourCdf = [];
  let cum = 0;
  for (const w of hourWeights) { cum += w / total; hourCdf.push(cum); }

  const dowWeights = { 0: 0.3, 1: 1.3, 2: 1.2, 3: 1.15, 4: 1.1, 5: 1.0, 6: 0.5 };
  const teams = ['Support', 'Sales', 'Tech'];
  const teamWeights = [0.5, 0.3, 0.2];
  const teamCdf = [];
  cum = 0;
  for (const w of teamWeights) { cum += w; teamCdf.push(cum); }

  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  const records = [];

  for (let i = 0; i < n; i++) {
    const dayOff = Math.floor(Math.random() * days);
    const base = new Date(start.getTime() + dayOff * 86400000);
    const dow = base.getDay();
    if (Math.random() > (dowWeights[dow] || 1)) continue;

    const rh = Math.random();
    let hour = 0;
    for (let h = 0; h < 24; h++) { if (rh <= hourCdf[h]) { hour = h; break; } }

    const rt = Math.random();
    let team = teams[2];
    for (let t = 0; t < teams.length; t++) { if (rt <= teamCdf[t]) { team = teams[t]; break; } }

    const dt = new Date(base);
    dt.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
    records.push({ created_at: dt, team });
  }
  return records;
}
