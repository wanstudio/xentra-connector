'use strict';

/**
 * Typed client-data persistence seam.
 *
 * Concrete client DB/storage implementations belong in this repository.
 * No arbitrary SQL or filesystem primitive is exposed by this interface.
 */
class ClientDataAdapter {
  async health() {
    return { ok: true };
  }

  async getBranchOperationalData(_input) {
    throw new Error('Capability not configured');
  }

  async getCatalogData(_input) {
    throw new Error('Capability not configured');
  }

  async getInventoryAvailability(_input) {
    throw new Error('Capability not configured');
  }

  async persistOrder(_input) {
    throw new Error('Capability not configured');
  }
}

module.exports = ClientDataAdapter;
