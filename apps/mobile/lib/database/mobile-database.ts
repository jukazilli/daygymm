import { getRandomBytesAsync } from "expo-crypto";

import { expoSecureStoreDriver } from "../security/expo-secure-store-driver";
import { DatabaseKeyProvider } from "./database-key";
import { expoSqlCipherDriver } from "./expo-sqlcipher-driver";
import { LocalDatabaseBootstrap } from "./local-database-bootstrap";
import { localMigrations } from "./local-migrations";

const databaseKeyProvider = new DatabaseKeyProvider(
  expoSecureStoreDriver,
  getRandomBytesAsync,
);

export const mobileDatabase = new LocalDatabaseBootstrap(
  databaseKeyProvider,
  expoSqlCipherDriver,
  localMigrations,
);
