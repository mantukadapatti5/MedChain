const fs = require("fs");
const path = require("path");
const RandomForestClassifier = require("./shortageClassifier");
const { buildFeatures } = require("./shortageFeatures");
const { createSeededRandom } = require("./rng");

const DATA_PATH = path.join(__dirname, "data", "sales_history.json");
const MODEL_PATH = path.join(__dirname, "shortage_model.json");

function loadSales() {
  if (!fs.existsSync(DATA_PATH)) throw new Error("sales_history.json not found. Run npm run train-model first.");
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function mean(values) { return values.length ? values.reduce((s, v) => s + Number(v || 0), 0) / values.length : 0; }

// Creates training examples from the project's existing chronological sales history.
// Stock is simulated from realistic coverage levels because historical on-hand stock
// is not present in the forecasting dataset. The target is future shortage: next-7-day
// demand exceeds current stock after accounting for lead-time demand.
function buildDataset(rows) {
  const byDrug = {};
  rows.forEach((r) => (byDrug[r.drugName] ||= []).push(r));
  const rand = createSeededRandom(20260831);
  const dataset = [];

  Object.values(byDrug).forEach((drugRows) => {
    drugRows.sort((a, b) => new Date(a.date) - new Date(b.date));
    for (let i = 21; i < drugRows.length - 7; i++) {
      const history = drugRows.slice(0, i).map((r) => r.qty);
      const next7 = drugRows.slice(i, i + 7).reduce((s, r) => s + Number(r.qty || 0), 0);
      const recent = history.slice(-7);
      const avg = mean(recent);
      if (!avg) continue;

      // Multiple stock-coverage scenarios prevent the classifier from learning a
      // single fixed threshold and give it both shortage and safe examples.
      for (let scenario = 0; scenario < 2; scenario++) {
        const coverage = scenario === 0 ? 1.5 + rand() * 3 : 0.3 + rand() * 7;
        const stock = Math.max(1, Math.round(avg * coverage));
        const forecast = mean(drugRows.slice(Math.max(0, i - 14), i).map((r) => r.qty)) * 7;
        const leadTimeDays = 2 + Math.floor(rand() * 6);
        const features = buildFeatures({ stock, history, forecastDemand: forecast, leadTimeDays });
        const leadTimeDemand = avg * leadTimeDays;
        const shortage = next7 + leadTimeDemand > stock * 1.05 ? 1 : 0;
        dataset.push({ features, target: shortage, drugName: drugRows[0].drugName, date: drugRows[i].date });
      }
    }
  });
  return dataset;
}

function evaluate(model, rows) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  rows.forEach((r) => {
    const predicted = model.predictOne(r.features).label;
    if (predicted === 1 && r.target === 1) tp++;
    else if (predicted === 0 && r.target === 0) tn++;
    else if (predicted === 1) fp++;
    else fn++;
  });
  const accuracy = (tp + tn) / Math.max(1, rows.length);
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = 2 * precision * recall / Math.max(1e-9, precision + recall);
  return { n: rows.length, accuracy: Number(accuracy.toFixed(4)), precision: Number(precision.toFixed(4)), recall: Number(recall.toFixed(4)), f1: Number(f1.toFixed(4)), confusionMatrix: { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn } };
}

function train() {
  const dataset = buildDataset(loadSales());
  const cutoff = Math.floor(dataset.length * 0.8);
  const trainRows = dataset.slice(0, cutoff);
  const testRows = dataset.slice(cutoff);
  const model = new RandomForestClassifier({ nTrees: 40, maxDepth: 6, minSamplesLeaf: 6, maxFeaturesFraction: 0.7, seed: 4242 });
  model.fit(trainRows.map((r) => r.features), trainRows.map((r) => r.target));
  const report = {
    trainedAt: new Date().toISOString(),
    method: "Random Forest Classifier (40 trees, max depth 6), trained from scratch in JavaScript",
    datasetSize: dataset.length,
    trainRows: trainRows.length,
    testRows: testRows.length,
    splitStrategy: "Chronological generated examples with final 20% held out",
    metrics: { heldOutTest: evaluate(model, testRows) },
  };
  fs.writeFileSync(MODEL_PATH, JSON.stringify(model.toJSON()), "utf-8");
  fs.writeFileSync(path.join(__dirname, "shortage_training_report.json"), JSON.stringify(report, null, 2), "utf-8");
  return report;
}

if (require.main === module) console.log(JSON.stringify(train(), null, 2));
module.exports = { train, buildDataset, evaluate };
