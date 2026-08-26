import { useState } from "react";
import { AlertOctagon, Loader2, Check, Building2, Truck, Factory } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";

export default function AdminRecalls() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/admin/recalls"), { intervalMs: 8000 });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ batch: "", drugName: "", reason: "", severity: "high" });
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(null);

  const issue = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post("/admin/recalls", form);
      const holders = [];
      if (res.affectedHolders.vendor) holders.push("Vendor");
      if (res.affectedHolders.distributorRegions.length) holders.push("Distributor (" + res.affectedHolders.distributorRegions.join(", ") + ")");
      if (res.affectedHolders.clients.length) holders.push(res.affectedHolders.clients.length + " client(s)");
      push("Recall issued for batch " + form.batch + ". Affects: " + (holders.join(" \u00b7 ") || "no current holders found") + ".", "error");
      setForm({ batch: "", drugName: "", reason: "", severity: "high" });
      setOpen(false);
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const resolve = async (id) => {
    setBusy(id);
    try {
      await api.post("/admin/recalls/" + id + "/resolve");
      push("Recall marked resolved.", "success");
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Drug Recalls</h2>
          <p className="text-sm text-slate-500">Issue a recall on any batch — every portal currently holding it is notified and must acknowledge.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn bg-red-600 text-white hover:bg-red-700">
          <AlertOctagon size={16} /> Issue Recall
        </button>
      </div>

      {data.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No recalls issued yet.</div>
      ) : (
        <div className="space-y-3">
          {data.map((r) => (
            <div key={r.id} className={"card p-5" + (r.status === "active" ? " border-2 border-red-200" : "")}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink-900">{r.drugName}</p>
                    <span className="font-mono text-xs text-slate-500">{r.batch}</span>
                    <Badge value={r.severity} />
                    <Badge value={r.status === "active" ? "open" : "resolved"} />
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{r.reason}</p>
                  <p className="text-xs text-slate-400 mt-1">Issued {new Date(r.issuedAt).toLocaleString()} by {r.issuedBy}</p>
                </div>
                {r.status === "active" && (
                  <button onClick={() => resolve(r.id)} disabled={busy === r.id} className="btn-outline text-xs !py-1.5">
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Mark Resolved
                  </button>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-600 mb-1.5">Affected Holders</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.affectedHolders.vendor && <span className="badge bg-vendor-soft text-vendor"><Factory size={11} /> Vendor</span>}
                    {r.affectedHolders.distributorRegions.map((z) => <span key={z} className="badge bg-distributor-soft text-distributor"><Truck size={11} /> {z}</span>)}
                    {r.affectedHolders.clients.map((c) => <span key={c} className="badge bg-client-soft text-client"><Building2 size={11} /> {c}</span>)}
                    {!r.affectedHolders.vendor && r.affectedHolders.distributorRegions.length === 0 && r.affectedHolders.clients.length === 0 && (
                      <span className="text-slate-400">No current holders on record.</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-slate-600 mb-1.5">Acknowledged By ({r.acknowledgedBy.length})</p>
                  {r.acknowledgedBy.length === 0 ? (
                    <p className="text-slate-400">No acknowledgements yet.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {r.acknowledgedBy.map((a, i) => (
                        <li key={i} className="text-slate-500">{a.name} ({a.role}) &mdash; {new Date(a.acknowledgedAt).toLocaleString()}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Issue Drug Recall">
        <form onSubmit={issue} className="space-y-3">
          <Field label="Batch Number" value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} required placeholder="e.g. AZI-4410" />
          <Field label="Drug Name" value={form.drugName} onChange={(v) => setForm({ ...form, drugName: v })} required />
          <label className="text-xs font-medium text-slate-600 space-y-1 block">
            Reason
            <textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} className="input focus:ring-red-200 focus:border-red-400" placeholder="e.g. Failed provenance verification, suspected counterfeit" />
          </label>
          <label className="text-xs font-medium text-slate-600 space-y-1 block">
            Severity
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="input focus:ring-red-200 focus:border-red-400">
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <button type="submit" disabled={submitting} className="btn-danger w-full mt-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Issue Recall to All Holders
          </button>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, onChange, ...props }) {
  return (
    <label className="text-xs font-medium text-slate-600 space-y-1 block">
      {label}
      <input {...props} onChange={(e) => onChange(e.target.value)} className="input focus:ring-red-200 focus:border-red-400" />
    </label>
  );
}
