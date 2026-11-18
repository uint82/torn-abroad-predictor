import { describe, expect, it } from 'vitest';
import { forecastStock } from '../src/domain/restock';
import { nextRestockTick } from '../src/domain/restock-ticks';
import {
  estimateRestockSize,
  estimateSellRatePerHour,
  sanitizeStockObservations,
} from '../src/domain/stock-history';
import { at } from './fixtures';

const minute = 60_000;

describe('sanitizeStockObservations', () => {
  it('drops bad timestamps, negative quantities and old points', () => {
    const now = at(10);
    const sanitized = sanitizeStockObservations(
      [
        { at: at(9), quantity: -5 },
        { at: at(9), quantity: 10 },
        { at: at(9), quantity: 20 },
        { at: now + 61 * 1000, quantity: 30 },
        { at: now - 24 * 60 * minute - 1, quantity: 40 },
        { at: now, quantity: 15 },
      ],
      now,
    );
    expect(sanitized).toEqual([
      { at: at(9), quantity: 20 },
      { at: now, quantity: 15 },
    ]);
  });

  it('keeps an observation up to one minute in the future', () => {
    const now = at(10);
    expect(sanitizeStockObservations([{ at: now + 30_000, quantity: 5 }], now)).toHaveLength(1);
  });
});

describe('sell rate', () => {
  it('measures units sold per hour', () => {
    const observations = [
      { at: at(9), quantity: 100 },
      { at: at(9, 30), quantity: 70 },
    ];
    expect(estimateSellRatePerHour(observations)).toBe(60);
  });

  it('weights short intervals together', () => {
    const observations = [
      { at: at(9), quantity: 100 },
      { at: at(9, 30), quantity: 70 },
      { at: at(10), quantity: 40 },
    ];
    expect(estimateSellRatePerHour(observations)).toBe(60);
  });

  it('ignores intervals that are too short, too long, or not a sale', () => {
    expect(
      estimateSellRatePerHour([
        { at: at(9), quantity: 100 },
        { at: at(9) + 10_000, quantity: 90 },
      ]),
    ).toBeNull();
    expect(
      estimateSellRatePerHour([
        { at: at(9), quantity: 100 },
        { at: at(16), quantity: 10 },
      ]),
    ).toBeNull();
    expect(
      estimateSellRatePerHour([
        { at: at(9), quantity: 100 },
        { at: at(9, 30), quantity: 100 },
      ]),
    ).toBeNull();
  });
});

describe('restock size', () => {
  it('uses the median positive jump', () => {
    const observations = [
      { at: at(9), quantity: 10 },
      { at: at(9, 15), quantity: 60 },
      { at: at(9, 30), quantity: 50 },
      { at: at(9, 45), quantity: 120 },
    ];
    expect(estimateRestockSize(observations)).toBe(60);
  });

  it('rounds the average of two middle jumps', () => {
    const observations = [
      { at: at(9), quantity: 10 },
      { at: at(9, 15), quantity: 20 },
      { at: at(9, 30), quantity: 40 },
    ];
    expect(estimateRestockSize(observations)).toBe(15);
  });

  it('returns null without a positive jump', () => {
    expect(estimateRestockSize([{ at: at(9), quantity: 50 }])).toBeNull();
  });
});

describe('nextRestockTick', () => {
  it('snaps to the next quarter hour', () => {
    expect(nextRestockTick(at(10))).toBe(at(10, 15));
    expect(nextRestockTick(at(10) + 1)).toBe(at(10, 15));
    expect(nextRestockTick(at(10, 14) + 59_000)).toBe(at(10, 15));
    expect(nextRestockTick(at(10, 15))).toBe(at(10, 30));
  });
});

