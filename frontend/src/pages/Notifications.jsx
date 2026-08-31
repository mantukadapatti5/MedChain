import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, AlertTriangle, Package, Truck, ShieldAlert, Snowflake, Info } from "lucide-react";
import { api } from "../api/api";

const ICONS = {
  SHORTAGE: AlertTriangle,
  ANOMALY: ShieldAlert,
  RECALL: Package,
  COLD_CHAIN: Snowflake,
  SHIPMENT: Truck,
  EXPIRY: Package,
  SYSTEM: Info,
};

const SEVERITY = {
  critical: "border-red-200 bg-red-50 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-blue-200 bg-blue-50 text-blue-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const loadNotifications = () => {
    setLoading(true);
    api.get("/notifications?limit=200")
      .then((data) => setNotifications(data.notifications || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNotifications();
    const id = setInterval(loadNotifications, 10000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.read);
    if (filter === "critical") return notifications.filter((n) => n.severity === "critical" || n.severity === "high");
    return notifications;
  }, [notifications, filter]);

  const unread = notifications.filter((n) => !n.read).length;

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((items) => items.map((n) => n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n));
  };

  const markAll = async () => {
    await api.post("/notifications/read-all");
    setNotifications((items) => items.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-admin" />
            <h2 className="font-display font-semibold text-xl text-ink-900">Notification History</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">Persistent alerts from shortages, anomalies, recalls, shipments and system events.</p>
        </div>
        {unread > 0 && (
          <button onClick={markAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium hover:bg-slate-50">
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {[['all', 'All'], ['unread', `Unread (${unread})`], ['critical', 'High priority']].map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === value ? "bg-ink-900 text-white border-ink-900" : "bg-white text-slate-600 border-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading notifications...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Bell size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No notifications</p>
          <p className="text-xs text-slate-500 mt-1">New alerts will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => {
            const Icon = ICONS[notification.type] || Info;
            return (
              <div key={notification.id} className={`bg-white border rounded-xl p-4 flex gap-3 ${notification.read ? "opacity-75" : ""}`}>
                <div className={`h-9 w-9 shrink-0 rounded-lg border flex items-center justify-center ${SEVERITY[notification.severity] || SEVERITY.info}`}>
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink-900">{notification.title}</p>
                    {!notification.read && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-admin-soft text-admin">New</span>}
                    <span className="text-[10px] uppercase font-semibold text-slate-400">{notification.type}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
                  <p className="text-[11px] text-slate-400 mt-2">{formatTime(notification.createdAt)}</p>
                </div>
                {!notification.read && (
                  <button onClick={() => markRead(notification.id)} className="self-start text-xs font-medium text-admin hover:underline">Mark read</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
