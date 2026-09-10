'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRuntimePersistenceService } = require('../../src/persistence/createRuntimePersistenceService');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (_) {
  DatabaseSync = null;
}

function createFixtureSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE branches (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
      address_text TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1, is_open_override INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE branch_delivery_settings (
      branch_id TEXT PRIMARY KEY, is_delivery_active INTEGER NOT NULL DEFAULT 1,
      is_pickup_active INTEGER NOT NULL DEFAULT 1, max_radius_km REAL NOT NULL DEFAULT 10,
      free_delivery_km REAL NOT NULL DEFAULT 0, price_per_km REAL NOT NULL DEFAULT 2500,
      min_order_amount REAL NOT NULL DEFAULT 0, promo_delivery_discount REAL,
      promo_min_order REAL
    );
    CREATE TABLE branch_categories (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, branch_id TEXT NOT NULL, name TEXT NOT NULL
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
      description TEXT, image_url TEXT, image TEXT, category_id TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, name TEXT NOT NULL
    );
    CREATE TABLE branch_products (
      branch_id TEXT NOT NULL, product_id TEXT NOT NULL, branch_category_id TEXT,
      name_override TEXT, description_override TEXT, image_override TEXT, price REAL,
      stock INTEGER NOT NULL DEFAULT 0, is_available INTEGER NOT NULL DEFAULT 1,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5, created_at TEXT NOT NULL
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, order_number TEXT UNIQUE NOT NULL, client_transaction_id TEXT,
      brand_id TEXT NOT NULL, branch_id TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL, order_type TEXT NOT NULL, fulfillment_schedule_type TEXT,
      scheduled_slot_start TEXT, scheduled_slot_end TEXT, status TEXT, subtotal REAL,
      delivery_fee REAL, discount_amount REAL, grand_total REAL, total_amount REAL,
      payment_method TEXT, payment_status TEXT, order_note TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL,
      product_name TEXT NOT NULL, unit_price REAL NOT NULL, quantity INTEGER NOT NULL,
      item_subtotal REAL NOT NULL, note TEXT
    );
    CREATE TABLE order_deliveries (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, destination_address TEXT,
      destination_latitude REAL, destination_longitude REAL, actual_road_distance_meters REAL,
      actual_duration_seconds INTEGER, chargeable_distance_km REAL, free_km_applied REAL,
      rate_per_km_applied REAL, delivery_fee_calculated REAL, status TEXT,
      created_at TEXT, updated_at TEXT
    );

    INSERT INTO branches VALUES ('br_1', 'brand_1', 'Branch 1', 'branch-1', 'Jl. Test 1', -5.4, 105.2, '0812', 1, 1);
    INSERT INTO branch_delivery_settings VALUES ('br_1', 1, 1, 10, 2, 2500, 0, 0, 0);
    INSERT INTO branch_categories VALUES ('bc_1', 'brand_1', 'br_1', 'Makanan');
    INSERT INTO products VALUES ('p_1', 'brand_1', 'Nasi Goreng', 'nasi-goreng', 'Deskripsi', '/master.png', null, null);
    INSERT INTO categories VALUES ('c_1', 'brand_1', 'Master');
    INSERT INTO branch_products VALUES ('br_1', 'p_1', 'bc_1', null, null, null, 25000, 10, 1, 5, '2026-09-10T00:00:00.000Z');
  `);
}

test('runtime persistence service uses the native SQLite adapter and typed operations', { skip: !DatabaseSync }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xentra-connector-'));
  const dbPath = path.join(dir, 'client.db');

  try {
    const seedDb = new DatabaseSync(dbPath);
    createFixtureSchema(seedDb);
    seedDb.close();

    const service = await createRuntimePersistenceService({ dbPath });
    const branch = await service.execute('branch.get_operational_data', { branch_id: 'br_1' });
    assert.equal(branch.branch.id, 'br_1');
    assert.equal(branch.branch.delivery.is_delivery_active, 1);

    const catalog = await service.execute('catalog.get', { branch_id: 'br_1' });
    assert.equal(catalog.items.length, 1);
    assert.equal(catalog.items[0].name, 'Nasi Goreng');
    assert.ok(Array.isArray(catalog.categories), 'categories must be an array');
    assert.equal(catalog.categories.length, 1);
    assert.equal(catalog.categories[0].id, 'bc_1');
    assert.equal(catalog.categories[0].name, 'Makanan');

    const inventory = await service.execute('inventory.get_availability', { branch_id: 'br_1' });
    assert.equal(inventory.items[0].stock, 10);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
