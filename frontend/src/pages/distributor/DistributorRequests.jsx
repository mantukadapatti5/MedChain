import { useState, Fragment } from "react";
import { Plus, MapPin, Thermometer, ChevronDown, ChevronUp, Loader2, PackageCheck, AlertTriangle, Navigation, Clock, Gauge } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";

const REGIONS = ["North Zone", "South Zone", "East Zone", "West Zone"];
const PRIORITIES = ["routine", "urgent", "critical"];

export default function DistributorRequests() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/distributor/stock-requests"), { intervalMs: 5000 });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ drugName: "", qty: "", region: REGIONS[0], priority: "routine" });
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [qtyReceivedInput, setQtyReceivedInput] = useState("");

  const raiseRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/distributor/stock-requests", { ...form, qty: Number(form.qty) });
      push(`Stock request for ${form.qty} units of ${form.drugName} sent to the Vendor.`, "success");
      setForm({ drugName: "", qty: "", region: REGIONS[0], priority: "routine" });
      setOpen(false);
      refresh();
    } catch (err) { push(err.message, "error"); }
    finally { setSubmitting(false); }
  };

  const gpsPing = async (id) => {
    setBusy(`gps-${id}`);
    try {
      await api.post(`/distributor/stock-requests/${id}/gps-ping`, {});
      push("GPS position updated.", "success");
      refresh();
    } catch (err) { push(err.message, "error"); }
    finally { setBusy(null); }
  };

  const coldReading = async (id, forceBreach) => {
    setBusy(`cold-${id}`);
    try {
      const body = forceBreach ? { temp: 14.5, humidity: 78 } : {};
      const res = await api.post(`/distributor/stock-requests/${id}/cold-chain-reading`, body);
      push(res.breached ? `Cold-chain breach detected! ${res.alerts.join("; ")}` : "Sensor reading logged: within safe range.", res.breached ? "error" : "success");
      refresh();
    } catch (err) { push(err.message, "error"); }
    finally { setBusy(null); }
  };

  const openReceive = (r) => {
    setReceiveTarget(r);
    setQtyReceivedInput(String(r.qtyDispatched));
  };

  const confirmReceive = async (e) => {
    e.preventDefault();
    setBusy(`receive-${receiveTarget.id}`);
    try {
      const res = await api.post(`/distributor/stock-requests/${receiveTarget.id}/receive`, { qtyReceived: Number(qtyReceivedInput) });
      if (res.mismatch?.mismatch) push(`Received with a discrepancy: expected ${receiveTarget.qtyDispatched}, got ${qtyReceivedInput}. Flagged as an anomaly for Admin review.`, "error");
      else push("Shipment received in full. Distributor inventory updated.", "success");
      setReceiveTarget(null);
      refresh();
    } catch (err) { push(err.message, "error"); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Stock Requests</h2>
          <p className="text-sm text-slate-500">Raise a request when regional stock runs low &mdash; the Vendor fulfills it via FEFO allocation.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn bg-distributor text-white hover:bg-distributor/90"><Plus size={16} /> Request Stock</button>
      </div>

      <div className="card overflow-hidden">
        <table className="table-shell">
          <thead><tr><th></th><th>Req #</th><th>Drug</th><th>Qty</th><th>Region</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.slice().reverse().map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td><button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-slate-400 hover:text-ink-900">{expanded === r.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button></td>
                  <td className="font-mono text-xs">#{r.id}</td>
                  <td className="font-medium text-ink-900">{r.drugName}</td>
                  <td>{r.qtyRequested}</td>
                  <td className="text-slate-500">{r.region}</td>
                  <td className="capitalize text-xs">{r.priority}</td>
                  <td><Badge value={r.status} /></td>
                  <td className="space-x-1.5">
                    {r.status === "dispatched" && <>
                      <button onClick={() => gpsPing(r.id)} disabled={busy === `gps-${r.id}`} className="btn-outline !py-1 !px-2.5 text-xs" title="Add simulated GPS ping">{busy === `gps-${r.id}` ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}</button>
                      <button onClick={() => coldReading(r.id, false)} disabled={busy === `cold-${r.id}`} className="btn-outline !py-1 !px-2.5 text-xs" title="Log cold-chain reading"><Thermometer size={12} /></button>
                      <button onClick={() => openReceive(r)} className="btn bg-distributor text-white hover:bg-distributor/90 !py-1 !px-2.5 text-xs"><PackageCheck size={12} /> Receive</button>
                    </>}
                  </td>
                </tr>
                {expanded === r.id && <tr><td colSpan={8} className="bg-slate-50 px-6 py-4">
                  <div className="grid md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="font-semibold text-slate-600 mb-1.5">Fulfillment</p>
                      <p className="text-slate-500">Dispatched: {r.qtyDispatched ?? "—"} &middot; Received: {r.qtyReceived ?? "—"}</p>
                      {r.qtyDispatched != null && r.qtyReceived != null && r.qtyDispatched !== r.qtyReceived && <p className="text-red-600 font-semibold flex items-center gap-1 mt-1"><AlertTriangle size={12} /> Quantity mismatch flagged</p>}
                    </div>
                    <TrackingSummary request={r} />
                    <div>
                      <p className="font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Thermometer size={12} /> Cold-Chain Log</p>
                      {r.coldChainLog.length === 0 ? <p className="text-slate-400">Not applicable or no readings.</p> : <ul className="space-y-1">{r.coldChainLog.map((c, i) => <li key={i} className={`font-mono ${c.alert ? "text-red-600 font-semibold" : "text-slate-500"}`}>{c.temp}&deg;C / {c.humidity}% {c.alert ? "⚠" : ""}</li>)}</ul>}
                    </div>
                  </div>
                </td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Request Stock from Vendor">
        <form onSubmit={raiseRequest} className="space-y-3">
          <Field label="Drug Name" value={form.drugName} onChange={(v) => setForm({ ...form, drugName: v })} required />
          <Field label="Quantity" type="number" value={form.qty} onChange={(v) => setForm({ ...form, qty: v })} required />
          <label className="text-xs font-medium text-slate-600 space-y-1 block">Region<select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input focus:ring-distributor/20 focus:border-distributor">{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600 space-y-1 block">Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input focus:ring-distributor/20 focus:border-distributor">{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">{submitting && <Loader2 size={16} className="animate-spin" />} Send Request</button>
        </form>
      </Modal>

      <Modal open={!!receiveTarget} onClose={() => setReceiveTarget(null)} title={`Confirm Receipt — Request #${receiveTarget?.id}`}>
        {receiveTarget && <form onSubmit={confirmReceive} className="space-y-3">
          <p className="text-sm text-slate-500">Vendor recorded <strong>{receiveTarget.qtyDispatched}</strong> units dispatched. Enter what actually arrived — a mismatch is automatically flagged for Admin review.</p>
          <Field label="Quantity Actually Received" type="number" value={qtyReceivedInput} onChange={setQtyReceivedInput} required />
          <button type="submit" disabled={busy === `receive-${receiveTarget.id}`} className="btn-primary w-full">{busy === `receive-${receiveTarget.id}` && <Loader2 size={16} className="animate-spin" />} Confirm Receipt</button>
        </form>}
      </Modal>
    </div>
  );
}

function TrackingSummary({ request }) {
  const { data, loading, error } = usePoll(() => api.get(`/distributor/stock-requests/${request.id}/tracking`), { intervalMs: 5000 });
  if (loading && !data) return <div><p className="font-semibold text-slate-600 mb-1.5">Shipment Tracking</p><p className="text-slate-400">Calculating route...</p></div>;
  if (error) return <div><p className="font-semibold text-slate-600 mb-1.5">Shipment Tracking</p><p className="text-red-500">Tracking unavailable.</p></div>;
  if (!data) return null;
  return (
    <div>
      <p className="font-semibold text-slate-600 mb-2 flex items-center gap-1"><Navigation size={12} /> Shipment Tracking</p>
      {data.gpsPoints === 0 ? <p className="text-slate-400">No GPS movement yet. Add a GPS ping to start tracking.</p> : <>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Metric icon={<Navigation size={11} />} label="Travelled" value={`${data.travelledKm} km`} />
          <Metric icon={<Navigation size={11} />} label="Remaining" value={`${data.remainingKm} km`} />
          <Metric icon={<Gauge size={11} />} label="Avg speed" value={`${data.averageSpeedKmh} km/h`} />
          <Metric icon={<Clock size={11} />} label="ETA" value={data.etaAt ? new Date(data.etaAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} />
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-distributor transition-all" style={{ width: `${data.progressPercent}%` }} /></div>
        <p className="text-[10px] text-slate-400 mt-1">{data.progressPercent}% route progress &middot; {data.gpsPoints} GPS point(s) &middot; {data.speedSource}</p>
      </>}
      {request.gpsLog?.length > 0 && <ul className="space-y-1 mt-2">{request.gpsLog.slice(-3).map((g, i) => <li key={i} className="font-mono text-[10px] text-slate-500">{new Date(g.timestamp).toLocaleString()} — {g.label}</li>)}</ul>}
    </div>
  );
}

function Metric({ icon, label, value }) {
  return <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5"><div className="flex items-center gap-1 text-slate-400">{icon}<span>{label}</span></div><p className="font-semibold text-slate-700 mt-0.5">{value}</p></div>;
}

function Field({ label, onChange, ...props }) {
  return <label className="text-xs font-medium text-slate-600 space-y-1 block">{label}<input {...props} onChange={(e) => onChange(e.target.value)} className="input focus:ring-distributor/20 focus:border-distributor" /></label>;
}
