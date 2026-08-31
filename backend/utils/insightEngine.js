const {
  getAIForecast,
  detectSurge,
  shortageRisk,
  detectInventoryAnomalies,
} = require("./mlEngine");

/**
 * Turns existing ML/statistical outputs and live inventory signals into
 * short, human-readable decision-support insights. This is intentionally
 * deterministic: it does not pretend that an external LLM generated the
 * result. The intelligence comes from the project's trained models and
 * business signals, then this layer explains the result in plain English.
 */
function severityRank(level) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[level] ?? 0;
}

function buildInsight({ item, portal, forecast, surge, risk, anomalies }) {
  const insight = {
    drugName: item.drugName,
    batch: item.batch,
    region: item.region || null,
    portal,
    severity: "info",
    title: "Inventory is stable",
    message: `${item.drugName} appears stable based on current inventory and demand signals. Continue monitoring normal replenishment levels.`,
    actions: ["Monitor inventory"],
    signals: {
      forecastNext7Days: forecast.forecastNextPeriod,
      forecastTrend: forecast.trend,
      forecastMethod: forecast.method,
      shortageRisk: risk.level,
      daysOfSupply: risk.daysOfSupply,
      surgeDetected: surge.isSurge,
      surgeRatio: surge.ratio,
      anomalyCount: anomalies.length,
    },
  };

  if (risk.level === "critical") {
    insight.severity = "critical";
    insight.title = "Critical shortage risk";
    insight.message = `${item.drugName} has only about ${risk.daysOfSupply} day(s) of supply remaining while predicted demand is ${forecast.forecastNextPeriod} unit(s) for the next 7 days. Immediate replenishment should be reviewed.`;
    insight.actions = ["Review replenishment", "Prioritize this batch"];
  } else if (risk.level === "high") {
    insight.severity = "high";
    insight.title = "High shortage risk";
    insight.message = `${item.drugName} may run short in about ${risk.daysOfSupply} day(s). The demand forecast is ${forecast.forecastNextPeriod} unit(s) for the next 7 days.`;
    insight.actions = ["Review stock request", "Monitor demand closely"];
  } else if (surge.isSurge) {
    insight.severity = "high";
    insight.title = "Demand surge detected";
    insight.message = `${item.drugName} demand is running about ${surge.ratio}x the recent baseline. Consider increasing replenishment before the current stock is depleted.`;
    insight.actions = ["Review replenishment", "Monitor surge"];
  } else if (forecast.trend === "rising") {
    insight.severity = "medium";
    insight.title = "Demand is rising";
    insight.message = `${item.drugName} shows a rising demand trend. The model forecasts about ${forecast.forecastNextPeriod} unit(s) for the next 7 days.`;
    insight.actions = ["Monitor stock", "Review reorder point"];
  }

  if (anomalies.length > 0 && insight.severity === "info") {
    insight.severity = "medium";
    insight.title = "Inventory needs attention";
    insight.message = `${item.drugName} has ${anomalies.length} detected inventory signal(s) that should be reviewed before the next replenishment cycle.`;
    insight.actions = ["Review anomaly cases"];
  }

  return insight;
}

function generateInsights(db) {
  const inputs = [];

  const inventories = [
    ["vendor", db.vendorInventory || []],
    ["distributor", db.distributorInventory || []],
    ["client", db.clientInventory || []],
  ];

  inventories.forEach(([portal, inventory]) => {
    inventory.forEach((item) => {
      const history = (db.sales || [])
        .filter((sale) => sale.drugName === item.drugName)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      const forecast = getAIForecast(item.drugName, history);
      const surge = detectSurge(history);
      const avgDailyDemand = history.length
        ? history.reduce((sum, sale) => sum + Number(sale.qty || 0), 0) / 21
        : 1;
      const risk = shortageRisk(Number(item.stock || 0), avgDailyDemand);
      const anomalies = detectInventoryAnomalies(item);

      inputs.push(buildInsight({ item, portal, forecast, surge, risk, anomalies }));
    });
  });

  inputs.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return inputs;
}

module.exports = { generateInsights };
