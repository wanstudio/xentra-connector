'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createHttpServer } = require('../src/transport/httpServer');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'connector-routing-'));
}

function request(port, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${urlPath}`, { method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function noopAdapter() {
  return {
    async health() { return { ok: true }; },
    async getBranchOperationalData() { return {}; },
    async getCatalogData() { return { categories: [], items: [] }; },
    async getInventoryAvailability() { return { items: [] }; },
    async persistOrder() { return {}; },
    async syncCatalog() { return {}; },
  };
}

test('dashboard routing: delegates /dashboard, /dashboard/, /dashboard/login, /dashboard/assets/* to Core runtime', async () => {
  const recordedRequests = [];

  // Mock Core server
  const mockCore = http.createServer((req, res) => {
    recordedRequests.push({ url: req.url, method: req.method, headers: req.headers });
    if (req.url === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Core Dashboard</title></head></html>');
    } else if (req.url === '/dashboard/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Core Dashboard Slash</title></head></html>');
    } else if (req.url === '/dashboard/login') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Core Login</title></head></html>');
    } else if (req.url.startsWith('/dashboard/assets/app.js')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('console.log("core dashboard script");');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Core 404');
    }
  });

  await new Promise((resolve) => mockCore.listen(0, '127.0.0.1', resolve));
  const corePort = mockCore.address().port;
  const coreOrigin = `http://127.0.0.1:${corePort}`;

  // Connector server with publicDir (Customer PWA)
  const publicDir = tmpDir();
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html><body>Customer PWA SPA</body></html>');

  const connectorServer = createHttpServer({
    publicDir,
    coreOrigin,
    adapter: noopAdapter(),
  });
  await new Promise((resolve) => connectorServer.listen(0, '127.0.0.1', resolve));
  const connectorPort = connectorServer.address().port;

  try {
    // 1. / -> Customer PWA
    const rootRes = await request(connectorPort, '/');
    assert.equal(rootRes.status, 200);
    assert.ok(rootRes.body.includes('Customer PWA SPA'));

    // 2. /dashboard -> Core
    const dashRes = await request(connectorPort, '/dashboard', { host: 'app.mybangjo.com' });
    assert.equal(dashRes.status, 200);
    assert.ok(dashRes.body.includes('Core Dashboard'));

    // 3. /dashboard/ -> Core
    const dashSlashRes = await request(connectorPort, '/dashboard/', { host: 'app.mybangjo.com' });
    assert.equal(dashSlashRes.status, 200);
    assert.ok(dashSlashRes.body.includes('Core Dashboard Slash'));

    // 4. /dashboard/login -> Core
    const loginRes = await request(connectorPort, '/dashboard/login', { host: 'app.mybangjo.com' });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.includes('Core Login'));

    // 5. /dashboard/assets/app.js -> Core
    const assetRes = await request(connectorPort, '/dashboard/assets/app.js', { host: 'app.mybangjo.com' });
    assert.equal(assetRes.status, 200);
    assert.ok(assetRes.body.includes('core dashboard script'));
    assert.ok(assetRes.headers['content-type'].includes('javascript'));

    // 6. /health -> Connector internal
    const healthRes = await request(connectorPort, '/health');
    assert.equal(healthRes.status, 200);
    assert.ok(healthRes.body.includes('"status"'));

    // 7. /capabilities -> Connector internal
    const capRes = await request(connectorPort, '/capabilities');
    assert.equal(capRes.status, 200);
    assert.ok(capRes.body.includes('"capabilities"'));

    // 8. Unrelated route /menu -> Customer PWA fallback
    const menuRes = await request(connectorPort, '/menu');
    assert.equal(menuRes.status, 200);
    assert.ok(menuRes.body.includes('Customer PWA SPA'));

    // Verify forwarded headers
    const lastDashReq = recordedRequests.find(r => r.url === '/dashboard');
    assert.equal(lastDashReq.headers['x-forwarded-host'], 'app.mybangjo.com');
  } finally {
    connectorServer.close();
    mockCore.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('dashboard routing: fails safely with 502 when Core is unreachable (does not serve PWA fallback)', async () => {
  const publicDir = tmpDir();
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html><body>Customer PWA SPA</body></html>');

  // Point to a non-existent port
  const unreachableCoreOrigin = 'http://127.0.0.1:59999';

  const connectorServer = createHttpServer({
    publicDir,
    coreOrigin: unreachableCoreOrigin,
    adapter: noopAdapter(),
  });
  await new Promise((resolve) => connectorServer.listen(0, '127.0.0.1', resolve));
  const connectorPort = connectorServer.address().port;

  try {
    const res = await request(connectorPort, '/dashboard');
    assert.equal(res.status, 502);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.error, 'CORE_UNAVAILABLE');
    assert.ok(!res.body.includes('Customer PWA SPA'), 'Must never silently fallback to Customer PWA');
  } finally {
    connectorServer.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});
