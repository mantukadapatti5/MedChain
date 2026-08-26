import { AlertOctagon, MapPinned } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import Badge from "../../components/Badge";
import ErrorBanner from "../../components/ErrorBanner";

const LEVEL_TO_SEVERITY = { critical: "high", high: "high", medium: "medium", low: "low" };

export default function AdminShortageRisk() {
  const { data, loading, error } = usePoll(() => api.get("/admin/shortage-risk"), { intervalMs: 8000 });

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  const critical = data.filter((r) => r.level === "critical").length;
  const high = data.filter((r) => r.level === "high").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertOctagon size={18} className="text-red-600" />
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Shortage Risk</h2>
          <p className="text-sm text-slate-500">Days-of-supply remaining per batch/region at current demand &mdash; surfaces shortages before they happen.</p>
        </div>
      </div>

      {(critical > 0 || high > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          {critical} batch(es) at <strong>critical</strong> risk (&lt;3 days of supply), {high} at <strong>high</strong> risk (&lt;7 days). Consider prioritizing these in incoming stock requests.
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Drug</th>
              <th>Batch</th>
              <th>Region</th>
              <th>Current Stock</th>
              <th>Avg Daily Demand</th>
              <th>Days of Supply</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td className="font-medium text-ink-900">{r.drugName}</td>
                <td className="font-mono text-xs text-slate-500">{r.batch}</td>
                <td className="text-xs"><span className="badge bg-slate-100 text-slate-600"><MapPinned size={11} /> {r.region}</span></td>
                <td>{r.stock}</td>
                <td>{r.avgDailyDemand}/day</td>
                <td className={r.level === "critical" ? "font-semibold text-red-600" : ""}>{r.daysOfSupply} days</td>
                <td><Badge value={LEVEL_TO_SEVERITY[r.level]} withDot={false} /> <span className="text-xs capitalize text-slate-500 ml-1">{r.level}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
