import * as SQLite from "expo-sqlite";

import { isValidDatabaseKey } from "./database-key";
import type {
  EncryptedDatabase,
  EncryptedDatabaseDriver,
  SqlSession,
} from "./local-database-bootstrap";

const databaseName = "daygym-training.db";

function executor(database: SQLite.SQLiteDatabase): SqlSession {
  return {
    exec(source) {
      return database.execAsync(source);
    },
    getAll<T>(source: string, parameters = []) {
      return database.getAllAsync<T>(source, ...parameters);
    },
    getFirst<T>(source: string, parameters = []) {
      return database.getFirstAsync<T>(source, ...parameters);
    },
    async run(source, parameters = []) {
      await database.runAsync(source, ...parameters);
    },
  };
}

function encryptedDatabase(database: SQLite.SQLiteDatabase): EncryptedDatabase {
  return {
    exec(source) {
      return database.execAsync(source);
    },
    close() {
      return database.closeAsync();
    },
    getAll<T>(source: string, parameters = []) {
      return database.getAllAsync<T>(source, ...parameters);
    },
    getFirst<T>(source: string, parameters = []) {
      return database.getFirstAsync<T>(source, ...parameters);
    },
    async run(source, parameters = []) {
      await database.runAsync(source, ...parameters);
    },
    transaction(task) {
      return database.withExclusiveTransactionAsync((transaction) =>
        task(executor(transaction)),
      );
    },
  };
}

export const expoSqlCipherDriver: EncryptedDatabaseDriver = {
  async open(databaseKey) {
    if (!isValidDatabaseKey(databaseKey)) {
      throw new Error("Invalid encrypted database key.");
    }

    const database = await SQLite.openDatabaseAsync(databaseName, {
      useNewConnection: true,
    });
    try {
      await database.execAsync(`PRAGMA key = "x'${databaseKey}'"`);
      await database.execAsync("PRAGMA cipher_memory_security = ON");
      return encryptedDatabase(database);
    } catch (error) {
      await database.closeAsync().catch(() => undefined);
      throw error;
    }
  },
};
