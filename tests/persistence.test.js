'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const TypedPersistenceService = require('../src/persistence/TypedPersistenceService');
const { OPERATIONS, validateOperation } = require('../src/contract/operations');

function adapter() {
  const calls = [];
  return {
    calls,
    async getBranchOperationalData(input) { calls.push(['branch', input]); return { branch_id: input.branch_id, open: true }; },
    async getCatalogData(input) { calls.push(['catalog', input]); return { branch_id: input.branch_id, categories: [], items: [] }; },
    async getInventoryAvailability(input) { calls.push(['inventory', input]); return { branch_id: input.branch_id, items: [] }; },
    async persistOrder(input) { calls.push(['order', input]); return { order_id: input.order.id }; },
    async syncCatalog(input) { calls.push(['sync', input]); return { branch_id: input.branch_id, categories_upserted: input.categories.length, products_upserted: input.products.length, branch_products_upserted: input.products.length }; },
  };
}

test('typed operations reject unknown operation and missing fields', () => {
  assert.throws(() => validateOperation('sql.execute', {}), (error) => error.code === 'VALIDATION_REJECTED');
  assert.throws(() => validateOperation(OPERATIONS.GET_CATALOG_DATA, {}), (error) => error.code === 'VALIDATION_REJECTED');
});

test('typed persistence delegates only approved operations', async () => {
  const client = adapter();
  const service = new TypedPersistenceService(client);

  assert.deepEqual(await service.execute(OPERATIONS.GET_CATALOG_DATA, { branch_id: 'b1' }), { branch_id: 'b1', categories: [], items: [] });
  assert.equal(client.calls.length, 1);
});

test('order persistence is idempotent for the same mutation id', async () => {
  const client = adapter();
  const service = new TypedPersistenceService(client);
  const input = { mutation_id: 'm1', order: { id: 'o1' } };

  const first = await service.execute(OPERATIONS.PERSIST_ORDER, input);
  const second = await service.execute(OPERATIONS.PERSIST_ORDER, input);

  assert.deepEqual(first, { result: { order_id: 'o1' }, replay: false });
  assert.deepEqual(second, { result: { order_id: 'o1' }, replay: true });
  assert.equal(client.calls.length, 1);
});

test('catalog.sync delegates to adapter.syncCatalog and is idempotent', async () => {
  const client = adapter();
  const service = new TypedPersistenceService(client);
  const input = {
    mutation_id: 'sync_m1',
    branch_id: 'b1',
    brand_id: 'brand1',
    categories: [{ id: 'bc1', name: 'Makanan' }],
    products: [{ id: 'p1', name: 'Nasi', price: 25000 }],
  };

  const first = await service.execute(OPERATIONS.CATALOG_SYNC, input);
  const second = await service.execute(OPERATIONS.CATALOG_SYNC, input);

  assert.equal(first.replay, false);
  assert.equal(second.replay, true);
  assert.deepEqual(first.result, { branch_id: 'b1', categories_upserted: 1, products_upserted: 1, branch_products_upserted: 1 });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0][0], 'sync');
});

test('catalog.sync validates required fields', () => {
  assert.throws(() => validateOperation(OPERATIONS.CATALOG_SYNC, {}), (error) => error.code === 'VALIDATION_REJECTED');
  assert.throws(() => validateOperation(OPERATIONS.CATALOG_SYNC, { mutation_id: 'm1' }), (error) => error.code === 'VALIDATION_REJECTED');
  assert.throws(() => validateOperation(OPERATIONS.CATALOG_SYNC, { mutation_id: 'm1', branch_id: 'b1' }), (error) => error.code === 'VALIDATION_REJECTED');
  assert.throws(() => validateOperation(OPERATIONS.CATALOG_SYNC, { mutation_id: 'm1', branch_id: 'b1', categories: [] }), (error) => error.code === 'VALIDATION_REJECTED');
});
