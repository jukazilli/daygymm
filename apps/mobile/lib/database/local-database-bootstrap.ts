import type { DatabaseKeyProvider } from "./database-key";
import type { LocalMigration } from "./local-migrations";

export interface SqlExecutor {
  exec(source: string): Promise<void>;
}

export interface EncryptedDatabase extends SqlExecutor {
  close(): Promise<void>;
  getFirst<T>(source: string): Promise<T | null>;
  transaction(task: (transaction: SqlExecutor) => Promise<void>): Promise<void>;
}

export interface EncryptedDatabaseDriver {
  open(databaseKey: string): Promise<EncryptedDatabase>;
}

export type LocalDatabaseBlockedReason =
  | "CIPHER_UNAVAILABLE"
  | "KEY_UNAVAILABLE"
  | "MIGRATION_FAILED"
  | "SCHEMA_UNSUPPORTED";

export type LocalDatabaseState =
  | { readonly status: "idle" }
  | { readonly status: "initializing" }
  | {
      readonly database: EncryptedDatabase;
      readonly schemaVersion: number;
      readonly status: "ready";
    }
  | {
      readonly reason: LocalDatabaseBlockedReason;
      readonly status: "write-blocked";
    };

export class LocalDatabaseWriteBlockedError extends Error {
  constructor(
    readonly state: Exclude<LocalDatabaseState, { status: "ready" }>,
  ) {
    super("LOCAL_DATABASE_WRITE_BLOCKED");
    this.name = "LocalDatabaseWriteBlockedError";
  }
}

interface CipherVersionRow {
  readonly cipher_version: string;
}

interface UserVersionRow {
  readonly user_version: number;
}

export class LocalDatabaseBootstrap {
  private currentState: LocalDatabaseState = { status: "idle" };
  private pendingInitialization: Promise<LocalDatabaseState> | undefined;

  constructor(
    private readonly keyProvider: Pick<DatabaseKeyProvider, "getOrCreate">,
    private readonly driver: EncryptedDatabaseDriver,
    private readonly migrations: readonly LocalMigration[],
  ) {}

  get state(): LocalDatabaseState {
    return this.currentState;
  }

  initialize(): Promise<LocalDatabaseState> {
    if (this.currentState.status === "ready") {
      return Promise.resolve(this.currentState);
    }

    if (!this.pendingInitialization) {
      this.currentState = { status: "initializing" };
      this.pendingInitialization = this.initializeOnce().finally(() => {
        this.pendingInitialization = undefined;
      });
    }

    return this.pendingInitialization;
  }

  requireWritableDatabase(): EncryptedDatabase {
    if (this.currentState.status !== "ready") {
      throw new LocalDatabaseWriteBlockedError(
        this.currentState as Exclude<LocalDatabaseState, { status: "ready" }>,
      );
    }

    return this.currentState.database;
  }

  private async initializeOnce(): Promise<LocalDatabaseState> {
    let databaseKey: string;
    try {
      databaseKey = await this.keyProvider.getOrCreate();
    } catch {
      return this.block("KEY_UNAVAILABLE");
    }

    let database: EncryptedDatabase | undefined;
    try {
      database = await this.driver.open(databaseKey);
      const cipher = await database.getFirst<CipherVersionRow>(
        "PRAGMA cipher_version",
      );
      if (!cipher?.cipher_version) {
        await database.close();
        return this.block("CIPHER_UNAVAILABLE");
      }
      await database.getFirst<{ readonly count: number }>(
        "SELECT count(*) AS count FROM sqlite_master",
      );
    } catch {
      if (database) {
        await database.close().catch(() => undefined);
      }
      return this.block("CIPHER_UNAVAILABLE");
    }

    if (!database) {
      return this.block("CIPHER_UNAVAILABLE");
    }

    try {
      await database.exec("PRAGMA foreign_keys = ON");
      await database.exec("PRAGMA journal_mode = WAL");
      const versionRow = await database.getFirst<UserVersionRow>(
        "PRAGMA user_version",
      );
      let schemaVersion = versionRow?.user_version ?? 0;
      const migrationVersionsAreContiguous = this.migrations.every(
        (migration, index) => migration.version === index + 1,
      );
      if (!migrationVersionsAreContiguous) {
        throw new Error("Local migration sequence is not contiguous.");
      }

      const latestSchemaVersion = this.migrations.at(-1)?.version ?? 0;
      if (schemaVersion > latestSchemaVersion) {
        await database.close();
        return this.block("SCHEMA_UNSUPPORTED");
      }

      for (const migration of this.migrations) {
        if (migration.version <= schemaVersion) {
          continue;
        }
        await database.transaction(async (transaction) => {
          for (const statement of migration.statements) {
            await transaction.exec(statement);
          }
          await transaction.exec(`PRAGMA user_version = ${migration.version}`);
        });
        schemaVersion = migration.version;
      }

      this.currentState = {
        database,
        schemaVersion,
        status: "ready",
      };
      return this.currentState;
    } catch {
      try {
        await database.close();
      } catch {
        // Closing is best-effort; the write gate remains blocked either way.
      }
      return this.block("MIGRATION_FAILED");
    }
  }

  private block(reason: LocalDatabaseBlockedReason): LocalDatabaseState {
    this.currentState = { reason, status: "write-blocked" };
    return this.currentState;
  }
}
