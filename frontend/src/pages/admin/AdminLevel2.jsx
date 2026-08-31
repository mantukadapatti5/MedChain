import { useEffect, useState } from "react";
import { api } from "../../api/api";

const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export default function AdminLevel2() {
  const [tab, setTab] = useState("scenario");
  const [inventory, setInventory] = useState([]);
  const [drugName, setDrugName] = useState("");
  const [increase, setIncrease] = useState(30);
  const [scenario, setScenario] = useState(null);
  const [redistribution, setRedistribution] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [batch, setBatch] = useState("");
  const [verification, setVerification] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/admin/inventory").then((data) => {
      const rows = Array.isArray(data) ? data : data?.inventory || data?.items || [];
      setInventory(rows);
      if (rows[0]) setDrugName(rows[0].drugName);
    }).catch(() => setInventory([]));
    api.get("/level2/redistribution/recommendations").then(setRedistribution).catch(() => setRedistribution([]));
    api.get("/level2/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  async function runScenario() {
    setMessage("");
    try { setScenario(await api.post("/level2/scenarios", { drugName, demandIncreasePercent: Number(increase), daysAhead: 7 })); }
    catch (e) { setMessage(e.message); }
  }

  async function executeTransfer(row) {
    try {
      const result = await api.post("/level2/redistribution/execute", { drugName: row.drugName, fromRegion: row.fromRegion, toRegion: row.toRegion, qty: row.suggestedQty });
      setMessage(`Transfer #${result.id} completed: ${result.qty} units moved from ${result.fromRegion} to ${result.toRegion}.`);
      setRedistribution(await api.get("/level2/redistribution/recommendations"));
    } catch (e) { setMessage(e.message); }
  }

  async function selectSupplier(name) {
    if (!drugName) return setMessage("Select a medicine first.");
    try {
      const result = await api.post("/level2/procurement-selection", { drugName, qty: 100, supplierName: name, reason: "Highest combined supplier performance score" });
      setMessage(`Supplier ${result.supplierName} selected for procurement.`);
    } catch (e) { setMessage(e.message); }
  }

  async function verifyBatch() {
    try { setVerification(await api.get(`/level2/batch/${encodeURIComponent(batch)}/verify`)); }
    catch (e) { setMessage(e.message); }
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Level 2 — Intelligent Supply Chain</h1><p className="text-slate-500">Four practical features built on the existing MedChain ML, inventory and blockchain systems.</p></div>
    {message && <div className="rounded-xl bg-slate-100 p-3 text-sm">{message}</div>}
    <div className="flex flex-wrap gap-2">{[["scenario","What-If Simulator"],["redistribution","Stock Redistribution"],["suppliers","Multi-Vendor"],["qr","QR Batch Verification"]].map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === id ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>

    {tab === "scenario" && <section className={card}><h2 className="text-lg font-bold">What-If Demand Simulator</h2><p className="mt-1 text-sm text-slate-500">Ask the existing ML models what happens if demand changes.</p><div className="mt-4 grid gap-3 md:grid-cols-3"><select className="rounded-xl border p-3" value={drugName} onChange={e => setDrugName(e.target.value)}>{[...new Set(inventory.map(x => x.drugName).filter(Boolean))].map(x => <option key={x}>{x}</option>)}</select><input className="rounded-xl border p-3" type="number" value={increase} onChange={e => setIncrease(e.target.value)} placeholder="Demand %"/><button className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white" onClick={runScenario}>Run Scenario</button></div>{scenario && <div className="mt-5 grid gap-3 md:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><b>Normal forecast</b><div className="text-2xl">{scenario.baselineForecast}</div></div><div className="rounded-xl bg-slate-50 p-4"><b>Scenario forecast</b><div className="text-2xl">{scenario.scenarioForecast}</div></div><div className="rounded-xl bg-slate-50 p-4"><b>Shortage probability</b><div className="text-2xl">{scenario.scenarioShortageProbability ?? "—"}%</div></div><div className="rounded-xl bg-slate-50 p-4"><b>Risk</b><div className="text-2xl uppercase">{scenario.scenarioRiskLevel || "—"}</div></div></div>}</section>}

    {tab === "redistribution" && <section className={card}><h2 className="text-lg font-bold">Automatic Stock Redistribution</h2><p className="mt-1 text-sm text-slate-500">Move surplus medicine to a lower-stock region before buying new stock.</p><div className="mt-4 space-y-3">{redistribution.length ? redistribution.map(row => <div key={row.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"><div><b>{row.drugName}</b><div className="text-sm text-slate-500">{row.fromRegion} ({row.fromStock}) → {row.toRegion} ({row.toStock}) · Suggested: {row.suggestedQty} units</div></div><button className="rounded-xl bg-slate-900 px-4 py-2 text-white" onClick={() => executeTransfer(row)}>Execute Transfer</button></div>) : <div className="rounded-xl bg-slate-50 p-4 text-slate-500">No redistribution is currently recommended.</div>}</div></section>}

    {tab === "suppliers" && <section className={card}><h2 className="text-lg font-bold">Multi-Vendor Supplier Comparison</h2><p className="mt-1 text-sm text-slate-500">Suppliers are ranked using price, quality, on-time delivery, delivery time and rejection rate.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Rank</th><th className="p-3">Supplier</th><th className="p-3">Score</th><th className="p-3">Quality</th><th className="p-3">On-time</th><th className="p-3">Price</th><th className="p-3">Action</th></tr></thead><tbody>{suppliers.map((s,i) => <tr key={s.id} className="border-b"><td className="p-3">#{i+1}</td><td className="p-3 font-semibold">{s.name}</td><td className="p-3">{s.overallScore}</td><td className="p-3">{s.qualityScore}%</td><td className="p-3">{s.onTimeRate}%</td><td className="p-3">₹{s.price}</td><td className="p-3"><button className="rounded-lg bg-slate-900 px-3 py-2 text-white" onClick={() => selectSupplier(s.name)}>Select</button></td></tr>)}</tbody></table></div></section>}

    {tab === "qr" && <section className={card}><h2 className="text-lg font-bold">QR Batch Verification</h2><p className="mt-1 text-sm text-slate-500">Enter a batch number from a QR label to verify its provenance against inventory and blockchain history.</p><div className="mt-4 flex gap-3"><input className="flex-1 rounded-xl border p-3" value={batch} onChange={e => setBatch(e.target.value)} placeholder="e.g. AZI-001"/><button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white" onClick={verifyBatch}>Verify Batch</button></div>{verification && <div className="mt-5 rounded-xl border p-5"><div className="grid gap-3 md:grid-cols-3"><div><span className="text-xs text-slate-500">Medicine</span><div className="font-semibold">{verification.drugName || "Not found"}</div></div><div><span className="text-xs text-slate-500">Expiry</span><div>{verification.expiryDate || "—"}</div></div><div><span className="text-xs text-slate-500">Blockchain</span><div className="font-semibold">{verification.blockchainVerified ? "✓ Verified" : "Not verified"}</div></div></div><div className="mt-4 text-sm">{verification.activeRecall ? "🚨 Active recall found" : "✓ No active recall found"} · {verification.blockchainEvents} blockchain event(s)</div></div>}</section>}
  </div>;
}