describe('forecastStock', () => {
  it('returns unknown without history', () => {
    const forecast = forecastStock([], { now: at(10), horizonMinutes: 60 });
    expect(forecast.status).toBe('unknown');
    expect(forecast.expectedStock).toBeNull();
    expect(forecast.nextRestockAt).toBeNull();
    expect(forecast.samples).toBe(0);
  });

  it('returns unknown when the data is stale', () => {
    const forecast = forecastStock([{ at: at(9), quantity: 10 }], {
      now: at(10, 1),
      horizonMinutes: 60,
    });
    expect(forecast.status).toBe('unknown');
    expect(forecast.expectedStock).toBeNull();
    expect(forecast.nextRestockAt).toBeNull();
  });

  it('projects current sales forward', () => {
    const forecast = forecastStock(
      [
        { at: at(9), quantity: 200 },
        { at: at(9, 30), quantity: 150 },
        { at: at(10), quantity: 100 },
      ],
      { now: at(10), horizonMinutes: 30 },
    );
    expect(forecast.status).toBe('in-stock');
    expect(forecast.expectedStock).toBe(50);
    expect(forecast.nextRestockAt).toBeNull();
    expect(forecast.confidence).toBe('medium');
    expect(forecast.sellRatePerHour).toBe(100);
  });

  it('projects the stale current quantity to now', () => {
    const forecast = forecastStock(
      [
        { at: at(8), quantity: 200 },
        { at: at(9), quantity: 100 },
      ],
      { now: at(9, 30), horizonMinutes: 0 },
    );
    expect(forecast.status).toBe('in-stock');
    expect(forecast.expectedStock).toBe(50);
  });

  it('adds a restock on the estimated tick when empty', () => {
    const forecast = forecastStock(
      [
        { at: at(8), quantity: 0 },
        { at: at(8, 30), quantity: 60 },
        { at: at(9), quantity: 60 },
        { at: at(9, 30), quantity: 0 },
        { at: at(10), quantity: 0 },
      ],
      { now: at(10), horizonMinutes: 30 },
    );
    expect(forecast.status).toBe('restock-expected');
    expect(forecast.expectedStock).toBe(30);
    expect(forecast.nextRestockAt).toBe(at(10, 15));
    expect(forecast.restockSize).toBe(60);
    expect(forecast.confidence).toBe('medium');
  });

  it('does not restock before half the sellout duration has passed', () => {
    const forecast = forecastStock(
      [
        { at: at(7, 45), quantity: 0 },
        { at: at(8), quantity: 60 },
        { at: at(12), quantity: 0 },
      ],
      { now: at(12), horizonMinutes: 30 },
    );
    expect(forecast.status).toBe('sold-out');
    expect(forecast.expectedStock).toBe(0);
    expect(forecast.nextRestockAt).toBe(at(14));
  });

  it('uses the median sellout duration across cycles', () => {
    const forecast = forecastStock(
      [
        { at: at(6), quantity: 0 },
        { at: at(6, 15), quantity: 60 },
        { at: at(7, 15), quantity: 0 },
        { at: at(7, 30), quantity: 60 },
        { at: at(10, 30), quantity: 0 },
      ],
      { now: at(10, 30), horizonMinutes: 0 },
    );
    expect(forecast.nextRestockAt).toBe(at(11, 30));
  });

  it('projects the next restock after current stock sells out', () => {
    const forecast = forecastStock(
      [
        { at: at(7), quantity: 0 },
        { at: at(7, 15), quantity: 60 },
        { at: at(9, 15), quantity: 0 },
        { at: at(9, 30), quantity: 60 },
        { at: at(10), quantity: 30 },
      ],
      { now: at(10), horizonMinutes: 30 },
    );
    expect(forecast.status).toBe('in-stock');
    expect(forecast.expectedStock).toBe(12);
    expect(forecast.nextRestockAt).toBe(at(12));
  });

  it('falls back to the next tick when the estimate is overdue', () => {
    const forecast = forecastStock(
      [
        { at: at(7), quantity: 0 },
        { at: at(7, 30), quantity: 60 },
        { at: at(8), quantity: 0 },
        { at: at(10), quantity: 0 },
      ],
      { now: at(10), horizonMinutes: 30 },
    );
    expect(forecast.nextRestockAt).toBe(at(10, 15));
  });

  it('leaves the restock time open when it is over a day away', () => {
    const forecast = forecastStock(
      [
        { at: at(7), quantity: 0 },
        { at: at(7, 30), quantity: 2 },
        { at: at(9, 30), quantity: 0 },
        { at: at(10), quantity: 100 },
      ],
      { now: at(10), horizonMinutes: 30 },
    );
    expect(forecast.status).toBe('in-stock');
    expect(forecast.nextRestockAt).toBeNull();
  });

  it('reports sold out when no restock lands before arrival', () => {
    const forecast = forecastStock(
      [
        { at: at(8), quantity: 0 },
        { at: at(8, 30), quantity: 50 },
        { at: at(9), quantity: 0 },
      ],
      { now: at(10), horizonMinutes: 0 },
    );
    expect(forecast.status).toBe('sold-out');
    expect(forecast.expectedStock).toBe(0);
    expect(forecast.nextRestockAt).toBe(at(10, 15));
  });

  it('does not claim availability without a single sale', () => {
    const forecast = forecastStock(
      [
        { at: at(9), quantity: 50 },
        { at: at(10), quantity: 50 },
      ],
      { now: at(10), horizonMinutes: 60 },
    );
    expect(forecast.status).toBe('in-stock');
    expect(forecast.expectedStock).toBe(50);
    expect(forecast.nextRestockAt).toBeNull();
    expect(forecast.confidence).toBe('low');
    expect(forecast.sellRatePerHour).toBeNull();
  });

  it('returns unknown when empty with no restock evidence', () => {
    const forecast = forecastStock(
      [
        { at: at(9), quantity: 10 },
        { at: at(9, 30), quantity: 0 },
      ],
      { now: at(10), horizonMinutes: 60 },
    );
    expect(forecast.status).toBe('unknown');
    expect(forecast.expectedStock).toBeNull();
    expect(forecast.nextRestockAt).toBeNull();
  });

  it('clamps an invalid horizon to zero', () => {
    const forecast = forecastStock([{ at: at(10), quantity: 12 }], {
      now: at(10),
      horizonMinutes: Number.NaN,
    });
    expect(forecast.horizonMinutes).toBe(0);
    expect(forecast.expectedStock).toBe(12);
  });
});

