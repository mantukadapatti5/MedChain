const fs = require("fs");
const path = require("path");
const RandomForestClassifier = require("./shortageClassifier");
const { buildFeatures } = require("./shortageFeatures");

const MODEL_PATH = path.join(__dirname, "shortage_model.json");

function loadModel() {
  if (!fs.existsSync(MODEL_PATH)) throw new Error("Shortage model is not trained. Run npm run train-shortage-model.");
  return RandomForestClassifier.fromJSON(JSON.parse(fs.readFileSync(MODEL_PATH, "utf-8")));
}

function classify(probability) {
  if (probability >= 80) return "critical";
  if (probability >= 60) return "high";
  if (probability >= 35) return "medium";
  return "low";
}

function predict({ stock, history, forecastDemand, leadTimeDays }) {
  const model = loadModel();
  const features = buildFeatures({ stock, history, forecastDemand, leadTimeDays });
  const result = model.predictOne(features);
  const shortageProbability = result.label === 1 ? result.probability : Number((100 - result.probability).toFixed(1));
  return {
    shortageProbability,
    riskLevel: classify(shortageProbability),
    model: "Random Forest Classifier",
    features,
  };
}

module.exports = { predict, classify };
