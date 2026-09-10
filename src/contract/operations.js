'use strict';

const { CODES, ConnectorError } = require('./errors');

const OPERATIONS = Object.freeze({
  GET_BRANCH_OPERATIONAL_DATA: 'branch.get_operational_data',
  GET_CATALOG_DATA: 'catalog.get',
  GET_INVENTORY_AVAILABILITY: 'inventory.get_availability',
  PERSIST_ORDER: 'order.persist',
  CATALOG_SYNC: 'catalog.sync',
});

const REQUIRED_FIELDS = Object.freeze({
  [OPERATIONS.GET_BRANCH_OPERATIONAL_DATA]: ['branch_id'],
  [OPERATIONS.GET_CATALOG_DATA]: ['branch_id'],
  [OPERATIONS.GET_INVENTORY_AVAILABILITY]: ['branch_id'],
  [OPERATIONS.PERSIST_ORDER]: ['mutation_id', 'order'],
  [OPERATIONS.CATALOG_SYNC]: ['mutation_id', 'branch_id', 'categories', 'products'],
});

function assertPlainObject(value, message = 'Expected object') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConnectorError(CODES.VALIDATION_REJECTED, message, { retryable: false });
  }
}

function validateOperation(operation, input) {
  if (!Object.values(OPERATIONS).includes(operation)) {
    throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Unsupported connector operation', { retryable: false });
  }

  assertPlainObject(input, 'Operation input must be an object');

  for (const field of REQUIRED_FIELDS[operation]) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      throw new ConnectorError(CODES.VALIDATION_REJECTED, `Missing required field: ${field}`, { retryable: false });
    }
  }

  return true;
}

module.exports = { OPERATIONS, validateOperation };
