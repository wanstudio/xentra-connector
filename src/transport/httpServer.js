'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getStatus } = require('../health/status');
const { getCapabilities } = require('../capabilities/registry');
const { verifyRequest } = require('../auth/requestVerifier');
const ReplayGuard = require('../auth/replayGuard');
const { negotiateContract } = require('../contract/negotiate');
const { ConnectorError } = require('../contract/errors');
const { createPersistenceService } = require('../persistence/createPersistenceService');

const MAX_BODY_BYTES = 64 * 1024;
const replayGuard = new ReplayGuard({ ttlMs: config.authMaxSkewMs });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authFailure(res, code) {
  return writeJson(res, 401, { error: 'AUTHORIZATION_REJECTED', code });
}

function requireServiceAuth(req, body) {
  return verifyRequest({ headers: req.headers, method: req.method, url: req.url, body }, {
    connectorId: config.connectorId,
    secret: config.coreHmacSecret,
    maxSkewMs: config.authMaxSkewMs,
    replayGuard,
  });
}

async function handleNegotiation(req, res) {
  const body = await readBody(req);
  const auth = requireServiceAuth(req, body);
  if (!auth.ok) return authFailure(res, auth.code);

  let input;
  try {
    input = body ? JSON.parse(body) : {};
  } catch (_error) {
    return writeJson(res, 400, { error: 'VALIDATION_REJECTED', code: 'INVALID_JSON' });
  }

  try {
    const negotiated = negotiateContract(input.requested_versions);
    return writeJson(res, 200, {
      ...negotiated,
      connector_id: config.connectorId,
      capabilities: getCapabilities().capabilities,
    });
  } catch (error) {
    if (error instanceof ConnectorError) {
      return writeJson(res, 409, { error: error.code, message: error.message });
    }
    console.error('Connector negotiation failure');
    return writeJson(res, 500, { error: 'INTERNAL_ERROR' });
  }
}

async function handlePersistence(req, res, persistenceService) {
  const body = await readBody(req);
  const auth = requireServiceAuth(req, body);
  if (!auth.ok) return authFailure(res, auth.code);

  let input;
  try {
    input = body ? JSON.parse(body) : {};
  } catch (_error) {
    return writeJson(res, 400, { error: 'VALIDATION_REJECTED', code: 'INVALID_JSON' });
  }

  try {
    const result = await persistenceService.execute(input.operation, input.input);
    return writeJson(res, 200, {
      contract_version: config.contractVersion,
      connector_id: config.connectorId,
      operation: input.operation,
      ...result,
    });
  } catch (error) {
    const contractError = error instanceof ConnectorError
      ? error
      : new ConnectorError('INTERNAL_ERROR', 'Connector integration failure', { cause: error });
    const status = contractError.code === 'VALIDATION_REJECTED' ? 400 : 409;
    return writeJson(res, status, {
      error: contractError.code,
      retryable: contractError.retryable,
      message: contractError.message,
    });
  }
}

function getPublicDir() {
  return config.publicDir || path.join(__dirname, '../../public');
}

function resolvePublicPath(publicDir, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://connector.local').pathname);
  } catch (_error) {
    return null;
  }

  // Prefix with '.' so an absolute URL pathname cannot replace publicDir.
  const resolved = path.resolve(publicDir, `.${pathname}`);
  const relative = path.relative(publicDir, resolved);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return resolved;
  }
  return null;
}

function serveStaticFile(res, filePath) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.end(content);
    return true;
  } catch (_e) {
    return false;
  }
}

function serveIndexFallback(res, publicDir) {
  const indexPath = path.join(publicDir, 'index.html');
  return serveStaticFile(res, indexPath);
}

function createHttpServer(options = {}) {
  const persistenceService = options.persistenceService || createPersistenceService(options.adapter, options.persistenceOptions);
  const publicDir = options.publicDir || getPublicDir();
  const hasPublicDir = fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory();

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return writeJson(res, 200, getStatus());
      }

      if (req.method === 'GET' && req.url === '/capabilities') {
        return writeJson(res, 200, getCapabilities());
      }

      if (req.method === 'POST' && req.url === '/v1/contract/negotiate') {
        return await handleNegotiation(req, res);
      }

      if (req.method === 'POST' && req.url === '/v1/persistence') {
        return await handlePersistence(req, res, persistenceService);
      }

      // Static file serving for Customer PWA (GET/HEAD only)
      if (hasPublicDir && (req.method === 'GET' || req.method === 'HEAD')) {
        const urlPath = req.url.split('?')[0];

        // Try exact file match first
        const filePath = resolvePublicPath(publicDir, req.url);
        if (filePath && serveStaticFile(res, filePath)) return;

        // Clean path for further resolution (strip trailing slash)
        const cleanPath = urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;

        if (!path.extname(cleanPath)) {
          // Try directory index (e.g., /checkout/ -> /checkout/index.html)
          const dirIndex = resolvePublicPath(publicDir, `${cleanPath}/index.html`);
          if (dirIndex && serveStaticFile(res, dirIndex)) return;

          // Try with .html extension (e.g., /checkout -> /checkout.html)
          const htmlPath = resolvePublicPath(publicDir, cleanPath + '.html');
          if (htmlPath && serveStaticFile(res, htmlPath)) return;
        }

        // SPA fallback: serve index.html for client-side routes
        if (serveIndexFallback(res, publicDir)) return;
      }

      return writeJson(res, 404, {
        error: 'NOT_FOUND',
        message: 'Connector endpoint not found',
      });
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') {
        return writeJson(res, 413, { error: 'VALIDATION_REJECTED', code: 'BODY_TOO_LARGE' });
      }
      console.error('Connector transport failure');
      return writeJson(res, 500, { error: 'INTERNAL_ERROR' });
    }
  });
}

function start(server = createHttpServer()) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { createHttpServer, start, readBody, resolvePublicPath };
