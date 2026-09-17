# ADR-001 — Subscription Renewal Anchor (D-06)

<!-- DOC-META
type: decision
status: accepted
verified-as-of: 2026-09-17
related: Docs/current/STATE-LIFECYCLE.md, Docs/PHASE-10.2-SUBSCRIPTION-LIFECYCLE-REPORT.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## Date
2026-09-15 (adopted during Phase 10.2, owner decision).

## Context
Renewal previously just added plan days from "now", discarding remaining subscription time — inconsistent for active subscribers.

## Decision
In `computeRenewalExpiry`:
- `ACTIVE` or `EXPIRING_SOON` → `newExpiry = current subscription_expires_at + plan days` (remaining time preserved).
- `EXPIRED`, `SUSPENDED`, or no configured expiry → `newExpiry = now + plan days`.
- Every renewal sets `is_active = true` (reactivates a suspended/expired store).
- Plans remain 30 / 180 / 365 days.

## Consequences
- No wasted time for active merchants; deterministic, testable math (covered by lifecycle tests: T+5→+30 stays anchored to old expiry; EXPIRED/SUSPENDED/null anchor to now).
- Provider PATCH renewal path is the only in-system renewal; no payment channel yet (see BACKLOG B-02).

## Non-negotiable
Owner sign-off was required before implementation (Phase 9 §15 D-06); do not change the anchor rule without a new ADR.

## Provenance
`apps/api-server/src/lib/storeLifecycle.ts:101` `computeRenewalExpiry`; Phase 10.2 §2, §11; Phase 9 §15 D-06.