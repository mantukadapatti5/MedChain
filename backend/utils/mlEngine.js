const crypto = require("crypto");
const { predictNextPeriod, getTrainingReport } = require("../ml/predict");

/**
 * Primary demand forecast: uses the trained-and-tested Random Forest model
 * (see backend/ml/) when it's available, feeding it the drug's real recent
 * sales history from the live database. Falls back to the statistical
 * method below (forecastDemand) only if the model file is missing (e.g.
 * `npm run train-model` hasn't been run yet) — the fallback is not a
 * "backup AI," it's an honestly-labeled simpler method, and the response
 * always says plainly which one actually produced the number.
 */
function getAIForecast(drugName, salesHistory = []) {
  const MIN_LIVE_HISTORY = 5;

  // With little or no live sales history, the model has almost nothing to
  // ground lag/rolling features on — that's an out-of-distribution corner
  // it barely saw during training (real drugs almost always have some
  // history by the time they're being forecast), and it produces
  // unreliable, near-arbitrary numbers in that situation. Rather than
  // present a low-confidence guess as if it were the trained model's real
  // output, this falls back to the plainer statistical method and says so.
  if (salesHistory.length < MIN_LIVE_HISTORY) {
    const fallback = forecastDemand(salesHistory);
    return {
      ...fallback,
      method: `${fallback.method} (trained model available, but only ${salesHistory.length} live sales record(s) exist for this drug — too little to trust its lag/rolling-average features yet)`,
      isTrainedModel: false,
    };
  }

  const recentHistory = salesHistory.map((s) => ({ date: s.date, qty: s.qty }));
  const trained = predictNextPeriod(drugName, recentHistory, 7);

  if (trained.available) {
    const trend =
      trained.dailyBreakdown.length >= 2 && trained.dailyBreakdown[trained.dailyBreakdown.length - 1] > trained.dailyBreakdown[0] * 1.15
        ? "rising"
        : trained.dailyBreakdown[trained.dailyBreakdown.length - 1] < trained.dailyBreakdown[0] * 0.85
        ? "falling"
        : "stable";
    return {
      forecastNextPeriod: trained.forecastNextPeriod,
      trend,
      confidence: trained.testMetrics ? Math.max(0.3, Math.min(0.97, trained.testMetrics.r2)) : 0.6,
      method: trained.method + (trained.isPerDrugMetric ? " — tested on held-out data for this drug" : " — tested on held-out data (overall model)"),
      testMetrics: trained.testMetrics,
      isTrainedModel: true,
    };
  }

  // fallback: model not trained yet
  const fallback = forecastDemand(salesHistory);
  return { ...fallback, isTrainedModel: false };
}



/**
 * Fits Holt's linear exponential smoothing model to a time series via grid
 * search over the smoothing parameters (alpha = level weight, beta = trend
 * weight), minimizing in-sample one-step-ahead squared error. This is a
 * genuine parameter-fitting / statistical-learning step — the model
 * literally learns alpha and beta from the data rather than using a fixed
 * formula — which is what distinguishes it from a plain moving average.
 * It is classical statistical learning, not a deep-learning model; the
 * honest name for it is "Holt's exponential smoothing," and that is what
 * this project calls it everywhere rather than overstating it as "AI".
 */
function fitHoltModel(series) {
  if (series.length < 2) return null;
  let best = null;
  let bestSSE = Infinity;

  for (let alpha = 0.1; alpha <= 0.9; alpha += 0.1) {
    for (let beta = 0.1; beta <= 0.9; beta += 0.1) {
      let level = series[0];
      let trend = series[1] - series[0];
      let sse = 0;

      for (let t = 1; t < series.length; t++) {
        const forecast = level + trend;
        const error = series[t] - forecast;
        sse += error * error;
        const newLevel = alpha * series[t] + (1 - alpha) * (level + trend);
        const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
        level = newLevel;
        trend = newTrend;
      }

      if (sse < bestSSE) {
        bestSSE = sse;
        best = { alpha: Number(alpha.toFixed(1)), beta: Number(beta.toFixed(1)), level, trend, sse };
      }
    }
  }
  return best;
}


