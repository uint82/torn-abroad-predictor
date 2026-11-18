export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageAdapter {
  read(key: string): unknown;
  write(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export function createMemoryBackend(): StorageBackend {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

export function createStorageAdapter(backend: StorageBackend): StorageAdapter {
  return {
    read: (key) => {
      const raw = backend.getItem(key);
      if (raw === null) {
        return null;
      }
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    write: (key, value) => {
      try {
        backend.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove: (key) => {
      try {
        backend.removeItem(key);
      } catch {
        return;
      }
    },
  };
}

export function getDefaultBackend(): StorageBackend {
  try {
    const probe = 'torn-abroad.probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return createMemoryBackend();
  }
}
