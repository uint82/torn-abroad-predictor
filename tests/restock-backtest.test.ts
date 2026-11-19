import { describe, expect, it } from 'vitest';
import type { StockObservation } from '../src/core/types';
import { forecastStock } from '../src/domain/restock';
import { at } from './fixtures';

const history: StockObservation[] = [
  { at: at(6), quantity: 0 },
  { at: at(6, 15), quantity: 60 },
  { at: at(7, 15), quantity: 0 },
  { at: at(7, 30), quantity: 60 },
  { at: at(9, 30), quantity: 0 },
  { at: at(10, 15), quantity: 60 },
  { at: at(11, 15), quantity: 0 },
  { at: at(11, 45), quantity: 60 },
  { at: at(12, 45), quantity: 0 },
  { at: at(13, 15), quantity: 60 },
  { at: at(14, 15), quantity: 0 },
];

const cuts = [
  { name: 'two lag samples', now: at(11, 15), actual: at(11, 45), samples: 2 },
  { name: 'three lag samples', now: at(12, 45), actual: at(13, 15), samples: 3 },
];

describe('restock forecast replay', () => {
  it.each(cuts)('keeps the observed restock inside the window with $name', (cut) => {
    const observations = history.filter((observation) => observation.at <= cut.now);
    const forecast = forecastStock(observations, {
      now: cut.now,
      horizonMinutes: 120,
    });
    expect(forecast.restockSamples).toBe(cut.samples);
    expect(forecast.nextRestockEarliestAt).not.toBeNull();
    expect(forecast.nextRestockLatestAt).not.toBeNull();
    expect(forecast.nextRestockEarliestAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      cut.actual,
    );
    expect(forecast.nextRestockLatestAt ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(
      cut.actual,
    );
  });
});
