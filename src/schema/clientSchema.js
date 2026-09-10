'use strict';

const { CODES, ConnectorError } = require('../contract/errors');

/**
 * Minimum schema required by the current typed connector operations.
 * This is a compatibility gate, not a copy of the Xentra Core schema.
 */
const REQUIRED_SCHEMA = Object.freeze({
  branches: ['id', 'brand_id', 'name', 'slug', 'address_text', 'latitude', 'longitude', 'phone', 'is_active', 'is_open_override'],
  branch_delivery_settings: ['branch_id', 'is_delivery_active', 'is_pickup_active', 'max_radius_km', 'free_delivery_km', 'price_per_km', 'min_order_amount', 'promo_delivery_discount', 'promo_min_order'],
  branch_categories: ['id', 'brand_id', 'branch_id', 'name'],
  products: ['id', 'brand_id', 'name', 'slug', 'description', 'image_url', 'image', 'category_id'],
  categories: ['id', 'brand_id', 'name'],
  branch_products: ['branch_id', 'product_id', 'branch_category_id', 'name_override', 'description_override', 'image_override', 'price', 'stock', 'is_available', 'low_stock_threshold', 'created_at'],
  orders: ['id', 'order_number', 'client_transaction_id', 'brand_id', 'branch_id', 'customer_name', 'customer_phone', 'order_type', 'fulfillment_schedule_type', 'scheduled_slot_start', 'scheduled_slot_end', 'status', 'subtotal', 'delivery_fee', 'discount_amount', 'grand_total', 'total_amount', 'payment_method', 'payment_status', 'order_note', 'created_at', 'updated_at'],
  order_items: ['id', 'order_id', 'product_id', 'product_name', 'unit_price', 'quantity', 'item_subtotal', 'note'],
  order_deliveries: ['id', 'order_id', 'destination_address', 'destination_latitude', 'destination_longitude', 'actual_road_distance_meters', 'actual_duration_seconds', 'chargeable_distance_km', 'free_km_applied', 'rate_per_km_applied', 'delivery_fee_calculated', 'status', 'created_at', 'updated_at'],
});

function readTableColumns(db, tableName) {
  try {
    const result = db.exec(`PRAGMA table_info(${tableName});`);
    if (!result || result.length === 0) return [];
    return result[0].values.map((row) => String(row[1]));
  } catch (error) {
    throw new ConnectorError(CODES.PERMANENT_INTEGRATION_FAILURE, 'Client database schema inspection failed', {
      retryable: false,
      cause: error,
    });
  }
}

function validateClientSchema(db, requiredSchema = REQUIRED_SCHEMA) {
  if (!db || typeof db.exec !== 'function') {
    throw new TypeError('A sql.js-compatible database instance is required');
  }

  const missing = [];
  for (const [table, columns] of Object.entries(requiredSchema)) {
    const actual = new Set(readTableColumns(db, table));
    if (actual.size === 0) {
      missing.push({ table, columns: [...columns] });
      continue;
    }
    const missingColumns = columns.filter((column) => !actual.has(column));
    if (missingColumns.length > 0) missing.push({ table, columns: missingColumns });
  }

  if (missing.length > 0) {
    throw new ConnectorError(CODES.PERMANENT_INTEGRATION_FAILURE, 'Client database schema is incompatible', {
      retryable: false,
      cause: missing,
    });
  }

  return Object.freeze({ compatible: true, tables: Object.keys(requiredSchema) });
}

module.exports = { REQUIRED_SCHEMA, readTableColumns, validateClientSchema };