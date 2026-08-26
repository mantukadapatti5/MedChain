import { useState, Fragment } from "react";
import { Check, X, Loader2, ChevronDown, ChevronUp, MapPin, Thermometer, AlertTriangle, Building2 } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";

const PRIORITY_STYLE = {
  critical: "bg-red-50 text-red-700 border-red-200",
  urgent: "bg-amber-50 text-amber-700 border-amber-200",
  routine: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function DistributorClientRequests() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/distributor/client-requests"), { intervalMs: 5000 });
  const { push } = useToast();
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState("");

  const approve = async (id) => {
    setBusy("approve-" + id);
    try {
      const res = await api.post("/distributor/client-requests/" + id + "/approve");
      push(res.message, res.shortfall > 0 ? "info" : "success");
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (e) => {
    e.preventDefault();
    setBusy("reject-" + rejectTarget);
    try {
      await api.post("/distributor/client-requests/" + rejectTarget + "/reject", { reason });
      push("Request #" + rejectTarget + " rejected.", "info");
      setRejectTarget(null);
      setReason("");
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const gpsPing = async (id) => {
    setBusy("gps-" + id);
    try {
      await api.post("/distributor/client-requests/" + id + "/gps-ping", {});
      push("GPS position updated.", "success");
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const coldReading = async (id, forceBreach) => {
    setBusy("cold-" + id);
    try {
      const body = forceBreach ? { temp: 14.5, humidity: 78 } : {};
      const res = await api.post("/distributor/client-requests/" + id + "/cold-chain-reading", body);
      push(res.breached ? "Cold-chain breach detected! " + res.alerts.join("; ") : "Sensor reading logged: within safe range.", res.breached ? "error" : "success");
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
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-900">Client Requests</h2>
        <p className="text-sm text-slate-500">Last-mile orders raised by your medicals &amp; institutions &mdash; sorted by priority.</p>
      </div>

      <div className="card overflow-hidden">
        <table className="table-shell">
          <thead>
            <tr>
              <th></th>
              <th>Req #</th>
              <th>Client</th>
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
                  <td className="font-medium text-ink-900 flex items-center gap-1.5"><Building2 size={12} className="text-slate-400" /> {r.clientName}</td>
                  <td>{r.drugName}</td>
                  <td>{r.qtyRequested}</td>
                  <td>
                    <span className={"badge border " + PRIORITY_STYLE[r.priority]}>
                      {r.priority === "critical" && <AlertTriangle size={11} />}
                      {r.priority}
                    </span>
                  </td>
                  <td><Badge value={r.status} /></td>
                  <td className="space-x-1.5">
                    {r.status === "pending" && (
                      <>
                        <button onClick={() => approve(r.id)} disabled={busy === "approve-" + r.id} className="btn bg-distributor text-white hover:bg-distributor/90 !py-1 !px-2.5 text-xs">
                          {busy === "approve-" + r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Approve
                        </button>
                        <button onClick={() => setRejectTarget(r.id)} className="btn-outline !py-1 !px-2.5 text-xs text-red-600 border-red-200 hover:bg-red-50">
                          <X size={12} /> Reject
                        </button>
                      </>
                    )}
                    {r.status === "dispatched" && (
                      <>
                        <button onClick={() => gpsPing(r.id)} disabled={busy === "gps-" + r.id} className="btn-outline !py-1 !px-2.5 text-xs">
                          {busy === "gps-" + r.id ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                        </button>
                        <button onClick={() => coldReading(r.id, false)} disabled={busy === "cold-" + r.id} className="btn-outline !py-1 !px-2.5 text-xs">
                          <Thermometer size={12} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={8} className="bg-slate-50 px-6 py-4">
                      <div className="grid md:grid-cols-3 gap-4 text-xs">
                        <div>
                          <p className="font-semibold text-slate-600 mb-1.5">FEFO Batch Allocation</p>
                          {r.batchesAllocated.length === 0 ? <p className="text-slate-400">Not yet allocated.</p> : (
                            <ul className="space-y-1">{r.batchesAllocated.map((b, i) => <li key={i} className="font-mono text-slate-500">{b.batch} &mdash; {b.qty} units (exp. {b.expiryDate})</li>)}</ul>
                          )}
                          {r.qtyDispatched != null && r.qtyDispatched < r.qtyRequested && (
                            <p className="text-amber-600 mt-1">⚠ Partial fulfillment: {r.qtyDispatched}/{r.qtyRequested}</p>
                          )}
                        </div>
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
                      {r.status === "rejected" && r.rejectionReason && <p className="text-xs text-red-600 mt-3">Rejected: {r.rejectionReason}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} title={"Reject Request #" + rejectTarget}>
        <form onSubmit={reject} className="space-y-3">
          <label className="text-xs font-medium text-slate-600 space-y-1 block">
            Reason
            <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input focus:ring-distributor/20 focus:border-distributor" placeholder="e.g. Insufficient regional stock this cycle" />
          </label>
          <button type="submit" disabled={busy && busy.startsWith("reject")} className="btn-danger w-full">
            {busy && busy.startsWith("reject") && <Loader2 size={16} className="animate-spin" />}
            Confirm Rejection
          </button>
        </form>
      </Modal>
    </div>
  );
}
