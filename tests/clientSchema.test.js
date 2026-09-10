'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateClientSchema } = require('../src/schema/clientSchema');

test('client schema validator accepts the minimum connector schema', () => {
  const tables = {
    branches: ['id', 'brand_id', 'name', 'slug', 'address_text', 'latitude', 'longitude', 'phone', 'is_active', 'is_open_override'],
    branch_delivery_settings: ['branch_id', 'is_delivery_active', 'is_pickup_active', 'max_radius_km', 'free_delivery_km', 'price_per_km', 'min_order_amount', 'promo_delivery_discount', 'promo_min_order'],
    branch_categories: ['id', 'brand_id', 'branch_id', 'name'],
    products: ['id', 'brand_id', 'name', 'slug', 'description', 'image_url', 'image', 'category_id'],
    categories: ['id', 'brand_id', 'name'],
    branch_products: ['branch_id', 'product_id', 'branch_category_id', 'name_override', 'description_override', 'image_override', 'price', 'stock', 'is_available', 'low_stock_threshold', 'created_at'],
    orders: ['id', 'order_number', 'client_transaction_id', 'brand_id', 'branch_id', 'customer_name', 'customer_phone', 'order_type', 'fulfillment_schedule_type', 'scheduled_slot_start', 'scheduled_slot_end', 'status', 'subtotal', 'delivery_fee', 'discount_amount', 'grand_total', 'total_amount', 'payment_method', 'payment_status', 'order_note', 'created_at', 'updated_at'],
    order_items: ['id', 'order_id', 'product_id', 'product_name', 'unit_price', 'quantity', 'item_subtotal', 'note'],
    order_deliveries: ['id', 'order_id', 'destination_address', 'destination_latitude', 'destination_longitude', 'actual_road_distance_meters', 'actual_duration_seconds', 'chargeable_distance_km', 'free_km_applied', 'rate_per_km_applied', 'delivery_fee_calculated', 'status', 'created_at', 'updated_at'],
  };

  const db = {
    exec(sql) {
      const match = /^PRAGMA table_info\\(([^)]+)\\);$/.exec(sql);
      const columns = tables[match && match[1]] || [];
      return columns.length
        ? [{ values: columns.map((name, index) => [index, name]), columns: ['cid', 'name'] }]
        : [];
    },
  };

  assert.equal(validateClientSchema(db).compatible, true);
});

test('client schema validator fails closed when a required column is missing', () => {
  const db = {
    exec(sql) {
      const table = sql.match(/^PRAGMA table_info\\(([^)]+)\\);$/)[1];
      if (table === 'branches') return [{ values: [[0, 'id']], columns: ['cid', 'name'] }];
      return [];
    },
  };

  assert.throws(() => validateClientSchema(db), (error) => {
    assert.equal(error.code, 'PERMANENT_INTEGRATION_FAILURE');
    assert.match(error.message, /schema is incompatible/i);
    return true;
  });
});
