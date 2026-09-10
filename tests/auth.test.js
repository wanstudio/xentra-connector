'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { signRequest, verifyRequest } = require('../src/auth/requestVerifier');

const base = {
  method: 'POST',
  url: '/v1/contract/negotiate',
  timestamp: '2026-09-10T00:00:00.000Z',
  requestId: 'req-1',
  body: JSON.stringify({ requested_versions: ['v1'] }),
};

test('service signature verifies for the exact request', () => {
  const secret = 'test-secret';
  const signature = signRequest(base, secret);
  const result = verifyRequest({
    ...base,
    headers: {
      'x-xentra-connector-id': 'connector-test',
      'x-xentra-request-id': base.requestId,
      'x-xentra-timestamp': base.timestamp,
      'x-xentra-signature': signature,
    },
  }, {
    connectorId: 'connector-test',
    secret,
    maxSkewMs: Number.MAX_SAFE_INTEGER,
  });

  assert.equal(result.ok, true);
  assert.equal(result.connectorId, 'connector-test');
});

test('signature fails closed when request is modified', () => {
  const secret = 'test-secret';
  const signature = signRequest(base, secret);
  const result = verifyRequest({
    ...base,
    body: JSON.stringify({ requested_versions: ['v2'] }),
    headers: {
      'x-xentra-connector-id': 'connector-test',
      'x-xentra-request-id': base.requestId,
      'x-xentra-timestamp': base.timestamp,
      'x-xentra-signature': signature,
    },
  }, {
    connectorId: 'connector-test',
    secret,
    maxSkewMs: Number.MAX_SAFE_INTEGER,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SIGNATURE_INVALID');
});

test('unconfigured service authentication fails closed', () => {
  const result = verifyRequest({ headers: {}, method: 'POST', url: '/v1/contract/negotiate', body: '{}' }, {
    connectorId: '',
    secret: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_NOT_CONFIGURED');
});
