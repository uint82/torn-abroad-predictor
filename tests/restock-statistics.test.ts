import { describe, expect, it } from 'vitest';
import { median, quantile, summarizeDistribution } from '../src/domain/statistics';
import { buildRestockGaps, summarizeRestockHistory } from '../src/domain/restock-timing';
import type { SelloutCycle } from '../src/domain/stock-history';

function cycle(restockedAt: number, soldOutAt: number): SelloutCycle {
  return { restockedAt, soldOutAt, durationMs: soldOutAt - restockedAt };
}

describe('distribution summaries', () => {
  it('returns empty statistics for no samples', () => {
    expect(summarizeDistribution([])).toEqual({
      samples: 0,
      median: null,
      low: null,
      high: null,
    });
  });

  it('ignores non-finite values', () => {
    expect(summarizeDistribution([Number.NaN, Number.POSITIVE_INFINITY, 20])).toEqual({
      samples: 1,
      median: 20,
      low: 20,
      high: 20,
    });
  });

  it('interpolates the median and quartiles', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(summarizeDistribution([10, 20, 30])).toEqual({
      samples: 3,
      median: 20,
      low: 15,
      high: 25,
    });
  });
});

describe('restock history', () => {
  it('pairs each restock with the previous sellout', () => {
    const cycles = [cycle(100, 200), cycle(215, 400), cycle(445, 500)];
    expect(buildRestockGaps(cycles)).toEqual([
      { soldOutAt: 200, restockedAt: 215, lagMs: 15, cycleDurationMs: 100 },
      { soldOutAt: 400, restockedAt: 445, lagMs: 45, cycleDurationMs: 185 },
    ]);
  });

  it('skips gaps that are not positive', () => {
    expect(buildRestockGaps([cycle(100, 200), cycle(200, 300)])).toEqual([]);
  });

  it('summarizes both lag and sellout duration', () => {
    const summary = summarizeRestockHistory([cycle(100, 200), cycle(215, 400)]);
    expect(summary.gaps).toHaveLength(1);
    expect(summary.lags.median).toBe(15);
    expect(summary.durations.median).toBe(142.5);
  });
});
