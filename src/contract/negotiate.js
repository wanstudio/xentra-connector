'use strict';

const { contractVersion } = require('../config');
const { CODES, ConnectorError } = require('./errors');

function negotiateContract(requestedVersions) {
  const versions = Array.isArray(requestedVersions) ? requestedVersions.filter((value) => typeof value === 'string' && value.length > 0) : [];
  if (versions.includes(contractVersion)) {
    return Object.freeze({
      contract_version: contractVersion,
      compatible: true,
    });
  }

  throw new ConnectorError(CODES.CONTRACT_INCOMPATIBLE, 'No compatible contract version', { retryable: false });
}

module.exports = { negotiateContract };