/**
 * Demand Forecasting. Uses Holt's exponential smoothing (fitted via grid
 * search — see fitHoltModel above) once there's enough history (4+ sales
 * records) to fit level and trend parameters meaningfully; falls back to a
 * weighted moving average for thinner histories where fitting two
 * parameters would just overfit noise. Either way, the `method` field on
 * the return value says plainly which one was used — this project never
 * silently upgrades that description to "AI" or "machine learning."
 */
function forecastDemand(salesHistory = []) {
  if (salesHistory.length === 0) {
    return { forecastNextPeriod: 0, trend: "flat", confidence: 0.3, method: "no sales history available" };
  }

  const sorted = salesHistory.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const qtys = sorted.map((s) => s.qty);
  const n = qtys.length;

  if (n >= 4) {
    const fit = fitHoltModel(qtys);
    if (fit) {
      const forecastNextPeriod = Math.max(0, Math.round(fit.level + fit.trend));
      const trend = fit.trend > 0.5 ? "rising" : fit.trend < -0.5 ? "falling" : "stable";
      const confidence = Math.min(0.95, 0.55 + n * 0.04);
      return {
        forecastNextPeriod,
        trend,
        confidence: Number(confidence.toFixed(2)),
        method: `Holt's exponential smoothing (fitted: alpha=${fit.alpha}, beta=${fit.beta})`,
      };
    }
  }

  // Weighted moving average - recent periods weighted higher
  const weights = qtys.map((_, i) => i + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const wma = qtys.reduce((sum, q, i) => sum + q * weights[i], 0) / weightSum;

  const xMean = (n - 1) / 2;
  const yMean = qtys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  qtys.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;

  const forecastNextPeriod = Math.max(0, Math.round(wma + slope));
  const trend = slope > 0.5 ? "rising" : slope < -0.5 ? "falling" : "stable";
  const confidence = Math.min(0.95, 0.5 + n * 0.05);

  return {
    forecastNextPeriod,
    trend,
    confidence: Number(confidence.toFixed(2)),
    method: "weighted moving average (too little history to fit a trend model reliably)",
  };
}

/**
 * Dynamic Reorder Point = ML Forecast -> Auto Restock Trigger, as labeled in
 * the Vendor Portal "Smart Contract Auto-Procure" upgrade box.
 */
function dynamicReorderPoint({ avgDailyUsage, leadTimeDays = 3, safetyStock = 0.2 }) {
  const base = avgDailyUsage * leadTimeDays;
  return Math.ceil(base * (1 + safetyStock));
}

/**
 * Anomaly & Counterfeit Detection (stands in for Isolation-Forest style
 * evaluation + autoencoder reconstruction-error scoring in the diagram).
 */
function detectInventoryAnomalies(item) {
  const anomalies = [];
  const now = new Date();
  const expiry = new Date(item.expiryDate);
  const daysToExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

  if (daysToExpiry <= 30 && daysToExpiry >= 0) {
    anomalies.push({
      type: "near-expiry",
      severity: daysToExpiry <= 7 ? "high" : "medium",
      message: `Batch ${item.batch} expires in ${daysToExpiry} day(s)`,
    });
  }
  if (daysToExpiry < 0) {
    anomalies.push({
      type: "expired",
      severity: "high",
      message: `Batch ${item.batch} expired ${Math.abs(daysToExpiry)} day(s) ago`,
    });
  }
  if (item.stock <= item.reorderPoint) {
    anomalies.push({
      type: "low-stock",
      severity: item.stock === 0 ? "high" : "medium",
      message: `${item.drugName} stock (${item.stock}) at/below reorder point (${item.reorderPoint})`,
    });
  }

  // Deterministic counterfeit "checksum" verification mock: recompute a
  // checksum from batch + manufacturer and compare to the stored provenance
  // checksum recorded on-chain when the batch was first created.
  if (item.provenanceChecksum) {
    const recomputed = crypto
      .createHash("md5")
      .update(`${item.batch}|${item.manufacturer || "N/A"}`)
      .digest("hex")
      .slice(0, 10);
    if (recomputed !== item.provenanceChecksum) {
      anomalies.push({
        type: "counterfeit-flag",
        severity: "high",
        message: `Batch ${item.batch} failed provenance checksum verification`,
      });
    }
  }

  return anomalies;
}

/**
 * Cold Chain Monitoring: Temp/Humidity Alert box in the diagram.
 */
function checkColdChain({ temp, humidity, minTemp = 2, maxTemp = 8, maxHumidity = 60 }) {
  const alerts = [];
  if (temp < minTemp || temp > maxTemp) {
    alerts.push(`Temperature breach: ${temp}°C (safe range ${minTemp}-${maxTemp}°C)`);
  }
  if (humidity > maxHumidity) {
    alerts.push(`Humidity breach: ${humidity}% (max ${maxHumidity}%)`);
  }
  return { breached: alerts.length > 0, alerts };
}

function computeProvenanceChecksum(batch, manufacturer) {
  return crypto
    .createHash("md5")
    .update(`${batch}|${manufacturer || "N/A"}`)
    .digest("hex")
    .slice(0, 10);
}

/**
 * Surge Detection: compares a recent window of sales against an older
 * baseline window, rather than only smoothing over the whole history like
 * forecastDemand does. A slow, gradual trend and a sudden emergency spike
 * look identical to a simple moving average until it's too late — this
 * function exists specifically to catch the spike fast.
 */
function detectSurge(salesHistory = [], { recentDays = 3, baselineDays = 14 } = {}) {
  if (salesHistory.length === 0) {
    return { isSurge: false, ratio: 1, recentAvgPerDay: 0, baselineAvgPerDay: 0 };
  }
  const now = new Date();
  const sorted = salesHistory.slice().sort((a, b) => new Date(a.date) - new Date(b.date));

  const recentCutoff = new Date(now.getTime() - recentDays * 86400000);
  const baselineCutoff = new Date(now.getTime() - (recentDays + baselineDays) * 86400000);

  const recent = sorted.filter((s) => new Date(s.date) >= recentCutoff);
  const baseline = sorted.filter((s) => new Date(s.date) >= baselineCutoff && new Date(s.date) < recentCutoff);

  const recentTotal = recent.reduce((sum, s) => sum + s.qty, 0);
  const baselineTotal = baseline.reduce((sum, s) => sum + s.qty, 0);

  const recentAvgPerDay = recentTotal / recentDays;
  const baselineAvgPerDay = baselineTotal / baselineDays || 0.001; // avoid divide-by-zero

  const ratio = Number((recentAvgPerDay / baselineAvgPerDay).toFixed(2));
  const isSurge = baseline.length > 0 && ratio >= 2.0 && recentTotal >= 10;

  return { isSurge, ratio, recentAvgPerDay: Number(recentAvgPerDay.toFixed(1)), baselineAvgPerDay: Number(baselineAvgPerDay.toFixed(1)) };
}

/**
 * Quantity Mismatch: compares what was dispatched against what the
 * receiving portal confirms. A shrinkage/tampering signal that plain
 * "is this batch genuine" counterfeit checking does not catch.
 */
function evaluateQuantityMismatch(qtyDispatched, qtyReceived) {
  if (qtyDispatched == null || qtyReceived == null) {
    return { mismatch: false };
  }
  const diff = qtyDispatched - qtyReceived;
  if (diff === 0) return { mismatch: false, diff: 0, diffPercent: 0 };

  const diffPercent = Math.abs(diff) / qtyDispatched;
  return {
    mismatch: true,
    diff,
    diffPercent: Number((diffPercent * 100).toFixed(1)),
    severity: diffPercent >= 0.2 ? "high" : "medium",
    direction: diff > 0 ? "shortfall" : "excess",
  };
}

/**
 * Shortage Risk: days-of-supply remaining at current burn rate, used to
 * build the Admin "Shortage Risk" view so at-risk batches surface before
 * they actually run out, not after.
 */
function shortageRisk(stock, avgDailyDemand) {
  const demand = avgDailyDemand > 0 ? avgDailyDemand : 0.01;
  const daysOfSupply = Number((stock / demand).toFixed(1));
  let level = "low";
  if (daysOfSupply < 3) level = "critical";
  else if (daysOfSupply < 7) level = "high";
  else if (daysOfSupply < 14) level = "medium";
  return { daysOfSupply, level };
}

module.exports = {
  forecastDemand,
  getAIForecast,
  getTrainingReport,
  dynamicReorderPoint,
  detectInventoryAnomalies,
  checkColdChain,
  computeProvenanceChecksum,
  detectSurge,
  evaluateQuantityMismatch,
  shortageRisk,
};
