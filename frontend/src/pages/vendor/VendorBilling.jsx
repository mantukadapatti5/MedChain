import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import Badge from "../../components/Badge";
import ErrorBanner from "../../components/ErrorBanner";
import { formatINR } from "../../utils/currency";

export default function VendorBilling() {
  const { data, loading, error } = usePoll(() => api.get("/vendor/billing"), { intervalMs: 8000 });

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  const total = data.reduce((s, b) => s + b.amount, 0);
  const outstanding = data.filter((b) => b.status === "pending").reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-900">Billing &amp; Invoices</h2>
        <p className="text-sm text-slate-500">Invoices generated automatically for each procurement order.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <span className="text-xs font-semibold uppercase text-slate-500">Total Invoiced</span>
          <span className="text-2xl font-display font-semibold text-ink-900">{formatINR(total)}</span>
        </div>
        <div className="stat-card">
          <span className="text-xs font-semibold uppercase text-slate-500">Outstanding</span>
          <span className="text-2xl font-display font-semibold text-amber-600">{formatINR(outstanding)}</span>
        </div>
        <div className="stat-card">
          <span className="text-xs font-semibold uppercase text-slate-500">Invoices</span>
          <span className="text-2xl font-display font-semibold text-ink-900">{data.length}</span>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Request #</th>
              <th>Drug</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.id}>
                <td className="font-mono text-xs">INV-{String(b.id).padStart(4, "0")}</td>
                <td className="font-mono text-xs text-slate-500">Req #{b.requestId}</td>
                <td className="font-medium text-ink-900">{b.drugName}</td>
                <td>{formatINR(b.amount)}</td>
                <td><Badge value={b.status} /></td>
                <td className="text-slate-500">{new Date(b.date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
