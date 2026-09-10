'use strict';

const contractVersion = process.env.XENTRA_CONTRACT_VERSION || 'v1';
const port = Number(process.env.PORT || 3100);
const connectorId = process.env.XENTRA_CONNECTOR_ID || '';
const coreHmacSecret = process.env.XENTRA_CORE_HMAC_SECRET || '';
const authMaxSkewMs = Number(process.env.XENTRA_AUTH_MAX_SKEW_MS || 300000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid PORT');
}

if (!Number.isInteger(authMaxSkewMs) || authMaxSkewMs < 1000 || authMaxSkewMs > 3600000) {
  throw new Error('Invalid XENTRA_AUTH_MAX_SKEW_MS');
}

module.exports = Object.freeze({
  contractVersion,
  port,
  connectorId,
  coreHmacSecret,
  authMaxSkewMs,
});
