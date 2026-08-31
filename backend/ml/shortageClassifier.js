const { createSeededRandom } = require("./rng");

class ClassificationTree {
  constructor({ maxDepth = 5, minSamplesLeaf = 8, maxFeatures = 4 } = {}) {
    this.maxDepth = maxDepth;
    this.minSamplesLeaf = minSamplesLeaf;
    this.maxFeatures = maxFeatures;
    this.root = null;
  }

  fit(X, y) {
    if (!X.length) throw new Error("Cannot train classifier with no rows.");
    const featureCount = X[0].length;
    const features = Array.from({ length: featureCount }, (_, i) => i);
    this.root = this.build(X, y, 0, features);
    return this;
  }

  gini(y) {
    const counts = new Map();
    y.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
    let impurity = 1;
    for (const count of counts.values()) {
      const p = count / y.length;
      impurity -= p * p;
    }
    return impurity;
  }

  majority(y) {
    const counts = new Map();
    y.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
  }

  sampleFeatures(features, count) {
    const copy = features.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  build(X, y, depth, allFeatures) {
    const prediction = this.majority(y);
    const node = { leaf: true, prediction };
    if (depth >= this.maxDepth || X.length < this.minSamplesLeaf * 2 || this.gini(y) === 0) return node;

    const candidates = this.sampleFeatures(allFeatures, this.maxFeatures);
    let best = null;
    const parentImpurity = this.gini(y);

    for (const feature of candidates) {
      const values = [...new Set(X.map((row) => Number(row[feature])))].sort((a, b) => a - b);
      if (values.length < 2) continue;
      const thresholds = [];
      for (let i = 0; i < values.length - 1; i++) thresholds.push((values[i] + values[i + 1]) / 2);

      for (const threshold of thresholds) {
        const leftX = [], leftY = [], rightX = [], rightY = [];
        X.forEach((row, i) => {
          if (Number(row[feature]) <= threshold) { leftX.push(row); leftY.push(y[i]); }
          else { rightX.push(row); rightY.push(y[i]); }
        });
        if (leftY.length < this.minSamplesLeaf || rightY.length < this.minSamplesLeaf) continue;
        const weighted = (leftY.length * this.gini(leftY) + rightY.length * this.gini(rightY)) / y.length;
        const gain = parentImpurity - weighted;
        if (!best || gain > best.gain) best = { feature, threshold, gain, leftX, leftY, rightX, rightY };
      }
    }

    if (!best || best.gain <= 1e-8) return node;
    node.leaf = false;
    node.feature = best.feature;
    node.threshold = best.threshold;
    node.left = this.build(best.leftX, best.leftY, depth + 1, allFeatures);
    node.right = this.build(best.rightX, best.rightY, depth + 1, allFeatures);
    return node;
  }

  predictOne(x, node = this.root) {
    if (node.leaf) return node.prediction;
    return Number(x[node.feature]) <= node.threshold ? this.predictOne(x, node.left) : this.predictOne(x, node.right);
  }
}

class RandomForestClassifier {
  constructor({ nTrees = 80, maxDepth = 6, minSamplesLeaf = 8, maxFeaturesFraction = 0.7, seed = 4242 } = {}) {
    this.nTrees = nTrees;
    this.maxDepth = maxDepth;
    this.minSamplesLeaf = minSamplesLeaf;
    this.maxFeaturesFraction = maxFeaturesFraction;
    this.seed = seed;
    this.trees = [];
  }

  fit(X, y) {
    if (!X.length || X.length !== y.length) throw new Error("Invalid classification training data.");
    const rand = createSeededRandom(this.seed);
    const featureCount = X[0].length;
    const maxFeatures = Math.max(1, Math.round(featureCount * this.maxFeaturesFraction));
    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      const tree = new ClassificationTree({ maxDepth: this.maxDepth, minSamplesLeaf: this.minSamplesLeaf, maxFeatures });
      tree.rand = rand;
      const bootstrapX = [], bootstrapY = [];
      for (let i = 0; i < X.length; i++) {
        const idx = Math.floor(rand() * X.length);
        bootstrapX.push(X[idx]);
        bootstrapY.push(y[idx]);
      }
      tree.fit(bootstrapX, bootstrapY);
      this.trees.push(tree);
    }
    return this;
  }

  predictOne(x) {
    const votes = new Map();
    for (const tree of this.trees) {
      const label = tree.predictOne(x);
      votes.set(label, (votes.get(label) || 0) + 1);
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    if (!ranked.length) throw new Error("Classifier has not been trained.");
    return {
      label: ranked[0][0],
      probability: Number(((ranked[0][1] / this.trees.length) * 100).toFixed(1)),
      votes: Object.fromEntries(ranked),
    };
  }

  toJSON() {
    return {
      nTrees: this.nTrees,
      maxDepth: this.maxDepth,
      minSamplesLeaf: this.minSamplesLeaf,
      maxFeaturesFraction: this.maxFeaturesFraction,
      seed: this.seed,
      trees: this.trees.map((t) => t.root),
    };
  }

  static fromJSON(json) {
    const forest = new RandomForestClassifier(json);
    forest.trees = json.trees.map((root) => {
      const tree = new ClassificationTree({ maxDepth: json.maxDepth, minSamplesLeaf: json.minSamplesLeaf, maxFeatures: 1 });
      tree.root = root;
      return tree;
    });
    return forest;
  }
}

module.exports = RandomForestClassifier;
