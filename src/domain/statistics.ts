export interface DistributionSummary {
  samples: number;
  median: number | null;
  low: number | null;
  high: number | null;
}

const DEFAULT_LOW_FRACTION = 0.25;
const DEFAULT_HIGH_FRACTION = 0.75;

function finiteSorted(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

function quantileSorted(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const bounded = Math.min(1, Math.max(0, fraction));
  const position = (sorted.length - 1) * bounded;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) {
    return null;
  }
  return lower + (upper - lower) * (position - lowerIndex);
}

export function quantile(values: readonly number[], fraction: number): number | null {
  return quantileSorted(finiteSorted(values), fraction);
}

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

export function summarizeDistribution(
  values: readonly number[],
  lowFraction = DEFAULT_LOW_FRACTION,
  highFraction = DEFAULT_HIGH_FRACTION,
): DistributionSummary {
  const sorted = finiteSorted(values);
  return {
    samples: sorted.length,
    median: quantileSorted(sorted, 0.5),
    low: quantileSorted(sorted, lowFraction),
    high: quantileSorted(sorted, highFraction),
  };
}
