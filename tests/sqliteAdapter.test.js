'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const { SqliteClientDataAdapter } = require('../src/adapters/SqliteClientDataAdapter');

test('sqlite adapter reads branch operational data and branch catalog', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE branches (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
      address_text TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      phone TEXT, is_active INTEGER DEFAULT 1, is_open_override INTEGER DEFAULT 1
    );
    CREATE TABLE branch_delivery_settings (
      id TEXT PRIMARY KEY, branch_id TEXT UNIQUE NOT NULL, is_delivery_active INTEGER DEFAULT 1,
      is_pickup_active INTEGER DEFAULT 1, max_radius_km REAL DEFAULT 10,
      free_delivery_km REAL DEFAULT 2, price_per_km REAL DEFAULT 3000,
      min_order_amount REAL DEFAULT 15000, promo_delivery_discount REAL DEFAULT 0,
      promo_min_order REAL DEFAULT 0
    );
    CREATE TABLE branch_categories (id TEXT PRIMARY KEY, branch_id TEXT, brand_id TEXT, name TEXT NOT NULL, image_url TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE products (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, category_id TEXT, name TEXT NOT NULL,
      slug TEXT, description TEXT, image_url TEXT, image TEXT
    );
    CREATE TABLE branch_products (
      branch_id TEXT NOT NULL, product_id TEXT NOT NULL, branch_category_id TEXT,
      name_override TEXT, description_override TEXT, image_override TEXT,
      price REAL, stock INTEGER, is_available INTEGER, low_stock_threshold INTEGER,
      created_at TEXT
    );
  `);

  db.run(`INSERT INTO branches VALUES ('b1','brand1','Bangjo Pusat','pusat','Jl. Test',-5,105,'0800',1,1)`);
  db.run(`INSERT INTO branch_delivery_settings VALUES ('s1','b1',1,1,10,2,3000,15000,0,0)`);
  db.run(`INSERT INTO branch_categories VALUES ('bc1','b1','brand1','Makanan',NULL,0)`);
  db.run(`INSERT INTO products VALUES ('p1','brand1','c1','Nasi Goreng','nasi-goreng','Master desc','master.jpg',NULL)`);
  db.run(`INSERT INTO branch_products VALUES ('b1','p1','bc1','Nasi Goreng Bangjo',NULL,'branch.jpg',25000,8,1,5,'2026-09-10T00:00:00Z')`);

  const adapter = new SqliteClientDataAdapter(db);
  const branch = await adapter.getBranchOperationalData({ branch_id: 'b1' });
  assert.equal(branch.branch.id, 'b1');
  assert.equal(branch.branch.delivery.price_per_km, 3000);

  const catalog = await adapter.getCatalogData({ branch_id: 'b1' });
  assert.equal(catalog.items.length, 1);
  assert.equal(catalog.items[0].name, 'Nasi Goreng Bangjo');
  assert.equal(catalog.items[0].category_name, 'Makanan');
  assert.equal(catalog.items[0].price, 25000);

  assert.ok(Array.isArray(catalog.categories), 'categories must be an array');
  assert.equal(catalog.categories.length, 1);
  assert.equal(catalog.categories[0].id, 'bc1');
  assert.equal(catalog.categories[0].name, 'Makanan');
  assert.equal(catalog.categories[0].sort_order, 0);

  const inventory = await adapter.getInventoryAvailability({ branch_id: 'b1' });
  assert.deepEqual(inventory.items[0].stock, 8);
});

test('sqlite adapter catalog.get returns categories with metadata for branch', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE branches (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
      address_text TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      phone TEXT, is_active INTEGER DEFAULT 1, is_open_override INTEGER DEFAULT 1
    );
    CREATE TABLE branch_categories (
      id TEXT PRIMARY KEY, branch_id TEXT NOT NULL, brand_id TEXT NOT NULL,
      name TEXT NOT NULL, slug TEXT, image_url TEXT, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, category_id TEXT, name TEXT NOT NULL,
      slug TEXT, description TEXT, image_url TEXT, image TEXT
    );
    CREATE TABLE branch_products (
      branch_id TEXT NOT NULL, product_id TEXT NOT NULL, branch_category_id TEXT,
      name_override TEXT, description_override TEXT, image_override TEXT,
      price REAL, stock INTEGER, is_available INTEGER, low_stock_threshold INTEGER,
      created_at TEXT
    );
  `);

  db.run(`INSERT INTO branches VALUES ('b1','brand1','Bangjo Pusat','pusat','Jl. Test',-5,105,'0800',1,1)`);
  db.run(`INSERT INTO branch_categories VALUES ('bc_fav','b1','brand1','Menu Favorit','menu-favorit','fav.jpg',1)`);
  db.run(`INSERT INTO branch_categories VALUES ('bc_minum','b1','brand1','Minuman Segar','minuman-segar',NULL,2)`);
  db.run(`INSERT INTO products VALUES ('p1','brand1','c1','Nasi Goreng','nasi-goreng','Desc','img1.jpg',NULL)`);
  db.run(`INSERT INTO products VALUES ('p2','brand1','c2','Es Teh','es-teh','Desc','img2.jpg',NULL)`);
  db.run(`INSERT INTO branch_products VALUES ('b1','p1','bc_fav','Nasi Goreng',NULL,NULL,25000,10,1,5,'2026-09-10T00:00:00Z')`);
  db.run(`INSERT INTO branch_products VALUES ('b1','p2','bc_minum','Es Teh',NULL,NULL,8000,20,1,5,'2026-09-10T00:00:00Z')`);

  const adapter = new SqliteClientDataAdapter(db);
  const catalog = await adapter.getCatalogData({ branch_id: 'b1' });

  assert.equal(catalog.categories.length, 2);
  assert.equal(catalog.items.length, 2);

  const sorted = catalog.categories.sort((a, b) => a.sort_order - b.sort_order);
  assert.equal(sorted[0].id, 'bc_fav');
  assert.equal(sorted[0].name, 'Menu Favorit');
  assert.equal(sorted[0].image_url, 'fav.jpg');
  assert.equal(sorted[0].sort_order, 1);

  assert.equal(sorted[1].id, 'bc_minum');
  assert.equal(sorted[1].name, 'Minuman Segar');
  assert.equal(sorted[1].image_url, null);
  assert.equal(sorted[1].sort_order, 2);

  const favProducts = catalog.items.filter(i => i.category_id === 'bc_fav');
  assert.equal(favProducts.length, 1);
  assert.equal(favProducts[0].product_id, 'p1');
});

