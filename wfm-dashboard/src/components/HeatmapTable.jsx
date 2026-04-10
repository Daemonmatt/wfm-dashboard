import { DAY_ORDER } from '../lib/dataProcessing';

function getColor(value, max, palette) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const colors = {
    blue:   { r: 59, g: 130, b: 246 },
    orange: { r: 245, g: 158, b: 11 },
    green:  { r: 16, g: 185, b: 129 },
  };
  const c = colors[palette] || colors.blue;
  const alpha = 0.08 + ratio * 0.55;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

export default function HeatmapTable({ data, title, palette = 'blue', format = 'float' }) {
  if (!data || data.length === 0) return null;

  const days = DAY_ORDER.filter(d => data[0]?.[d] !== undefined);
  const allValues = data.flatMap(row => days.map(d => row[d] || 0));
  const maxVal = Math.max(...allValues, 1);

  return (
    <div className="overflow-x-auto">
      {title && (
        <h3 className="text-text-main font-semibold text-base mb-3 border-l-3 border-primary pl-3">
          {title}
        </h3>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-bg-dark z-10 px-3 py-2.5 text-left text-text-sub font-medium text-xs uppercase tracking-wider border-b border-bg-surface">
              Hour
            </th>
            {days.map(day => (
              <th key={day} className="px-3 py-2.5 text-center text-text-sub font-medium text-xs uppercase tracking-wider border-b border-bg-surface min-w-[90px]">
                {day.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
              <td className="sticky left-0 bg-bg-dark z-10 px-3 py-2 text-text-sub font-mono text-xs border-b border-bg-surface/50">
                {row.hour}
              </td>
              {days.map(day => {
                const val = row[day] || 0;
                return (
                  <td
                    key={day}
                    className="px-3 py-2 text-center font-mono text-xs border-b border-bg-surface/50 transition-colors"
                    style={{ backgroundColor: getColor(val, maxVal, palette) }}
                  >
                    <span className="text-text-main font-medium">
                      {format === 'int' ? Math.round(val) : val.toFixed(1)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-bg-card/50">
            <td className="sticky left-0 bg-bg-card z-10 px-3 py-2 text-text-sub font-semibold text-xs border-t border-bg-surface">
              Total
            </td>
            {days.map(day => {
              const total = data.reduce((sum, row) => sum + (row[day] || 0), 0);
              return (
                <td key={day} className="px-3 py-2 text-center font-mono text-xs font-semibold text-primary border-t border-bg-surface">
                  {format === 'int' ? Math.round(total) : total.toFixed(1)}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
