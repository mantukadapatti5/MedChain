import { useState } from "react";
import { Snowflake, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import { useToast } from "../../context/ToastContext";
import ErrorBanner from "../../components/ErrorBanner";

export default function VendorColdChain() {
  const { data, loading, error, refresh } = usePoll(() => api.get("/vendor/cold-chain"), { intervalMs: 6000 });
  const { push } = useToast();
  const [busy, setBusy] = useState(null);

  const logReading = async (batch, forceBreach) => {
    setBusy(batch);
    try {
      const body = forceBreach ? { temp: 15.8, humidity: 78 } : {};
      const res = await api.post(`/vendor/cold-chain/${encodeURIComponent(batch)}/reading`, body);
      push(res.breached ? `Breach detected on ${batch}: ${res.alerts.join("; ")}` : `Reading logged for ${batch}: within safe range.`, res.breached ? "error" : "success");
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
      <div className="flex items-center gap-2">
        <Snowflake size={18} className="text-blue-500" />
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Cold Chain Monitoring</h2>
          <p className="text-sm text-slate-500">Live temperature &amp; humidity for cold-chain batches held in the Vendor's own warehouse.</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No cold-chain batches registered yet.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((item) => {
            const reading = item.latestReading;
            const breach = reading?.alert;
            return (
              <div key={item.id} className={`card p-5 border-2 ${breach ? "border-red-200" : "border-transparent"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-ink-900">{item.drugName}</p>
                    <p className="font-mono text-xs text-slate-500">{item.batch}</p>
                  </div>
                  {breach ? (
                    <span className="badge bg-red-50 text-red-700 border border-red-200"><AlertTriangle size={12} /> Breach</span>
                  ) : (
                    <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> Normal</span>
                  )}
                </div>

                {reading ? (
                  <div className="grid grid-cols-2 gap-3 mt-4 text-center">
                    <div>
                      <p className={`text-xl font-display font-semibold ${breach ? "text-red-600" : "text-ink-900"}`}>{reading.temp}&deg;C</p>
                      <p className="text-[10px] uppercase text-slate-400">Temperature</p>
                    </div>
                    <div>
                      <p className={`text-xl font-display font-semibold ${breach ? "text-red-600" : "text-ink-900"}`}>{reading.humidity}%</p>
                      <p className="text-[10px] uppercase text-slate-400">Humidity</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-4">No sensor readings logged yet.</p>
                )}

                <div className="flex gap-2 mt-4">
                  <button onClick={() => logReading(item.batch, false)} disabled={busy === item.batch} className="btn-outline text-xs !py-1.5 flex-1">
                    {busy === item.batch ? <Loader2 size={12} className="animate-spin" /> : null}
                    Log Sensor Reading
                  </button>
                  <button onClick={() => logReading(item.batch, true)} disabled={busy === item.batch} className="btn-outline text-xs !py-1.5 text-red-600 border-red-200 hover:bg-red-50">
                    Simulate Breach
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
