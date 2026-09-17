# ADR-003 — Order State Machine & Mandatory Return Reason

<!-- DOC-META
type: decision
status: accepted
verified-as-of: 2026-09-17
related: Docs/current/STATE-LIFECYCLE.md, Docs/current/STATE-PRODUCT-MODEL.md, Docs/PHASE-10.3-RETURN-AFTER-DELIVERY-REPORT.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## Date
2026-09-15 (Phase 10.3).

## Context
`RETURNED` existed in schema/UI but had no legitimate path (SHIPPED→RETURNED was unrestricted, DELIVERED was terminal). Return-after-delivery was impossible in-system.

## Decision
- Single explicit transition matrix `VALID_TRANSITIONS` (see STATE-LIFECYCLE §1); added `DELIVERED → RETURNED`, removed `SHIPPED → RETURNED`.
- `RETURNED` is terminal; all other statuses cannot reach it.
- `return_reason` (nullable `orders.return_reason`, added via `db:push`) is **mandatory and trimmed non-empty** when transitioning to `RETURNED`; stored on the row and mirrored in the audit `note`.
- Fail before write: invalid transition or missing reason → `422`, no row/audit change.

## Consequences
- One DB migration across Phase 10 (the `return_reason` column); all other Phase 10.x phases were schema-neutral.
- Reports already grouped `RETURNED` + `return_fee` (`returnLoss`/`netRevenue`); no report changes needed.

## Non-negotiable
Two-step return (D-04 / Option B) was rejected for COD MVP. Do not silently allow `RETURNED → *` or drop the reason requirement.

## Provenance
`apps/api-server/src/lib/transitions.ts`; `lib/db/src/schema/orders.ts:46`; Phase 10.3 §3-§7; Phase 9 §5/§15 D-04.