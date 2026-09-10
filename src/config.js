'use strict';

const contractVersion = process.env.XENTRA_CONTRACT_VERSION || 'v1';
const port = Number(process.env.PORT || 3100);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid PORT');
}

module.exports = Object.freeze({
  contractVersion,
  port,
  connectorId: process.env.XENTRA_CONNECTOR_ID || '',
});
