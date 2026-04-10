import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DAY_ORDER } from '../lib/dataProcessing';

const DAY_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];

const tooltipStyle = {
  contentStyle: { background: '#1E293B', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#F1F5F9', fontSize: 12 },
  labelStyle: { color: '#94A3B8' },
};

export function WeeklyTotalChart({ data, title, color = '#3B82F6' }) {
  const days = DAY_ORDER.filter(d => data[0]?.[d] !== undefined);
  const chartData = days.map(day => ({
    day: day.slice(0, 3),
    total: Math.round(data.reduce((s, r) => s + (r[day] || 0), 0)),
  }));

  return (
    <div>
      <h4 className="text-text-main font-semibold text-sm mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
          <XAxis dataKey="day" tick={{ fill: '#94A3B8', fontSize: 11 }} />
          <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="total" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DayComparisonChart({ arrival, forecast, day }) {
  const chartData = arrival.map((row, i) => ({
    hour: row.hour,
    actual: row[day] || 0,
    forecast: forecast[i]?.[day] || 0,
  }));

  return (
    <div>
      <h4 className="text-text-main font-semibold text-sm mb-3">{day} — Actual vs Forecast</h4>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
          <XAxis dataKey="hour" tick={{ fill: '#94A3B8', fontSize: 9 }} interval={2} />
          <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
          <Bar dataKey="actual" fill="#3B82F6" radius={[3, 3, 0, 0]} name="Actual Avg" />
          <Bar dataKey="forecast" fill="#F59E0B" radius={[3, 3, 0, 0]} name="Forecast" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HCOverlayChart({ hcTable }) {
  const days = DAY_ORDER.filter(d => hcTable[0]?.[d] !== undefined);

  return (
    <div>
      <h4 className="text-text-main font-semibold text-sm mb-3">HC Required by Hour (all days)</h4>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={hcTable}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
          <XAxis dataKey="hour" tick={{ fill: '#94A3B8', fontSize: 9 }} interval={2} />
          <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
          {days.map((day, i) => (
            <Line
              key={day} type="monotone" dataKey={day} name={day.slice(0, 3)}
              stroke={DAY_COLORS[i % DAY_COLORS.length]} strokeWidth={2}
              dot={{ r: 2 }} activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