describe('restock uncertainty', () => {
  it('uses measured restock lag over half the sellout duration', () => {
    const forecast = forecastStock(
      [
        { at: at(6), quantity: 0 },
        { at: at(6, 15), quantity: 60 },
        { at: at(8, 15), quantity: 0 },
        { at: at(8, 30), quantity: 60 },
        { at: at(10, 30), quantity: 0 },
        { at: at(10, 45), quantity: 60 },
        { at: at(12, 45), quantity: 0 },
      ],
      { now: at(12, 45), horizonMinutes: 15 },
    );
    expect(forecast.nextRestockAt).toBe(at(13));
    expect(forecast.nextRestockEarliestAt).toBe(at(13));
    expect(forecast.nextRestockLatestAt).toBe(at(13));
    expect(forecast.restockSamples).toBe(2);
    expect(forecast.restockConfidence).toBe('low');
    expect(forecast.arrivalStockChance).toBe(1);
  });

  it('reports a window from measured lag spread', () => {
    const forecast = forecastStock(
      [
        { at: at(6), quantity: 0 },
        { at: at(6, 30), quantity: 60 },
        { at: at(7), quantity: 0 },
        { at: at(7, 15), quantity: 60 },
        { at: at(7, 45), quantity: 0 },
        { at: at(8, 30), quantity: 60 },
        { at: at(9), quantity: 0 },
      ],
      { now: at(9), horizonMinutes: 60 },
    );
    expect(forecast.nextRestockAt).toBe(at(9, 30));
    expect(forecast.nextRestockEarliestAt).toBe(at(9, 30));
    expect(forecast.nextRestockLatestAt).toBe(at(9, 45));
    expect(forecast.restockConfidence).toBe('low');
    expect(forecast.arrivalStockChance).toBe(1);
  });

  it('raises restock confidence with more measured restocks', () => {
    const forecast = forecastStock(
      [
        { at: at(6), quantity: 0 },
        { at: at(6, 15), quantity: 60 },
        { at: at(7, 15), quantity: 0 },
        { at: at(7, 30), quantity: 60 },
        { at: at(8, 30), quantity: 0 },
        { at: at(8, 45), quantity: 60 },
        { at: at(9, 45), quantity: 0 },
        { at: at(10), quantity: 60 },
        { at: at(11), quantity: 0 },
      ],
      { now: at(11), horizonMinutes: 30 },
    );
    expect(forecast.nextRestockAt).toBe(at(11, 15));
    expect(forecast.restockSamples).toBe(3);
    expect(forecast.restockConfidence).toBe('medium');
  });

  it('reaches high restock confidence with five measured restocks', () => {
    const forecast = forecastStock(
      [
        { at: at(6), quantity: 0 },
        { at: at(6, 15), quantity: 60 },
        { at: at(7, 15), quantity: 0 },
        { at: at(7, 30), quantity: 60 },
        { at: at(8, 30), quantity: 0 },
        { at: at(8, 45), quantity: 60 },
        { at: at(9, 45), quantity: 0 },
        { at: at(10), quantity: 60 },
        { at: at(11), quantity: 0 },
        { at: at(11, 15), quantity: 60 },
        { at: at(12, 15), quantity: 0 },
        { at: at(12, 30), quantity: 60 },
        { at: at(13, 30), quantity: 0 },
      ],
      { now: at(13, 30), horizonMinutes: 30 },
    );
    expect(forecast.nextRestockAt).toBe(at(13, 45));
    expect(forecast.restockSamples).toBe(5);
    expect(forecast.restockConfidence).toBe('high');
  });

  it('withholds timing fields when no restock can be timed', () => {
    const forecast = forecastStock(
      [
        { at: at(9), quantity: 50 },
        { at: at(10), quantity: 40 },
      ],
      { now: at(10), horizonMinutes: 60 },
    );
    expect(forecast.nextRestockAt).toBeNull();
    expect(forecast.nextRestockEarliestAt).toBeNull();
    expect(forecast.nextRestockLatestAt).toBeNull();
    expect(forecast.restockSamples).toBe(0);
    expect(forecast.restockConfidence).toBe('low');
  });
});
