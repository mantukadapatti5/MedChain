import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Factory, Truck, ShieldCheck, ArrowRight, Loader2, Building2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const ROLES = [
  { key: "vendor", label: "Vendor", icon: Factory, accent: "border-vendor text-vendor bg-vendor-soft", demo: "vendor@gmail.com / vendor12" },
  { key: "distributor", label: "Distributor", icon: Truck, accent: "border-distributor text-distributor bg-distributor-soft", demo: "dis@gmail.com / dis12" },
  { key: "client", label: "Client", icon: Building2, accent: "border-client text-client bg-client-soft", demo: "client1@gmail.com / client123" },
  { key: "admin", label: "Admin / Regulator", icon: ShieldCheck, accent: "border-admin text-admin bg-admin-soft", demo: "admin@gmail.com / admin12" },
];

export default function Login() {
  const [role, setRole] = useState("vendor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, authError, setAuthError } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const activeRole = ROLES.find((r) => r.key === role);

  const fillDemo = () => {
    const [demoEmail, demoPass] = activeRole.demo.split(" / ");
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setAuthError("");
    try {
      const user = await login(email, password, role);
      push(`Welcome back, ${user.name}. Signed in to the ${user.role} portal.`, "success");
      navigate(`/${user.role}`);
    } catch (err) {
      push(err.message || "Login failed.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-ink-950">
      {/* Hero / brand panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden flex-col justify-between p-12 text-white">
        <div className="absolute inset-0 bg-node-grid [background-size:22px_22px] opacity-40" />
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-chain/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-chain flex items-center justify-center font-display font-bold text-white text-lg">M</div>
            <span className="font-display font-semibold text-xl">MedChain</span>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-xs font-semibold tracking-widest uppercase text-chain-glow mb-4">
            SIH 2025&ndash;26 &middot; Role-Based &middot; IoT + Blockchain
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight mb-4">
            Every batch, traced from bench to bedside.
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            An ML-based drug inventory &amp; supply chain platform connecting Vendors,
            Distributors and Regulators on one immutable ledger &mdash; with live cold-chain
            telemetry, demand forecasting, and counterfeit detection.
          </p>
        </div>

        <ChainStrip />
      </div>

      {/* Login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="h-9 w-9 rounded-xl bg-chain flex items-center justify-center font-display font-bold text-white">M</div>
            <span className="font-display font-semibold text-xl text-ink-900">MedChain</span>
          </div>

          <div className="card p-7">
            <h2 className="font-display text-xl font-semibold text-ink-900">Sign in to your portal</h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">Select your role, then enter your credentials.</p>

            <div className="grid grid-cols-2 gap-2 mb-5">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const active = role === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      setRole(r.key);
                      setAuthError("");
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-all ${
                      active ? r.accent : "border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <Icon size={18} />
                    {r.label}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input focus:ring-ink-900/20 focus:border-ink-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input focus:ring-ink-900/20 focus:border-ink-900"
                />
              </div>

              {authError && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">
                  {authError}
                </div>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full mt-1">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {submitting ? "Signing in..." : `Enter ${activeRole.label} Portal`}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-slate-400">Demo credentials: {activeRole.demo}</span>
              <button onClick={fillDemo} className="font-semibold text-ink-900 hover:underline">
                Autofill
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            Registered account required &middot; unlicensed vendors/distributors must be verified by Admin.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChainStrip() {
  const blocks = ["Vendor", "Distributor", "Cold-Chain", "Client", "Audit"];
  return (
    <div className="relative z-10 mt-10">
      <div className="flex items-center gap-2">
        {blocks.map((b, i) => (
          <div key={b} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-300">{b}</span>
            </div>
            {i < blocks.length - 1 && <span className="h-px w-4 bg-chain-glow/50" />}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-3 font-mono">
        Immutable ledger &middot; every transaction hash-linked to the last
      </p>
    </div>
  );
}
