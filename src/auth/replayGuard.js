'use strict';

class ReplayGuard {
  constructor(options = {}) {
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 5 * 60 * 1000;
    this.maxEntries = Number.isInteger(options.maxEntries) ? options.maxEntries : 10000;
    this.entries = new Map();
  }

  consume(key, now = Date.now()) {
    if (!key) return false;
    this.#prune(now);
    const expiresAt = this.entries.get(key);
    if (expiresAt && expiresAt > now) return false;
    this.entries.set(key, now + this.ttlMs);
    if (this.entries.size > this.maxEntries) this.#prune(now, true);
    return true;
  }

  #prune(now, force = false) {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now || (force && this.entries.size > this.maxEntries)) this.entries.delete(key);
      if (!force && expiresAt > now) break;
    }
  }
}

module.exports = ReplayGuard;
