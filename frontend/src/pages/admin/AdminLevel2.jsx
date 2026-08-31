import { useEffect, useState } from "react";
import { api } from "../../api/api";

const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export default function AdminLevel2() {
  const [tab, setTab] = useState("scenario");
  const [inventory, setInventory] = useState([]);
  const [datasetSummary, setDatasetSummary] = useState(null);
  const [drugName, setDrugName] = useState("");
  const [increase, setIncrease] = useState(30);
  const [scenario, setScenario] = useState(null);
  const [redistribution, setRedistribution] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [batch, setBatch] = useState("");
  const [verification, setVerification] = useState(null);
  const [regional, setRegional] = useState(null);
  const [regionalDrug, setRegionalDrug] = useState("");
  const [regionalRegion, setRegionalRegion] = useState("");
  const [shipmentSummary, setShipmentSummary] = useState(null);
  const [coldChainSummary, setColdChainSummary] = useState(null);
  const [message, setMessage] = useState("");

  async function loadData() {
    const [inv, summary, red, sup, shipments, cold] = await Promise.allSettled([
      api.get("/datasets/inventory?limit=500"),
      api.get("/datasets/summary"),
      api.get("/level2/dataset-actions/redistribution-recommendations"),
      api.get("/level2/dataset/supplier-ranking"),
      api.get("/level2/dataset/shipment-summary"),
      api.get("/level2/dataset/cold-chain-summary"),
    ]);
    if (inv.status === "fulfilled") {
      const rows = inv.value?.rows || [];
      setInventory(rows);
      if (rows[0]) setDrugName(rows[0].drug_name);
    }
    if (summary.status === "fulfilled") setDatasetSummary(summary.value);
    if (red.status === "fulfilled") setRedistribution(red.value || []);
    if (sup.status === "fulfilled") setSuppliers(sup.value?.suppliers || []);
    if (shipments.status === "fulfilled") setShipmentSummary(shipments.value);
    if (cold.status === "fulfilled") setColdChainSummary(cold.value);
  }

  useEffect(() => { loadData().catch((e) => setMessage(e.message)); }, []);

  async function runScenario() {
    setMessage("");
    try { setScenario(await api.post("/level2/dataset-actions/scenario", { drugName, demandIncreasePercent: Number(increase), daysAhead: 7 })); }
    catch (e) { setMessage(e.message); }
  }

  async function runRegionalForecast() {
    setMessage("");
    try {
      const query = new URLSearchParams({ days: "7" });
      if (regionalDrug) query.set("drugName", regionalDrug);
      if (regionalRegion) query.set("region", regionalRegion);
      setRegional(await api.get(`/level2/dataset/regional-forecast?${query.toString()}`));
    } catch (e) { setMessage(e.message); }
  }

  async function executeTransfer(row) {
    try {
      const result = await api.post("/level2/redistribution/execute", { drugName: row.drugName, fromRegion: row.fromRegion, toRegion: row.toRegion, qty: row.suggestedQty });
      setMessage(`Transfer #${result.id} completed: ${result.qty} units moved from ${result.fromRegion} to ${result.toRegion}.`);
      await loadData();
    } catch (e) { setMessage(e.message); }
  }

  async function selectSupplier(name) {
    if (!drugName) return setMessage("Select a medicine first.");
    try {
      const result = await api.post("/level2/procurement-selection", { drugName, qty: 100, supplierName: name, reason: "Selected from CSV supplier performance ranking" });
      setMessage(`Supplier ${result.supplierName} selected for procurement.`);
    } catch (e) { setMessage(e.message); }
  }

  async function verifyBatch() {
    setMessage("");
    try { setVerification(await api.get(`/level2/batch/${encodeURIComponent(batch)}/verify`)); }
    catch (e) { setMessage(e.message); }
  }

  const drugs = [...new Set(inventory.map(x => x.drug_name).filter(Boolean))];
  const regions = [...new Set(inventory.map(x => x.region).filter(Boolean))];

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Level 2 — Intelligent Supply Chain</h1><p className="text-slate-500">Five practical features using the six MedChain CSV datasets and existing transactional systems.</p></div>
    {datasetSummary && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Dataset connection: {Object.values(datasetSummary).reduce((n, x) => n + Number(x.rows || 0), 0)} records loaded across {Object.keys(datasetSummary).length} datasets.</div>}
    {message && <div className="rounded-xl bg-slate-100 p-3 text-sm">{message}</div>}
    <div className="flex flex-wrap gap-2">{[["scenario","What-If Simulator"],["regional","Hospital / Regional Forecast"],["redistribution","Stock Redistribution"],["suppliers","Multi-Vendor"],["qr","QR Batch Verification"]].map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === id ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>

    {tab === "scenario" && <section className={card}><h2 className="text-lg font-bold">What-If Demand Simulator</h2><p className="mt-1 text-sm text-slate-500">Uses the CSV sales history for the selected medicine and the trained Random Forest models for the scenario calculation.</p><div className="mt-4 grid gap-3 md:grid-cols-3"><select className="rounded-xl border p-3" value={drugName} onChange={e => setDrugName(e.target.value)}>{drugs.map(x => <option key={x}>{x}</option>)}</select><input className="rounded-xl border p-3" type="number" value={increase} onChange={e => setIncrease(e.target.value)} placeholder="Demand %"/><button className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white" onClick={runScenario}>Run Scenario</button></div>{scenario && <div className="mt-5 grid gap-3 md:grid-cols-5"><div className="rounded-xl bg-slate-50 p-4"><b>Current stock</b><div className="text-2xl">{scenario.currentStock}</div></div><div className="rounded-xl bg-slate-50 p-4"><b>Normal forecast</b><div className="text-2xl">{scenario.baselineForecast}</div></div><div className="rounded-xl bg-slate-50 p-4"><b>Scenario forecast</b><div className="text-2xl">{scenario.scenarioForecast}</div></div><div className="rounded-xl bg-slate-50 p-4"><b>Shortage probability</b><div className="text-2xl">{scenario.scenarioShortageProbability ?? "—"}%</div></div><div className="rounded-xl bg-slate-50 p-4"><b>Risk</b><div className="text-2xl uppercase">{scenario.scenarioRiskLevel || "—"}</div></div></div>}</section>}

    {tab === "regional" && <section className={card}><h2 className="text-lg font-bold">Hospital & Regional Demand Forecast</h2><p className="mt-1 text-sm text-slate-500">Uses hospital demand history plus inventory by region to estimate a 7-day demand and stock coverage.</p><div className="mt-4 grid gap-3 md:grid-cols-3"><select className="rounded-xl border p-3" value={regionalDrug} onChange={e => setRegionalDrug(e.target.value)}><option value="">All medicines</option>{drugs.map(x => <option key={x}>{x}</option>)}</select><select className="rounded-xl border p-3" value={regionalRegion} onChange={e => setRegionalRegion(e.target.value)}><option value="">All regions</option>{regions.map(x => <option key={x}>{x}</option>)}</select><button className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white" onClick={runRegionalForecast}>Generate 7-Day Forecast</button></div>{regional && <><div className="mt-5 grid gap-3 md:grid-cols-4">{regional.regionalSummary?.slice(0,4).map(r => <div key={r.region} className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{r.region}</div><div className="text-xl font-bold">{r.forecastDemand}</div><div className="text-xs">forecast units · {r.criticalItems} critical</div></div>)}</div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Hospital</th><th className="p-3">Region</th><th className="p-3">Medicine</th><th className="p-3">Stock</th><th className="p-3">7-Day Forecast</th><th className="p-3">Days Supply</th><th className="p-3">Risk</th><th className="p-3">Method</th></tr></thead><tbody>{(regional.results || []).map((r, i) => <tr key={`${r.hospitalId}-${r.drugName}-${i}`} className="border-b"><td className="p-3 font-semibold">{r.hospitalName}</td><td className="p-3">{r.region}</td><td className="p-3">{r.drugName}</td><td className="p-3">{r.currentRegionalStock}</td><td className="p-3">{r.forecastDemand}</td><td className="p-3">{r.daysOfSupply ?? "—"}</td><td className="p-3 font-semibold uppercase">{r.shortageRisk}</td><td className="p-3 text-xs text-slate-500">{r.method}</td></tr>)}</tbody></table></div></>}</section>}

    {tab === "redistribution" && <section className={card}><h2 className="text-lg font-bold">Automatic Stock Redistribution</h2><p className="mt-1 text-sm text-slate-500">Recommendations are calculated from the inventory CSV. Executing a transfer updates the live transactional inventory and blockchain ledger.</p><div className="mt-4 space-y-3">{redistribution.length ? redistribution.map(row => <div key={row.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"><div><b>{row.drugName}</b><div className="text-sm text-slate-500">{row.fromRegion} ({row.fromStock}) → {row.toRegion} ({row.toStock}) · Suggested: {row.suggestedQty} units</div></div><button className="rounded-xl bg-slate-900 px-4 py-2 text-white" onClick={() => executeTransfer(row)}>Execute Transfer</button></div>) : <div className="rounded-xl bg-slate-50 p-4 text-slate-500">No redistribution is currently recommended from the dataset.</div>}</div></section>}

    {tab === "suppliers" && <section className={card}><h2 className="text-lg font-bold">Multi-Vendor Supplier Comparison</h2><p className="mt-1 text-sm text-slate-500">Supplier performance comes from the six-supplier CSV and is ranked using quality, on-time delivery, delivery time, price and rejection rate.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Rank</th><th className="p-3">Supplier</th><th className="p-3">Score</th><th className="p-3">Quality</th><th className="p-3">On-time</th><th className="p-3">Delivery</th><th className="p-3">Price</th><th className="p-3">Action</th></tr></thead><tbody>{suppliers.map((s,i) => <tr key={s.supplierId} className="border-b"><td className="p-3">#{i+1}</td><td className="p-3 font-semibold">{s.supplierName}</td><td className="p-3">{s.overallScore}</td><td className="p-3">{s.qualityScore}%</td><td className="p-3">{s.onTimeRate}%</td><td className="p-3">{s.averageDeliveryDays} d</td><td className="p-3">₹{s.averagePrice}</td><td className="p-3"><button className="rounded-lg bg-slate-900 px-3 py-2 text-white" onClick={() => selectSupplier(s.supplierName)}>Select</button></td></tr>)}</tbody></table></div></section>}

    {tab === "qr" && <section className={card}><h2 className="text-lg font-bold">QR Batch Verification</h2><p className="mt-1 text-sm text-slate-500">Enter a batch number from the inventory dataset to verify it against live inventory, recalls and the blockchain ledger.</p><div className="mt-4 flex gap-3"><input className="flex-1 rounded-xl border p-3" value={batch} onChange={e => setBatch(e.target.value)} placeholder="e.g. AZI-001"/><button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white" onClick={verifyBatch}>Verify Batch</button></div>{verification && <div className="mt-5 rounded-xl border p-5"><div className="grid gap-3 md:grid-cols-3"><div><span className="text-xs text-slate-500">Medicine</span><div className="font-semibold">{verification.drugName || "Not found"}</div></div><div><span className="text-xs text-slate-500">Expiry</span><div>{verification.expiryDate || "—"}</div></div><div><span className="text-xs text-slate-500">Blockchain</span><div className="font-semibold">{verification.blockchainVerified ? "✓ Verified" : "Not verified"}</div></div></div><div className="mt-4 text-sm">{verification.activeRecall ? "🚨 Active recall found" : "✓ No active recall found"} · {verification.blockchainEvents} blockchain event(s)</div></div>}</section>}

    <section className="grid gap-4 md:grid-cols-2"><div className={card}><h3 className="font-bold">Shipment Dataset</h3><p className="mt-1 text-sm text-slate-500">{shipmentSummary ? `${shipmentSummary.total} shipment records loaded.` : "Loading shipment data…"}</p>{shipmentSummary && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(shipmentSummary.statusCounts || {}).map(([status,count]) => <span key={status} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{status}: {count}</span>)}</div>}</div><div className={card}><h3 className="font-bold">Cold-Chain Dataset</h3><p className="mt-1 text-sm text-slate-500">{coldChainSummary ? `${coldChainSummary.totalReadings} readings · ${coldChainSummary.breachCount} breaches (${coldChainSummary.breachRate}%).` : "Loading cold-chain data…"}</p></div></section>
  </div>;
}
