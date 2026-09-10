'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ReplayGuard = require('../src/auth/replayGuard');

test('replay guard accepts once and rejects repeated request id', () => {
  const guard = new ReplayGuard({ ttlMs: 1000 });
  assert.equal(guard.consume('connector:req-1', 1000), true);
  assert.equal(guard.consume('connector:req-1', 1001), false);
  assert.equal(guard.consume('connector:req-1', 2001), true);
});
