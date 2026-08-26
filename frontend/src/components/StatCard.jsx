export default function StatCard({ label, value, sub, icon, accent = "slate", pulse }) {
  const accentMap = {
    vendor: "text-vendor bg-vendor/10",
    distributor: "text-distributor bg-distributor/10",
    admin: "text-admin bg-admin/10",
    chain: "text-chain bg-chain/10",
    red: "text-red-600 bg-red-50",
    slate: "text-slate-600 bg-slate-100",
  };
  return (
    <div className="stat-card relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {icon && (
          <span className={`h-8 w-8 rounded-lg flex items-center justify-center text-base ${accentMap[accent]}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-display font-semibold text-ink-900">{value}</span>
        {pulse && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
      </div>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}
