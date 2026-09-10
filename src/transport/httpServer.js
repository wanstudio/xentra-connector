'use strict';

const http = require('http');
const config = require('../config');
const { getStatus } = require('../health/status');
const { getCapabilities } = require('../capabilities/registry');

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

function createHttpServer() {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      return writeJson(res, 200, getStatus());
    }

    if (req.method === 'GET' && req.url === '/capabilities') {
      return writeJson(res, 200, getCapabilities());
    }

    return writeJson(res, 404, {
      error: 'NOT_FOUND',
      message: 'Connector endpoint not found',
    });
  });
}

function start(server = createHttpServer()) {
  return new Promise((resolve) => {
    server.listen(config.port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { createHttpServer, start };
