const fs = require("fs");
const path = require("path");
const RandomForestRegressor = require("./randomForest");
const { computeFeatures } = require("./features");
const { DRUGS } = require("./generateDataset");

const MODEL_PATH = path.join(__dirname, "model.json");
const REPORT_PATH = path.join(__dirname, "training_report.json");

let cachedModel = null;
let cachedReport = null;

function categoryFor(drugName) {
  const match = DRUGS.find((d) => d.name === drugName);
  return match ? match.category : "Analgesic";
}

function baselineFor(drugName) {
  const match = DRUGS.find((d) => d.name === drugName);
  return match ? match.base : 20;
}

function loadModel() {
  if (cachedModel) return cachedModel;
  if (!fs.existsSync(MODEL_PATH)) return null;
  const json = JSON.parse(fs.readFileSync(MODEL_PATH, "utf-8"));
  cachedModel = RandomForestRegressor.fromJSON(json);
  return cachedModel;
}

function loadReport() {
  if (cachedReport) return cachedReport;
  if (!fs.existsSync(REPORT_PATH)) return null;
  cachedReport = JSON.parse(fs.readFileSync(REPORT_PATH, "utf-8"));
  return cachedReport;
}

/**
 * Predicts demand for the next `daysAhead` days for a drug, using the
 * trained Random Forest plus the drug's own recent live sales history
 * (from the running app's actual database, not the synthetic training set)
 * to build lag/rolling features for "today". This is how the model's
 * learned seasonal/weekday patterns get applied to genuinely current data.
 *
 * `recentHistory` = array of { date, qty } from live sales, chronological.
 */
function predictNextPeriod(drugName, recentHistory = [], daysAhead = 7) {
  const model = loadModel();
  const report = loadReport();
  if (!model) {
    return { available: false, reason: "Model not trained yet. Run `npm run train-model` in backend/." };
  }

  const category = categoryFor(drugName);
  const qtyHistory = recentHistory
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((r) => r.qty);

  // If there's real history, use it as-is. If there's none at all, seed
  // the rolling window with the drug's known typical baseline (from the
  // training catalog) rather than zeros — zeros would tell the model
  // "this drug sells nothing," which is a false and misleading signal,
  // not a neutral one.
  const seedValue = qtyHistory.length > 0 ? qtyHistory[qtyHistory.length - 1] : baselineFor(drugName);
  const rollingHistory = qtyHistory.length >= 7 ? qtyHistory.slice() : Array(7 - qtyHistory.length).fill(seedValue).concat(qtyHistory);

  const today = new Date();
  const daily = [];

  for (let d = 0; d < daysAhead; d++) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + d);
    const features = computeFeatures(targetDate, category, rollingHistory.length, rollingHistory);
    const pred = Math.max(0, model.predictOne(features));
    daily.push(Number(pred.toFixed(1)));
    rollingHistory.push(pred);
  }

  const forecastNextPeriod = Math.round(daily.reduce((s, v) => s + v, 0));
  const drugMetrics = report && report.perDrugTestMetrics ? report.perDrugTestMetrics[drugName] : null;

  return {
    available: true,
    forecastNextPeriod,
    dailyBreakdown: daily,
    method: report ? report.method : "Random Forest Regressor (trained)",
    trainedAt: report ? report.trainedAt : null,
    testMetrics: drugMetrics || (report ? report.metrics.onHeldOutTestData : null),
    isPerDrugMetric: !!drugMetrics,
  };
}

function getTrainingReport() {
  return loadReport();
}

module.exports = { predictNextPeriod, getTrainingReport, loadModel };
