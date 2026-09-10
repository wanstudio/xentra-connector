'use strict';

const { createHttpServer, start: listen } = require('./transport/httpServer');
const { createRuntimePersistenceService } = require('./persistence/createRuntimePersistenceService');

async function start() {
  const persistenceService = await createRuntimePersistenceService();
  return listen(createHttpServer({ persistenceService }));
}

// Start both when executed directly and when loaded by Passenger/cPanel.
// Passenger requires the startup module rather than invoking it as the main script.
if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start xentra-connector');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
} else {
  start().catch((error) => {
    console.error('Failed to start xentra-connector under host application runner');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = { start };
