'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestEnvelope, validateEnvelope } = require('../src/contract/envelope');
const { getCapabilities } = require('../src/capabilities/registry');

process.env.XENTRA_CONTRACT_VERSION = process.env.XENTRA_CONTRACT_VERSION || 'v1';

test('request envelope contains locked baseline metadata', () => {
  const envelope = createRequestEnvelope({ operation: 'health' }, {
    connectorId: 'test-connector',
    requestId: 'req-1',
    correlationId: 'corr-1',
    timestamp: '2026-09-10T00:00:00.000Z',
  });

  assert.equal(envelope.contract_version, 'v1');
  assert.equal(envelope.connector_id, 'test-connector');
  assert.equal(envelope.request_id, 'req-1');
  assert.equal(envelope.correlation_id, 'corr-1');
  assert.equal(validateEnvelope(envelope), true);
});

test('capabilities advertise contract version and typed persistence', () => {
  const result = getCapabilities();
  assert.deepEqual(result.contract_versions, ['v1']);
  assert.equal(result.capabilities.health, true);
  assert.equal(result.capabilities.typed_persistence, true);
});
