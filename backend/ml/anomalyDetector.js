const IsolationForest = require("./isolationForest");

function daysToExpiry(expiryDate) {
  if (!expiryDate) return 365;
  const days = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
  return Number.isFinite(days) ? days : 365;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Builds a consistent numerical feature vector for every inventory item.
 * Features are deliberately based on fields already used by MedChain.
 */
function inventoryFeatures(item, salesHistory = []) {
  const history = salesHistory.filter((s) => s.drugName === item.drugName);
  const recent = history.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 14);
  const total = recent.reduce((sum, s) => sum + safeNumber(s.qty), 0);
  const avgDailyDemand = recent.length ? total / recent.length : 0;
  const stock = Math.max(0, safeNumber(item.stock));
  const reorderPoint = Math.max(0, safeNumber(item.reorderPoint));
  const daysSupply = avgDailyDemand > 0 ? stock / avgDailyDemand : stock;
  const expiry = daysToExpiry(item.expiryDate);

  return [
    stock,
    avgDailyDemand,
    daysSupply,
    reorderPoint,
    Math.max(0, expiry),
    Math.max(0, reorderPoint - stock),
  ];
}

function severityFromScore(score) {
  if (score >= 0.78) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

function reasonFor(item, score, vector) {
  const [stock, demand, daysSupply, reorderPoint, expiry] = vector;
  const reasons = [];
  if (demand > 0 && stock < demand * 3) reasons.push("stock is unusually low compared with recent demand");
  if (reorderPoint > 0 && stock < reorderPoint) reasons.push("stock is below the reorder point");
  if (expiry <= 30) reasons.push("batch is close to expiry");
  if (daysSupply > 60) reasons.push("stock is unusually high relative to recent demand");
  if (!reasons.length) reasons.push("inventory pattern differs from the normal inventory population");
  return `Isolation Forest score ${score.toFixed(2)}: ${reasons.join("; ")}.`;
}

/**
 * Fits an unsupervised Isolation Forest to the current inventory population
 * and returns a scored result for every item. The model is retrained on each
 * scan so the baseline follows the current MedChain inventory population.
 */
function scanInventoryWithIsolationForest(inventory, salesHistory = []) {
  if (!Array.isArray(inventory) || inventory.length < 3) return [];

  const vectors = inventory.map((item) => inventoryFeatures(item, salesHistory));
  const model = new IsolationForest({
    nTrees: 80,
    sampleSize: Math.min(32, inventory.length),
    maxDepth: 8,
    contamination: Math.min(0.2, Math.max(0.05, 3 / inventory.length)),
  });
  model.fit(vectors);

  return inventory.map((item, index) => {
    const score = model.scoreOne(vectors[index]);
    const anomaly = score >= model.threshold;
    return {
      item,
      score,
      anomaly,
      severity: severityFromScore(score),
      reason: reasonFor(item, score, vectors[index]),
      features: {
        stock: vectors[index][0],
        avgDailyDemand: Number(vectors[index][1].toFixed(2)),
        daysOfSupply: Number(vectors[index][2].toFixed(1)),
        reorderPoint: vectors[index][3],
        daysToExpiry: vectors[index][4],
      },
    };
  });
}

module.exports = { inventoryFeatures, scanInventoryWithIsolationForest };
