'use strict';

const fs = require('fs');
const path = require('path');
const ClientDataAdapter = require('./ClientDataAdapter');
const { CODES, ConnectorError } = require('../contract/errors');

const TABLES = Object.freeze({
  branches: 'branches',
  branchDeliverySettings: 'branch_delivery_settings',
  branchCategories: 'branch_categories',
  branchProducts: 'branch_products',
  products: 'products',
  categories: 'categories',
  orders: 'orders',
  orderItems: 'order_items',
  orderDeliveries: 'order_deliveries',
});

function assertId(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new ConnectorError(CODES.VALIDATION_REJECTED, `Invalid ${field}`, { retryable: false });
  }
}

function assertOrderShape(order) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) {
    throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Invalid order payload', { retryable: false });
  }
  for (const field of ['id', 'order_number', 'brand_id', 'branch_id', 'customer_name', 'customer_phone']) {
    if (typeof order[field] !== 'string' || order[field].length === 0) {
      throw new ConnectorError(CODES.VALIDATION_REJECTED, `Missing or invalid order field: ${field}`, { retryable: false });
    }
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Order must contain at least one item', { retryable: false });
  }
}

class SqliteClientDataAdapter extends ClientDataAdapter {
  constructor(db, options = {}) {
    super();
    if (!db || typeof db.exec !== 'function' || typeof db.run !== 'function') {
      throw new TypeError('A sql.js-compatible database instance is required');
    }
    this.db = db;
    this.tables = { ...TABLES, ...(options.tables || {}) };
    this.persist = typeof options.persist === 'function' ? options.persist : async () => {};
  }

  close() {
    if (typeof this.db.close === 'function') this.db.close();
  }

