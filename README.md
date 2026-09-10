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

## Initial repository shape

```text
xentra-connector/
├── contract/
├── transport/
├── auth/
├── capabilities/
├── adapters/
├── persistence/
├── storage/
├── health/
├── src/
└── tests/
```

This repository intentionally starts from the contract rather than copying any part of `xentra-core`.
