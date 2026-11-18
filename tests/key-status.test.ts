import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, DEFAULT_SETTINGS } from '../src/core/types';
import type { AppState } from '../src/state/app-state';
import { createInitialState } from '../src/state/app-state';
import { keyCheckMessage } from '../src/state/key-status';

const base: AppState = createInitialState({
  settings: DEFAULT_SETTINGS,
  filters: DEFAULT_FILTERS,
  apiKey: 'key',
  catalog: null,
  stock: null,
  histories: { stock: {}, prices: {} },
  country: 'jap',
});

describe('keyCheckMessage', () => {
  it('returns no message for a valid key', () => {
    const state = { ...base, keyStatus: 'valid' as const, error: 'Quote refresh failed.' };
    expect(keyCheckMessage(state)).toBeNull();
  });

  it('prefers the key message', () => {
    const state = {
      ...base,
      keyStatus: 'invalid' as const,
      keyMessage: 'API key has been paused by the owner.',
      error: 'Something else.',
    };
    expect(keyCheckMessage(state)).toBe('API key has been paused by the owner.');
  });

  it('falls back to the general error', () => {
    const state = {
      ...base,
      keyStatus: 'unchecked' as const,
      keyMessage: null,
      error: 'Could not reach the API.',
    };
    expect(keyCheckMessage(state)).toBe('Could not reach the API.');
  });

  it('returns null when no message is available', () => {
    const state = { ...base, keyStatus: 'checking' as const };
    expect(keyCheckMessage(state)).toBeNull();
  });
});
