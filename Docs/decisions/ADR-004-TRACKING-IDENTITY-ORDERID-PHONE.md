# ADR-004 — Customer Tracking Identity: orderId + Phone, No Auth

<!-- DOC-META
type: decision
status: accepted
verified-as-of: 2026-09-17
related: Docs/current/STATE-LIFECYCLE.md, Docs/current/STATE-BUSINESS-RULES.md, Docs/PHASE-10.4-CUSTOMER-ORDER-TRACKING-REPORT.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## Date
2026-09-15 (Phase 10.4).

## Context
Customers had no post-order visibility; no auth channel exists for customers. Spec chose a knowledge-factor lookup.

## Decision
- Public `POST /api/public/orders/status` requires `{ orderId, phone }` and matches `orders.id` + `orders.customer_phone`.
- Unauthenticated but **rate-limited** (`trackOrderLimiter` 20 / 10 min) and `Cache-Control: no-store`.
- Response is derived live from the orders row: `orderId, status, createdAt, updatedAt, returnedAt, deliveredAt`; 404 when no match. No DB change.
- Status is *viewable*, never *pushed* (no WhatsApp/SMS — D-08/D-09).

## Consequences
- Tracking works without customer accounts; identity is knowledge-based (someone knowing both id+phone can view an order — accepted for COD MVP).
- No PIN/tracking code today (BACKLOG B-10).

## Non-negotiable
Do not expose a tracking endpoint that leaks store/business data; keep the knowledge-factor + rate limit + no-store cache.

## Provenance
`apps/api-server/src/routes/public.ts:302-338`; `middleware/rateLimiter.ts:21-27`; Phase 10.4; Phase 9 §3, §15 D-08/D-09.