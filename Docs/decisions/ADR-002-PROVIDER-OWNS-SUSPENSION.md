# ADR-002 — Provider Owns Store Suspension (`is_active`)

<!-- DOC-META
type: decision
status: accepted
verified-as-of: 2026-09-17
related: Docs/current/STATE-LIFECYCLE.md, Docs/current/STATE-BUSINESS-RULES.md, Docs/PHASE-10.2-SUBSCRIPTION-LIFECYCLE-REPORT.md
-->

## Date
2026-09-15 (Phase 10.2).

## Context
Merchants could previously write `is_active` on their own store (toggling the storefront off), which collided with the provider's suspension concept.

## Decision
- `is_active` is **provider-owned**: field removed from `UpdateStoreBody` (merchant `PATCH /stores/:id`); zod silently drops the excess key.
- Provider `PATCH /provider/stores/:id` is the only path that toggles `is_active`; renewal also auto-reactivates.
- Merchant keeps explicit product-level `is_active` (publish/hide) on landing pages — unrelated to store suspension.

## Consequences
- Suspended = platform-level block (`403` login, no session, storefront hidden); published product hides are merchant-level.
- D-07 (merchant-owned "storefront off") remains deferred — requires this ownership model to be revisited by the product owner.

## Non-negotiable
Do not re-add `isActive` to the merchant store-update contract.

## Provenance
`apps/api-server/src/routes/stores.ts:49-70` (UpdateStoreBody), `routes/provider.ts:451-462`; Phase 10.2 §7, §11.