import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1Result } from '@cloudflare/workers-types';
import { SCHEMA } from '../server/store-schema';

type SqlValue = string | number | null;

function result<T>(results: T[]): D1Result<T> {
  return {
    results,
    success: true,
    meta: {
      changed_db: false,
      changes: 0,
      duration: 0,
      last_row_id: 0,
      rows_read: 0,
      rows_written: 0,
      size_after: 0,
    },
  };
}

class FakeStatement {
  readonly #db: DatabaseSync;
  readonly #sql: string;
  #values: SqlValue[] = [];

  constructor(db: DatabaseSync, sql: string) {
    this.#db = db;
    this.#sql = sql;
  }

  bind(...values: unknown[]): FakeStatement {
    this.#values = values as SqlValue[];
    return this;
  }

  async all<T>(): Promise<D1Result<T>> {
    return result(this.#db.prepare(this.#sql).all(...this.#values) as T[]);
  }

  async first<T>(): Promise<T | null> {
    return (this.#db.prepare(this.#sql).get(...this.#values) as T | undefined) ?? null;
  }

  async run(): Promise<D1Result<unknown>> {
    const info = this.#db.prepare(this.#sql).run(...this.#values);
    const output = result<unknown>([]);
    output.meta.changes = Number(info.changes);
    output.meta.last_row_id = Number(info.lastInsertRowid);
    return output;
  }

  async execute(): Promise<D1Result<unknown>> {
    return /^\s*(SELECT|WITH)/i.test(this.#sql) ? this.all() : this.run();
  }
}

class FakeD1Database {
  readonly #db: DatabaseSync;

  constructor() {
    this.#db = new DatabaseSync(':memory:');
    this.#db.exec(SCHEMA);
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.#db, sql);
  }

  async batch(statements: FakeStatement[]): Promise<D1Result<unknown>[]> {
    this.#db.exec('BEGIN');
    try {
      const results: D1Result<unknown>[] = [];
      for (const statement of statements) {
        results.push(await statement.execute());
      }
      this.#db.exec('COMMIT');
      return results;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.#db.close();
  }
}

export type FakeDatabase = FakeD1Database & D1Database;

export function createFakeD1(): FakeDatabase {
  return new FakeD1Database() as FakeDatabase;
}
