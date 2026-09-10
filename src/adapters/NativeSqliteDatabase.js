'use strict';

/**
 * Small compatibility wrapper around Node's built-in node:sqlite API.
 * It presents the subset of the sql.js database surface consumed by the
 * connector adapter and schema validator, while keeping the SQLite file
 * opened as a real read/write database instead of an in-memory snapshot.
 */
class NativeSqliteDatabase {
  constructor(db) {
    if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
      throw new TypeError('A node:sqlite DatabaseSync instance is required');
    }
    this.db = db;
  }

  exec(sql) {
    const normalized = String(sql).trim();
    if (/^PRAGMA\s+table_info\(/i.test(normalized)) {
      const rows = this.db.prepare(normalized).all();
      return rows.length === 0
        ? []
        : [{
            columns: Object.keys(rows[0]),
            values: rows.map((row) => Object.values(row)),
          }];
    }

    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(normalized)) {
      const rows = this.db.prepare(normalized).all();
      if (rows.length === 0) return [];
      return [{
        columns: Object.keys(rows[0]),
        values: rows.map((row) => Object.values(row)),
      }];
    }

    this.db.exec(normalized);
    return [];
  }

  run(sql, params = []) {
    const statement = this.db.prepare(String(sql));
    if (Array.isArray(params) && params.length > 0) return statement.run(...params);
    return statement.run();
  }

  close() {
    if (typeof this.db.close === 'function') this.db.close();
  }
}

function openNativeSqlite(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return new NativeSqliteDatabase(db);
}

module.exports = { NativeSqliteDatabase, openNativeSqlite };
