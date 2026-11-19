import { describe, expect, it } from 'vitest';
import { DEFAULT_COUNTRY, buildSearch, parseUrlState } from '../src/ui/url-state';

describe('url state', () => {
  it('uses defaults for an empty query', () => {
    expect(parseUrlState('')).toEqual({
      country: DEFAULT_COUNTRY,
      filters: { group: 'all', sort: 'profit', inStockOnly: false },
    });
  });

  it('reads a valid query', () => {
    expect(parseUrlState('?country=mex&group=drug&sort=stock&stock=1')).toEqual({
      country: 'mex',
      filters: { group: 'drug', sort: 'stock', inStockOnly: true },
    });
  });

  it('ignores invalid values', () => {
    expect(parseUrlState('?country=atlantis&group=rocks&sort=chaos&stock=yes')).toEqual({
      country: DEFAULT_COUNTRY,
      filters: { group: 'all', sort: 'profit', inStockOnly: false },
    });
  });

  it('omits defaults when building a query', () => {
    expect(
      buildSearch({
        country: DEFAULT_COUNTRY,
        filters: { group: 'all', sort: 'profit', inStockOnly: false },
      }),
    ).toBe('');
  });

  it('round-trips a query', () => {
    const state = {
      country: 'uae' as const,
      filters: { group: 'plushie' as const, sort: 'name' as const, inStockOnly: true },
    };
    expect(parseUrlState(buildSearch(state))).toEqual(state);
  });
});
