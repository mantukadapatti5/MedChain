import { Boxes, PackageSearch, AlertTriangle, Clock3, Wallet, Receipt, Zap, Loader2, Factory } from "lucide-react";
import { useState } from "react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import StatCard from "../../components/StatCard";
import Badge from "../../components/Badge";
import ErrorBanner from "../../components/ErrorBanner";
import { formatINR } from "../../utils/currency";

export default function VendorDashboard() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/vendor/dashboard"));
  const { data: runs, refresh: refreshRuns } = usePoll(() => api.get("/vendor/production-runs"), { intervalMs: 15000 });
  const { push } = useToast();
  const [running, setRunning] = useState(false);

  const runAutoProcure = async () => {
    setRunning(true);
    try {
      const res = await api.post("/vendor/auto-procure/run");
      push(res.message, res.createdOrders.length ? "success" : "info");
      refresh();
      refreshRuns();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <SkeletonGrid />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Overview</h2>
          <p className="text-sm text-slate-500">Live inventory, procurement &amp; billing snapshot.</p>
        </div>
        <button onClick={runAutoProcure} disabled={running} className="btn bg-vendor text-white hover:bg-vendor/90 shadow-card">
          {running ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          Run Smart Contract Auto-Procure
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Drugs" value={data.totalDrugs} icon={<Boxes size={16} />} accent="vendor" />
        <StatCard label="Stock Units" value={data.totalStockUnits} icon={<PackageSearch size={16} />} accent="vendor" />
        <StatCard label="Low Stock" value={data.lowStockCount} icon={<AlertTriangle size={16} />} accent="red" />
        <StatCard label="Near Expiry" value={data.nearExpiryCount} icon={<Clock3 size={16} />} accent="red" />
        <StatCard label="Pending Requests" value={data.pendingRequests} icon={<Receipt size={16} />} accent="vendor" />
        <StatCard label="Inventory Value" value={formatINR(data.inventoryValue)} icon={<Wallet size={16} />} accent="vendor" />
      </div>

      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-3">Batches Needing Reorder</h3>
        {data.lowStockItems.length === 0 ? (
          <p className="text-sm text-slate-500">All batches are above their reorder point. Nothing needs attention.</p>
        ) : (
          <table className="table-shell">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Batch</th>
                <th>Stock</th>
                <th>Reorder Point</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStockItems.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium text-ink-900">{i.drugName}</td>
                  <td className="font-mono text-xs text-slate-500">{i.batch}</td>
                  <td>{i.stock}</td>
                  <td>{i.reorderPoint}</td>
                  <td><Badge value={i.stock === 0 ? "high" : "medium"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-3 flex items-center gap-1.5">
          <Factory size={15} /> Recent Production Runs
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Every Smart Contract Auto-Procure action is recorded here — since the Vendor is the manufacturer at the top of this chain, "procurement" means running production, not ordering from someone else.
        </p>
        {!runs || runs.length === 0 ? (
          <p className="text-sm text-slate-500">No production runs recorded yet.</p>
        ) : (
          <table className="table-shell">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Batch</th>
                <th>Qty Produced</th>
                <th>Stock Before → After</th>
                <th>Reason</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 8).map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-ink-900">{r.drugName}</td>
                  <td className="font-mono text-xs text-slate-500">{r.batch}</td>
                  <td>{r.qtyProduced}</td>
                  <td className="text-xs text-slate-500">{r.stockBefore} → {r.stockAfter}</td>
                  <td className="text-xs text-slate-500">{r.reason}</td>
                  <td className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="stat-card h-24 animate-pulse bg-slate-100" />
      ))}
    </div>
  );
}
