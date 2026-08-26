const fs = require("fs");
const path = require("path");
const RandomForestRegressor = require("./randomForest");
const { computeFeatures } = require("./features");
const { generateDataset, DRUGS } = require("./generateDataset");

/**
 * Trains the demand-forecasting model and honestly evaluates it.
 *
 * Critically, the train/test split is done BY DATE, not by randomly
 * shuffling rows: the model only ever trains on the earlier ~80% of each
 * drug's history and is tested on the later ~20% it has never seen. This
 * is the correct way to validate a time-series forecaster - a random
 * shuffle would let the model "peek" at values close in time to what it's
 * being tested on, which inflates accuracy in a way that would not hold up
 * on genuinely future data. This project deliberately avoids that shortcut.
 */

const TEST_FRACTION = 0.2;

function buildSupervisedRows(rawRows) {
  const byDrug = {};
  rawRows.forEach((r) => {
    if (!byDrug[r.drugName]) byDrug[r.drugName] = [];
    byDrug[r.drugName].push(r);
  });

  const supervised = [];
  Object.entries(byDrug).forEach(([drugName, rows]) => {
    rows.sort((a, b) => new Date(a.date) - new Date(b.date));
    const category = rows[0].category;
    const history = [];

    rows.forEach((row, i) => {
      const date = new Date(row.date);
      const features = computeFeatures(date, category, i, history);
      supervised.push({ drugName, date: row.date, features, target: row.qty, rowIndex: i, totalRows: rows.length });
      history.push(row.qty);
    });
  });

  return supervised;
}

function splitTrainTest(supervised) {
  const train = [];
  const test = [];
  supervised.forEach((row) => {
    const cutoff = Math.floor(row.totalRows * (1 - TEST_FRACTION));
    if (row.rowIndex < cutoff) train.push(row);
    else test.push(row);
  });
  return { train, test };
}

function evaluate(model, rows) {
  const errors = [];
  const actuals = [];

  rows.forEach((row) => {
    const pred = Math.max(0, model.predictOne(row.features));
    actuals.push(row.target);
    errors.push(pred - row.target);
  });

  const n = errors.length;
  const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
  const positiveActuals = actuals.filter((a) => a > 0).length;
  const mape =
    (errors.reduce((s, e, i) => (actuals[i] > 0 ? s + Math.abs(e) / actuals[i] : s), 0) / positiveActuals) * 100;

  const actualMean = actuals.reduce((s, a) => s + a, 0) / n;
  const ssRes = errors.reduce((s, e) => s + e * e, 0);
  const ssTot = actuals.reduce((s, a) => s + (a - actualMean) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    n,
    mae: Number(mae.toFixed(2)),
    rmse: Number(rmse.toFixed(2)),
    mape: Number(mape.toFixed(2)),
    r2: Number(r2.toFixed(3)),
  };
}

function evaluatePerDrug(model, rows) {
  const byDrug = {};
  rows.forEach((r) => {
    if (!byDrug[r.drugName]) byDrug[r.drugName] = [];
    byDrug[r.drugName].push(r);
  });
  const report = {};
  Object.entries(byDrug).forEach(([drugName, drugRows]) => {
    report[drugName] = evaluate(model, drugRows);
  });
  return report;
}

function train() {
  console.log("Generating fresh synthetic dataset...");
  const rawRows = generateDataset();
  fs.writeFileSync(path.join(__dirname, "data", "sales_history.json"), JSON.stringify(rawRows), "utf-8");

  console.log("Building supervised training rows from " + rawRows.length + " raw records...");
  const supervised = buildSupervisedRows(rawRows);

  const { train: trainRows, test: testRows } = splitTrainTest(supervised);
  console.log("Time-based split: " + trainRows.length + " train rows / " + testRows.length + " test rows (test = last " + (TEST_FRACTION * 100) + "% of each drug's calendar, strictly after training data)");

  const X_train = trainRows.map((r) => r.features);
  const y_train = trainRows.map((r) => r.target);

  console.log("Training Random Forest Regressor (40 trees)...");
  const startTime = Date.now();
  const model = new RandomForestRegressor({ nTrees: 100, maxDepth: 6, minSamplesLeaf: 12, maxFeaturesFraction: 0.7 });
  model.fit(X_train, y_train);
  const trainSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("Training complete in " + trainSeconds + "s.");

  console.log("Evaluating on held-out test data the model never trained on...");
  const overall = evaluate(model, testRows);
  const perDrug = evaluatePerDrug(model, testRows);
  const trainFit = evaluate(model, trainRows);

  const report = {
    trainedAt: new Date().toISOString(),
    method: "Random Forest Regressor (100 trees, max depth 6), trained from scratch in JavaScript",
    datasetSize: rawRows.length,
    drugCount: DRUGS.length,
    trainRows: trainRows.length,
    testRows: testRows.length,
    testSplitStrategy: "Chronological per-drug split - last " + (TEST_FRACTION * 100) + "% of each drug's date range held out; model never saw these dates during training",
    trainSeconds: Number(trainSeconds),
    metrics: {
      onTrainingData: trainFit,
      onHeldOutTestData: overall,
    },
    perDrugTestMetrics: perDrug,
  };

  fs.writeFileSync(path.join(__dirname, "model.json"), JSON.stringify(model.toJSON()), "utf-8");
  fs.writeFileSync(path.join(__dirname, "training_report.json"), JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== Held-out test set results (data the model never trained on) ===");
  console.log("MAE: " + overall.mae + " units | RMSE: " + overall.rmse + " | MAPE: " + overall.mape + "% | R2: " + overall.r2);
  console.log("\nPer-drug breakdown:");
  Object.entries(perDrug).forEach(([drug, m]) => {
    console.log("  " + drug + ": MAE=" + m.mae + ", R2=" + m.r2 + ", n=" + m.n);
  });
  console.log("\nModel saved to ml/model.json, report saved to ml/training_report.json");
}

if (require.main === module) {
  train();
}

module.exports = { train, buildSupervisedRows, splitTrainTest, evaluate };
