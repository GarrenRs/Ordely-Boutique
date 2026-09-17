# ADR-005 — No `order_source` Column; Provenance via Audit

<!-- DOC-META
type: decision
status: accepted
verified-as-of: 2026-09-17
related: Docs/current/STATE-BUSINESS-RULES.md, Docs/PHASE-10.5-MANUAL-ORDER-REPORT.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## Date
2026-09-15 (Phase 10.5).

## Context
Merchant manual order entry (P2-01) needed to be distinguishable from public orders, suggesting an `order_source` column. Existing `orders` table and public/manual flows share the same core.

## Decision
- **No `order_source` column** in Phase 10.5 (D-02 honored; no migration).
- Provenance is carried by the audit note: manual orders log `ORDER_CREATED` with note `"طلب يدوي عبر التاجر"`.
- Manual and public orders both flow through `createOrderCore`; manual adds `requireAddressForHome=true`.

## Consequences
- No schema change in 10.5; source attribution is audit-level only.
- If analytics / returns-eligibility by source becomes a need, a future `order_source ENUM('PUBLIC','MANUAL')` migration would be required first (BACKLOG B-01 / D-02).

## Non-negotiable
Do not add an `order_source` column without a spec + DB migration decision (owner awareness).

## Provenance
`apps/api-server/src/lib/manual-order.ts:8` (`MANUAL_ORDER_AUDIT_NOTE`); Phase 10.5 §1, §16.1, §17; Phase 9 §7.1, §15 D-02.