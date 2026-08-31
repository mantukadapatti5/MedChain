const FEATURE_NAMES = [
  "stock",
  "avgDailyDemand",
  "forecastDemand",
  "daysOfSupply",
  "leadTimeDays",
  "demandTrend",
  "demandVolatility",
];

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function std(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (Number(v || 0) - m) ** 2)));
}

function buildFeatures({ stock, history = [], forecastDemand = 0, leadTimeDays = 3 }) {
  const clean = history.map(Number).filter(Number.isFinite);
  const recent = clean.slice(-7);
  const previous = clean.slice(-14, -7);
  const avgDailyDemand = mean(recent.length ? recent : clean);
  const previousDemand = mean(previous.length ? previous : recent);
  const demandTrend = previousDemand > 0 ? avgDailyDemand / previousDemand : 1;
  const demandVolatility = std(recent.length ? recent : clean);
  const daysOfSupply = avgDailyDemand > 0 ? Number(stock || 0) / avgDailyDemand : 999;

  return [
    Number(stock || 0),
    Number(avgDailyDemand.toFixed(4)),
    Number(forecastDemand || 0),
    Number(Math.min(daysOfSupply, 999).toFixed(4)),
    Number(leadTimeDays || 3),
    Number(Math.min(demandTrend, 10).toFixed(4)),
    Number(demandVolatility.toFixed(4)),
  ];
}

module.exports = { FEATURE_NAMES, mean, std, buildFeatures };
