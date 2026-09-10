'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

let createRuntimePersistenceService;
try {
  ({ createRuntimePersistenceService } = require('../src/persistence/createRuntimePersistenceService'));
} catch (_) {}

test('runtime persistence service uses the typed adapter against a native SQLite file', { skip: !createRuntimePersistenceService }, async () => {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (_) {
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xentra-connector-'));
  const dbPath = path.join(dir, 'client.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE branches (id TEXT PRIMARY KEY, brand_id TEXT, name TEXT, slug TEXT, address_text TEXT, latitude REAL, longitude REAL, phone TEXT, is_active INTEGER, is_open_override INTEGER);
    CREATE TABLE branch_delivery_settings (branch_id TEXT, is_delivery_active INTEGER, is_pickup_active INTEGER, max_radius_km REAL, free_delivery_km REAL, price_per_km REAL, min_order_amount REAL, promo_delivery_discount REAL, promo_min_order REAL);
    CREATE TABLE branch_categories (id TEXT PRIMARY KEY, brand_id TEXT, branch_id TEXT, name TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, brand_id TEXT, name TEXT, slug TEXT, description TEXT, image_url TEXT, image TEXT, category_id TEXT);
    CREATE TABLE categories (id TEXT PRIMARY KEY, brand_id TEXT, name TEXT);
    CREATE TABLE branch_products (branch_id TEXT, product_id TEXT, branch_category_id TEXT, name_override TEXT, description_override TEXT, image_override TEXT, price REAL, stock INTEGER, is_available INTEGER, low_stock_threshold INTEGER, created_at TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, order_number TEXT UNIQUE, client_transaction_id TEXT, brand_id TEXT, branch_id TEXT, customer_name TEXT, customer_phone TEXT, order_type TEXT, fulfillment_schedule_type TEXT, scheduled_slot_start TEXT, scheduled_slot_end TEXT, status TEXT, subtotal REAL, delivery_fee REAL, discount_amount REAL, grand_total REAL, total_amount REAL, payment_method TEXT, payment_status TEXT, order_note TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, product_name TEXT, unit_price REAL, quantity INTEGER, item_subtotal REAL, note TEXT);
    CREATE TABLE order_deliveries (id TEXT PRIMARY KEY, order_id TEXT, destination_address TEXT, destination_latitude REAL, destination_longitude REAL, actual_road_distance_meters REAL, actual_duration_seconds REAL, chargeable_distance_km REAL, free_km_applied REAL, rate_per_km_applied REAL, delivery_fee_calculated REAL, status TEXT, created_at TEXT, updated_at TEXT);
  `);
  db.prepare('INSERT INTO branches VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('b1', 'brand1', 'Bangjo', 'bangjo', 'Lampung', -5.4, 105.3, '0800', 1, 1);
  db.prepare('INSERT INTO branch_delivery_settings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('b1', 1, 1, 10, 2, 2500, 0, 0, 0);
  db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('p1', 'brand1', 'Nasi', 'nasi', 'desc', null, null, null);
  db.prepare('INSERT INTO branch_products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('b1', 'p1', null, null, null, null, 15000, 10, 1, 5, new Date().toISOString());
  db.close();

  const service = await createRuntimePersistenceService({ dbPath });
  const operational = await service.execute('branch.operational.read', { branch_id: 'b1' });
  const catalog = await service.execute('catalog.read', { branch_id: 'b1' });
  const inventory = await service.execute('inventory.availability.read', { branch_id: 'b1' });

  assert.equal(operational.branch.id, 'b1');
  assert.equal(operational.branch.delivery.is_delivery_active, 1);
  assert.equal(catalog.items[0].name, 'Nasi');
  assert.equal(inventory.items[0].stock, 10);

  fs.rmSync(dir, { recursive: true, force: true });
});
