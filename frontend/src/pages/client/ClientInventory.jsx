import { useState } from "react";
import { Boxes, Snowflake, Loader2, Minus } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";

export default function ClientInventory() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/client/inventory"), { intervalMs: 8000 });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ drugName: "", qty: "", note: "" });
  const [submitting, setSubmitting] = useState(false);

  const recordUsage = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/client/usage", { ...form, qty: Number(form.qty) });
      push("Usage recorded: " + form.qty + " units of " + form.drugName + ".", "success");
      setForm({ drugName: "", qty: "", note: "" });
      setOpen(false);
      refresh();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  const totalUnits = data.reduce((s, i) => s + i.stock, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">My Inventory</h2>
          <p className="text-sm text-slate-500">Medicine currently on hand at your facility — updates as shipments arrive and are dispensed.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn bg-client text-white hover:bg-client/90">
          <Minus size={16} /> Record Usage
        </button>
      </div>

      <div className="stat-card w-fit">
        <span className="text-xs font-semibold uppercase text-slate-500">Total On-Hand Units</span>
        <span className="text-2xl font-display font-semibold text-ink-900">{totalUnits}</span>
      </div>

      {data.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No stock on hand yet — it will appear here once a request is received.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-shell">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Batch</th>
                <th>On-Hand Stock</th>
                <th>Expiry</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium text-ink-900 flex items-center gap-1.5">
                    {item.coldChain && <Snowflake size={13} className="text-blue-500" />}
                    {item.drugName}
                  </td>
                  <td className="font-mono text-xs text-slate-500">{item.batch}</td>
                  <td>{item.stock}</td>
                  <td>{item.expiryDate}</td>
                  <td>
                    {item.flags.length === 0 ? (
                      <span className="text-xs text-emerald-600">Compliant</span>
                    ) : (
                      item.flags.map((f, i) => <Badge key={i} value={f.severity} />)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Record Medicine Usage">
        <form onSubmit={recordUsage} className="space-y-3">
          <p className="text-xs text-slate-500">Drawn from your oldest-expiring batch first (FEFO).</p>
          <Field label="Drug Name" value={form.drugName} onChange={(v) => setForm({ ...form, drugName: v })} required />
          <Field label="Quantity Dispensed" type="number" value={form.qty} onChange={(v) => setForm({ ...form, qty: v })} required />
          <Field label="Note (optional)" value={form.note} onChange={(v) => setForm({ ...form, note: v })} placeholder="e.g. Dispensed to outpatients" />
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Record Usage
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
      <input {...props} onChange={(e) => onChange(e.target.value)} className="input focus:ring-client/20 focus:border-client" />
    </label>
  );
}
