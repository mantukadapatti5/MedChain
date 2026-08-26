import { useState } from "react";
import { Plus, Building2, Loader2, MapPinned, ShieldCheck, ShieldAlert } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/Modal";
import ErrorBanner from "../../components/ErrorBanner";

const REGIONS = ["North Zone", "South Zone", "East Zone", "West Zone"];
const TYPES = ["Pharmacy", "Hospital", "Clinic", "Institution"];

const emptyForm = { name: "", type: TYPES[0], region: REGIONS[0], contactPerson: "", phone: "", email: "", password: "" };

export default function DistributorClients() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/distributor/clients"), { intervalMs: 10000 });
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [regionFilter, setRegionFilter] = useState("all");
  const [search, setSearch] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/distributor/clients", form);
      push(form.name + " onboarded with portal access (" + form.email + ").", "success");
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

  const visible = data.filter((c) => {
    const regionOk = regionFilter === "all" || c.region === regionFilter;
    const searchOk = !search.trim() || c.name.toLowerCase().includes(search.toLowerCase());
    return regionOk && searchOk;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Clients</h2>
          <p className="text-sm text-slate-500">Medicals &amp; institutions served by this distribution hub &mdash; {data.length} onboarded.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn bg-distributor text-white hover:bg-distributor/90">
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="input !w-auto text-sm flex-1 min-w-[200px]"
        />
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="input !w-auto text-sm">
          <option value="all">All Regions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((c) => (
          <div key={c.id} className="card p-5 flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-distributor-soft text-distributor flex items-center justify-center shrink-0">
              <Building2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900 truncate">{c.name}</p>
              <p className="text-xs text-slate-500">{c.type}</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="badge bg-slate-100 text-slate-600"><MapPinned size={11} /> {c.region}</span>
                {c.licenseVerified ? (
                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200"><ShieldCheck size={11} /> Verified</span>
                ) : (
                  <span className="badge bg-amber-50 text-amber-700 border border-amber-200"><ShieldAlert size={11} /> Pending</span>
                )}
              </div>
              {c.contactPerson && <p className="text-xs text-slate-400 mt-2">{c.contactPerson} &middot; {c.phone}</p>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Onboard New Client">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Institution Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600 space-y-1 block">
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input focus:ring-distributor/20 focus:border-distributor">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 space-y-1 block">
              Region
              <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input focus:ring-distributor/20 focus:border-distributor">
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Person" value={form.contactPerson} onChange={(v) => setForm({ ...form, contactPerson: v })} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </div>
          <p className="text-xs font-semibold text-slate-500 pt-1">Portal Login Credentials</p>
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          <Field label="Temporary Password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
          <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Onboard &amp; Create Login
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
