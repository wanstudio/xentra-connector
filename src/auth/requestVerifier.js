'use strict';

const crypto = require('crypto');

const HEADER_NAMES = Object.freeze({
  connectorId: 'x-xentra-connector-id',
  requestId: 'x-xentra-request-id',
  timestamp: 'x-xentra-timestamp',
  signature: 'x-xentra-signature',
});

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function canonicalize({ method, url, timestamp, requestId, body }) {
  return [
    String(method || '').toUpperCase(),
    String(url || ''),
    String(timestamp || ''),
    String(requestId || ''),
    sha256Hex(body || ''),
  ].join('\n');
}

function signRequest({ method, url, timestamp, requestId, body }, secret) {
  if (!secret) throw new Error('Signing secret is required');
  return crypto.createHmac('sha256', secret).update(canonicalize({ method, url, timestamp, requestId, body })).digest('base64url');
}

function verifyRequest({ headers, method, url, body }, options = {}) {
  const expectedConnectorId = options.connectorId || '';
  const secret = options.secret || '';
  const maxSkewMs = Number.isFinite(options.maxSkewMs) ? options.maxSkewMs : 5 * 60 * 1000;

  if (!expectedConnectorId || !secret) return { ok: false, code: 'AUTH_NOT_CONFIGURED' };

  const connectorId = headers[HEADER_NAMES.connectorId];
  const requestId = headers[HEADER_NAMES.requestId];
  const timestamp = headers[HEADER_NAMES.timestamp];
  const signature = headers[HEADER_NAMES.signature];

  if (![connectorId, requestId, timestamp, signature].every((value) => typeof value === 'string' && value.length > 0)) {
    return { ok: false, code: 'AUTH_HEADERS_MISSING' };
  }

  if (connectorId !== expectedConnectorId) return { ok: false, code: 'CONNECTOR_MISMATCH' };

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxSkewMs) {
    return { ok: false, code: 'REQUEST_EXPIRED' };
  }

  const expected = signRequest({ method, url, timestamp, requestId, body }, secret);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, code: 'SIGNATURE_INVALID' };
  }

  if (options.replayGuard && !options.replayGuard.consume(`${connectorId}:${requestId}`)) {
    return { ok: false, code: 'REPLAY_DETECTED' };
  }

  return { ok: true, connectorId, requestId };
}

module.exports = { HEADER_NAMES, canonicalize, signRequest, verifyRequest };
