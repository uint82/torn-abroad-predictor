import { describe, expect, it } from 'vitest';
import { formatRestockWindow, restockTooltip } from '../src/ui/restock-format';
import { at, makeForecast } from './fixtures';

describe('restock formatting', () => {
  it('returns n/a without a window', () => {
    expect(formatRestockWindow(makeForecast())).toBe('n/a');
  });

  it('shows a compact same-day window', () => {
    expect(
      formatRestockWindow(
        makeForecast({
          nextRestockEarliestAt: at(9, 45),
          nextRestockLatestAt: at(10, 45),
        }),
      ),
    ).toBe('09:45 TCT to 10:45 TCT');
  });

  it('shows dates when a window crosses midnight', () => {
    expect(
      formatRestockWindow(
        makeForecast({
          nextRestockEarliestAt: at(23, 30),
          nextRestockLatestAt: at(23, 30) + 60 * 60_000,
        }),
      ),
    ).toBe('1 Jan 2026, 23:30 TCT to 2 Jan 2026, 00:30 TCT');
  });

  it('shows the full date for a one-tick window', () => {
    expect(
      formatRestockWindow(
        makeForecast({
          nextRestockEarliestAt: at(10, 15),
          nextRestockLatestAt: at(10, 15),
        }),
      ),
    ).toBe('1 Jan 2026, 10:15 TCT');
  });

  it('explains timing, chance, and confidence in the tooltip', () => {
    const tooltip = restockTooltip(
      makeForecast({
        nextRestockAt: at(10, 15),
        nextRestockEarliestAt: at(9, 45),
        nextRestockLatestAt: at(10, 45),
        arrivalStockChance: 0.67,
        restockConfidence: 'medium',
        restockSamples: 4,
      }),
      at(9, 45),
    );
    expect(tooltip).toContain('Estimated restock 1 Jan 2026, 10:15 TCT');
    expect(tooltip).toContain('Plausible window 09:45 TCT to 10:45 TCT');
    expect(tooltip).toContain('67% chance');
    expect(tooltip).toContain('medium restock confidence from 4 measured lags');
  });

  it('explains why a restock time is missing', () => {
    expect(restockTooltip(makeForecast(), at(10))).toContain('completed sellout and refill cycle');
  });

  it('distinguishes a missing estimate from a restock beyond the lookahead', () => {
    expect(restockTooltip(makeForecast({ restockSamples: 2 }), at(10))).toContain(
      '24-hour lookahead',
    );
  });
});
