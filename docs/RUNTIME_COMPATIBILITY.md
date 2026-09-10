# Xentra Connector — Runtime Compatibility

**Status: LOCKED**

## Principle

`xentra-connector` is designed to be portable across client environments. The client runtime does **not** need to match the Xentra Core runtime version.

- Xentra Core runtime requirements are controlled by Xentra.
- Connector runtime requirements are determined by the connector implementation and its detected capabilities.
- Do not require client Node.js to match Xentra Core Node.js.
- Do not introduce a hard client Node.js version lock unless a future connector feature genuinely requires one.

## Runtime capability model

The connector should prefer native platform capabilities when available and fall back to supported compatibility implementations where safe.

Current example:

`node:sqlite` native SQLite → preferred path

`sql.js` → compatibility path when native SQLite is unavailable

The fallback must not be used when it would create an unsafe whole-file snapshot writer against a SQLite database that another live process can modify concurrently.

## Compatibility boundary

The portable contract is the following:

`Client Runtime → xentra-connector → Contract v1 → Xentra Core`

The contract, authentication protocol, typed operations, validation behavior, and failure semantics are stable boundaries. Node.js version, operating system, and hosting provider are deployment details and are not part of the Core ↔ Connector API contract.

## Engineering rule

New connector code MUST:

1. avoid unnecessary dependence on a single client runtime version;
2. detect optional runtime capabilities rather than assuming them;
3. keep compatibility behavior inside the connector;
4. fail closed when the available runtime cannot safely provide the required capability.

This document intentionally does not define a universal client Node.js version. Deployment-specific runtime constraints belong in the deployment record for each client.
