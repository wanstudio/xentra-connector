'use strict';

const CODES = Object.freeze({
  VALIDATION_REJECTED: 'VALIDATION_REJECTED',
  AUTHORIZATION_REJECTED: 'AUTHORIZATION_REJECTED',
  CONFLICT: 'CONFLICT',
  UNAVAILABLE_DEPENDENCY: 'UNAVAILABLE_DEPENDENCY',
  PERMANENT_INTEGRATION_FAILURE: 'PERMANENT_INTEGRATION_FAILURE',
  CONTRACT_INCOMPATIBLE: 'CONTRACT_INCOMPATIBLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

class ConnectorError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.cause = options.cause;
  }
}

function toContractError(error) {
  if (error instanceof ConnectorError) return error;
  return new ConnectorError(CODES.INTERNAL_ERROR, 'Connector integration failure', {
    retryable: false,
    cause: error,
  });
}

module.exports = { CODES, ConnectorError, toContractError };
