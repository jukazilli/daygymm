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
  {
    version: 2,
    name: "training-session-outbox",
    statements: [
      `CREATE TABLE IF NOT EXISTS training_session_snapshots (
        owner_id TEXT PRIMARY KEY NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS training_outbox_operations (
        owner_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence >= 0),
        status TEXT NOT NULL CHECK (status IN ('pending', 'conflict')),
        attempts INTEGER NOT NULL CHECK (attempts >= 0),
        retry_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'start-session',
          'start-exercise',
          'complete-set',
          'revise-set',
          'pause-session',
          'resume-session',
          'cancel-session',
          'finish-session'
        )),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, operation_id),
        UNIQUE (owner_id, sequence)
      ) STRICT`,
      `CREATE INDEX IF NOT EXISTS training_outbox_owner_sequence_idx
       ON training_outbox_operations (owner_id, sequence)`,
      `INSERT INTO local_schema_migrations (version, name, applied_at)
       VALUES (2, 'training-session-outbox', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    ],
  },
]);
