'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let openNativeSqlite;
let hasNativeSqlite = true;
try {
  ({ openNativeSqlite } = require('../src/adapters/NativeSqliteDatabase'));
  require('node:sqlite');
} catch (_) {
  hasNativeSqlite = false;
}

test('native sqlite wrapper exposes schema metadata and parameterized queries', { skip: !hasNativeSqlite }, () => {
  const db = openNativeSqlite(':memory:');
  db.run('CREATE TABLE branches (id TEXT PRIMARY KEY, name TEXT);');
  db.run('INSERT INTO branches (id, name) VALUES (?, ?);', ['b1', 'Bangjo']);

  const schema = db.exec('PRAGMA table_info(branches);');
  assert.ok(schema[0].values.some((row) => row[1] === 'id'));

  const rows = db.exec('SELECT id, name FROM branches WHERE id = ?;', ['b1']);
  assert.deepEqual(rows[0].values, [['b1', 'Bangjo']]);
  db.close();
});
