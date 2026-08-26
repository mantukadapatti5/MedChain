import { ClipboardList, Truck, PackageCheck, Building2, Boxes } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import StatCard from "../../components/StatCard";
import Badge from "../../components/Badge";
import ErrorBanner from "../../components/ErrorBanner";

export default function ClientDashboard() {
  const { data, loading, error } = usePoll(() => api.get("/client/dashboard"));

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="stat-card h-24 animate-pulse bg-slate-100" />)}</div>;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-6">
      <div className="card p-5 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-client-soft text-client flex items-center justify-center shrink-0">
          <Building2 size={22} />
        </div>
        <div>
          <p className="font-display font-semibold text-ink-900">{data.client.name}</p>
          <p className="text-xs text-slate-500">{data.client.type} &middot; {data.client.region} &middot; {data.client.licenseVerified ? "License Verified" : "License Pending Verification"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Pending Requests" value={data.pendingRequests} icon={<ClipboardList size={16} />} accent="client" />
        <StatCard label="In Transit" value={data.inTransit} icon={<Truck size={16} />} accent="client" />
        <StatCard label="Received" value={data.totalReceived} icon={<PackageCheck size={16} />} accent="client" />
        <StatCard label="On-Hand Units" value={data.onHandStockUnits} icon={<Boxes size={16} />} accent="client" />
        <StatCard label="Near Expiry" value={data.nearExpiryCount} icon={<Boxes size={16} />} accent="red" />
      </div>

      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-3">Recent Requests</h3>
        {data.recentRequests.length === 0 ? (
          <p className="text-sm text-slate-500">No requests yet — raise one from the Requests tab.</p>
        ) : (
          <ul className="space-y-2">
            {data.recentRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-ink-900">{r.drugName} &times;{r.qtyRequested}</span>
                <Badge value={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
