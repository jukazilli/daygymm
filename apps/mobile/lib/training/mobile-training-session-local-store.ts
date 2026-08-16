import { LocalDatabaseWriteBlockedError } from "../database/local-database-bootstrap";
import { mobileDatabase } from "../database/mobile-database";
import { SqlCipherTrainingSessionLocalStore } from "./sqlcipher-training-session-local-store";

async function initializedMobileDatabase() {
  const state = await mobileDatabase.initialize();
  if (state.status !== "ready") {
    throw new LocalDatabaseWriteBlockedError(state);
  }
  return state.database;
}

export const mobileTrainingSessionLocalStore =
  new SqlCipherTrainingSessionLocalStore(initializedMobileDatabase);
