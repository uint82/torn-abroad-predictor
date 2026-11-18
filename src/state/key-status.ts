import type { AppState } from './app-state';

export function keyCheckMessage(state: AppState): string | null {
  if (state.keyStatus === 'valid') {
    return null;
  }
  return state.keyMessage ?? state.error;
}
