import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  getDestination,
  isCountryCode,
  isTravelMethod,
  oneWayMinutes,
  roundTripMinutes,
} from '../src/domain/destinations';

describe('destinations', () => {
  it('lists eleven unique destinations', () => {
    expect(DESTINATIONS).toHaveLength(11);
    expect(new Set(DESTINATIONS.map((destination) => destination.code)).size).toBe(11);
  });

  it('uses the airstrip time for Mexico', () => {
    expect(oneWayMinutes(getDestination('mex'), 'airstrip')).toBe(17);
  });

  it('rounds booked travel time', () => {
    expect(oneWayMinutes(getDestination('mex'), 'standard', true)).toBe(18);
    expect(oneWayMinutes(getDestination('jap'), 'standard', true)).toBe(160);
  });

  it('doubles one-way time for a round trip', () => {
    expect(roundTripMinutes(getDestination('sou'), 'business')).toBe(170);
  });

  it('rejects unknown country codes', () => {
    expect(isCountryCode('mex')).toBe(true);
    expect(isCountryCode('atlantis')).toBe(false);
    expect(() => getDestination('atlantis' as never)).toThrow('Unknown destination');
  });

  it('rejects unknown travel methods', () => {
    expect(isTravelMethod('wlt')).toBe(true);
    expect(isTravelMethod('teleport')).toBe(false);
  });
});
