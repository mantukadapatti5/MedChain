import { useState } from "react";
import { FileDown, FileJson, Loader2 } from "lucide-react";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";

export default function AdminAuditReports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  const generate = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/audit-report");
      setReport(res);
      push("Audit report generated from live ledger &amp; portal data.".replace("&amp;", "&"), "success");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medchain-audit-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    if (!report) return;
    const rows = [
      ["Section", "Field", "Value"],
      ["Summary", "Generated At", report.generatedAt],
      ["Summary", "Chain Valid", report.chainIntegrity.valid],
      ["Summary", "Total Ledger Transactions", report.totalTransactionsOnLedger],
      ...report.stockRequests.map((o) => ["Stock Requests", `#${o.id} ${o.drugName}`, `qty=${o.qtyRequested} status=${o.status}`]),
      ...report.clientRequests.map((o) => ["Client Requests", `#${o.id} ${o.drugName}`, `qty=${o.qtyRequested} status=${o.status}`]),
      ...report.anomalies.map((a) => ["Anomalies", `#${a.id} ${a.drugName}`, `type=${a.type} status=${a.status}`]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medchain-audit-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Regulatory Audit Reports</h2>
          <p className="text-sm text-slate-500">Compliance snapshot compiled from the live ledger and both portals.</p>
        </div>
        <button onClick={generate} disabled={loading} className="btn bg-admin text-white hover:bg-admin/90">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileJson size={16} />}
          Generate Report
        </button>
      </div>

      {report && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString()} &middot;{" "}
              <span className={report.chainIntegrity.valid ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                {report.chainIntegrity.valid ? "Ledger Verified" : "Tampering Detected"}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={downloadCSV} className="btn-outline text-xs !py-1.5">
                <FileDown size={14} /> Export CSV
              </button>
              <button onClick={downloadJSON} className="btn-outline text-xs !py-1.5">
                <FileDown size={14} /> Export JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <MiniStat label="Ledger Transactions" value={report.totalTransactionsOnLedger} />
            <MiniStat label="Stock Requests" value={report.stockRequests.length} />
            <MiniStat label="Sales Records" value={report.sales.length} />
            <MiniStat label="Anomaly Cases" value={report.anomalies.length} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Raw Report Preview</p>
            <pre className="text-xs font-mono bg-slate-900 text-slate-200 rounded-xl p-4 overflow-x-auto max-h-96 overflow-y-auto">
{JSON.stringify(report, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-lg font-display font-semibold text-ink-900">{value}</p>
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
    </div>
  );
}
