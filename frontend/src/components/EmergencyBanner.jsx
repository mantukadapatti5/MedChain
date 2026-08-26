import { useEffect, useState } from "react";
import { Siren } from "lucide-react";
import { api } from "../api/api";

export default function EmergencyBanner() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let mounted = true;
    const check = () => {
      api.get("/blockchain/emergency-status").then((r) => mounted && setStatus(r)).catch(() => {});
    };
    check();
    const id = setInterval(check, 7000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (!status?.emergencyMode) return null;

  return (
    <div className="bg-red-600 text-white px-6 py-2 flex items-center gap-2 text-sm font-medium">
      <Siren size={15} className="animate-pulse" />
      Emergency Mode Active &mdash; priority allocation &amp; surge-scaled procurement are in effect
      {status.updatedBy && <span className="text-red-200 text-xs ml-1">(activated by {status.updatedBy})</span>}
    </div>
  );
}
