import { Truck, PackageCheck, DollarSign, AlertTriangle, Star } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import StatCard from "../../components/StatCard";
import Badge from "../../components/Badge";
import ErrorBanner from "../../components/ErrorBanner";
import { formatINR } from "../../utils/currency";

export default function DistributorDashboard() {
  const { data, loading, error } = usePoll(() => api.get("/distributor/dashboard"));

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="stat-card h-24 animate-pulse bg-slate-100" />)}</div>;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-900">Overview</h2>
        <p className="text-sm text-slate-500">Dispatch queue, in-transit shipments &amp; sales performance.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending Requests" value={data.pendingRequests} icon={<Truck size={16} />} accent="distributor" />
        <StatCard label="In Transit" value={data.inTransit} icon={<PackageCheck size={16} />} accent="distributor" />
        <StatCard label="Total Sales" value={formatINR(data.totalSalesAmount)} icon={<DollarSign size={16} />} accent="distributor" />
        <StatCard label="Low Stock" value={data.lowStockCount} icon={<AlertTriangle size={16} />} accent="red" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-3">Active Request Queue</h3>
          {data.activeQueue.length === 0 ? (
            <p className="text-sm text-slate-500">No orders awaiting action.</p>
          ) : (
            <ul className="space-y-2">
              {data.activeQueue.map((o) => (
                <li key={o.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                  <span className="font-medium text-ink-900">{o.drugName} ×{o.qtyRequested}</span>
                  <Badge value={o.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-3 flex items-center gap-1.5">
            <Star size={15} className="text-amber-500" /> Vendor Supplier Performance
          </h3>
          {data.supplierPerformance.map((s) => (
            <div key={s.vendorName} className="space-y-2">
              <p className="font-medium text-ink-900 text-sm">{s.vendorName}</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-display font-semibold text-distributor">{s.onTimeDeliveryRate}%</p>
                  <p className="text-[10px] uppercase text-slate-400">On-Time</p>
                </div>
                <div>
                  <p className="text-lg font-display font-semibold text-distributor">{s.qualityScore}/5</p>
                  <p className="text-[10px] uppercase text-slate-400">Quality</p>
                </div>
                <div>
                  <p className="text-lg font-display font-semibold text-distributor">{s.ordersFulfilled}</p>
                  <p className="text-[10px] uppercase text-slate-400">Fulfilled</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
