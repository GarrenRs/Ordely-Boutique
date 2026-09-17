# ADR-006 — COD Money Model (fees, payable, returns)

<!-- DOC-META
type: decision
status: accepted
verified-as-of: 2026-09-17
related: Docs/current/STATE-BUSINESS-RULES.md, Docs/current/STATE-PRODUCT-MODEL.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md, Docs/PHASE-8-PRODUCT-AUDIT.md
-->

## Date
Anchored in Phase 8/9 (product decision) as COD-only commerce; fee model formalized here.

## Context
The commercial model is COD-only with **no payment records** (a product decision, not a defect — Phase 8). Orders compute money at creation from the product page price and delivery zone fees.

## Decision
- `unit_price` = landing page price snapshot; `total_price = unit_price × quantity`; `quantity` integer 1..10.
- `delivery_fee = office_fee` (OFFICE) or `office_fee + home_fee` (HOME); `home_fee` null → HOME unavailable; `office_fee` null → zone unusable.
- `transport_mode = SHED_MED` forces `OFFICE`.
- `return_fee` = zone `return_fee`; `payable_total = total_price + delivery_fee` (COD at delivery).
- Returns: `returnLoss = Σ return_fee`; `netRevenue` already deducts it via status grouping.
- DB stores `numeric(10,2)` as strings; API maps via `Number()`; null fees remain null in public payloads.
- No stock/payment/cart concepts in V1 (B-18, B-06 documented).

## Consequences
- Deterministic per-order pricing re-validated server-side each creation; single pricing core for public/legacy/manual flows.
- Moving an order out of `DELIVERED` is impossible (terminal) → no double-count risk in reports (guarded in state machine).

## Non-negotiable
COD-only; any pre-payment/deposit/digitized-payment concept is a new product decision (B-06), not a patch.

## Provenance
`apps/api-server/src/lib/order-creation.ts:103-179`; Phase 8 §Business-model; Phase 9 §5/§7; Phase 10.3 §9.