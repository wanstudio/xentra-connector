'use strict';

const { CODES, ConnectorError, toContractError } = require('../contract/errors');
const { OPERATIONS, validateOperation } = require('../contract/operations');

class TypedPersistenceService {
  constructor(adapter, options = {}) {
    if (!adapter || typeof adapter !== 'object') {
      throw new TypeError('A client data adapter is required');
    }
    this.adapter = adapter;
    this.idempotency = options.idempotencyStore || new Map();
  }

  async execute(operation, input) {
    validateOperation(operation, input);

    if (operation === OPERATIONS.PERSIST_ORDER) {
      return this.#executeIdempotent(operation, input.mutation_id, input, () => this.adapter.persistOrder(input));
    }

    if (operation === OPERATIONS.CATALOG_SYNC) {
      return this.#executeIdempotent(operation, input.mutation_id, input, () => this.adapter.syncCatalog(input));
    }

    switch (operation) {
      case OPERATIONS.GET_BRANCH_OPERATIONAL_DATA:
        return this.adapter.getBranchOperationalData(input);
      case OPERATIONS.GET_CATALOG_DATA:
        return this.adapter.getCatalogData(input);
      case OPERATIONS.GET_INVENTORY_AVAILABILITY:
        return this.adapter.getInventoryAvailability(input);
      default:
        throw new ConnectorError(CODES.VALIDATION_REJECTED, 'Unsupported connector operation', { retryable: false });
    }
  }

  async close() {
    if (typeof this.adapter.close === 'function') {
      await this.adapter.close();
    }
  }

  async #executeIdempotent(operation, mutationId, input, handler) {
    const key = `${operation}:${String(mutationId)}`;
    if (this.idempotency.has(key)) {
      return {
        ...(this.idempotency.get(key)),
        replay: true,
      };
    }

    try {
      const result = await handler();
      const response = { result, replay: false };
      this.idempotency.set(key, response);
      return response;
    } catch (error) {
      throw toContractError(error);
    }
  }
}

module.exports = TypedPersistenceService;
