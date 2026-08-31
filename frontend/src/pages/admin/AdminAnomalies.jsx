import { useState } from "react";
import { ScanSearch, Loader2 } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/Badge";
import ErrorBanner from "../../components/ErrorBanner";

const NEXT_STATUS = {
  open: "investigating",
  investigating: "escalated",
  escalated: "resolved",
};
const NEXT_LABEL = {
  open: "Start Investigating",
  investigating: "Escalate",
  escalated: "Mark Resolved",
};

export default function AdminAnomalies() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/admin/anomalies"), { intervalMs: 6000 });
  const { push } = useToast();
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState(null);

  const scan = async () => {
    setScanning(true);
    try {
      const res = await api.post("/admin/anomalies/scan");
      push(res.message, res.created.length ? "success" : "info");
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setScanning(false);
    }
  };

  const advance = async (a) => {
    const next = NEXT_STATUS[a.status];
    if (!next) return;
    setUpdating(a.id);
    try {
      await api.put(`/admin/anomalies/${a.id}`, { status: next });
      push(`Case #${a.id} moved to "${next}".`, "success");
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Anomaly Case Management</h2>
          <p className="text-sm text-slate-500">Isolation Forest detects unusual inventory patterns; compliance rules remain separate.</p>
        </div>
        <button onClick={scan} disabled={scanning} className="btn bg-admin text-white hover:bg-admin/90">
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />}
          Run ML Anomaly Scan
        </button>
      </div>

      {data.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No anomaly cases yet. Run an Isolation Forest scan to check current inventory.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Case #</th>
                <th>Type</th>
                <th>Drug</th>
                <th>Batch</th>
                <th>ML Score</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Status</th>
                <th>Detected</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs">#{a.id}</td>
                  <td className="capitalize">{a.type.replaceAll("-", " ")}</td>
                  <td className="font-medium text-ink-900">{a.drugName}</td>
                  <td className="font-mono text-xs text-slate-500">{a.batch}</td>
                  <td className="font-mono text-xs">
                    {a.model === "Isolation Forest" && Number.isFinite(Number(a.anomalyScore))
                      ? Number(a.anomalyScore).toFixed(2)
                      : "—"}
                  </td>
                  <td><Badge value={a.severity} /></td>
                  <td className="capitalize text-slate-500">{a.source}</td>
                  <td><Badge value={a.status} /></td>
                  <td className="text-slate-500">{new Date(a.detectedAt).toLocaleString()}</td>
                  <td>
                    {a.status !== "resolved" && (
                      <button
                        onClick={() => advance(a)}
                        disabled={updating === a.id}
                        className="btn-outline !py-1 !px-2.5 text-xs"
                      >
                        {updating === a.id ? <Loader2 size={12} className="animate-spin" /> : NEXT_LABEL[a.status]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
