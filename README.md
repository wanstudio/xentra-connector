# Xentra Connector

Minimal client-side integration service for Xentra enterprise deployments.

## Architectural boundary

`xentra-connector` is a separate deployment unit from `xentra-core`.

- Xentra Core owns identity, authorization policy, tenant authority, business rules and proprietary algorithms.
- The connector owns authenticated transport, client DB/storage adapters, schema translation, and approved persistence operations.
- The connector must not become a copy, fork, or mirror of Xentra Core.
- No arbitrary SQL or filesystem API is exposed to Xentra Core.
- Connector credentials are service credentials and must never be exposed to browser code.

The protocol baseline is **v1** and must conform to the locked Core ↔ Connector contract in `xentra-core/docs/CORE_CONNECTOR_API_CONTRACT.md`.

## Current protocol surface

- `GET /health` — operational status.
- `GET /capabilities` — supported contract versions and capability flags.
- `POST /v1/contract/negotiate` — authenticated contract-version negotiation.
- `POST /v1/persistence` — authenticated typed persistence operations only.

The negotiation and persistence endpoints require a service signature. The transport baseline uses HMAC-SHA256 with a timestamp/replay window; production deployments should place the connector behind TLS and use mTLS where operationally practical. The signing secret is never browser-visible.

## Client schema compatibility

Before a client database is used by typed persistence, the connector can run a read-only schema compatibility check. The check inspects required tables/columns with `PRAGMA table_info(...)` and fails closed when the minimum schema is not present. The validator does not create, alter, migrate, or delete client data.

The current adapter targets the existing Bangjo/Xentra SQLite schema for these capabilities:

- branch operational data and delivery/pickup settings
- branch catalog and branch-category resolution
- branch inventory availability
- order, order-item and optional delivery persistence

The connector contains only the minimum schema knowledge required by its approved operations; it does not import or mirror the full Xentra Core schema.

## Required environment variables for authenticated operation

```text
XENTRA_CONNECTOR_ID=<registered connector identity>
XENTRA_CORE_HMAC_SECRET=<scoped service credential>
XENTRA_CONTRACT_VERSION=v1
XENTRA_AUTH_MAX_SKEW_MS=300000
```

Requests are bound to the configured connector identity and the exact method, URL, timestamp, request ID and body hash. Expired, malformed, mismatched, or invalidly signed requests fail closed.

## Initial repository shape

```text
xentra-connector/
├── contract/
├── transport/
├── auth/
├── capabilities/
├── adapters/
├── persistence/
├── schema/
├── storage/
├── health/
├── src/
└── tests/
```

This repository intentionally starts from the contract rather than copying any part of `xentra-core`.
