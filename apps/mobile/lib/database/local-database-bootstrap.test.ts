import { describe, expect, it } from "vitest";

import type { LocalMigration } from "./local-migrations";
import {
  LocalDatabaseBootstrap,
  LocalDatabaseWriteBlockedError,
  type EncryptedDatabase,
  type SqlParameter,
  type SqlSession,
} from "./local-database-bootstrap";

class FakeDatabase implements EncryptedDatabase {
  closed = false;
  readonly executed: string[] = [];
  failStatement: string | undefined;
  cipherVersion = "4.6.1 community";
  userVersion = 0;

  async close() {
    this.closed = true;
  }

  async exec(source: string) {
    if (source === this.failStatement) {
      throw new Error("simulated migration failure");
    }
    this.executed.push(source);
    const version = source.match(/^PRAGMA user_version = (\d+)$/)?.[1];
    if (version) {
      this.userVersion = Number(version);
    }
  }

  async getAll<T>(
    _source: string,
    _parameters: readonly SqlParameter[] = [],
  ): Promise<T[]> {
    void _parameters;
    return [];
  }

  async getFirst<T>(
    source: string,
    _parameters: readonly SqlParameter[] = [],
  ): Promise<T | null> {
    void _parameters;
    if (source === "PRAGMA cipher_version") {
      return { cipher_version: this.cipherVersion } as T;
    }
    if (source === "PRAGMA user_version") {
      return { user_version: this.userVersion } as T;
    }
    return { count: 0 } as T;
  }

  async run(
    source: string,
    _parameters: readonly SqlParameter[] = [],
  ): Promise<void> {
    void _parameters;
    await this.exec(source);
  }

  async transaction(task: (transaction: SqlSession) => Promise<void>) {
    const executedBefore = [...this.executed];
    const versionBefore = this.userVersion;
    try {
      await task(this);
    } catch (error) {
      this.executed.splice(0, this.executed.length, ...executedBefore);
      this.userVersion = versionBefore;
      throw error;
    }
  }
}

const migrations: readonly LocalMigration[] = [
  { version: 1, name: "one", statements: ["migration-one"] },
  { version: 2, name: "two", statements: ["migration-two"] },
];

function bootstrap(database: FakeDatabase, selectedMigrations = migrations) {
  return new LocalDatabaseBootstrap(
    { getOrCreate: () => Promise.resolve("ab".repeat(32)) },
    { open: () => Promise.resolve(database) },
    selectedMigrations,
  );
}

describe("LocalDatabaseBootstrap", () => {
  it("verifies SQLCipher before migrating and opening the write gate", async () => {
    const database = new FakeDatabase();
    const localDatabase = bootstrap(database);

    const state = await localDatabase.initialize();

    expect(state).toMatchObject({ status: "ready", schemaVersion: 2 });
    expect(localDatabase.requireWritableDatabase()).toBe(database);
    expect(database.executed).toEqual([
      "PRAGMA foreign_keys = ON",
      "PRAGMA journal_mode = WAL",
      "migration-one",
      "PRAGMA user_version = 1",
      "migration-two",
      "PRAGMA user_version = 2",
    ]);
  });

  it("does not repeat migrations already applied", async () => {
    const database = new FakeDatabase();
    database.userVersion = 1;
    const state = await bootstrap(database).initialize();

    expect(state).toMatchObject({ status: "ready", schemaVersion: 2 });
    expect(database.executed).not.toContain("migration-one");
    expect(database.executed).toContain("migration-two");
  });

  it("blocks writes and preserves the database when SQLCipher is absent", async () => {
    const database = new FakeDatabase();
    database.cipherVersion = "";
    const localDatabase = bootstrap(database);

    expect(await localDatabase.initialize()).toEqual({
      status: "write-blocked",
      reason: "CIPHER_UNAVAILABLE",
    });
    expect(database.closed).toBe(true);
    expect(() => localDatabase.requireWritableDatabase()).toThrow(
      LocalDatabaseWriteBlockedError,
    );
  });

  it("rolls back a failed migration, closes and blocks writes", async () => {
    const database = new FakeDatabase();
    database.failStatement = "migration-two";
    const localDatabase = bootstrap(database);

    expect(await localDatabase.initialize()).toEqual({
      status: "write-blocked",
      reason: "MIGRATION_FAILED",
    });
    expect(database.userVersion).toBe(1);
    expect(database.closed).toBe(true);
    expect(database.executed).not.toContain("migration-two");
  });

  it("blocks writes when the secure key is unavailable", async () => {
    const localDatabase = new LocalDatabaseBootstrap(
      { getOrCreate: () => Promise.reject(new Error("key unavailable")) },
      { open: () => Promise.reject(new Error("must not open")) },
      migrations,
    );

    expect(await localDatabase.initialize()).toEqual({
      status: "write-blocked",
      reason: "KEY_UNAVAILABLE",
    });
  });

  it("rejects a migration gap without deleting or resetting data", async () => {
    const database = new FakeDatabase();
    const state = await bootstrap(database, [
      { version: 2, name: "gap", statements: ["must-not-run"] },
    ]).initialize();

    expect(state).toEqual({
      status: "write-blocked",
      reason: "MIGRATION_FAILED",
    });
    expect(database.executed).not.toContain("must-not-run");
    expect(database.userVersion).toBe(0);
  });

  it("blocks an older app from writing a newer schema", async () => {
    const database = new FakeDatabase();
    database.userVersion = 3;

    expect(await bootstrap(database).initialize()).toEqual({
      status: "write-blocked",
      reason: "SCHEMA_UNSUPPORTED",
    });
    expect(database.closed).toBe(true);
    expect(database.userVersion).toBe(3);
  });
});
