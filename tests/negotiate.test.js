'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { negotiateContract } = require('../src/contract/negotiate');

process.env.XENTRA_CONTRACT_VERSION = process.env.XENTRA_CONTRACT_VERSION || 'v1';

test('contract negotiation selects supported v1', () => {
  assert.deepEqual(negotiateContract(['v1']), {
    contract_version: 'v1',
    compatible: true,
  });
});

test('contract negotiation rejects incompatible versions', () => {
  assert.throws(() => negotiateContract(['v2']), (error) => {
    assert.equal(error.code, 'CONTRACT_INCOMPATIBLE');
    assert.equal(error.retryable, false);
    return true;
  });
});
