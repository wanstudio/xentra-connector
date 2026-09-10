'use strict';

const path = require('path');
const initSqlJs = require('sql.js');
const { createSqliteFileAdapter } = require('../adapters/SqliteClientDataAdapter');
const TypedPersistenceService = require('./TypedPersistenceService');

async function createRuntimePersistenceService({ dbPath, persistenceOptions } = {}) {
  const resolvedPath = dbPath || process.env.XENTRA_CLIENT_DB_PATH || process.env.DB_PATH;
  if (!resolvedPath) {
    throw new Error('XENTRA_CLIENT_DB_PATH is required for runtime persistence');
  }

  const adapter = await createSqliteFileAdapter({
    dbPath: path.resolve(resolvedPath),
    initSqlJs: () => initSqlJs(),
  });

  return new TypedPersistenceService(adapter, persistenceOptions);
}

module.exports = { createRuntimePersistenceService };