  #queryMany(sql, params = []) {
    try {
      const result = this.db.exec(sql, params);
      if (!result || result.length === 0) return [];
      const [first] = result;
      return first.values.map((values) => Object.fromEntries(first.columns.map((column, i) => [column, values[i]])));
    } catch (error) {
      throw new ConnectorError(CODES.PERMANENT_INTEGRATION_FAILURE, 'Client database query failed', { cause: error, retryable: false });
    }
  }

  #queryOne(sql, params = []) {
    return this.#queryMany(sql, params)[0] || null;
  }

  #run(sql, params = []) {
    try {
      this.db.run(sql, params);
    } catch (error) {
      throw new ConnectorError(CODES.PERMANENT_INTEGRATION_FAILURE, 'Client database mutation failed', { cause: error, retryable: false });
    }
  }

  #transaction(callback) {
    this.#run('BEGIN IMMEDIATE;');
    try {
      const result = callback();
      this.#run('COMMIT;');
      return result;
    } catch (error) {
      try { this.#run('ROLLBACK;'); } catch (_) {}
      throw error;
    }
  }

  async getBranchOperationalData(input) {
    assertId(input.branch_id, 'branch_id');

    const branch = this.#queryOne(`
      SELECT id, brand_id, name, slug, address_text, latitude, longitude,
             phone, is_active, is_open_override
      FROM ${this.tables.branches}
      WHERE id = ?
      LIMIT 1
    `, [input.branch_id]);

    if (!branch) {
      throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Branch not found', { retryable: false });
    }

    const settings = this.#queryOne(`
      SELECT is_delivery_active, is_pickup_active, max_radius_km,
             free_delivery_km, price_per_km, min_order_amount,
             promo_delivery_discount, promo_min_order
      FROM ${this.tables.branchDeliverySettings}
      WHERE branch_id = ?
      LIMIT 1
    `, [input.branch_id]);

    return { branch: { ...branch, delivery: settings || null } };
  }

  async getCatalogData(input) {
    assertId(input.branch_id, 'branch_id');

    const items = this.#queryMany(`
      SELECT
        bp.product_id,
        bp.branch_id,
        bp.branch_category_id AS category_id,
        COALESCE(bp.name_override, p.name) AS name,
        p.slug,
        COALESCE(bp.description_override, p.description) AS description,
        COALESCE(bp.image_override, p.image_url, p.image) AS image_url,
        bp.price,
        bp.is_available,
        bp.stock,
        bp.low_stock_threshold,
        bc.name AS category_name
      FROM ${this.tables.branchProducts} bp
      JOIN ${this.tables.products} p ON p.id = bp.product_id
      LEFT JOIN ${this.tables.branchCategories} bc ON bc.id = bp.branch_category_id
      WHERE bp.branch_id = ?
      ORDER BY bp.created_at ASC, bp.product_id ASC
    `, [input.branch_id]);

    const categories = this.#queryMany(`
      SELECT id, name, image_url, sort_order
      FROM ${this.tables.branchCategories}
      WHERE branch_id = ?
      ORDER BY sort_order ASC, name ASC
    `, [input.branch_id]);

    return { branch_id: input.branch_id, categories, items };
  }

  async getInventoryAvailability(input) {
    assertId(input.branch_id, 'branch_id');

    const items = this.#queryMany(`
      SELECT product_id, branch_id, stock, is_available, low_stock_threshold
      FROM ${this.tables.branchProducts}
      WHERE branch_id = ?
      ORDER BY product_id ASC
    `, [input.branch_id]);

    return { branch_id: input.branch_id, items };
  }

  async persistOrder(input) {
    assertId(input.mutation_id, 'mutation_id');
    assertOrderShape(input.order);

    const order = input.order;
    const existing = this.#queryOne(`
      SELECT id, order_number, branch_id
      FROM ${this.tables.orders}
      WHERE id = ? OR order_number = ?
      LIMIT 1
    `, [order.id, order.order_number]);

    if (existing) {
      return { order_id: existing.id, persisted: false, conflict: true };
    }

    this.#transaction(() => {
      this.#run(`
        INSERT INTO ${this.tables.orders} (
          id, order_number, client_transaction_id, brand_id, branch_id,
          customer_name, customer_phone, order_type, fulfillment_schedule_type,
          scheduled_slot_start, scheduled_slot_end, status, subtotal,
          delivery_fee, discount_amount, grand_total, total_amount,
          payment_method, payment_status, order_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        order.id,
        order.order_number,
        order.client_transaction_id || null,
        order.brand_id,
        order.branch_id,
        order.customer_name,
        order.customer_phone,
        order.order_type || 'delivery',
        order.fulfillment_schedule_type || 'asap',
        order.scheduled_slot_start || null,
        order.scheduled_slot_end || null,
        order.status || 'pending',
        Number(order.subtotal || 0),
        Number(order.delivery_fee || 0),
        Number(order.discount_amount || 0),
        Number(order.grand_total || 0),
        order.total_amount == null ? null : Number(order.total_amount),
        order.payment_method || 'cash',
        order.payment_status || 'pending',
        order.order_note || null,
        order.created_at || new Date().toISOString(),
        order.updated_at || new Date().toISOString(),
      ]);

      for (const item of order.items) {
        if (!item || typeof item !== 'object') {
          throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Invalid order item', { retryable: false });
        }
        for (const field of ['id', 'product_id', 'product_name']) {
          if (typeof item[field] !== 'string' || item[field].length === 0) {
            throw new ConnectorError(CODES.VALIDATION_REJECTED, `Invalid order item field: ${field}`, { retryable: false });
          }
        }
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unit_price);
        if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Invalid order item quantity/price', { retryable: false });
        }

        this.#run(`
          INSERT INTO ${this.tables.orderItems} (
            id, order_id, product_id, product_name, unit_price, quantity, item_subtotal, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id,
          order.id,
          item.product_id,
          item.product_name,
          unitPrice,
          quantity,
          Number(item.item_subtotal == null ? unitPrice * quantity : item.item_subtotal),
          item.note || null,
        ]);
      }

      if (order.delivery) {
        this.#run(`
          INSERT INTO ${this.tables.orderDeliveries} (
            id, order_id, destination_address, destination_latitude,
            destination_longitude, actual_road_distance_meters,
            actual_duration_seconds, chargeable_distance_km, free_km_applied,
            rate_per_km_applied, delivery_fee_calculated, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          order.delivery.id || `del_${order.id}`,
          order.id,
          order.delivery.destination_address || null,
          order.delivery.destination_latitude == null ? null : Number(order.delivery.destination_latitude),
          order.delivery.destination_longitude == null ? null : Number(order.delivery.destination_longitude),
          order.delivery.actual_road_distance_meters == null ? null : Number(order.delivery.actual_road_distance_meters),
          order.delivery.actual_duration_seconds == null ? null : Number(order.delivery.actual_duration_seconds),
          order.delivery.chargeable_distance_km == null ? null : Number(order.delivery.chargeable_distance_km),
          order.delivery.free_km_applied == null ? null : Number(order.delivery.free_km_applied),
          order.delivery.rate_per_km_applied == null ? null : Number(order.delivery.rate_per_km_applied),
          order.delivery.delivery_fee_calculated == null ? Number(order.delivery.delivery_fee || 0) : Number(order.delivery.delivery_fee_calculated),
          order.delivery.status || 'unassigned',
          order.created_at || new Date().toISOString(),
          order.updated_at || new Date().toISOString(),
        ]);
      }
    });

    await this.persist();
    return { order_id: order.id, persisted: true, conflict: false };
  }

  async syncCatalog(input) {
    assertId(input.branch_id, 'branch_id');
    if (!Array.isArray(input.categories)) {
      throw new ConnectorError(CODES.VALIDATION_REJECTED, 'categories must be an array', { retryable: false });
    }
    if (!Array.isArray(input.products)) {
      throw new ConnectorError(CODES.VALIDATION_REJECTED, 'products must be an array', { retryable: false });
    }

    for (const cat of input.categories) {
      if (!cat || typeof cat.id !== 'string' || cat.id.length === 0) {
        throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Invalid category: missing id', { retryable: false });
      }
      if (typeof cat.name !== 'string' || cat.name.length === 0) {
        throw new ConnectorError(CODES.VALIDATION_REJECTED, `Invalid category ${cat.id}: missing name`, { retryable: false });
      }
    }

    for (const prod of input.products) {
      if (!prod || typeof prod.id !== 'string' || prod.id.length === 0) {
        throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Invalid product: missing id', { retryable: false });
      }
      if (typeof prod.name !== 'string' || prod.name.length === 0) {
        throw new ConnectorError(CODES.VALIDATION_REJECTED, `Invalid product ${prod.id}: missing name`, { retryable: false });
      }
      if (typeof prod.price !== 'number' || prod.price < 0) {
        throw new ConnectorError(CODES.VALIDATION_REJECTED, `Invalid product ${prod.id}: price must be non-negative number`, { retryable: false });
      }
    }

    let categoriesUpserted = 0;
    let productsUpserted = 0;
    let branchProductsUpserted = 0;

    this.#transaction(() => {
      this.#run(`DELETE FROM ${this.tables.branchProducts} WHERE branch_id = ?`, [input.branch_id]);
      this.#run(`DELETE FROM ${this.tables.branchCategories} WHERE branch_id = ?`, [input.branch_id]);

      for (const cat of input.categories) {
        this.#run(`
          INSERT INTO ${this.tables.branchCategories} (id, brand_id, branch_id, name, image_url, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            image_url = excluded.image_url,
            sort_order = excluded.sort_order
        `, [
          cat.id,
          input.brand_id || null,
          input.branch_id,
          cat.name,
          cat.image_url || null,
          Number(cat.sort_order || 0),
        ]);
        categoriesUpserted++;
      }

      for (const prod of input.products) {
        this.#run(`
          INSERT INTO ${this.tables.products} (id, brand_id, name, slug, description, image_url, category_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            slug = excluded.slug,
            description = excluded.description,
            image_url = excluded.image_url,
            category_id = excluded.category_id
        `, [
          prod.id,
          input.brand_id || null,
          prod.name,
          prod.slug || '',
          prod.description || '',
          prod.image_url || null,
          prod.category_id || null,
        ]);
        productsUpserted++;
      }

      for (const bp of input.products) {
        this.#run(`
          INSERT INTO ${this.tables.branchProducts} (
            branch_id, product_id, branch_category_id, name_override,
            description_override, image_override, price, stock,
            is_available, low_stock_threshold, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          input.branch_id,
          bp.id,
          bp.branch_category_id || null,
          bp.name_override || null,
          bp.description_override || null,
          bp.image_override || null,
          Number(bp.price),
          Number(bp.stock != null ? bp.stock : 100),
          bp.is_available != null ? (bp.is_available ? 1 : 0) : 1,
          Number(bp.low_stock_threshold != null ? bp.low_stock_threshold : 5),
          bp.created_at || new Date().toISOString(),
        ]);
        branchProductsUpserted++;
      }
    });

    await this.persist();

    return {
      branch_id: input.branch_id,
      categories_upserted: categoriesUpserted,
      products_upserted: productsUpserted,
      branch_products_upserted: branchProductsUpserted,
    };
  }
}

async function createSqliteFileAdapter({ dbPath, initSqlJs }) {
  if (typeof initSqlJs !== 'function') throw new TypeError('initSqlJs is required');
  if (typeof dbPath !== 'string' || dbPath.length === 0) throw new TypeError('dbPath is required');

  const SQL = await initSqlJs();
  let db;
  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  const persist = async () => {
    if (dbPath === ':memory:') return;
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${dbPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, Buffer.from(db.export()));
    fs.renameSync(tmpPath, dbPath);
  };

  return new SqliteClientDataAdapter(db, { persist });
}

module.exports = { SqliteClientDataAdapter, createSqliteFileAdapter };
