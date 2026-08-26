import { TrendingUp, TrendingDown, Minus, Brain, Flame, Database, Target, CheckCircle2, AlertCircle } from "lucide-react";
import { usePoll } from "../../hooks/usePoll";
import { api } from "../../api/api";
import ErrorBanner from "../../components/ErrorBanner";

const TREND_ICON = { rising: TrendingUp, falling: TrendingDown, stable: Minus, flat: Minus };
const TREND_COLOR = { rising: "text-emerald-600 bg-emerald-50", falling: "text-red-600 bg-red-50", stable: "text-slate-500 bg-slate-100", flat: "text-slate-500 bg-slate-100" };

export default function VendorAnalytics() {
  const { data, loading, error } = usePoll(() => api.get("/vendor/analytics"), { intervalMs: 10000 });
  const { data: modelInfo } = usePoll(() => api.get("/vendor/model-info").catch(() => null), { intervalMs: 30000 });

  if (loading) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;
  if (error) return <ErrorBanner message={error} />;

  const drugs = Object.entries(data);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Brain size={18} className="text-vendor" />
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Demand Forecasting &amp; Analytics</h2>
          <p className="text-sm text-slate-500">A Random Forest model trained on synthetic historical sales data, evaluated on data it never saw during training.</p>
        </div>
      </div>

      {modelInfo && (
        <div className="card p-5 bg-gradient-to-br from-vendor-soft to-white">
          <div className="flex items-center gap-1.5 mb-3">
            <Database size={15} className="text-vendor" />
            <p className="font-semibold text-ink-900 text-sm">Model Training Report</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-lg font-display font-semibold text-ink-900">{modelInfo.datasetSize.toLocaleString()}</p>
              <p className="text-[10px] uppercase text-slate-400">Training Records</p>
            </div>
            <div>
              <p className="text-lg font-display font-semibold text-ink-900">{modelInfo.testRows.toLocaleString()}</p>
              <p className="text-[10px] uppercase text-slate-400">Held-Out Test Rows</p>
            </div>
            <div>
              <p className="text-lg font-display font-semibold text-vendor">{modelInfo.metrics.onHeldOutTestData.r2}</p>
              <p className="text-[10px] uppercase text-slate-400">Overall R&sup2; (test)</p>
            </div>
            <div>
              <p className="text-lg font-display font-semibold text-vendor">{modelInfo.metrics.onHeldOutTestData.mape}%</p>
              <p className="text-[10px] uppercase text-slate-400">Overall MAPE (test)</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            {modelInfo.method} &middot; {modelInfo.testSplitStrategy}
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {drugs.map(([name, d]) => {
          const Icon = TREND_ICON[d.forecast.trend] || Minus;
          const metrics = d.forecast.testMetrics;
          return (
            <div key={name} className={`card p-5 ${d.surge?.isSurge ? "border-2 border-red-300" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink-900">{name}</p>
                {d.surge?.isSurge && (
                  <span className="badge bg-red-50 text-red-700 border border-red-200">
                    <Flame size={12} /> Surge {d.surge.ratio}x
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`badge ${TREND_COLOR[d.forecast.trend]}`}>
                  <Icon size={13} /> {d.forecast.trend}
                </span>
                {d.forecast.isTrainedModel ? (
                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 size={11} /> Trained model
                  </span>
                ) : (
                  <span className="badge bg-slate-100 text-slate-500 border border-slate-200">
                    <AlertCircle size={11} /> Fallback method
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{d.forecast.method}</p>

              {metrics && (
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Target size={11} /> R&sup2;={metrics.r2}</span>
                  <span>MAE={metrics.mae}</span>
                  <span>MAPE={metrics.mape}%</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div>
                  <p className="text-lg font-display font-semibold text-ink-900">{d.currentStock}</p>
                  <p className="text-[10px] uppercase text-slate-400">Current Stock</p>
                </div>
                <div>
                  <p className="text-lg font-display font-semibold text-ink-900">{d.forecast.forecastNextPeriod}</p>
                  <p className="text-[10px] uppercase text-slate-400">Forecast Next 7 Days</p>
                </div>
                <div>
                  <p className="text-lg font-display font-semibold text-vendor">{d.recommendedROP}</p>
                  <p className="text-[10px] uppercase text-slate-400">Recommended ROP</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
