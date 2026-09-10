'use strict';

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { createSqliteFileAdapter } = require('../adapters/SqliteClientDataAdapter');
const { openNativeSqlite } = require('../adapters/NativeSqliteDatabase');
const { validateClientSchema } = require('../schema/clientSchema');
const TypedPersistenceService = require('./TypedPersistenceService');

async function createRuntimePersistenceService({ dbPath, persistenceOptions } = {}) {
  const resolvedPath = dbPath || process.env.XENTRA_CLIENT_DB_PATH || process.env.DB_PATH;
  if (!resolvedPath) {
    throw new Error('XENTRA_CLIENT_DB_PATH is required for runtime persistence');
  }

  const absolutePath = path.resolve(resolvedPath);

  // Prefer native node:sqlite on supported Node runtimes. This opens the
  // actual SQLite file with WAL and avoids the whole-file snapshot overwrite
  // risk of sql.js when another process is writing to the same DB.
  try {
    const db = openNativeSqlite(absolutePath);
    validateClientSchema(db);
    return new TypedPersistenceService(db, persistenceOptions);
  } catch (error) {
    if (error && error.code === 'PERMANENT_INTEGRATION_FAILURE') throw error;
    // Fall through only when node:sqlite is unavailable. Older Node runtimes
    // retain the existing sql.js compatibility path.
  }

  const adapter = await createSqliteFileAdapter({
    dbPath: absolutePath,
    initSqlJs: () => initSqlJs(),
  });

  validateClientSchema(adapter.db);
  return new TypedPersistenceService(adapter, persistenceOptions);
}

module.exports = { createRuntimePersistenceService };