test('sqlite adapter catalog.get returns empty categories for branch with no categories', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE branches (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
      address_text TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      phone TEXT, is_active INTEGER DEFAULT 1, is_open_override INTEGER DEFAULT 1
    );
    CREATE TABLE branch_categories (
      id TEXT PRIMARY KEY, branch_id TEXT NOT NULL, brand_id TEXT NOT NULL,
      name TEXT NOT NULL, slug TEXT, image_url TEXT, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, category_id TEXT, name TEXT NOT NULL,
      slug TEXT, description TEXT, image_url TEXT, image TEXT
    );
    CREATE TABLE branch_products (
      branch_id TEXT NOT NULL, product_id TEXT NOT NULL, branch_category_id TEXT,
      name_override TEXT, description_override TEXT, image_override TEXT,
      price REAL, stock INTEGER, is_available INTEGER, low_stock_threshold INTEGER,
      created_at TEXT
    );
  `);

  db.run(`INSERT INTO branches VALUES ('b1','brand1','Bangjo Pusat','pusat','Jl. Test',-5,105,'0800',1,1)`);

  const adapter = new SqliteClientDataAdapter(db);
  const catalog = await adapter.getCatalogData({ branch_id: 'b1' });

  assert.equal(catalog.categories.length, 0);
  assert.equal(catalog.items.length, 0);
});

test('sqlite adapter persists an order atomically with items and delivery', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, order_number TEXT UNIQUE NOT NULL, client_transaction_id TEXT,
      brand_id TEXT NOT NULL, branch_id TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL, order_type TEXT NOT NULL,
      fulfillment_schedule_type TEXT DEFAULT 'asap', scheduled_slot_start TEXT,
      scheduled_slot_end TEXT, status TEXT NOT NULL, subtotal REAL NOT NULL,
      delivery_fee REAL DEFAULT 0, discount_amount REAL DEFAULT 0, grand_total REAL NOT NULL,
      total_amount REAL, payment_method TEXT DEFAULT 'cash', payment_status TEXT DEFAULT 'pending',
      order_note TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL,
      product_name TEXT NOT NULL, unit_price REAL NOT NULL, quantity INTEGER NOT NULL,
      item_subtotal REAL, note TEXT
    );
    CREATE TABLE order_deliveries (
      id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, destination_address TEXT,
      destination_latitude REAL, destination_longitude REAL,
      actual_road_distance_meters REAL, actual_duration_seconds REAL,
      chargeable_distance_km REAL, free_km_applied REAL, rate_per_km_applied REAL,
      delivery_fee_calculated REAL, status TEXT NOT NULL, created_at TEXT, updated_at TEXT
    );
  `);

  let persisted = 0;
  const adapter = new SqliteClientDataAdapter(db, { persist: async () => { persisted += 1; } });
  const result = await adapter.persistOrder({
    mutation_id: 'm1',
    order: {
      id: 'o1',
      order_number: 'ORD-1',
      brand_id: 'brand1',
      branch_id: 'b1',
      customer_name: 'Test',
      customer_phone: '0800',
      order_type: 'delivery',
      subtotal: 25000,
      delivery_fee: 3000,
      grand_total: 28000,
      items: [{ id: 'oi1', product_id: 'p1', product_name: 'Nasi Goreng', unit_price: 25000, quantity: 1, item_subtotal: 25000 }],
      delivery: { destination_address: 'Jl. Tujuan', delivery_fee: 3000 },
    },
  });

  assert.deepEqual(result, { order_id: 'o1', persisted: true, conflict: false });
  assert.equal(persisted, 1);
  assert.equal(db.exec('SELECT COUNT(*) AS c FROM orders')[0].values[0][0], 1);
  assert.equal(db.exec('SELECT COUNT(*) AS c FROM order_items')[0].values[0][0], 1);
  assert.equal(db.exec('SELECT COUNT(*) AS c FROM order_deliveries')[0].values[0][0], 1);
});
