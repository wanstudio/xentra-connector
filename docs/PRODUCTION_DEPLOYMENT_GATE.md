# Xentra Connector — Production Deployment Gate

Status: CODE-READY / ENVIRONMENT-APPLY WHEN DEPLOYING

## Purpose

This document keeps the connector rollout operationally safe without blocking development on the current Bangjo production database. Bangjo data is dummy/rebuildable for this rollout, so the implementation source of truth is the canonical connector/Core contract and schema already locked in Git.

## Current implementation assumptions

1. `branch_delivery_settings` is the canonical branch delivery configuration table.
2. `branch_settings` is legacy terminology and is not a supported runtime alternative.
3. The connector operates only through typed operations; it does not expose arbitrary SQL or filesystem access.
4. `node:sqlite` is the preferred runtime path for the actual SQLite file. The `sql.js` path is compatibility-only.
5. A real deployment must still configure `XENTRA_CLIENT_DB_PATH` and service credentials outside source control.

## Deployment checks

1. `XENTRA_CLIENT_DB_PATH` points to the intended client-owned SQLite file.
2. The connector process account can read/write the database and its WAL/SHM sidecar files.
3. The database is initialized/migrated to the canonical connector schema before first use.
4. Native `node:sqlite` is available when the same SQLite file may be accessed by another live process.
5. If `sql.js` fallback is used, it must not share a live SQLite file with another writer.
6. Service authentication credentials are provisioned outside source control and are not browser-visible.
7. TLS is enabled for Core ↔ Connector transport; mTLS is preferred for enterprise deployments.

## Safe rollout sequence

`prepare/rebuild client DB → schema validation → read integration test → backup → connector deployment → read-only smoke test → controlled order persistence test → monitor → full enablement`

The source DB should still be backed up before enabling writes, but a historical Bangjo schema investigation is not a development gate.

## Rollback

Disable Core → Connector persistence traffic, stop the connector process, and restore the previous application routing. Preserve the client DB backup for recovery.
