'use strict';

const crypto = require('crypto');
const { contractVersion } = require('../config');

function createRequestEnvelope(payload, options = {}) {
  const requestId = options.requestId || crypto.randomUUID();
  const correlationId = options.correlationId || requestId;
  const timestamp = options.timestamp || new Date().toISOString();

  return Object.freeze({
    contract_version: contractVersion,
    connector_id: options.connectorId || undefined,
    request_id: requestId,
    correlation_id: correlationId,
    timestamp,
    payload,
  });
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return false;
  const required = ['contract_version', 'request_id', 'correlation_id', 'timestamp'];
  return required.every((key) => typeof envelope[key] === 'string' && envelope[key].length > 0);
}

module.exports = { createRequestEnvelope, validateEnvelope };
