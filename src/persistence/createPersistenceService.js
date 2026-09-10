'use strict';

const ClientDataAdapter = require('../adapters/ClientDataAdapter');
const TypedPersistenceService = require('./TypedPersistenceService');

function createPersistenceService(adapter = new ClientDataAdapter(), options = {}) {
  return new TypedPersistenceService(adapter, options);
}

module.exports = { createPersistenceService };
