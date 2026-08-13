export interface LocalMigration {
  readonly name: string;
  readonly statements: readonly string[];
  readonly version: number;
}

export const localMigrations: readonly LocalMigration[] = Object.freeze([
  {
    version: 1,
    name: "local-foundation",
    statements: [
      `CREATE TABLE IF NOT EXISTS local_schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT`,
      `INSERT INTO local_schema_migrations (version, name, applied_at)
       VALUES (1, 'local-foundation', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    ],
  },
]);
