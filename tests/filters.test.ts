import { describe, expect, it } from 'vitest';
import { filterRows, sortRows } from '../src/domain/filters';
import { makeRow } from './fixtures';

const rows = [
  makeRow(1, 'Alpha', {
    group: 'plushie',
    stock: 5,
    buyPrice: 100,
    salePrice: 1000,
    unitProfit: 1500,
  }),
  makeRow(2, 'Beta', {
    group: 'flower',
    stock: 0,
    buyPrice: 50,
    salePrice: null,
    unitProfit: null,
  }),
  makeRow(3, 'Gamma', {
    group: 'drug',
    stock: 10,
    buyPrice: 200,
    salePrice: 1500,
    unitProfit: 1300,
  }),
  makeRow(4, 'Delta', {
    group: 'plushie',
    stock: null,
    buyPrice: null,
    salePrice: 1200,
    unitProfit: null,
  }),
];

describe('filterRows', () => {
  it('filters by item group', () => {
    const result = filterRows(rows, { group: 'plushie', sort: 'name', inStockOnly: false });
    expect(result.map((row) => row.name)).toEqual(['Alpha', 'Delta']);
  });

  it('filters items without stock', () => {
    const result = filterRows(rows, { group: 'all', sort: 'name', inStockOnly: true });
    expect(result.map((row) => row.name)).toEqual(['Alpha', 'Gamma']);
  });

  it('keeps everything when no filter is active', () => {
    expect(filterRows(rows, { group: 'all', sort: 'name', inStockOnly: false })).toHaveLength(4);
  });
});

describe('sortRows', () => {
  it('sorts by profit and pushes unknown values last', () => {
    const result = sortRows(rows, 'profit');
    expect(result.map((row) => row.name)).toEqual(['Alpha', 'Gamma', 'Beta', 'Delta']);
  });

  it('sorts by stock', () => {
    const result = sortRows(rows, 'stock');
    expect(result.map((row) => row.name)).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
  });

  it('sorts by name', () => {
    const result = sortRows(rows, 'name');
    expect(result.map((row) => row.name)).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
  });

  it('sorts by buy price with unknown values last', () => {
    const result = sortRows(rows, 'buy');
    expect(result.map((row) => row.name)).toEqual(['Beta', 'Alpha', 'Gamma', 'Delta']);
  });

  it('sorts by market price', () => {
    const result = sortRows(rows, 'market');
    expect(result.map((row) => row.name)).toEqual(['Gamma', 'Delta', 'Alpha', 'Beta']);
  });

  it('does not mutate the input', () => {
    const input = [...rows];
    sortRows(input, 'profit');
    expect(input.map((row) => row.itemId)).toEqual([1, 2, 3, 4]);
  });
});
