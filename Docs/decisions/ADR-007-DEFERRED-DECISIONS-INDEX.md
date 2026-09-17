# ADR-007 — Deferred Decisions Registry (D-01 … D-11)

<!-- DOC-META
type: decision
status: accepted
verified-as-of: 2026-09-17
related: Docs/current/BACKLOG.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## Date
2026-09-17 (documentation closure).

## Context
Phase 9 recorded eleven deferred/rejected decisions (D-01…D-11) "<em>so future phases don't re-litigate</em>" them. They must remain findable and authoritative after the docs reorganization.

## Decision
- `Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md §15` remains the **canonical registry** for D-01…D-11 (immutable evidence).
- `Docs/current/BACKLOG.md §A` mirrors the registry with live statuses (D-06 promoted to implemented; D-02/B-01 open…).
- Future decisions get their own ADR (`Docs/decisions/ADR-NNN-…`) and a single-line pointer entry here is **not** required — ADRs are self-indexing via `Docs/INDEX.md`.

## Consequences
- One immutable source of decision text (Phase 9 §15) + one live status view (BACKLOG §A). No duplicated decision bodies.
- A future phase must not silently "reopen" a D-0x: it records a new ADR that explicitly supersedes it.

## Non-negotiable
Do not edit Phase 9 §15; change a deferred status by recording a new ADR and updating BACKLOG §A.

## Provenance
`Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md:695-709`.