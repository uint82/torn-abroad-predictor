export class AppError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
  }
}

export class ApiError extends AppError {
  readonly code: number;
  readonly retryable: boolean;

  constructor(message: string, code: number, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

export class ShapeError extends AppError {
  readonly path: string;

  constructor(expected: string, path: string) {
    super(`Unexpected response shape: expected ${expected} at ${path}`);
    this.name = 'ShapeError';
    this.path = path;
  }
}

// Torn reports a key as unusable for several reasons: invalid, jailed owner,
// inactivity, insufficient access, or a paused key. All of them need the owner.
const UNUSABLE_KEY_CODES: ReadonlySet<number> = new Set([1, 2, 10, 13, 16, 18]);

export function isKeyError(error: unknown): boolean {
  return error instanceof ApiError && UNUSABLE_KEY_CODES.has(error.code);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Try again.';
}
