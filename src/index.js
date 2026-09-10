'use strict';

const { start } = require('./transport/httpServer');

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start xentra-connector');
    process.exitCode = 1;
  });
}

module.exports = { start };
