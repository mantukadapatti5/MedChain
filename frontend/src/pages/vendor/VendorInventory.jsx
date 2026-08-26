import { useState } from "react";
import { Plus, Snowflake, Loader2 } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";
import { formatINR } from "../../utils/currency";

const emptyForm = {
  drugName: "",
  category: "",
  batch: "",
  manufacturer: "Sunrise Pharma",
  stock: "",
  reorderPoint: "",
  unitPrice: "",
  expiryDate: "",
  coldChain: false,
};

export default function VendorInventory() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/vendor/inventory"), { intervalMs: 8000 });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/vendor/inventory", {
        ...form,
        stock: Number(form.stock),
        reorderPoint: Number(form.reorderPoint),
        unitPrice: Number(form.unitPrice),
      });
      push(`Batch ${form.batch} added to inventory and recorded on the ledger.`, "success");
      setForm(emptyForm);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Inventory</h2>
          <p className="text-sm text-slate-500">Available stock across all registered batches.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn bg-vendor text-white hover:bg-vendor/90">
          <Plus size={16} /> Add Batch
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Drug</th>
              <th>Batch</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Reorder Pt.</th>
              <th>Unit Price</th>
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
                <td>{item.category}</td>
                <td className={item.stock <= item.reorderPoint ? "font-semibold text-red-600" : ""}>{item.stock}</td>
                <td>{item.reorderPoint}</td>
                <td>{formatINR(item.unitPrice)}</td>
                <td>{item.expiryDate}</td>
                <td className="space-x-1">
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

      <Modal open={open} onClose={() => setOpen(false)} title="Register New Batch">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Drug Name" value={form.drugName} onChange={(v) => handleChange("drugName", v)} required />
            <Field label="Category" value={form.category} onChange={(v) => handleChange("category", v)} />
            <Field label="Batch No." value={form.batch} onChange={(v) => handleChange("batch", v)} required />
            <Field label="Manufacturer" value={form.manufacturer} onChange={(v) => handleChange("manufacturer", v)} />
            <Field label="Stock Qty" type="number" value={form.stock} onChange={(v) => handleChange("stock", v)} required />
            <Field label="Reorder Point" type="number" value={form.reorderPoint} onChange={(v) => handleChange("reorderPoint", v)} required />
            <Field label="Unit Price (INR)" type="number" step="0.01" value={form.unitPrice} onChange={(v) => handleChange("unitPrice", v)} required />
            <Field label="Expiry Date" type="date" value={form.expiryDate} onChange={(v) => handleChange("expiryDate", v)} required />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.coldChain} onChange={(e) => handleChange("coldChain", e.target.checked)} className="rounded border-slate-300" />
            Requires cold-chain (2&ndash;8&deg;C) monitoring
          </label>
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Add to Inventory
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
      <input {...props} onChange={(e) => onChange(e.target.value)} className="input focus:ring-vendor/20 focus:border-vendor" />
    </label>
  );
}
