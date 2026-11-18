import { describe, expect, it } from 'vitest';
import { estimateArrivalStockChance } from '../src/domain/restock-probability';
import { at } from './fixtures';

const base = {
  now: at(10),
  end: at(11),
  emptyAt: at(10),
  alwaysInStock: false,
  lags: [15 * 60_000, 15 * 60_000],
  durations: [60 * 60_000, 90 * 60_000],
};

describe('arrival stock chance', () => {
  it('returns certain when current stock covers the trip', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        emptyAt: at(11, 30),
        end: at(10, 30),
      }),
    ).toBe(1);
  });

  it('returns certain when stock never sells out', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        emptyAt: null,
        alwaysInStock: true,
      }),
    ).toBe(1);
  });

  it('returns null without enough lag and duration samples', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        lags: [15 * 60_000],
      }),
    ).toBeNull();
    expect(
      estimateArrivalStockChance({
        ...base,
        durations: [60 * 60_000],
      }),
    ).toBeNull();
  });

  it('returns null when the empty time is unknown', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        emptyAt: null,
      }),
    ).toBeNull();
  });

  it('returns zero when every restock lands after arrival', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        end: at(10, 5),
      }),
    ).toBe(0);
  });

  it('scores the fraction of plausible lag scenarios', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        end: at(10, 15),
        lags: [15 * 60_000, 30 * 60_000],
        durations: [30 * 60_000, 60 * 60_000],
      }),
    ).toBe(0.5);
  });

  it('accounts for more than one restock before arrival', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        end: at(11, 16),
        lags: [15 * 60_000, 15 * 60_000],
        durations: [15 * 60_000, 30 * 60_000],
      }),
    ).toBe(1);
  });

  it('ignores invalid scenario samples', () => {
    expect(
      estimateArrivalStockChance({
        ...base,
        end: at(10, 15),
        lags: [15 * 60_000, 30 * 60_000, 0, Number.NaN, -1],
        durations: [30 * 60_000, 60 * 60_000, Number.POSITIVE_INFINITY],
      }),
    ).toBe(0.5);
  });
});
