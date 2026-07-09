/**
 * Pearson correlation helpers, ported from Allen Institute's timelapse-colorizer
 * (`src/colorizer/utils/math_utils/correlation.ts`). Pure math, no dependencies:
 * given the per-object feature columns, produce a feature-by-feature matrix of
 * linear-correlation coefficients for the Correlation tab's heatmap.
 */

type NumberArray = Float32Array | Uint32Array | number[];

/**
 * Pearson correlation coefficient between two equal-length arrays. Pairs where
 * either value is non-finite (NaN/Inf) are skipped. Returns a value in [-1, 1],
 * or 0 when there is no finite data or no variance.
 */
export function pearson(x: NumberArray, y: NumberArray): number {
  if (x.length !== y.length) {
    throw new Error("pearson: arrays must have the same length");
  }
  const n = x.length;

  let count = 0;
  let sumx = 0;
  let sumy = 0;
  let sumxy = 0;
  let sumx2 = 0;
  let sumy2 = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) {
      continue;
    }
    count++;
    sumx += xi;
    sumy += yi;
    sumxy += xi * yi;
    sumx2 += xi * xi;
    sumy2 += yi * yi;
  }

  if (count === 0) {
    return 0;
  }

  const numerator = count * sumxy - sumx * sumy;
  const denomX = count * sumx2 - sumx * sumx;
  const denomY = count * sumy2 - sumy * sumy;
  const denominator = Math.sqrt(denomX * denomY);

  // Numerator and denominator both ~0 => a feature has no variance => undefined
  // correlation; report 0 rather than NaN.
  if (Math.abs(numerator) < 1e-6 && Math.abs(denominator) < 1e-6) {
    return 0;
  }
  return numerator / denominator;
}

/**
 * Symmetric matrix of Pearson coefficients between every pair of feature
 * columns. `out[i][j]` is the correlation of feature `i` with feature `j`; the
 * diagonal is 1. Only the lower triangle is computed, then mirrored.
 */
export function computeCorrelations(featureColumns: NumberArray[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < featureColumns.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < i; j++) {
      row.push(pearson(featureColumns[i], featureColumns[j]));
    }
    out.push(row);
  }
  // Mirror the lower triangle into the upper triangle and set the diagonal to 1.
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      out[i][j] = out[j][i];
    }
    out[i][i] = 1;
  }
  return out;
}
