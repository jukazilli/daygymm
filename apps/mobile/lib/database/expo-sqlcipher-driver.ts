import * as SQLite from "expo-sqlite";

import { isValidDatabaseKey } from "./database-key";
import type {
  EncryptedDatabase,
  EncryptedDatabaseDriver,
  SqlExecutor,
} from "./local-database-bootstrap";

const databaseName = "daygym-training.db";

function executor(database: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    exec(source) {
      return database.execAsync(source);
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
    getFirst<T>(source: string) {
      return database.getFirstAsync<T>(source);
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
