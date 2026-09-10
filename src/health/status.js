'use strict';

const config = require('../config');
const { getCapabilities } = require('../capabilities/registry');

function getStatus() {
  return {
    status: 'ok',
    ready: true,
    connector_id: config.connectorId || null,
    contract_version: config.contractVersion,
    ...getCapabilities(),
  };
}

module.exports = { getStatus };
