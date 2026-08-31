const { predictNextPeriod } = require("../ml/predict");

function numericQty(row) {
  return Number(row.qty || row.quantity || 0);
}

function normalizeHistory(rows) {
  return rows
    .map((row) => ({
      date: row.date || row.recordedAt || row.createdAt,
      qty: numericQty(row),
    }))
    .filter((row) => row.qty > 0 && row.date && !Number.isNaN(new Date(row.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function aggregateByDay(rows) {
  const byDay = new Map();
  rows.forEach((row) => {
    const day = new Date(row.date).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + row.qty);
  });
  return [...byDay.entries()].map(([date, qty]) => ({ date, qty }));
}

function movingAverageForecast(history, days) {
  const values = history.map((row) => row.qty);
  if (!values.length) return Array(days).fill(0);
  const window = Math.min(7, values.length);
  const avg = values.slice(-window).reduce((sum, value) => sum + value, 0) / window;
  return Array(days).fill(Number(avg.toFixed(1)));
}

function forecastSeries(drugName, history, horizon) {
  const daily = aggregateByDay(normalizeHistory(history));
  if (daily.length >= 3) {
    try {
      const result = predictNextPeriod(drugName, daily, horizon);
      if (result?.available) return { forecast: result, method: result.method || "Random Forest" };
    } catch (_) {
      // Fall back to a transparent moving-average forecast when a drug/client
      // segment does not have enough compatible model history.
    }
  }

  const breakdown = movingAverageForecast(daily, horizon);
  return {
    forecast: {
      available: true,
      forecastNextPeriod: Math.round(breakdown.reduce((sum, value) => sum + value, 0)),
      dailyBreakdown: breakdown,
      trend: breakdown.length > 1 && breakdown[breakdown.length - 1] > breakdown[0] ? "rising" : "stable",
    },
    method: daily.length >= 3 ? "Moving Average fallback" : "Insufficient segment history — baseline estimate",
  };
}

function buildRegionalForecast(db, { drugName, region, clientId, days = 7 } = {}) {
  const horizon = Math.max(1, Math.min(Number(days) || 7, 30));
  const clients = Array.isArray(db.clients) ? db.clients : [];
  const targets = clients.filter((client) =>
    (!region || client.region === region) && (!clientId || Number(client.id) === Number(clientId))
  );

  const drugNames = drugName
    ? [drugName]
    : [...new Set([
        ...(db.vendorInventory || []).map((i) => i.drugName),
        ...(db.distributorInventory || []).map((i) => i.drugName),
        ...(db.clientInventory || []).map((i) => i.drugName),
      ].filter(Boolean))];

  const usageLog = Array.isArray(db.clientUsageLog) ? db.clientUsageLog : [];
  const clientRequests = Array.isArray(db.clientRequests) ? db.clientRequests : [];
  const sales = Array.isArray(db.sales) ? db.sales : [];
  const results = [];

  targets.forEach((client) => {
    drugNames.forEach((name) => {
      const usageHistory = usageLog.filter((row) => Number(row.clientId) === Number(client.id) && row.drugName === name);
      const requestHistory = clientRequests.filter((row) => Number(row.clientId) === Number(client.id) && row.drugName === name && row.status !== "rejected");
      const clientHistory = [...usageHistory, ...requestHistory];
      const externalSales = sales.filter((row) => row.drugName === name && (!region || row.region === region) && (!client.name || row.buyer === client.name));
      const history = clientHistory.length ? clientHistory : externalSales;
      if (!history.length) return;

      const { forecast, method } = forecastSeries(name, history, horizon);
      const currentStock = (db.clientInventory || [])
        .filter((row) => Number(row.clientId) === Number(client.id) && row.drugName === name)
        .reduce((sum, row) => sum + Number(row.stock || 0), 0);

      const forecastTotal = Number(forecast.forecastNextPeriod || 0);
      const dailyRate = horizon > 0 ? forecastTotal / horizon : 0;
      const daysOfSupply = dailyRate > 0 ? Number((currentStock / dailyRate).toFixed(1)) : null;
      const shortageRisk = daysOfSupply == null ? "unknown" : daysOfSupply < 3 ? "critical" : daysOfSupply < 7 ? "high" : daysOfSupply < 14 ? "medium" : "low";

      results.push({
        clientId: client.id,
        clientName: client.name,
        clientType: client.type,
        region: client.region,
        drugName: name,
        currentStock,
        forecastDemand: forecastTotal,
        dailyForecast: forecast.dailyBreakdown || [],
        daysOfSupply,
        shortageRisk,
        historyRecords: history.length,
        source: usageHistory.length ? "Client usage history" : "Client requests / sales history",
        model: method,
      });
    });
  });

  results.sort((a, b) => (b.forecastDemand - a.forecastDemand) || (a.daysOfSupply ?? 9999) - (b.daysOfSupply ?? 9999));
  return { horizonDays: horizon, filters: { drugName: drugName || null, region: region || null, clientId: clientId || null }, results };
}

function summarizeRegions(report) {
  const byRegion = {};
  report.results.forEach((row) => {
    if (!byRegion[row.region]) byRegion[row.region] = { region: row.region, forecastDemand: 0, currentStock: 0, criticalItems: 0, highRiskItems: 0 };
    byRegion[row.region].forecastDemand += row.forecastDemand;
    byRegion[row.region].currentStock += row.currentStock;
    if (row.shortageRisk === "critical") byRegion[row.region].criticalItems++;
    if (row.shortageRisk === "high") byRegion[row.region].highRiskItems++;
  });
  return Object.values(byRegion).sort((a, b) => b.forecastDemand - a.forecastDemand);
}

module.exports = { buildRegionalForecast, summarizeRegions };
