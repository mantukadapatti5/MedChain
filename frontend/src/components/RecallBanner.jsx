import { useState } from "react";
import { AlertOctagon, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { usePoll } from "../hooks/usePoll";
import { api } from "../api/api";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

export default function RecallBanner() {
  const { data } = usePoll(() => api.get("/blockchain/recalls/active"), { intervalMs: 10000 });
  const { user } = useAuth();
  const { push } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(null);

  if (!data || data.length === 0) return null;

  const myAck = (recall) => recall.acknowledgedBy.some((a) => a.email === user?.email);

  const acknowledge = async (id) => {
    setBusy(id);
    try {
      await api.post(`/blockchain/recalls/${id}/acknowledge`);
      push("Recall acknowledged.", "success");
    } catch (err) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-red-700 text-white text-sm">
      <button onClick={() => setExpanded((e) => !e)} className="w-full px-6 py-2 flex items-center gap-2 font-medium">
        <AlertOctagon size={15} />
        {data.length} active drug recall{data.length > 1 ? "s" : ""} — review and acknowledge
        {expanded ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
      </button>
      {expanded && (
        <div className="bg-red-800 px-6 py-3 space-y-2">
          {data.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 bg-red-700/50 rounded-lg px-3 py-2">
              <div>
                <p className="font-semibold">{r.drugName} &mdash; batch {r.batch}</p>
                <p className="text-red-100 text-xs">{r.reason}</p>
              </div>
              {myAck(r) ? (
                <span className="text-xs flex items-center gap-1 text-emerald-200 shrink-0"><Check size={13} /> Acknowledged</span>
              ) : (
                <button
                  onClick={() => acknowledge(r.id)}
                  disabled={busy === r.id}
                  className="btn bg-white text-red-700 hover:bg-red-50 !py-1 !px-2.5 text-xs shrink-0"
                >
                  {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : "Acknowledge"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
