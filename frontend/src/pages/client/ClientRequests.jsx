import { useState, Fragment } from "react";
import { Plus, MapPin, Thermometer, ChevronDown, ChevronUp, Loader2, PackageCheck, Search, ShieldCheck } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";

const PRIORITIES = ["routine", "urgent", "critical"];

export default function ClientRequests() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/client/requests"), { intervalMs: 5000 });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ drugName: "", qty: "", priority: "routine" });
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [qtyReceivedInput, setQtyReceivedInput] = useState("");
  const [busy, setBusy] = useState(null);
  const [batchQuery, setBatchQuery] = useState("");
  const [provenance, setProvenance] = useState(null);
  const [searching, setSearching] = useState(false);

  const raiseRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/client/requests", { ...form, qty: Number(form.qty) });
      push("Request for " + form.qty + " units of " + form.drugName + " sent to the Distributor.", "success");
      setForm({ drugName: "", qty: "", priority: "routine" });
      setOpen(false);
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openReceive = (r) => {
    setReceiveTarget(r);
    setQtyReceivedInput(String(r.qtyDispatched));
  };

  const confirmReceive = async (e) => {
    e.preventDefault();
    setBusy("receive-" + receiveTarget.id);
    try {
      const res = await api.post("/client/requests/" + receiveTarget.id + "/receive", { qtyReceived: Number(qtyReceivedInput) });
      if (res.mismatch && res.mismatch.mismatch) {
        push("Discrepancy noted: expected " + receiveTarget.qtyDispatched + ", received " + qtyReceivedInput + ". This has been flagged for Admin review.", "error");
      } else {
        push("Shipment received in full — thank you for confirming.", "success");
      }
      setReceiveTarget(null);
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const lookupProvenance = async (e) => {
    e.preventDefault();
    if (!batchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get("/client/provenance/" + encodeURIComponent(batchQuery.trim()));
      setProvenance(res);
      if (!res.found) push('No ledger history found for batch "' + batchQuery + '" yet.', "info");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">My Requests</h2>
          <p className="text-sm text-slate-500">Order medicines directly from your Distributor and track every shipment.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn bg-client text-white hover:bg-client/90">
          <Plus size={16} /> New Request
        </button>
      </div>

      <form onSubmit={lookupProvenance} className="card p-4 flex items-center gap-2">
        <Search size={16} className="text-slate-400" />
        <input
          value={batchQuery}
          onChange={(e) => setBatchQuery(e.target.value)}
          placeholder="Verify a batch you received — enter its batch number"
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
        />
        <button type="submit" disabled={searching} className="btn-outline !py-1.5 text-xs">
          {searching ? <Loader2 size={14} className="animate-spin" /> : "Verify Batch"}
        </button>
      </form>
      {provenance && (
        <div className={"rounded-xl border px-4 py-3 text-sm flex items-center gap-2 " + (provenance.found ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500")}>
          <ShieldCheck size={16} />
          {provenance.found ? "Batch " + provenance.batch + " verified — " + provenance.history.length + " ledger event(s) on record." : "No on-chain history found for batch " + provenance.batch + "."}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="table-shell">
          <thead>
            <tr>
              <th></th>
              <th>Req #</th>
              <th>Drug</th>
              <th>Qty</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>
                    <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-slate-400 hover:text-ink-900">
                      {expanded === r.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </td>
                  <td className="font-mono text-xs">#{r.id}</td>
                  <td className="font-medium text-ink-900">{r.drugName}</td>
                  <td>{r.qtyRequested}</td>
                  <td className="capitalize text-xs">{r.priority}</td>
                  <td><Badge value={r.status} /></td>
                  <td>
                    {r.status === "dispatched" && (
                      <button onClick={() => openReceive(r)} className="btn bg-client text-white hover:bg-client/90 !py-1 !px-2.5 text-xs">
                        <PackageCheck size={12} /> Confirm Receipt
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={7} className="bg-slate-50 px-6 py-4">
                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><MapPin size={12} /> GPS Trail</p>
                          {r.gpsLog.length === 0 ? <p className="text-slate-400">No movement yet.</p> : (
                            <ul className="space-y-1">{r.gpsLog.map((g, i) => <li key={i} className="font-mono text-slate-500">{new Date(g.timestamp).toLocaleString()} &mdash; {g.label}</li>)}</ul>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Thermometer size={12} /> Cold-Chain Log</p>
                          {r.coldChainLog.length === 0 ? <p className="text-slate-400">Not applicable or no readings.</p> : (
                            <ul className="space-y-1">
                              {r.coldChainLog.map((c, i) => (
                                <li key={i} className={(c.alert ? "text-red-600 font-semibold" : "text-slate-500") + " font-mono"}>{c.temp}&deg;C / {c.humidity}% {c.alert ? "⚠" : ""}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      {r.batchesAllocated.length > 0 && (
                        <p className="text-xs text-slate-500 mt-2">Batch(es): {r.batchesAllocated.map((b) => b.batch).join(", ")}</p>
                      )}
                      {r.status === "rejected" && r.rejectionReason && <p className="text-xs text-red-600 mt-2">Rejected: {r.rejectionReason}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Request Stock from Distributor">
        <form onSubmit={raiseRequest} className="space-y-3">
          <Field label="Drug Name" value={form.drugName} onChange={(v) => setForm({ ...form, drugName: v })} required />
          <Field label="Quantity" type="number" value={form.qty} onChange={(v) => setForm({ ...form, qty: v })} required />
          <label className="text-xs font-medium text-slate-600 space-y-1 block">
            Priority
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input focus:ring-client/20 focus:border-client">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Send Request
          </button>
        </form>
      </Modal>

      <Modal open={!!receiveTarget} onClose={() => setReceiveTarget(null)} title={"Confirm Receipt — Request #" + (receiveTarget ? receiveTarget.id : "")}>
        {receiveTarget && (
          <form onSubmit={confirmReceive} className="space-y-3">
            <p className="text-sm text-slate-500">The Distributor recorded <strong>{receiveTarget.qtyDispatched}</strong> units dispatched. Enter what actually arrived at your facility — any discrepancy is automatically flagged for Admin review.</p>
            <Field label="Quantity Actually Received" type="number" value={qtyReceivedInput} onChange={setQtyReceivedInput} required />
            <button type="submit" disabled={busy === "receive-" + receiveTarget.id} className="btn-primary w-full">
              {busy === "receive-" + receiveTarget.id && <Loader2 size={16} className="animate-spin" />}
              Confirm Receipt
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, onChange, ...props }) {
  return (
    <label className="text-xs font-medium text-slate-600 space-y-1 block">
      {label}
      <input {...props} onChange={(e) => onChange(e.target.value)} className="input focus:ring-client/20 focus:border-client" />
    </label>
  );
}
