# STATE-LIFECYCLE — Lifecycles & State Machines

> Living mirror of the three behavioral state machines: **order status transitions**, **store subscription lifecycle**, and **derived readiness**. Verified against `transitions.ts`, `storeLifecycle.ts`, `readiness.ts`. Code wins; keep in sync with those modules.

<!-- DOC-META
type: state
status: active
verified-as-of: 2026-09-17
related: Docs/current/STATE-BUSINESS-RULES.md, Docs/current/STATE-PRODUCT-MODEL.md, Docs/PHASE-10.1-PUBLICATION-READINESS-REPORT.md, Docs/PHASE-10.2-SUBSCRIPTION-LIFECYCLE-REPORT.md, Docs/PHASE-10.3-RETURN-AFTER-DELIVERY-REPORT.md
-->

## 1. Order state machine (`VALID_TRANSITIONS`, `transitions.ts`)

```text
NEW:                    → PENDING_CONFIRMATION, CANCELLED
PENDING_CONFIRMATION:   → CONFIRMED, REJECTED
CONFIRMED:              → SHIPPED, CANCELLED
SHIPPED:                → DELIVERED
DELIVERED:              → RETURNED
RETURNED:               (terminal)
CANCELLED:              (terminal)
REJECTED:               (terminal)
```

- Enforcement: `PATCH /stores/:storeId/orders/:orderId` rejects any transition outside the matrix with `422 "انتقال غير مسموح من X إلى Y"` (no write).
- **`RETURNED` requires a non-empty `returnReason`** (trimmed) → `422 "سبب الإرجاع مطلوب"`; stores `return_reason`, sets `returned_at`, writes audit `STATUS_CHANGED` with reason in `note`.
- `SHIPPED → RETURNED` was **removed** in Phase 10.3; `DELIVERED → RETURNED` is the only entry path into `RETURNED`.
- Lifecycle timestamps (`confirmed_at/shipped_at/delivered_at/returned_at`) are set on the respective terminal-of-that-leg transitions; `updated_at` always bumps.

## 2. Store subscription lifecycle (`storeLifecycle.ts`)

Computed live at each request from `is_active` + `subscription_expires_at` (no stored column, no cron — self-healing):

| Merchant `storeStatus` | Condition | Login | Accepts new orders | Public storefront |
|---|---|---|---|---|
| `ACTIVE` | `is_active` and (no expiry or > 7 days left) | allowed | yes | live |
| `EXPIRING_SOON` | `is_active` and 0 < days left ≤ 7 | allowed | yes | live (amber banner) |
| `EXPIRED` | `is_active` and expiry ≤ now | restricted login | **no** (422) | hidden |
| `SUSPENDED` | `is_active = false` | **blocked** (403, no session) | no | hidden |

- `daysUntil = ceil((expiry - now) / DAY_MS)`; `EXPIRING_SOON_DAYS = 7`.
- Provider projection `subscriptionStatus`: `suspended | noSubscription | expired | expiringSoon | active`.
- `noSubscription` (store active, no expiry) → merchant sees `ACTIVE`.

### Renewal (D-06, ADR-001)

```text
ACTIVE | EXPIRING_SOON  → newExpiry = subscription_expires_at + plan days   (time preserved)
EXPIRED | SUSPENDED | no-expiry → newExpiry = now + plan days
```
- Every renewal also sets `is_active = true` (reactivates suspended/expired store).
- Owner-adopted (Phase 10.2); implemented in `computeRenewalExpiry`.

## 3. Derived readiness (publication) — `readiness.ts`

Costly/derived; computed per request. Precedence order (first reason wins):

| # | Reason code | Condition |
|---|---|---|
| 1 | `store_inactive` | store `SUSPENDED` (`is_active = false`) |
| 2 | `subscription_expired` | store lifecycle `EXPIRED` |
| 3 | `no_usable_delivery_zone` | no delivery zone with `is_active = true` + `office_fee != null` + at least one enabled commune in `delivery_commune_settings` |
| 4 | `product_incomplete` | missing name / `price ≤ 0` / missing description / missing slug |
| 5 | `product_unpublished` | `landing_pages.is_active = false` |

- SQL gate `effectiveActiveStoreSql = is_active = true AND (subscription_expires_at IS NULL OR subscription_expires_at > now())` — single definition reused across public routes.
- Zone "usable" correctness rule: a wilaya counts only if it has at least one commune not disabled by `delivery_commune_settings`; absent commune settings = all communes enabled.
- Merchant surfaces `publiclyLive` + `readinessReason` (landing pages) and `deliveryReady` (store); reasons are **never** exposed to public/customers.
- Manual `is_active=false` remains the explicit merchant opt-out.

## 4. Flow integrity guarantees

- Order creation goes through one core (`createOrderCore`) for all three entry routes (public, legacy public, manual), guaranteeing identical validation/pricing/audit.
- Pre-checks are **fail-before-write**: readiness (`422`), lifecycle (`422`/`403`), quantity/variant/zone/commune/fee availability, address (manual+HOME) — no order row is created on failure.
- Cross-store isolation: all store-scoped resources resolve through `:storeId` + session scope; manual-order product lookup requires `storeId` match.