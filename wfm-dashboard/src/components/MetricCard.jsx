export default function MetricCard({ value, label, icon }) {
  return (
    <div className="bg-gradient-to-br from-bg-card to-bg-dark border border-primary/15 rounded-xl
                    px-5 py-4 text-center shadow-lg hover:-translate-y-0.5 transition-transform">
      {icon && <div className="text-2xl mb-1">{icon}</div>}
      <div className="text-2xl font-bold text-primary leading-tight">{value}</div>
      <div className="text-xs text-text-sub uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
