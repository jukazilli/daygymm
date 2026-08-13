import type { SecureKeyValueDriver } from "../security/secure-session-storage";

const databaseKeyStorageName = "daygym.local.database-key.v1";
const databaseKeyPattern = /^[0-9a-f]{64}$/;

export type RandomBytes = (length: number) => Promise<Uint8Array>;

export class DatabaseKeyError extends Error {
  constructor(readonly code: "INVALID_KEY" | "RANDOM_SOURCE_FAILED") {
    super(code);
    this.name = "DatabaseKeyError";
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export class DatabaseKeyProvider {
  private pendingKey: Promise<string> | undefined;

  constructor(
    private readonly store: SecureKeyValueDriver,
    private readonly randomBytes: RandomBytes,
  ) {}

  getOrCreate(): Promise<string> {
    if (!this.pendingKey) {
      this.pendingKey = this.loadOrCreate().catch((error: unknown) => {
        this.pendingKey = undefined;
        throw error;
      });
    }

    return this.pendingKey;
  }

  private async loadOrCreate(): Promise<string> {
    const storedKey = await this.store.getItem(databaseKeyStorageName);
    if (storedKey !== null) {
      if (!databaseKeyPattern.test(storedKey)) {
        throw new DatabaseKeyError("INVALID_KEY");
      }
      return storedKey;
    }

    const bytes = await this.randomBytes(32);
    if (bytes.length !== 32) {
      throw new DatabaseKeyError("RANDOM_SOURCE_FAILED");
    }

    const generatedKey = bytesToHex(bytes);
    await this.store.setItem(databaseKeyStorageName, generatedKey);
    return generatedKey;
  }
}

export function isValidDatabaseKey(value: string): boolean {
  return databaseKeyPattern.test(value);
}
