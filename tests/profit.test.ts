import { describe, expect, it } from 'vitest';
import {
  buildTripPlan,
  feePercentFor,
  flightCost,
  isValidAmount,
  netSalePrice,
  profitPerHour,
  selectBasket,
  unitProfit,
} from '../src/domain/profit';
import { makeForecast, makeRow, makeSettings } from './fixtures';

describe('feePercentFor', () => {
  it('returns the item market fee', () => {
    expect(feePercentFor({ channel: 'item-market', customFeePercent: 0 })).toBe(5);
  });

  it('returns no fee for bazaars', () => {
    expect(feePercentFor({ channel: 'bazaar', customFeePercent: 10 })).toBe(0);
  });

  it('clamps a custom fee', () => {
    expect(feePercentFor({ channel: 'custom', customFeePercent: -5 })).toBe(0);
    expect(feePercentFor({ channel: 'custom', customFeePercent: 250 })).toBe(100);
    expect(feePercentFor({ channel: 'custom', customFeePercent: Number.NaN })).toBe(0);
  });
});

describe('amounts', () => {
  it('accepts zero but rejects negatives and non-finite values', () => {
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidAmount('5')).toBe(false);
  });

  it('takes the fee out of the sale price', () => {
    expect(netSalePrice(1000, 5)).toBe(950);
    expect(netSalePrice(1000, 0)).toBe(1000);
    expect(netSalePrice(0, 5)).toBeNull();
  });

  it('subtracts the buy price from the net sale', () => {
    expect(unitProfit({ buyPrice: 100, salePrice: 1000, feePercent: 5 })).toBe(850);
    expect(unitProfit({ buyPrice: 0, salePrice: 100, feePercent: 5 })).toBe(95);
    expect(unitProfit({ buyPrice: 100, salePrice: 0, feePercent: 5 })).toBeNull();
  });
});

describe('flightCost', () => {
  it('charges the standard fare both ways', () => {
    expect(
      flightCost({
        destinationCode: 'mex',
        method: 'standard',
        businessTicketCost: 0,
      }),
    ).toBe(13000);
  });

  it('can charge a single leg', () => {
    expect(
      flightCost({
        destinationCode: 'mex',
        method: 'standard',
        businessTicketCost: 0,
        roundTrip: false,
      }),
    ).toBe(6500);
  });

  it('treats airstrip and WLT as free', () => {
    expect(flightCost({ destinationCode: 'jap', method: 'airstrip', businessTicketCost: 0 })).toBe(
      0,
    );
    expect(flightCost({ destinationCode: 'jap', method: 'wlt', businessTicketCost: 0 })).toBe(0);
  });

  it('uses the configured business ticket cost', () => {
    expect(
      flightCost({ destinationCode: 'jap', method: 'business', businessTicketCost: 1000 }),
    ).toBe(2000);
    expect(
      flightCost({
        destinationCode: 'jap',
        method: 'business',
        businessTicketCost: Number.NaN,
      }),
    ).toBe(0);
  });
});

describe('profitPerHour', () => {
  it('scales profit to an hour', () => {
    expect(profitPerHour(600, 60)).toBe(600);
    expect(profitPerHour(600, 120)).toBe(300);
  });

  it('returns null for a non-positive duration', () => {
    expect(profitPerHour(600, 0)).toBeNull();
    expect(profitPerHour(600, Number.NaN)).toBeNull();
  });
});

describe('selectBasket', () => {
  const candidates = [
    { itemId: 1, name: 'Alpha', unitProfit: 500, stock: 3, buyPrice: 100 },
    { itemId: 2, name: 'Beta', unitProfit: 500, stock: 100, buyPrice: 200 },
    { itemId: 3, name: 'Gamma', unitProfit: 700, stock: 2, buyPrice: 50 },
  ];

  it('fills capacity by unit profit', () => {
    const selection = selectBasket(candidates, 4);
    expect(selection.units).toBe(4);
    expect(selection.buyCost).toBe(300);
    expect(selection.grossProfit).toBe(2400);
    expect(selection.picks.map((pick) => [pick.itemId, pick.units])).toEqual([
      [3, 2],
      [1, 2],
    ]);
  });

  it('respects per-item stock when capacity exceeds supply', () => {
    const selection = selectBasket(candidates, 200);
    expect(selection.units).toBe(105);
    expect(selection.grossProfit).toBe(52900);
  });

  it('skips unprofitable and empty items', () => {
    const selection = selectBasket(
      [
        { itemId: 1, name: 'Loss', unitProfit: -10, stock: 10, buyPrice: 10 },
        { itemId: 2, name: 'Empty', unitProfit: 100, stock: 0, buyPrice: 10 },
        { itemId: 3, name: 'NaN', unitProfit: Number.NaN, stock: 10, buyPrice: 10 },
      ],
      10,
    );
    expect(selection.units).toBe(0);
    expect(selection.picks).toEqual([]);
  });

  it('floors fractional stock and capacity', () => {
    const selection = selectBasket(
      [{ itemId: 1, name: 'Fraction', unitProfit: 10, stock: 2.9, buyPrice: 1 }],
      2.9,
    );
    expect(selection.units).toBe(2);
  });

  it('handles zero or negative capacity', () => {
    expect(selectBasket(candidates, 0).units).toBe(0);
    expect(selectBasket(candidates, -4).units).toBe(0);
  });
});

describe('buildTripPlan', () => {
  const rows = [
    makeRow(1, 'Alpha', {
      buyPrice: 100,
      unitProfit: 50,
      stock: 6,
      forecast: makeForecast({ status: 'in-stock', expectedStock: 5 }),
    }),
    makeRow(2, 'Beta', {
      buyPrice: 10,
      unitProfit: 20,
      stock: 4,
      forecast: makeForecast({ status: 'in-stock', expectedStock: 2 }),
    }),
  ];

  it('uses predicted availability when enabled', () => {
    const plan = buildTripPlan('mex', rows, makeSettings({ capacity: 10, method: 'standard' }));
    expect(plan.units).toBe(7);
    expect(plan.buyCost).toBe(520);
    expect(plan.grossProfit).toBe(290);
    expect(plan.flightCost).toBe(13000);
    expect(plan.netProfit).toBe(-12710);
    expect(plan.totalMinutes).toBe(48);
    expect(plan.fillRate).toBeCloseTo(0.7);
    expect(plan.picks).toHaveLength(2);
  });

  it('uses current stock when prediction is disabled', () => {
    const plan = buildTripPlan(
      'mex',
      rows,
      makeSettings({ capacity: 10, method: 'standard', includePredictedStock: false }),
    );
    expect(plan.units).toBe(10);
    expect(plan.grossProfit).toBe(380);
  });

  it('adds waiting time to the trip duration', () => {
    const plan = buildTripPlan(
      'mex',
      rows,
      makeSettings({ capacity: 10, method: 'standard', waitMinutes: 30 }),
    );
    expect(plan.totalMinutes).toBe(78);
  });

  it('reports a loss when nothing is worth buying', () => {
    const plan = buildTripPlan(
      'jap',
      [makeRow(1, 'Bad', { buyPrice: 100, unitProfit: null })],
      makeSettings({ capacity: 28, method: 'standard' }),
    );
    expect(plan.units).toBe(0);
    expect(plan.netProfit).toBe(-64000);
    expect(plan.roiPercent).toBeNull();
    expect(plan.profitPerHour).toBeNull();
  });
});
