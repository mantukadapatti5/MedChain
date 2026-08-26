import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, LogOut, Link2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/api";
import EmergencyBanner from "./EmergencyBanner";
import RecallBanner from "./RecallBanner";

const THEME = {
  vendor: {
    accent: "text-vendor",
    bg: "bg-vendor",
    ring: "ring-vendor",
    soft: "bg-vendor-soft",
    label: "Vendor Portal",
    tagline: "Manufacturing & Procurement",
  },
  distributor: {
    accent: "text-distributor",
    bg: "bg-distributor",
    ring: "ring-distributor",
    soft: "bg-distributor-soft",
    label: "Distributor Portal",
    tagline: "Dispatch & Logistics",
  },
  admin: {
    accent: "text-admin",
    bg: "bg-admin",
    ring: "ring-admin",
    soft: "bg-admin-soft",
    label: "Admin / Regulator Portal",
    tagline: "Compliance & Oversight",
  },
  client: {
    accent: "text-client",
    bg: "bg-client",
    ring: "ring-client",
    soft: "bg-client-soft",
    label: "Client Portal",
    tagline: "Medicals & Institutions",
  },
};

export default function PortalLayout({ portal, navItems, pageTitle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const theme = THEME[portal];
  const [chainOk, setChainOk] = useState(null);

  useEffect(() => {
    let mounted = true;
    const check = () => {
      api
        .get("/blockchain/verify")
        .then((r) => mounted && setChainOk(r.valid))
        .catch(() => mounted && setChainOk(null));
    };
    check();
    const id = setInterval(check, 8000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-ink-950 text-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg ${theme.bg} flex items-center justify-center font-display font-bold text-ink-950`}>
              M
            </div>
            <div>
              <p className="font-display font-semibold text-white text-sm leading-tight">MedChain</p>
              <p className="text-[11px] text-slate-400 leading-tight">Drug Supply Tracker</p>
            </div>
          </div>
        </div>

        <div className="px-5 pt-4 pb-2">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${theme.accent}`}>{theme.label}</p>
          <p className="text-[11px] text-slate-500">{theme.tagline}</p>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? `bg-white/10 text-white`
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <item.icon size={17} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link2 size={13} />
            <span>Hyperledger Fabric &middot; Sim.</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <EmergencyBanner />
        {portal !== "admin" && <RecallBanner />}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div>
            <h1 className="font-display font-semibold text-lg text-ink-900">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border ${
                chainOk === true
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : chainOk === false
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-slate-50 text-slate-500 border-slate-200"
              }`}
              title="Blockchain ledger integrity status"
            >
              {chainOk === false ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
              {chainOk === true ? "Ledger Verified" : chainOk === false ? "Tamper Detected" : "Checking..."}
            </div>
            <div className="h-9 w-px bg-slate-200" />
            <div className="flex items-center gap-2.5">
              <div className={`h-8 w-8 rounded-full ${theme.soft} ${theme.accent} flex items-center justify-center font-semibold text-xs`}>
                {user?.name?.slice(0, 2)?.toUpperCase()}
              </div>
              <div className="leading-tight hidden sm:block">
                <p className="text-sm font-medium text-ink-900">{user?.name}</p>
                <p className="text-[11px] text-slate-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="ml-1 h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-red-600 transition"
                title="Log out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
