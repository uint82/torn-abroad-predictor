import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatMinutes,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatSignedMoney,
  formatSignedPercent,
  formatStock,
} from '../src/ui/format';

describe('format', () => {
  it('formats money', () => {
    expect(formatMoney(1234.6)).toBe('$1,235');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(null)).toBe('n/a');
    expect(formatMoney(Number.NaN)).toBe('n/a');
  });

  it('formats signed money', () => {
    expect(formatSignedMoney(1234)).toBe('+$1,234');
    expect(formatSignedMoney(-1234)).toBe('-$1,234');
    expect(formatSignedMoney(0)).toBe('+$0');
    expect(formatSignedMoney(Number.POSITIVE_INFINITY)).toBe('n/a');
  });

  it('formats numbers', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(12.34, 1)).toBe('12.3');
    expect(formatNumber(null)).toBe('n/a');
  });

  it('formats percentages', () => {
    expect(formatPercent(12.34)).toBe('12.3%');
    expect(formatSignedPercent(12.34)).toBe('+12.3%');
    expect(formatSignedPercent(-12.34)).toBe('-12.3%');
    expect(formatSignedPercent(0)).toBe('0.0%');
    expect(formatPercent(null)).toBe('n/a');
  });

  it('formats durations', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(59)).toBe('59m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(89)).toBe('1h 29m');
    expect(formatMinutes(-5)).toBe('0m');
    expect(formatMinutes(null)).toBe('n/a');
  });

  it('formats relative times', () => {
    const now = 10_000_000;
    expect(formatRelative(null, now)).toBe('never');
    expect(formatRelative(now - 10_000, now)).toBe('just now');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelative(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(formatRelative(now + 5 * 60_000, now)).toBe('in 5m');
  });

  it('formats a date', () => {
    expect(formatDateTime(null)).toBe('n/a');
    expect(formatDateTime(Date.UTC(2026, 0, 1, 9))).toContain('2026');
  });

  it('formats stock', () => {
    expect(formatStock(12.9)).toBe('12');
    expect(formatStock(-1)).toBe('0');
    expect(formatStock(null)).toBe('n/a');
  });
});
