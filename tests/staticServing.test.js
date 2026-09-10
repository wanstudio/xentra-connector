'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createHttpServer, resolvePublicPath } = require('../src/transport/httpServer');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'connector-pwa-'));
}

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.status || res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
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

test('static file serving: public path resolver rejects traversal', () => {
  const publicDir = path.resolve(tmpDir());
  try {
    assert.equal(resolvePublicPath(publicDir, '/%2e%2e%2fsecret.txt'), null);
    assert.equal(resolvePublicPath(publicDir, '/%2e%2e%5csecret.txt'), null);
    assert.equal(resolvePublicPath(publicDir, '/assets/app.js'), path.join(publicDir, 'assets', 'app.js'));
  } finally {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('static file serving: serves index.html at root', async () => {
  const publicDir = tmpDir();
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html><body>Hello PWA</body></html>');

  process.env.XENTRA_PUBLIC_DIR = publicDir;
  const server = createHttpServer({ publicDir, adapter: noopAdapter() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await request(port, '/');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Hello PWA'));
    assert.ok(res.headers['content-type'].includes('text/html'));
  } finally {
    server.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
    delete process.env.XENTRA_PUBLIC_DIR;
  }
});

test('static file serving: serves CSS/JS with correct MIME types', async () => {
  const publicDir = tmpDir();
  fs.writeFileSync(path.join(publicDir, 'style.css'), 'body { color: red; }');
  fs.writeFileSync(path.join(publicDir, 'app.js'), 'console.log("hi")');

  const server = createHttpServer({ publicDir, adapter: noopAdapter() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const css = await request(port, '/style.css');
    assert.equal(css.status, 200);
    assert.ok(css.headers['content-type'].includes('text/css'));

    const js = await request(port, '/app.js');
    assert.equal(js.status, 200);
    assert.ok(js.headers['content-type'].includes('javascript'));
  } finally {
    server.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('static file serving: SPA fallback serves index.html for unknown routes', async () => {
  const publicDir = tmpDir();
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html><body>SPA</body></html>');

  const server = createHttpServer({ publicDir, adapter: noopAdapter() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await request(port, '/menu/nasi-goreng');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('SPA'));
  } finally {
    server.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('static file serving: API routes are not affected by static serving', async () => {
  const publicDir = tmpDir();
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>PWA</html>');
  fs.writeFileSync(path.join(publicDir, 'health'), 'should not serve this');

  const server = createHttpServer({ publicDir, adapter: noopAdapter() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await request(port, '/health');
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, 'ok');
    assert.ok(!res.body.includes('PWA'));
  } finally {
    server.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('static file serving: no public dir = API-only mode (no regression)', async () => {
  const server = createHttpServer({ publicDir: '/nonexistent/path/xyz', adapter: { async health() { return { ok: true }; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const health = await request(port, '/health');
    assert.equal(health.status, 200);

    const notFound = await request(port, '/something');
    assert.equal(notFound.status, 404);
  } finally {
    server.close();
  }
});

test('static file serving: checkout.html served at /checkout', async () => {
  const publicDir = tmpDir();
  fs.writeFileSync(path.join(publicDir, 'checkout.html'), '<html><body>Checkout</body></html>');

  const server = createHttpServer({ publicDir, adapter: noopAdapter() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await request(port, '/checkout');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Checkout'));
  } finally {
    server.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('static file serving: directory with index.html served at /checkout/', async () => {
  const publicDir = tmpDir();
  fs.mkdirSync(path.join(publicDir, 'checkout'));
  fs.writeFileSync(path.join(publicDir, 'checkout', 'index.html'), '<html><body>Checkout Dir</body></html>');

  const server = createHttpServer({ publicDir, adapter: noopAdapter() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await request(port, '/checkout/');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Checkout Dir'));
  } finally {
    server.close();
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});
