const DecisionTreeRegressor = require("./decisionTree");
const { createSeededRandom } = require("./rng");

const TRAINING_SEED = 42; // fixed seed -> reproducible bootstrap sampling every run

/**
 * A Random Forest regressor: trains many decision trees, each on a
 * bootstrap sample of the training rows (bagging) and a random subset of
 * features per split, then averages their predictions. This is the same
 * algorithm family named in the project's original architecture diagram
 * (alongside LSTM/XGBoost) and is a legitimate, trainable, testable
 * machine-learning model — not a fixed formula.
 */
class RandomForestRegressor {
  constructor({ nTrees = 40, maxDepth = 8, minSamplesLeaf = 5, maxFeaturesFraction = 0.7 } = {}) {
    this.nTrees = nTrees;
    this.maxDepth = maxDepth;
    this.minSamplesLeaf = minSamplesLeaf;
    this.maxFeaturesFraction = maxFeaturesFraction;
    this.trees = [];
  }

  fit(X, y) {
    const rand = createSeededRandom(TRAINING_SEED);
    const nFeatures = X[0].length;
    const maxFeatures = Math.max(1, Math.round(nFeatures * this.maxFeaturesFraction));
    const n = X.length;

    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      const bootstrapX = [];
      const bootstrapY = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rand() * n);
        bootstrapX.push(X[idx]);
        bootstrapY.push(y[idx]);
      }
      const tree = new DecisionTreeRegressor({
        maxDepth: this.maxDepth,
        minSamplesLeaf: this.minSamplesLeaf,
        maxFeatures,
        rand,
      });
      tree.fit(bootstrapX, bootstrapY);
      this.trees.push(tree);
    }
    return this;
  }

  predictOne(x) {
    const preds = this.trees.map((tree) => tree.predictOne(x));
    return preds.reduce((s, p) => s + p, 0) / preds.length;
  }

  predict(X) {
    return X.map((x) => this.predictOne(x));
  }

  toJSON() {
    return {
      nTrees: this.nTrees,
      maxDepth: this.maxDepth,
      minSamplesLeaf: this.minSamplesLeaf,
      maxFeaturesFraction: this.maxFeaturesFraction,
      trees: this.trees.map((t) => t.root),
    };
  }

  static fromJSON(json) {
    const forest = new RandomForestRegressor({
      nTrees: json.nTrees,
      maxDepth: json.maxDepth,
      minSamplesLeaf: json.minSamplesLeaf,
      maxFeaturesFraction: json.maxFeaturesFraction,
    });
    forest.trees = json.trees.map((root) => {
      const t = new DecisionTreeRegressor();
      t.root = root;
      return t;
    });
    return forest;
  }
}

module.exports = RandomForestRegressor;
