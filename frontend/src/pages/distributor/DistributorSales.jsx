import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";
import { formatINR } from "../../utils/currency";

export default function DistributorSales() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/distributor/sales"), { intervalMs: 6000 });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ drugName: "", qty: "", unitPrice: "", buyer: "", region: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/distributor/sales", { ...form, qty: Number(form.qty), unitPrice: Number(form.unitPrice) });
      push(`Sale of ${form.qty} units to ${form.buyer} recorded on the ledger.`, "success");
      setForm({ drugName: "", qty: "", unitPrice: "", buyer: "", region: "" });
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

  const totalAmount = data.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Sales</h2>
          <p className="text-sm text-slate-500">Outbound sales to pharmacies and hospitals.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn bg-distributor text-white hover:bg-distributor/90">
          <Plus size={16} /> Record Sale
        </button>
      </div>

      <div className="stat-card w-fit">
        <span className="text-xs font-semibold uppercase text-slate-500">Total Sales Revenue</span>
        <span className="text-2xl font-display font-semibold text-ink-900">{formatINR(totalAmount)}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Drug</th>
              <th>Batch</th>
              <th>Qty</th>
              <th>Amount</th>
              <th>Buyer</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.slice().reverse().map((s) => (
              <tr key={s.id}>
                <td className="font-medium text-ink-900">{s.drugName}</td>
                <td className="font-mono text-xs text-slate-500">{s.batch}</td>
                <td>{s.qty}</td>
                <td>{formatINR(s.amount)}</td>
                <td>{s.buyer}</td>
                <td className="text-slate-500">{new Date(s.date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record New Sale">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Drug Name" value={form.drugName} onChange={(v) => setForm({ ...form, drugName: v })} required />
          <Field label="Buyer" value={form.buyer} onChange={(v) => setForm({ ...form, buyer: v })} required placeholder="Cityview Pharmacy" />
          <label className="text-xs font-medium text-slate-600 space-y-1 block">
            Region (optional — restricts FEFO pool to this hub)
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input focus:ring-distributor/20 focus:border-distributor">
              <option value="">Any region</option>
              <option value="North Zone">North Zone</option>
              <option value="South Zone">South Zone</option>
              <option value="East Zone">East Zone</option>
              <option value="West Zone">West Zone</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" type="number" value={form.qty} onChange={(v) => setForm({ ...form, qty: v })} required />
            <Field label="Unit Price (INR)" type="number" step="0.01" value={form.unitPrice} onChange={(v) => setForm({ ...form, unitPrice: v })} />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Record Sale
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
      <input {...props} onChange={(e) => onChange(e.target.value)} className="input focus:ring-distributor/20 focus:border-distributor" />
    </label>
  );
}
