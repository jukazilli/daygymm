export interface SecureKeyValueDriver {
  deleteItem(key: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

type SessionSlot = "a" | "b";

interface SessionManifest {
  readonly chunks: number;
  readonly length: number;
  readonly version: 1;
}

const chunkLength = 400;
const maximumChunks = 32;

export const mobileSessionStorageKey = "daygym.auth.session.v1";

export class SecureSessionStorageError extends Error {
  constructor(
    readonly code:
      "INVALID_STORAGE_KEY" | "SESSION_TOO_LARGE" | "SECURE_DELETE_FAILED",
  ) {
    super(code);
    this.name = "SecureSessionStorageError";
  }
}

function isSlot(value: string | null): value is SessionSlot {
  return value === "a" || value === "b";
}

function parseManifest(value: string | null): SessionManifest | null {
  if (!value) {
    return null;
  }

  try {
    const candidate = JSON.parse(value) as Partial<SessionManifest>;
    if (
      candidate.version !== 1 ||
      !Number.isInteger(candidate.chunks) ||
      !candidate.chunks ||
      candidate.chunks < 1 ||
      candidate.chunks > maximumChunks ||
      !Number.isInteger(candidate.length) ||
      candidate.length === undefined ||
      candidate.length < 0 ||
      candidate.length > maximumChunks * chunkLength
    ) {
      return null;
    }

    return candidate as SessionManifest;
  } catch {
    return null;
  }
}

export class SecureSessionStorage {
  constructor(
    private readonly driver: SecureKeyValueDriver,
    private readonly allowedStorageKey = mobileSessionStorageKey,
  ) {}

  private assertStorageKey(key: string) {
    if (
      key !== this.allowedStorageKey &&
      !key.startsWith(`${this.allowedStorageKey}-`)
    ) {
      throw new SecureSessionStorageError("INVALID_STORAGE_KEY");
    }
  }

  private pointerKey(key: string) {
    return `${key}.active`;
  }

  private manifestKey(key: string, slot: SessionSlot) {
    return `${key}.${slot}.manifest`;
  }

  private chunkKey(key: string, slot: SessionSlot, index: number) {
    return `${key}.${slot}.${index}`;
  }

  private async removeSlot(key: string, slot: SessionSlot): Promise<void> {
    const manifest = parseManifest(
      await this.driver.getItem(this.manifestKey(key, slot)),
    );
    await this.driver.deleteItem(this.manifestKey(key, slot));
    const chunksToDelete = manifest?.chunks ?? maximumChunks;
    for (let index = 0; index < chunksToDelete; index += 1) {
      await this.driver.deleteItem(this.chunkKey(key, slot, index));
    }
  }

  private async removeSlotBestEffort(
    key: string,
    slot: SessionSlot,
  ): Promise<void> {
    try {
      await this.removeSlot(key, slot);
    } catch {
      // The active pointer never references an incomplete slot. Orphan cleanup
      // is retried by the next write or explicit removal.
    }
  }

  async getItem(key: string): Promise<string | null> {
    this.assertStorageKey(key);
    const slot = await this.driver.getItem(this.pointerKey(key));
    if (!isSlot(slot)) {
      return null;
    }

    const manifest = parseManifest(
      await this.driver.getItem(this.manifestKey(key, slot)),
    );
    if (!manifest) {
      return null;
    }

    const chunks: string[] = [];
    for (let index = 0; index < manifest.chunks; index += 1) {
      const chunk = await this.driver.getItem(this.chunkKey(key, slot, index));
      if (chunk === null) {
        return null;
      }
      chunks.push(chunk);
    }

    const value = chunks.join("");
    return value.length === manifest.length ? value : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.assertStorageKey(key);
    const chunks = Array.from(
      { length: Math.max(1, Math.ceil(value.length / chunkLength)) },
      (_, index) => value.slice(index * chunkLength, (index + 1) * chunkLength),
    );
    if (chunks.length > maximumChunks) {
      throw new SecureSessionStorageError("SESSION_TOO_LARGE");
    }

    const activeSlot = await this.driver.getItem(this.pointerKey(key));
    const targetSlot: SessionSlot = activeSlot === "a" ? "b" : "a";
    await this.removeSlot(key, targetSlot);

    try {
      for (const [index, chunk] of chunks.entries()) {
        await this.driver.setItem(this.chunkKey(key, targetSlot, index), chunk);
      }

      const manifest: SessionManifest = {
        chunks: chunks.length,
        length: value.length,
        version: 1,
      };
      await this.driver.setItem(
        this.manifestKey(key, targetSlot),
        JSON.stringify(manifest),
      );
      await this.driver.setItem(this.pointerKey(key), targetSlot);
    } catch (error) {
      await this.removeSlotBestEffort(key, targetSlot);
      throw error;
    }

    if (isSlot(activeSlot)) {
      await this.removeSlotBestEffort(key, activeSlot);
    }
  }

  async removeItem(key: string): Promise<void> {
    this.assertStorageKey(key);

    try {
      await this.driver.deleteItem(this.pointerKey(key));
      await this.removeSlot(key, "a");
      await this.removeSlot(key, "b");
    } catch {
      throw new SecureSessionStorageError("SECURE_DELETE_FAILED");
    }
  }
}
