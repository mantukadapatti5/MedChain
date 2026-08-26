const STYLES = {
  // order / generic statuses
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  dispatched: "bg-blue-50 text-blue-700 border border-blue-200",
  received: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  // anomaly status
  open: "bg-red-50 text-red-700 border border-red-200",
  investigating: "bg-amber-50 text-amber-700 border border-amber-200",
  escalated: "bg-purple-50 text-purple-700 border border-purple-200",
  resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  // severity
  high: "bg-red-50 text-red-700 border border-red-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-blue-50 text-blue-700 border border-blue-200",
};

const DOT = {
  pending: "bg-amber-500",
  dispatched: "bg-blue-500",
  received: "bg-emerald-500",
  paid: "bg-emerald-500",
  open: "bg-red-500",
  investigating: "bg-amber-500",
  escalated: "bg-purple-500",
  resolved: "bg-emerald-500",
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
};

export default function Badge({ value, withDot = true }) {
  const key = String(value || "").toLowerCase();
  const style = STYLES[key] || "bg-slate-100 text-slate-600 border border-slate-200";
  const dot = DOT[key] || "bg-slate-400";
  return (
    <span className={`badge ${style}`}>
      {withDot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {value}
    </span>
  );
}
