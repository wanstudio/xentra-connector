'use strict';

const { createHttpServer, start: listen } = require('./transport/httpServer');
const { createRuntimePersistenceService } = require('./persistence/createRuntimePersistenceService');

async function start() {
  const persistenceService = await createRuntimePersistenceService();
  return listen(createHttpServer({ persistenceService }));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start xentra-connector');
    process.exitCode = 1;
  });
}

module.exports = { start };
