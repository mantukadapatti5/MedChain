import { useState } from "react";
import { Link2, ShieldCheck, ShieldAlert, Search, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import ErrorBanner from "../../components/ErrorBanner";

const TYPE_COLOR = {
  GENESIS: "bg-slate-700",
  STOCK_REQUEST_RAISED: "bg-cyan-600",
  STOCK_REQUEST_APPROVED: "bg-purple-600",
  STOCK_REQUEST_REJECTED: "bg-rose-700",
  ORDER_DISPATCHED: "bg-blue-600",
  ORDER_RECEIVED: "bg-emerald-600",
  QUANTITY_MISMATCH_DETECTED: "bg-red-800",
  SALE_RECORDED: "bg-teal-600",
  INVENTORY_UPDATE: "bg-slate-500",
  ANOMALY_DETECTED: "bg-red-600",
  QUARANTINE_TRIGGERED: "bg-red-700",
  COLD_CHAIN_ALERT: "bg-orange-600",
  COMPLIANCE_VERIFIED: "bg-emerald-700",
  CASE_ESCALATED: "bg-fuchsia-600",
  SMART_CONTRACT_AUTO_PROCURE: "bg-indigo-600",
  EMERGENCY_MODE_TOGGLED: "bg-red-500",
  CLIENT_REQUEST_RAISED: "bg-sky-600",
  CLIENT_REQUEST_APPROVED: "bg-violet-600",
  CLIENT_REQUEST_REJECTED: "bg-rose-800",
  CLIENT_ORDER_DISPATCHED: "bg-blue-500",
  CLIENT_ORDER_RECEIVED: "bg-emerald-500",
  CLIENT_QUANTITY_MISMATCH_DETECTED: "bg-red-900",
  CLIENT_ONBOARDED: "bg-cyan-700",
};

export default function BlockchainExplorer() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/admin/blockchain"), { intervalMs: 6000 });
  const { push } = useToast();
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [batchQuery, setBatchQuery] = useState("");
  const [provenance, setProvenance] = useState(null);
  const [searching, setSearching] = useState(false);

  const verify = async () => {
    setVerifying(true);
    try {
      const res = await api.get("/admin/blockchain/verify");
      setVerifyResult(res);
      push(res.valid ? "Chain integrity verified. No tampering detected." : `Tampering detected at block ${res.brokenAt}!`, res.valid ? "success" : "error");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setVerifying(false);
    }
  };

  const lookupProvenance = async (e) => {
    e.preventDefault();
    if (!batchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/admin/blockchain/provenance/${encodeURIComponent(batchQuery.trim())}`);
      setProvenance(res);
      if (!res.found) push(`No ledger history found for batch "${batchQuery}".`, "error");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  const blocks = data.slice().reverse();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Blockchain Explorer</h2>
          <p className="text-sm text-slate-500">Immutable, hash-chained audit trail &mdash; every transaction across all portals.</p>
        </div>
        <button onClick={verify} disabled={verifying} className="btn bg-admin text-white hover:bg-admin/90">
          {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Verify Chain Integrity
        </button>
      </div>

      {verifyResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${verifyResult.valid ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {verifyResult.valid ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
          {verifyResult.valid ? "All blocks verified &mdash; hashes match and the chain is unbroken." : `Integrity failure at block #${verifyResult.brokenAt}: ${verifyResult.reason}`}
        </div>
      )}

      <form onSubmit={lookupProvenance} className="card p-4 flex items-center gap-2">
        <Search size={16} className="text-slate-400" />
        <input
          value={batchQuery}
          onChange={(e) => setBatchQuery(e.target.value)}
          placeholder="QR Verify &mdash; enter a batch number, e.g. AZI-4410"
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
        />
        <button type="submit" disabled={searching} className="btn-outline !py-1.5 text-xs">
          {searching ? <Loader2 size={14} className="animate-spin" /> : "Verify Provenance"}
        </button>
      </form>

      {provenance && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink-900 mb-2">
            Provenance for <span className="font-mono">{provenance.batch}</span>{" "}
            {provenance.found ? <span className="text-emerald-600">&middot; {provenance.history.length} ledger event(s) found</span> : <span className="text-red-600">&middot; not found on chain</span>}
          </p>
          <ChainStrip blocks={provenance.history} compact />
        </div>
      )}

      {/* Signature visual: hash-linked block chain */}
      <div className="card p-5">
        <h3 className="font-display font-semibold text-ink-900 mb-4 flex items-center gap-1.5">
          <Link2 size={15} /> Ledger ({blocks.length} blocks, newest first)
        </h3>
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {blocks.map((b) => (
            <div key={b.index} className="rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === b.index ? null : b.index)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
              >
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${TYPE_COLOR[b.type] || "bg-slate-400"}`} />
                <span className="font-mono text-xs text-slate-400 w-10 shrink-0">#{b.index}</span>
                <span className="text-sm font-semibold text-ink-900 shrink-0">{b.type.replaceAll("_", " ")}</span>
                <span className="text-xs text-slate-400 truncate flex-1">{b.actor}</span>
                <span className="text-[11px] text-slate-400 shrink-0 hidden md:inline">{new Date(b.timestamp).toLocaleString()}</span>
                {expanded === b.index ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
              </button>
              {expanded === b.index && (
                <div className="px-4 pb-4 space-y-2 bg-slate-50">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 mb-0.5">Hash</p>
                      <p className="hash-chip truncate">{b.hash}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 mb-0.5">Previous Hash</p>
                      <p className="hash-chip truncate">{b.prevHash}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400 mb-0.5">Payload</p>
                    <pre className="text-xs font-mono bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto">
{JSON.stringify(b.data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChainStrip({ blocks, compact }) {
  if (!blocks || blocks.length === 0) return <p className="text-xs text-slate-400">No linked events.</p>;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {blocks.map((b, i) => (
        <div key={b.index} className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
            <span className={`h-1.5 w-1.5 rounded-full ${TYPE_COLOR[b.type] || "bg-slate-400"}`} />
            <span className="text-[10px] font-mono text-slate-500">{b.type.replaceAll("_", " ")}</span>
          </div>
          {i < blocks.length - 1 && <span className="h-px w-3 bg-chain/40" />}
        </div>
      ))}
    </div>
  );
}
