import { ShieldCheck, Factory, Truck, Building2 } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import Badge from "../../components/Badge";
import ErrorBanner from "../../components/ErrorBanner";

const ROLE_ICON = { admin: ShieldCheck, vendor: Factory, distributor: Truck, client: Building2 };
const ROLE_COLOR = {
  admin: "text-admin bg-admin-soft",
  vendor: "text-vendor bg-vendor-soft",
  distributor: "text-distributor bg-distributor-soft",
  client: "text-client bg-client-soft",
};

export default function AdminUsers() {
  const { data, loading, error } = usePoll(() => api.get("/admin/users"), { intervalMs: 15000 });

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-900">User &amp; Role Management</h2>
        <p className="text-sm text-slate-500">Registered accounts across all three portals (RBAC).</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {data.map((u) => {
          const Icon = ROLE_ICON[u.role] || ShieldCheck;
          const roleColor = ROLE_COLOR[u.role] || "text-slate-600 bg-slate-100";
          return (
            <div key={u.id} className="card p-5 flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${roleColor}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 truncate">{u.name}</p>
                <p className="text-xs text-slate-500 truncate">{u.email}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <Badge value={u.role} withDot={false} />
                  {u.licenseVerified && <span className="text-[10px] text-emerald-600 font-medium">License Verified</span>}
                  {u.mfaEnabled && <span className="text-[10px] text-purple-600 font-medium">MFA On</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
