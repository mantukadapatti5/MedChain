import { Users, Link2, ShieldAlert, Activity, DollarSign, Boxes, Siren, Loader2 } from "lucide-react";
import { useState } from "react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import StatCard from "../../components/StatCard";
import ErrorBanner from "../../components/ErrorBanner";
import { formatINR } from "../../utils/currency";

export default function AdminDashboard() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/admin/dashboard"));
  const { push } = useToast();
  const [toggling, setToggling] = useState(false);

  const toggleEmergency = async () => {
    setToggling(true);
    try {
      const res = await api.post("/admin/emergency-mode", { active: !data.emergencyMode });
      push(res.emergencyMode ? "Emergency Mode activated. Priority allocation and surge-scaled procurement are now in effect across all portals." : "Emergency Mode deactivated. Systems returned to normal operation.", res.emergencyMode ? "error" : "success");
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="stat-card h-24 animate-pulse bg-slate-100" />)}</div>;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">System Health</h2>
          <p className="text-sm text-slate-500">Platform-wide oversight across all portals and the ledger.</p>
        </div>
        <button
          onClick={toggleEmergency}
          disabled={toggling}
          className={`btn ${data.emergencyMode ? "bg-slate-700 hover:bg-slate-800" : "bg-red-600 hover:bg-red-700"} text-white`}
        >
          {toggling ? <Loader2 size={16} className="animate-spin" /> : <Siren size={16} />}
          {data.emergencyMode ? "Deactivate Emergency Mode" : "Activate Emergency Mode"}
        </button>
      </div>

      {data.emergencyMode && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 flex items-center gap-2">
          <Siren size={16} className="animate-pulse" />
          Emergency Mode is active: Vendor auto-procure now targets 4x reorder points, and stock requests are prioritized critical &gt; urgent &gt; routine.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={data.totalUsers} icon={<Users size={16} />} accent="admin" />
        <StatCard
          label="Ledger Status"
          value={data.chainValid ? "Verified" : "Tampered"}
          icon={<Link2 size={16} />}
          accent={data.chainValid ? "admin" : "red"}
          pulse={data.chainValid}
        />
        <StatCard label="Open Anomaly Cases" value={data.openAnomalies} icon={<ShieldAlert size={16} />} accent="red" />
        <StatCard label="Orders In Transit" value={data.requestsInTransit} icon={<Activity size={16} />} accent="admin" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-3 flex items-center gap-1.5"><Users size={15} /> Users by Role</h3>
          <div className="grid grid-cols-4 gap-3 text-center">
            <RoleBlock label="Admin" value={data.usersByRole.admin} color="text-admin" />
            <RoleBlock label="Vendor" value={data.usersByRole.vendor} color="text-vendor" />
            <RoleBlock label="Distributor" value={data.usersByRole.distributor} color="text-distributor" />
            <RoleBlock label="Client" value={data.usersByRole.client} color="text-client" />
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-display font-semibold text-ink-900 mb-3 flex items-center gap-1.5"><Boxes size={15} /> Inventory Value</h3>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-lg font-display font-semibold text-vendor">{formatINR(data.totalInventoryValueVendor)}</p>
              <p className="text-[10px] uppercase text-slate-400">Vendor Holdings</p>
            </div>
            <div>
              <p className="text-lg font-display font-semibold text-distributor">{formatINR(data.totalInventoryValueDistributor)}</p>
              <p className="text-[10px] uppercase text-slate-400">Distributor Holdings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-3 flex items-center gap-1.5"><DollarSign size={15} /> Ledger Snapshot</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-lg font-display font-semibold text-ink-900">{data.totalBlocks}</p>
            <p className="text-[10px] uppercase text-slate-400">Blocks on Chain</p>
          </div>
          <div>
            <p className="text-lg font-display font-semibold text-ink-900">{data.totalStockRequests}</p>
            <p className="text-[10px] uppercase text-slate-400">Total Orders</p>
          </div>
          <div>
            <p className="text-lg font-display font-semibold text-ink-900">{formatINR(data.totalSalesAmount)}</p>
            <p className="text-[10px] uppercase text-slate-400">Total Sales</p>
          </div>
          <div>
            <p className="text-lg font-display font-semibold text-purple-700">{data.escalatedAnomalies}</p>
            <p className="text-[10px] uppercase text-slate-400">Escalated Cases</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleBlock({ label, value, color }) {
  return (
    <div>
      <p className={`text-lg font-display font-semibold ${color}`}>{value}</p>
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
    </div>
  );
}
