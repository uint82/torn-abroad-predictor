import { describe, expect, it } from 'vitest';
import { predictPriceTrend, sanitizePriceObservations } from '../src/domain/prediction';
import { at } from './fixtures';

describe('price trend', () => {
  it('describes a rise', () => {
    const trend = predictPriceTrend(
      [
        { at: at(9), price: 100 },
        { at: at(10), price: 110 },
      ],
      { now: at(10) },
    );
    expect(trend.direction).toBe('rising');
    expect(trend.changePercent).toBeCloseTo(10);
    expect(trend.volatilityPercent).toBeCloseTo(4.7619, 3);
  });

  it('describes a fall', () => {
    const trend = predictPriceTrend(
      [
        { at: at(9), price: 110 },
        { at: at(10), price: 100 },
      ],
      { now: at(10) },
    );
    expect(trend.direction).toBe('falling');
    expect(trend.changePercent).toBeCloseTo(-9.0909, 3);
  });

  it('treats small changes as stable', () => {
    const trend = predictPriceTrend(
      [
        { at: at(9), price: 100 },
        { at: at(10), price: 101 },
      ],
      { now: at(10) },
    );
    expect(trend.direction).toBe('stable');
  });

  it('returns unknown with fewer than two points', () => {
    const trend = predictPriceTrend([{ at: at(10), price: 100 }], { now: at(10) });
    expect(trend.direction).toBe('unknown');
    expect(trend.samples).toBe(1);
  });

  it('ignores points outside the window and non-positive prices', () => {
    const trend = predictPriceTrend(
      [
        { at: at(8), price: 50 },
        { at: at(9, 30), price: 0 },
        { at: at(10), price: 100 },
      ],
      { now: at(10), windowMinutes: 60 },
    );
    expect(trend.direction).toBe('unknown');
    expect(trend.samples).toBe(1);
  });

  it('keeps the last value for duplicate timestamps', () => {
    const sanitized = sanitizePriceObservations(
      [
        { at: at(9), price: 100 },
        { at: at(10), price: 100 },
        { at: at(10), price: 120 },
      ],
      at(10),
    );
    expect(sanitized).toEqual([
      { at: at(9), price: 100 },
      { at: at(10), price: 120 },
    ]);
  });
});
