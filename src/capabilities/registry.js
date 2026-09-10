'use strict';

const { contractVersion } = require('../config');

const CAPABILITIES = Object.freeze({
  health: true,
  readiness: true,
  capability_discovery: true,
  contract_negotiation: true,
  typed_persistence: true,
  object_storage: false,
});

function getCapabilities() {
  return Object.freeze({
    contract_versions: [contractVersion],
    capabilities: CAPABILITIES,
  });
}

module.exports = { getCapabilities };
