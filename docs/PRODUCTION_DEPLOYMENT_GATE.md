# Xentra Connector — Production Deployment Gate

Status: READY FOR ENVIRONMENT VALIDATION

## Purpose

This document is the operational gate for deploying `xentra-connector` into a client-controlled environment such as Bangjo. Code compatibility is necessary but not sufficient; the real client database and runtime ownership model must be validated before enabling persistence.

## Required pre-deployment checks

1. `XENTRA_CLIENT_DB_PATH` points to the intended client-owned SQLite file.
2. The connector process account can read/write the database and its WAL/SHM sidecar files.
3. The actual client database passes `validateClientSchema` without migration or destructive changes.
4. The connector is not sharing the same SQLite file through an unsafe whole-file snapshot writer.
5. Native `node:sqlite` is available for the production runtime whenever concurrent access is possible. The `sql.js` fallback is compatibility-only and must not be used alongside another live writer against the same file.
6. Existing application/POS processes and their DB access mode are identified before enabling `order.persist`.
7. Service authentication credentials are provisioned outside source control and are not browser-visible.
8. TLS is enabled for Core ↔ Connector transport; mTLS is preferred for enterprise deployments.

## Bangjo-specific gate

The following cannot be marked PASS from source inspection alone:

- actual production database schema compatibility;
- actual production database file path;
- whether the current Bangjo runtime and connector will concurrently write the same SQLite file;
- Passenger/hosting process lifecycle and restart behavior;
- network reachability from Core to the connector endpoint.

Therefore, no production connector write path should be enabled until a read-only snapshot of the Bangjo DB has been tested and the runtime writer ownership has been confirmed.

## Safe rollout sequence

`DB snapshot/read-only copy → schema validation → read integration test → backup → connector deployment → read-only smoke test → controlled order persistence test → monitor → full enablement`

During validation, the connector must not alter the source production DB.

## Rollback

Disable Core → Connector persistence traffic, stop the connector process, and restore the previous application routing. Do not delete or recreate the client DB as part of rollback.
