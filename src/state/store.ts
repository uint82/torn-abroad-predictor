export type Listener<T> = (state: T) => void;

export class Store<T> {
  #state: T;
  readonly #listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.#state = initial;
  }

  get(): T {
    return this.#state;
  }

  update(updater: (state: T) => T): void {
    const next = updater(this.#state);
    if (Object.is(next, this.#state)) {
      return;
    }
    this.#state = next;
    for (const listener of [...this.#listeners]) {
      listener(next);
    }
  }

  subscribe(listener: Listener<T>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
