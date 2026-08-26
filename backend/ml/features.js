const FEATURE_NAMES = [
  "dayOfWeek",
  "month",
  "dayOfYearSin",
  "dayOfYearCos",
  "drugCategoryCode",
  "trendIndexYears",
  "lag7",
  "lag14",
  "rollingAvg7",
  "rollingAvg30",
];

const CATEGORY_CODE = {
  Analgesic: 0,
  Antibiotic: 1,
  Hormone: 2,
  Rehydration: 3,
  Antidiabetic: 4,
};

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Builds the exact same feature vector shape whether called during training
 * (from the synthetic dataset) or at prediction time (from live sales
 * history) — the two MUST match, or the trained model would be evaluating
 * inputs shaped differently from what it learned on ("train/serve skew"),
 * which is a classic real-world ML bug this project deliberately avoids.
 *
 * `history` = array of past quantities in chronological order, ending the
 * day before `date`. `daysSinceDatasetStart` normalizes the trend feature
 * so it's on a comparable scale between training and inference.
 */
function computeFeatures(date, category, daysSinceDatasetStart, history) {
  const doy = dayOfYear(date);
  const last7 = history.slice(-7);
  const last30 = history.slice(-30);

  return [
    date.getDay(),
    date.getMonth() + 1,
    Math.sin((2 * Math.PI * doy) / 365),
    Math.cos((2 * Math.PI * doy) / 365),
    CATEGORY_CODE[category] ?? 0,
    daysSinceDatasetStart / 365,
    history.length >= 7 ? history[history.length - 7] : mean(last7),
    history.length >= 14 ? history[history.length - 14] : mean(last30),
    mean(last7),
    mean(last30),
  ];
}

module.exports = { FEATURE_NAMES, CATEGORY_CODE, computeFeatures, dayOfYear, mean };
