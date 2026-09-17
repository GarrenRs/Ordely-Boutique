# Phase 9 - Product Gap Specification

<!-- DOC-META
type: spec
status: implemented
implemented-by: Docs/PHASE-10.1-PUBLICATION-READINESS-REPORT.md, Docs/PHASE-10.2-SUBSCRIPTION-LIFECYCLE-REPORT.md, Docs/PHASE-10.3-RETURN-AFTER-DELIVERY-REPORT.md, Docs/PHASE-10.4-CUSTOMER-ORDER-TRACKING-REPORT.md, Docs/PHASE-10.5-MANUAL-ORDER-REPORT.md
notes: All five specs (P1-01, P1-02, P1-03, P1-04, P2-01) implemented and closed by Phase 10.1-10.5. Historical content intentionally unmodified.
-->

> **Scope:** Specification only. This document converts the Phase 8 audit findings (P1-01, P1-02, P1-03, P1-04, P2-01) into implementation-ready product specifications. No source code, database, API, UI, production data, or repository structure was modified.
>
> **Baseline:** Closed and published Ordely baseline (git `main`). All file:line evidence below is from the audited baseline.
>
> **Status:** Specification complete. This document ends the phase. No code was written.

---

## 1. Executive Summary

Phase 8 identified two P1 business-flow gaps (customer post-order visibility, implicit product publication) plus a P1-adjacent state gap (return-after-delivery) and a lifecycle gap (subscription expiry not enforced against the merchant). Phase 9 turns those findings and P2-01 into precise, implementation-ready specifications.

Five specifications are produced, each grounded in the current code:

| # | Gap | Recommended direction (summary) |
|---|---|---|
| P1-01 | Customer Order Tracking | Knowledge-factor lookup (order id + phone), no auth, rate-limited, unauthenticated status endpoint + an inline tracker on the success screen and a `/track` page. **No DB change required.** Human-readable order number is deferred. |
| P1-02 | Publication Readiness | Delivery readiness is a **derived** store-level predicate ("has >=1 usable active delivery zone"), and a product is publicly live only when store-ready AND page `is_active`. `is_active` keeps its explicit publish/opt-out meaning; no data migration. |
| P1-03 | Return After Delivery | Single transition `DELIVERED -> RETURNED` (Option A) with a required return reason. `returnedAt` column already exists; add nullable `return_reason`. Revenue reversal is automatic via current status grouping. |
| P1-04 | Subscription Expiry Enforcement | Four explicit merchant lifecycle states (ACTIVE / EXPIRING_SOON / EXPIRED / SUSPENDED). Expired merchant: login allowed, storefront off, no new orders, existing orders fully operable, renewal CTA. Suspended merchant: login blocked (provider policy). **No DB change required**; enforcement is a shared server predicate. |
| P2-01 | Merchant Manual Order Entry | New "New Order" screen reusing existing `POST /stores/:storeId/orders`, product/variant/zone/fee validation shared with the public flow, quantity capped 1..10, source distinguished in the audit note. `order_source` column is deferred. |

Guiding constraints honoured from Phase 8: no invented business requirements; classify each proposed change as BUG-fix / MISSING WORKFLOW / PRODUCT DECISION / FUTURE FEATURE; smallest business-safe expansion; multi-tenant isolation and Arabic-first UX preserved.

Implementation sequence (Section 14) is ordered by dependency, not by Phase 8 enumeration: gates first (P1-02, P1-04), then state/reporting (P1-03), then new customer surface (P1-01), then merchant capture UI (P2-01).

---

## 2. Product Principles

These principles govern every specification below and must survive implementation:

1. **Single source of truth on the server.** Public availability, order acceptance, and merchant capability are computed server-side from data (derived predicates), never from client state. The client only renders what the server returns.
2. **`is_active` / `subscription_expires_at` semantics are fixed.** `is_active` = explicit on/off switch; `subscription_expires_at` = time boundary. Lifecycle states are derived from their combination (Section 6).
3. **No silent workflow dead-ends.** Every customer/merchant terminal state must have an Arabic-facing explanation and (where relevant) a next step.
4. **Fees are snapshots, not refetched.** `delivery_fee`, `return_fee`, `unit_price`, `total_price` are stored on the order at creation (already true) and must never be recomputed later. Return handling only reads the snapshot.
5. **Operations continuity beats lockout.** Expiry must stop *new* commercial activity (storefront, new orders) without freezing the handling of existing orders (confirm/ship/deliver/return, customer lookup).
6. **Minimal schema surface.** Prefer derived computation and existing columns. Any new column must earn its place via a concrete reporting or audit requirement.
7. **Multi-tenant isolation is invariant.** Every new public or merchant query is scoped by `store_id` (or order row) exactly as today.
8. **Arabic-first, RTL, `ar-DZ-u-nu-latn` dates.** All customer-facing strings and date formats follow the existing conventions (`Layout.tsx`, order UI).
9. **Rate limiting is applied to every public surface.** Reuse the `express-rate-limit` middleware pattern (`rateLimiter.ts`).
10. **Audit trail is complete on every state change.** `order_id` + `store_id` + action + from/to + note, per `audit.ts`.

---

## 3. P1-01 Customer Order Tracking Specification

Phase 8 findings: **C-01/X-02** (customer lifecycle dead-end). Baseline: success screen returns `{ id, productName, totalPrice, deliveryFee, payableTotal, status }` (`routes/public.ts:305-315`); the customer has no way to re-check status.

### 3.1 Evaluation of the recommended lookup ("order id + phone")

**Confirmed: order id + phone is sufficient for the MVP.** Rationale:

- The serial `orders.id` is printed to the customer on the success screen; the phone is a secret-bearing knowledge factor that is **not** printed publicly.
- Order volume per store is small (COD market); per-store brute force is impractical.
- The combination of (a) exact phone match, (b) a dedicated rate limiter, and (c) an identical 404 for every failure makes enumeration and cross-store lookups impractical without a match.
- No session, token, or email is needed, which keeps the feature unauthenticated and cheap.

A separate **human-readable order number (e.g. `ORD-2026-00123`) is deferred** (Section 15, D-01). It is cosmetic, adds a column + generator over 24 existing orders, and does not change the lookup security model.

### 3.2 Public URL structure and endpoints

- **Tracking page (frontend):** `/track` - public, unauthenticated; two fields (رقم الطلب, رقم الهاتف). It is linked from the success screen and from the storefront footer if present.
- **Inline tracker:** the existing success screen embeds a live status widget (Section 3.7) that fetches the same endpoint automatically, because the phone was already collected during checkout.
- **Endpoint (recommended):** `POST /api/public/orders/status` with a JSON body. A POST (not GET) keeps the phone number out of access logs and out of any CDN/proxy caching (phone = PII; `Cache-Control: no-store`).
  - Alternative rejected: `GET /api/public/orders/:orderId/status?phone=...` - works, but leaks the phone into logs and query strings.

### 3.3 Request and response

Request body:

```
POST /api/public/orders/status
{
  "orderId": 123,
  "phone": "0550123456"
}
```

Validation: `orderId` positive integer; `phone` non-empty string, max 30 chars (format not enforced server-side; existing customer phones are free-form).

Response `200`:

```
{
  "orderId": 123,
  "status": "SHIPPED",
  "productName": "Robes Ali Express",
  "productImageUrl": "https://.../img.jpg",     // null allowed
  "quantity": 1,
  "unitPrice": 3500,                              // number
  "totalPrice": 3500,
  "deliveryFee": 600,
  "payableTotal": 4100,
  "deliveryWilayaName": "Alger",
  "deliveryCommuneName": "Bab Ezzouar",
  "deliveryMethod": "HOME",                       // HOME | OFFICE
  "createdAt": "2026-09-15T10:00:00.000Z",
  "confirmedAt": "2026-09-15T11:00:00.000Z",      // null unless set
  "shippedAt": "2026-09-15T12:00:00.000Z",        // null unless set
  "deliveredAt": null,
  "returnedAt": null,
  "updatedAt": "2026-09-15T12:00:00.000Z"
}
```

Notes:
- All money fields are returned as JS numbers (consistent with `formatOrder` reconstruction in `routes/orders.ts:33-47` for unitPrice/totalPrice and the public response `createPublicOrder`).
- The client renders the timeline and Arabic labels (Section 3.5) from `status` + the timestamp fields. No customer name, address, or store-internal fields are returned.

Error responses (all identical shape, Arabic):

| HTTP | Body | When |
|---|---|---|
| 400 | `{"error": "بيانات غير صحيحة"}` | invalid body (id not int, phone empty) |
| **404** | `{"error": "لم يتم العثور على الطلب"}` | never found **or** phone mismatch - identical in both cases |
| 429 | `{"error": "طلبات كثيرة، حاول لاحقاً"}` | rate limit |

The 404 must be byte-for-byte identical for wrong id, wrong phone, or a valid id belonging to another customer. No other response reveals whether the id exists.

### 3.4 Security model

| Concern | Decision |
|---|---|
| Authentication | Public / unauthenticated. |
| Authorization | Knowledge factor: exact equality `orders.phone == provided`, scoped to the order row. |
| Enumeration | Identical 404 for any failure; numeric-only id parse guard; no order data before phone match. |
| Rate limiting | **New dedicated limiter `trackLookupLimiter`**: 20 requests / 10 minutes per IP (reuse `rateLimit` from `rateLimiter.ts`, `xForwardedForHeader: false` to match existing). |
| Caching | `Cache-Control: no-store` on the response. |
| Logging | Phone not written to access logs (POST body; if any structured logging is added later, mask the phone). |
| PII exposure | Only the fields in 3.3 are returned; `customerName/Address` are never returned. |
| Store isolation | Lookup is by `orders.id` only - no `store_id` in the URL, so the caller never learns store memberships beyond the product already returned. |

DB impact: **none.** `orders.id` is the PK; timestamp columns used for the timeline already exist. Lookup query is single-row by PK + phone filter. No index needed.

### 3.5 Status values exposed to the customer and Arabic labels

Expose exactly the 8 internal statuses via a server-agnostic client mapping (keep the client the single owner of labels):

| Status | Arabic label (customer-facing) |
|---|---|
| NEW | تم استلام الطلب |
| PENDING_CONFIRMATION | بانتظار تأكيد التاجر |
| CONFIRMED | تم تأكيد الطلب |
| SHIPPED | تم الشحن |
| DELIVERED | تم التوصيل |
| RETURNED | تم إرجاع الطلب |
| CANCELLED | أُلغي الطلب |
| REJECTED | رُفض الطلب |

Do not add new statuses in this phase.

### 3.6 Status timeline presentation

- **Normal path:** a vertical RTL timeline with four steps - request received (createdAt) -> confirmed (confirmedAt) -> shipped (shippedAt) -> delivered (deliveredAt) - plus the delivery method and product/delivery summary cards.
- **Pending step:** the next not-yet-reached step renders as "in progress" with its label only.
- **Terminal path:** CANCELLED / REJECTED / RETURNED render as a single highlighted node with the Arabic label and timestamp = `returnedAt` if present, else `updatedAt` (CANCELLED/REJECTED have no dedicated timestamp columns today; see deferred D-03).
- The deliver-to-deliver path (SHIPPED -> DELIVERED) shows a "delivery in progress" step; no progress percentage: the system has no courier tracking integration (never invent it).

### 3.7 UI states (inline tracker + /track page)

| State | Behavior |
|---|---|
| Initial | Inline: auto-fetch with the just-placed order id + the collected phone. `/track`: two inputs (رقم الطلب, رقم الهاتف) prefilled with nothing. |
| Loading | Skeleton lines on the widget / disabled submit with "جارٍ البحث..." |
| Found | Timeline + summary card + a "هل لديك استفسار؟" WhatsApp link to the store `whatsappNumber` if set. |
| Not found (404) | Inline error "لم يتم العثور على الطلب، تأكد من رقم الطلب والهاتف" with the form preserved (id/phone not cleared). |
| Too many requests (429) | "طلبات كثيرة، حاول بعد قليل" - clear next-step text, preserve inputs, disable retry for the window. |
| Network/other error | Generic "تعذر الاتصال، حاول مرة أخرى" + retry button. |
| Success-screen nuance | The widget never blocks the success screen; it renders below the confirmation block. |

### 3.8 Acceptance criteria

1. A customer who placed an order via `POST /s/:slug/p/:slug/order` can see the order status on the success screen immediately (NEW).
2. The same customer can re-check later from `/track` using the printed order id and the checkout phone and sees progressed status (CONFIRMED/SHIPPED/DELIVERED) including timestamps.
3. Moving an order to RETURNED shows the return node with `returnedAt`; to CANCELLED/REJECTED shows the terminal node with `updatedAt`.
4. Wrong phone with a valid order id returns the identical 404 body/status as a nonexistent id.
5. More than 20 requests per 10 minutes from one IP returns 429 with the Arabic message.
6. Response headers include `Cache-Control: no-store`.
7. No customer name or address appears anywhere in the response or UI.
8. Existing merchant order management, audit logs, and the public ordering flow are unaffected (regression, Section 12.1-12.8).

### 3.9 Abuse considerations

- Brute force of phone for a known id: mitigated by exact match + 20/10min limiter. A targeted 20 tries per 10 min against a 9-10 digit Algerian phone is not practical.
- Id enumeration: harmless alone (404 identical); id + phone guessing is bounded by the limiter and by the local-market phone format.
- Scraping order data: no endpoint returns more than one order per successful pair; volume is bounded.
- Distributed attack via many IPs: out of scope for this phase (no auth/bot service); the limiter mirrors existing public-order protections.

---

## 4. P1-02 Publication Readiness Specification

Phase 8 findings: **M-02/X-11** (implicit publication), **V-…** public surfaces. Baseline facts:

- `landingPages.is_active` defaults `true` (`schema/landing-pages.ts:27`).
- Public reads filter only `is_active = true` (`public.ts:75-76`) and store visibility on `effectiveActiveStoreSql` (`public.ts:11`).
- Delivery zones are usable only when `is_active`, `office_fee != null`, and at least one enabled commune remains (`public.ts:110-133`); communes are disabled via `delivery_commune_settings.is_active`.
- Order creation requires a matching usable zone (`public.ts:205-239`), so a page reachable without a delivery configuration fails at checkout with `422 "طريقة التوصيل غير متاحة..."`.

### 4.1 Rule options evaluated

| Option | Meaning | Verdict |
|---|---|---|
| A | Store must have >=1 active zone (any fee state) | Weak: an active zone in `is_active` state can still be unusable (office_fee null, all communes disabled), reproducing the same checkout failure. Rejected. |
| B | Store-zone ready **AND** product data complete | Strongest. Product data (name, price>0, description) is already enforced at create/update, so the product leg adds little today but future-proofs. Adopted. |
| C | Explicit manual publish only (rely on `is_active`) | This is the current unsafe default; no change. Rejected alone. |
| D | Readiness gate + explicit manual publish | Adopted in the non-persisted variant below: read-only availability = readiness AND explicit `is_active`; `is_active` keeps its manual publish/opt-out meaning. |

**Recommendation: Rule D, implemented purely as derived predicates (no persistent flip of existing rows).**

Why non-persisted: it removes the "implicit live" bug at every read/order path with zero migration, self-heals when zones are later deleted or communes disabled, and keeps `is_active` meaningful (explicit merchant intent) rather than an unreliable cached readiness bit.

### 4.2 Derived predicates (single source of truth)

Store readiness (matches the existing usable-zone computation in `deliveryZonesForStore`, `public.ts:110-133`):

```
storeHasUsableDeliveryZone(storeId) =
  EXISTS delivery_zone z
    z.store_id = storeId
    AND z.is_active = true
    AND z.office_fee IS NOT NULL
    AND EXISTS (public communes of z.wilaya
                not disabled by delivery_commune_settings for storeId)
```

Product publicly-live (the effective read/order predicate):

```
productPubliclyLive(page) =
  store.is_active = true
  AND (store.subscription_expires_at IS NULL OR store.subscription_expires_at > now())
  AND storeHasUsableDeliveryZone(store.id)
  AND page.is_active = true
  AND page.product_name   (non-empty, guaranteed by DB NOT NULL)
  AND page.price > 0
  AND page.description    (non-empty, guaranteed by DB NOT NULL)
  AND page.slug           (present, guaranteed by DB NOT NULL)
```

The store-expiry leg reuses `effectiveActiveStoreSql` (`public.ts:11`) verbatim so public-store gating is unchanged. The three data-completeness checks are satisfied by existing DB constraints and are listed so future product data becomes stricter without breaking this predicate.

### 4.3 Publish / unpublish semantics

| Concept | Behavior |
|---|---|
| Publish | Merchant sets `is_active = true` on the product (the existing toggle). It takes effect **immediately only if** the store is ready; otherwise the product stays hidden and the UI explains why (4.6). |
| Unpublish | Merchant sets `is_active = false` - instant hide, as today. |
| Store becomes unready (zone deleted/disabled, office fee cleared, store expired) | Products **automatically stop being live** (derived) - this is the exact bug being fixed. No data write occurs. |
| Product data incomplete | Cannot happen via the app (create/update validation); if it ever exists in DB, it is not live. |

`is_active` therefore reads as "explicit show toggle"; effective liveliness = toggle AND readiness. This documents the previously ambiguous ownership of visibility (X-06/O-12 surfaces) without inventing a new control.

### 4.4 Migration impact

- **No data migration.** Existing rows keep their `is_active` values.
- **Behavioral migration:** any page currently `is_active` but not fully ready (store has no usable zone) silently leaves the public surface after deploy. This is the intended fix: those pages were already failing at checkout (`422`). The merchant is told why (4.6).
- **No new columns, no new enum values, no index changes.**

### 4.5 API behavior

| Surface | Change |
|---|---|
| `GET /api/public/s/:storeSlug` (+ `/p/:slug`, `/s/:storeSlug/p/:productSlug`) | Keep current filters; the product/store lists simply omit non-ready rows. Public 404 messages unchanged. |
| `POST /api/public/.../order` | Already guarded by store+product active; additionally reject when `!storeHasUsableDeliveryZone` with the existing market-true message (validation will fail on zone anyway). Explicit guard added for consistency and latency. |
| `GET /api/stores/:storeId/landing-pages` (merchant) | **Add two read-only fields per product:** `publiclyLive: boolean` and `readinessReason: string | null` (see 4.6 codes). No change to create/update payloads. |
| `GET /api/stores/:storeId` (store) | Add `deliveryReady: boolean` read-only. |

### 4.6 UI changes

- Product list card: green "منشور" vs amber "غير منشور" badge; when hidden due to readiness, show reason chip: "أضف ولاية توصيل واحدة على الأقل", "فعّل ولاية توصيل بالأسعار", "ممنوع التوصيل لهذه البلديات", "اشتراك المتجر منتهي" as applicable.
- Product form: hint text "سيظهر المنتج للعملاء بعد إضافة ولاية توصيل واحدة على الأقل وتفعيل عرض المتجر".
- No new screens; no change to the existing show/hide toggle interaction.

Readiness reason codes (internal, stable, Arabic in UI):

| Code | Arabic |
|---|---|
| `store_inactive` | المتجر غير مفعّل |
| `subscription_expired` | اشتراك المتجر منتهي |
| `no_usable_delivery_zone` | أضف ولاية توصيل واحدة على الأقل بأسعار توصيل |
| `product_unpublished` | المنتج مخفي يدوياً |
| `product_incomplete` | بيانات المنتج غير مكتملة |

### 4.7 Public behavior when not ready and error behavior

- Store with no usable zone: already 404 at store level (`public.ts:319`) - unchanged.
- Product hidden by readiness: 404 "المنتج غير متاح" for customers (unchanged shape).
- Order POST when store became unready mid-session: guard returns the existing 422 delivery-unavailable style message (do not invent a new customer-facing explanation beyond what the coding error already communicates).
- No public error texts about subscription/readiness are introduced: readiness reasons are merchant-console-only (this keeps customer copy identical and avoids leaking business terms).

### 4.8 Acceptance criteria

1. A store with zero zones (or all zones disabled/null fees): no product is reachable publicly, and merchant list shows `no_usable_delivery_zone` on every product.
2. Adding a usable zone makes previously-hidden products live with **no merchant action** if `is_active` is true (derived).
3. Removing/`is_active=false` on that zone makes products non-live again immediately.
4. A product with `is_active=false` stays hidden even when the store is ready.
5. Store with expired subscription: products not live (existing `effectiveActiveStoreSql`), merchant dashboard shows reason.
6. Order creation is rejected for a store that just lost readiness, with the existing delivery-unavailable 422 (or explicit guard 422), and no order row is inserted.
7. Multi-tenant: readiness of store A never affects store B products (per-store zone rows).
8. All public endpoints continue to serve the show-case store and legacy `/p/:slug` exactly as before (regression).

---

## 5. P1-03 Return After Delivery Specification

Phase 8 findings: **S-01/O-05**. Baseline state machine (`lib/transitions.ts`):

```
NEW -> [PENDING_CONFIRMATION, CANCELLED]
PENDING_CONFIRMATION -> [CONFIRMED, REJECTED]
CONFIRMED -> [SHIPPED, CANCELLED]
SHIPPED -> [DELIVERED, RETURNED]
DELIVERED -> []        (terminal)
RETURNED | CANCELLED | REJECTED -> []   (terminal)
```

`returnedAt` column already exists (`schema/orders.ts:49`); `summary` and `dailyReport` already compute `returned` count and `returnLoss = sum(return_fee)` for RETURNED (`orders.ts:102-105`, `reports.ts:59-62`).

### 5.1 Option evaluation

| Option | Design | Verdict |
|---|---|---|
| A | `DELIVERED -> RETURNED` (direct, single step) | **Adopted.** Smallest honest model for COD. The merchant is the operator; there is no customer self-service channel to intermediate a "request". |
| B | `DELIVERED -> RETURN_REQUESTED -> RETURNED` | Rejected for MVP: the intermediate state has no operator today (no customer UI, no notification), would require a new enum value + status wrangling, and DELIVERED counts as revenue until finalised - the states it would "fix" are already unobservable. |
| C | Keep DELIVERED terminal + separate return entity/event table | Rejected: adds a table and manual reconciliation for zero reporting gain; returning is a property of the order, not a new object. |

A return reason is captured at the transition (free text + quick categories) because COD returns without a reason are impossible to reconcile with couriers. This is recorded as a MISSING WORKFLOW fix within existing architecture, not a new feature.

### 5.2 State transition and timestamps

- Update transition map: `DELIVERED -> ["RETURNED"]`.
- `returnedAt` is set on the transition in the PATCH handler (`orders.ts:359` already sets it for RETURNED - reused unchanged).
- Reason is required when the target status is RETURNED.
- The transition is **one-way and final** (mirrors today's RETURNED semantics); revert requires provider/DB intervention, consistent with existing terminal states.

### 5.3 Return reason

- New **nullable** column `orders.return_reason text` (no default; no backfill).
- UI (merchant, mandatory before confirm): quick options + optional free text, e.g. "حجم غير مناسب", "لون مختلف", "منتج معيب", "غير قابل للتسليم", plus "سبب آخر" with a free-text field (max 200 chars).
- Stored verbatim on the order and copied into the audit note (5.6).

### 5.4 Reporting impact (explicit semantics)

Because reports group **by current status** (`orders.ts:88-108`, `reports.ts:15-29`), no SQL change is required:

| Metric | Before (DELIVERED) | After (RETURNED) |
|---|---|---|
| `delivered` count / `new` metrics | counts it | no longer counts |
| `revenue` = sum(total_price) | includes it | excludes it (automatic reversal) |
| `deliveryRevenue` | includes it | excludes it |
| `returnLoss` = sum(return_fee) | 0 | = that order's `return_fee` snapshot |
| `netRevenue` | contributes | contributes -return_fee |

COD means no money moved, so "reversal" is a notional revenue reclassification, which the summary already expresses.

**Documented limitation (do not fix now):** daily reports are computed from `orders.created_at` grouped by *current* status. A return performed days after the delivery day changes today's counts but not the historical day's row. Confirm this is the intended as-of-now semantic; enhancement (report by status-change date) is deferred (Section 15, D-05).

### 5.5 Revenue reversal behavior

- No money reversals exist (no payment fields anywhere). The only act is the status change + `return_reason`.
- The restore path for a mistaken return is provider-side intervention (as with every terminal state today).

### 5.6 Audit behavior

- Reuse `logAudit` STATUS_CHANGED path (`orders.ts:375-384`), with `note` = the return reason text.
- The audit query `GET /stores/:storeId/orders/:orderId/audit` returns the entry automatically - no change.

### 5.7 Merchant UI and customer impact

- Order detail in DELIVERED state shows a destructive action "إرجاع بعد التوصيل" (uses the existing `ConfirmActionDialog` pattern per V-06 - confirmation is mandatory).
- Dialog: reason quick-options + free text; confirm button disabled until a reason is chosen; on success navigate stays on the order with RETURNED badge (already supported) + returnedAt.
- Customer impact: none structural this phase. The P1-01 tracker automatically shows the return node with `returnedAt` once tracking ships (3.5-3.6). No customer notification channel exists (deferred).

### 5.8 Migration strategy

- Enum: no change (`RETURNED` already exists).
- One additive nullable column `return_reason` - safe online migration (PG `ADD COLUMN` default NULL), no backfill, no index (queried only per order row).
- Deploy order: schema first, then code that sets the reason. Old clients calling PATCH without reason: during the rollout the reason becomes required only on the server - guard must be tolerant (require reason only when `status == RETURNED`), so a stale client marking RETURNED with no reason is still accepted with `return_reason = NULL`; the UI enforces it. (Soft enforcement during transition; strict enforcement after one release cycle.)

### 5.9 Acceptance criteria

1. `DELIVERED` orders expose "إرجاع بعد التوصيل"; attempting it without a reason is blocked by the UI.
2. Transition DELIVERED->RETURNED succeeds, returns the updated order with `returnedAt` set and `return_reason` stored.
3. `summary` removes the order from `delivered`+`revenue`/`deliveryRevenue` and adds its `return_fee` to `returnLoss`; `netRevenue` recomputes.
4. `daily` + `weekly` reports reflect the return (current-status semantics, 5.4).
5. Audit log contains `STATUS_CHANGED` with from/to and the reason in `note`.
6. All other transitions remain exactly as today (unit regression on `isValidTransition`).
7. Returning is not offered on any status other than DELIVERED.
8. Multi-tenant: store A returns do not affect store B reports.

---

## 6. P1-04 Subscription Expiry Enforcement Specification

Phase 8 findings: **B-02/S-06/O-10**, provider console gap. Baseline facts:

- Public gate: `effectiveActiveStoreSql` = `is_active AND (subscription_expires_at IS NULL OR > now())` (`public.ts:11`, `provider.ts:106`).
- Merchant login checks only user + password + store existence (`auth.ts:18-34`) - **no** `is_active` / expiry check.
- Merchant store PATCH allows `is_active` write today (`UpdateStoreBody`, `api.ts:297-304`) - ambiguous self-toggle (X-06).
- Provider PATCH `/stores/:storeId` can set `subscriptionDays` (30/180/365) and `isActive` (`provider.ts:434-469`); renewal sets expiry from **now** (addSubscriptionDays).
- Layout banner derives state client-side: no expiry / <=7 days (amber) / expired (rose) (`Layout.tsx:130-179`).

### 6.1 Lifecycle states (server-derived)

| State | Definition (derived, single predicate) | Merchant login | Storefront | New orders | Existing-order ops | Catalog |
|---|---|---|---|---|---|---|
| **ACTIVE** | `is_active` AND (`expires` NULL OR future) AND daysLeft > 7 | allowed | live | allowed | full | full |
| **EXPIRING_SOON** | ACTIVE and `daysLeft <= 7` | allowed | live | allowed | full | full (+ banner CTA) |
| **EXPIRED** | `is_active` AND `expires <= now` | allowed (limited mode) | **off** | **blocked** | full | allowed |
| **SUSPENDED** | `is_active = false` (provider policy) | **blocked (403)** | off | blocked | behind login | behind login |
| `expires IS NULL` and `is_active` | Undefined/unlimited (plan "غير محددة", `Layout.tsx:124-128`) | allowed | live | allowed | full | full |

`daysLeft` uses the same ceil computation as `Layout.tsx:148` so the dashboard and the derivation never disagree.

### 6.2 The 12 questions answered

1. **Authentication after expiry:** login is allowed; the session is created normally AND a derived `storeStatus: "EXPIRED"` + `subscriptionExpiresAt` is returned by `GET /auth/me` and login payload. The dashboard switches to "limited mode" (6.3). Fully authenticated sessions still enforce per-request (6.4), so no stale-session hole.
2. **Dashboard behavior ("expired"):** top banner persists (rose, "اشتراك المتجر منتهي"), products hidden from storefront, "طلب جديد" entry disabled with an explanation, and a fixed renewal CTA (6.7). Everything else (orders lists, order detail, customers, delivery zones, reports, catalog, settings) remains usable.
3. **Order-management behavior:** status transitions on **existing** orders remain fully allowed (confirm/ship/deliver/return) - operations continuity (Section 2 principle 5). Editing customer fields on existing orders allowed. Creating orders blocked (manual order endpoint and public order endpoint both guard).
4. **Public storefront behavior:** unchanged gating via `effectiveActiveStoreSql` - store 404 / products invisible to customers. No renewal/lock page for customers.
5. **Provider behavior:** store list gains a computed `subscriptionStatus` (`active/expiringSoon/expired/suspended/noSubscription`) + expiry date column; existing PATCH `subscriptionDays` remains the renewal mechanism. Suspension uses the existing `isActive=false` toggle.
6. **Renewal CTA:** the existing subscription modal (`Layout.tsx:425-511`, manual plans + WhatsApp handoff) is reused; in EXPIRED limited mode the banner CTA is elevated and the modal explains current expiry date. No new payment channel (that is FUTURE_FEATURE).
7. **Manual renewal behavior:** provider `PATCH /stores/:storeId` with `subscriptionDays` sets `subscription_expires_at`. **Recommended anchor (needs owner confirmation, Section 15 D-06):** for an expired/suspended store, expiry = now + days (reactivation); for an active store, expiry = previous_expiry + days (retain remaining days), and `is_active=true` is set in both cases. Current code always uses "now + days"; this spec flags the improvement as a decision, not a silent change.
8. **Expired vs suspended (operational difference):**

| | EXPIRED | SUSPENDED |
|---|---|---|
| Cause | `expires_at <= now`, `is_active=true` | `is_active=false` (provider, policy) |
| Merchant login | Allowed (limited mode) | Blocked - `403 "المتجر موقوف مؤقتاً. تواصل معنا."` |
| Renew/policy intent | Commercial: renew via WhatsApp+provider | Trust: provider must unsuspend manually |
| Storefront | off | off |
| Data | read/write on existing orders + catalog | not accessible via app |

9. **Existing orders remain accessible:** yes, in both EXPIRED (full) and, after login, SUSPENDED (none - login blocked, which is the intent). Data is never deleted.
10. **Edit existing products after expiry:** allowed. Harmless: the storefront is already off, order history is price-snapshot-based, and allowing preparation shortens post-renewal downtime. (Recorded as a product decision, not an oversight.)
11. **New orders blocked:** yes. Blocked at the merchant manual-order endpoint (P2-01) and still blocked publicly (derived predicate). Server error, Arabic: `422 "اشتراك المتجر منتهي"` (merchant-facing) / public paths keep their existing 404s.
12. **Read-only mode:** no global read-only mode. The smallest safe model is *limited operational mode* for EXPIRED (as above) and *no login* for SUSPENDED. A strict read-only mode would strand in-flight COD deliveries and is explicitly not chosen.

### 6.3 Client behavior at a glance

- Login/`/auth/me` returns `storeStatus` + `subscriptionExpiresAt` + `isActive`.
- `Layout.tsx merchantSubscriptionInfo` is extended to highlight EXPIRED (existing rose tone) and SUSPENDED (distinct style) using server `storeStatus` rather than duplicating derivation.
- Active-route guard: routes that create orders (`/orders/new`, future P2-01) are disabled in EXPIRED; all other merchant routes load.

### 6.4 Server enforcement points

| Check | Where | Behavior |
|---|---|---|
| Login blocked when suspended | `auth.ts:post /login` | fetch store; `if (!store.is_active) 403 {error:"المتجر موقوف مؤقتاً. تواصل معنا."}` (no session). |
| Store status for consumers | `auth.ts /me` + login payload | add `storeStatus`, `subscriptionExpiresAt`, `isActive`. |
| Public storefront | `public.ts` `effectiveActiveStoreSql` (unchanged) | off when expired/suspended. |
| Merchant order create | `orders.ts:post /` (+ P2-01) | shared guard `storeAcceptsNewOrders(storeId)` = ACTIVE or EXPIRING_SOON; else `422 {error:"اشتراك المتجر منتهي"}`. |
| Readiness pedigree | P1-02 predicate (Section 4.2) | store leg reuses the same effective-active sql. |

Shared helper `storeLifecycleState(store)` returning the derived status is the single source of truth for login guards, /me, provider list, and readiness; placed in `apps/api-server/src/lib` (e.g. `storeLifecycle.ts`).

### 6.5 Auth toolkit for the acceptance run

1. Suspended store login -> 403, no session cookie created.
2. Active store login still returns user; login limiter unchanged (10/15min).
3. Expired store login -> 200 with `storeStatus:"EXPIRED"`; dashboard banner rose; storefront 404 for customers.
4. Expired store tries order create (merchant + manual UI) -> 422 Arabic message; no order row.
5. Expired store still advances an existing NEW order to CONFIRMED/SHIPPED/DELIVERED; returned orders work.
6. `subscriptionDays` PATCH renews: if active, expiry extended from previous expiry (per D-06-if-approved); if expired, from now; `isActive` true afterwards.
7. `PATCH /stores/:storeId` by the merchant no longer accepts `isActive` (see 6.6); provider toggle still works.
8. Regression: showcase store and provider summary counts unchanged semantics (`provider.ts:342-358`).

### 6.6 Scope note on the merchant `is_active` write

The merchant `PATCH /stores/:storeId` currently accepts `isActive` (`UpdateStoreBody`). Under the new model, `is_active = false` means "suspended (provider policy)" which must not be merchant-writable. **This spec proposes removing `isActive` from `UpdateStoreBody`** (documented as a product decision). The merchant's own storefront opt-out ("إخفاء المتجر مؤقتاً") is a separate concept deferred to D-07 so suspension semantics stay unambiguous.

### 6.7 Renewal CTA details

- EXPIRED banner: persistent rose banner with "انتهى اشتراك المتجر" + تاريخ and a "تجديد الاشتراك" button opening the existing modal.
- Modal in EXPIRED keeps the manual plan selector + WhatsApp CTA (existing copy); the plans list and prices unchanged.
- On renewal by provider, next `/me` reflects ACTIVE immediately; banner returns to normal.

---

## 7. P2-01 Merchant Manual Order Entry Specification

Phase 8 findings: **X-01/O-06/C-03**. Baseline: `POST /api/stores/:storeId/orders` exists and is fully functional (`orders.ts:160-277`) but has no UI (verified: no `createOrder` call in `apps/web`).

### 7.1 Order-source decision

**`order_source` column is not required now and is deferred (D-02).** Rationale:

- No report differentiates sales channel today (`summary`, `daily`, `weekly` group only by status).
- The create path is merchant-authenticated and the audit log already distinguishes it: add `note: "طلب يدوي عبر التاجر"` to the `ORDER_CREATED` audit entry at creation. Provenance survives with zero schema change.
- Revisit trigger: when management starts reporting by channel or when online-payments/C-partner funnels are introduced.

### 7.2 New Order screen

- **Entry:** "طلب جديد" button on the Orders page (enabled only when store is ACTIVE/EXPIRING_SOON under P1-04; tooltip explains why disabled).
- **Route:** merchant frontend, e.g. `/stores/:storeId/orders/new`.

Fields (mirror the public checkout contract; all data validated by the existing endpoint):

| Field | Control | Rules |
|---|---|---|
| المنتج | select from store products (any product owned by the store, regardless of page `is_active`, since the merchant is selling it) | required; shows name + price + image |
| المقاس | option group | required if product has sizes; values validated against `available_sizes` |
| اللون | option group | required if product has colors; validated against `available_colors` |
| الكمية | number | 1..10 (aligned with public path; see 7.4) |
| اسم العميل | text | required (2..100) |
| هاتف العميل | text | required (9..20) |
| الولاية | select (58) | required; resolved to a usable active zone for the store |
| البلدية | select | required; must belong to the wilaya; disabled public communes excluded |
| طريقة التوصيل | HOME/OFFICE | required; forced to OFFICE when product `transport_mode == "SHED_MED"` (mirror `orders.ts:187`) |
| العنوان | text | optional (max 500) - as the public flow |
| ملاحظة | text | optional (max 1000) |

### 7.3 Fees and pricing (no recomputation - snapshot rules)

- `unit_price` = product price; `total_price` = price * quantity; computed at creation exactly as `orders.ts:180-181`.
- `delivery_fee` = zone office fee (base) + home fee if HOME, exactly as current code; `return_fee` snapshot from zone.
- All stored on the order; never recomputed later (Section 2 principle 4).

### 7.4 Contract changes to `CreateOrderBody`

- `quantity: zod.number()` becomes `min(1).max(10)` (currently unbounded in the merchant contract while public caps 1..10 - this closes X-08).
- No other schema change.

### 7.5 Delivery validation

- The screen reuses the public selection UX (wilaya -> commune, disabled communes greyed) but reads zones from the **merchant delivery endpoints** (same zone rows).
- If the store has no usable zone for the chosen wilaya, the field blocks with the existing Arabic messages ("طريقة التوصيل غير متاحة لهذه الولاية" etc.) before submit.
- Store readiness guard: screen submit also requires P1-04 (store not expired) and P1-02 store-level predicate implicitly by requiring a usable zone.

### 7.6 Order status and audit

- Initial status `NEW` (same as public flow; the merchant confirms from the order list/detail - no new status invented).
- Audit: reuse existing `ORDER_CREATED` log with `note: "طلب يدوي عبر التاجر"` plus optional merchant notes.
- On success, navigate to the newly created order's detail page (existing route).

### 7.7 Validation and error behavior

| Case | Behavior |
|---|---|
| Missing product/customer fields | inline required errors (Arabic), existing form pattern |
| Variant mismatch (size/color) | block select; error text from server contract consistent with public flow |
| Quantity out of 1..10 | inline error "الكمية يجب أن تكون بين 1 و 10" |
| No usable zone for wilaya | block method/commune; delivery-unavailable messages |
| Store expired/suspended | button disabled + tooltip; server returns `422 "اشتراك المتجر منتهي"` if called directly |

### 7.8 Acceptance criteria

1. Merchant on ACTIVE store creates an order end-to-end (product, variants when present, customer, wilaya/commune/method) and lands on the order detail with `NEW`.
2. Fees/prices stored equal the zone/product snapshot; displayed `payableTotal` matches `totalPrice + deliveryFee`.
3. SHED_MED product forces OFFICE and shows a note.
4. Quantity 15 rejected client + server-side; quantity 10 accepted.
5. Audit entry contains "طلب يدوي عبر التاجر".
6. Button disabled and server-side guarded when store is EXPIRED/SUSPENDED.
7. Customer created/updated (upsert by store+phone) exactly as public flow (`orders.ts:232-249`).
8. No effect on public ordering endpoint; storefront unchanged.

---

## 8. Cross-System Impact Matrix

| Feature | DB | API | Frontend | Auth | Reports | Storage | Migration | Risk |
|---|---|---|---|---|---|---|---|---|
| **P1-01 Tracking** | None (PK + existing timestamps) | +1 public endpoint `POST /api/public/orders/status`; new limiter | +`/track` page; inline widget on success screen; status timeline + mapping | None (knowledge factor); rate-limited | None | None (images served as today) | None | Low: public surface; mitigated by identical-404 + limiter |
| **P1-02 Readiness** | None (derived predicates) | read models gain `publiclyLive`/`deliveryReady`/`readinessReason`; read/order guards add usable-zone leg | product-list badges + hints; no new screens | None | None | None | None (behavioral only) | Medium: changes what is visible; ships with merchant telemetry (reason chips) |
| **P1-03 Return** | +1 nullable `orders.return_reason` | transition map + PATCH handler + reason validation | OrderDetail destructive dialog (confirm pattern) | None | automatic (status grouping) - no SQL change | None | +1 additive column; no backfill | Low |
| **P1-04 Expiry** | None | login guard; `/auth/me` + login payload fields; order-create guard; provider store list field | banner/mode switch; disable new-order entry; renewal modal reuse | login blocks suspended; limited-mode on expired | none changed (provider summary reused) | None | None (all derived) | Medium: auth behavior change; rollout must keep active stores unaffected |
| **P2-01 Manual order** | None | contract: quantity 1..10; audit note | +`/orders/new` screen | requireAuth + store access; blocked when not ACTIVE/EXPIRING | none (new orders join existing status groups) | product images as today | None | Low-Medium: new merchant surface; reuses proven endpoint |

---

## 9. Data / API / UI Change Summary

### 9.1 Data changes (all additive / derived)

| Change | Type | Migration |
|---|---|---|
| `orders.return_reason` (text, nullable) | column | `ALTER TABLE orders ADD COLUMN return_reason text;` - low risk, no backfill |
| `storeLifecycleState` / `storeAcceptsNewOrders` predicates | server lib code | none |
| `storeHasUsableDeliveryZone` predicate | server lib code | none (re-expresses `public.ts:110-133`) |
| `subscriptionStatus` for provider/merchant consumers | server lib code | none |

Deferred (Section 15): `order_source`, order human-readable number, cancellation timestamps, renewal/notice tracking columns.

### 9.2 API changes

| Endpoint | Change |
|---|---|
| `POST /api/public/orders/status` | **new** (P1-01) |
| `GET /api/stores/:storeId/landing-pages` | adds `publiclyLive`, `readinessReason` (P1-02) |
| `GET /api/stores/:storeId` | adds `deliveryReady` (P1-02) |
| `POST /api/stores/:storeId/orders` | quantity 1..10; audit note; blocked when store not accepting orders (P1-04/P2-01) |
| `PATCH /api/stores/:storeId/orders/:orderId` | accepts `{status:"RETURNED", returnReason}`; enforces DELIVERED->RETURNED (P1-03) |
| `POST /api/auth/login`, `GET /api/auth/me` | add `storeStatus`, `subscriptionExpiresAt` (P1-04) |
| `PATCH /api/stores/:storeId` (merchant) | removes `isActive` write (P1-04, 6.6) |
| `PATCH /api/provider/stores/:storeId` | unchanged behavior + renewal anchor decision D-06 |

### 9.3 UI changes

| Screen | Change |
|---|---|
| Success screen | inline status tracker widget (P1-01) |
| New public `/track` page | lookup form + timeline (P1-01) |
| Product list (merchant) | live/readiness badges + reasons (P1-02) |
| Product form | readiness hint (P1-02) |
| Order detail (DELIVERED) | "إرجاع بعد التوصيل" confirm dialog + reason picker (P1-03) |
| Merchant shell | server-driven subscription banner; EXPIRED/SUSPENDED presentation (P1-04) |
| Orders page | "طلب جديد" button + `/orders/new` screen (P2-01) |

All new copy is Arabic, RTL, `ar-DZ-u-nu-latn` dates, per Section 2 principle 8.

---

## 10. Migration Considerations

1. **No destructive migrations.** Only `orders.return_reason` is added; everything else is derived logic.
2. **Deploy sequence for P1-03:** schema column -> server code (transition + reason) -> web UI. During the window, the server accepts RETURNED with `return_reason=NULL` (soft enforcement), letting old cached clients function; UI enforces from day one. Hard server-side requirement lands one release later.
3. **P1-02 is behavioral:** after deploy, non-ready pages silently leave the public surface. Communicate to the operator via the merchant readiness chips; no data loss (products keep `is_active`).
4. **P1-04 must not surprise active merchants:** enforcement only changes EXPIRED/SUSPENDED paths. The only behavioral risk is the merchant `isActive` write removal (6.6) - confirm no merchant relies on toggling the storefront off (needs product-owner awareness; see D-07).
5. **Rollback:** all changes are additive predicates or one nullable column; reverting means removing guards / reversing the transition map / dropping the column - all safe with no backfill.
6. **Environment parity:** predicates must be unit-tested against the local Drizzle schema (tests run against the dev DB, not production).

---

## 11. Acceptance Criteria (consolidated superset)

Each feature carries its own criteria in Sections 3-7. The consolidated gate before anything ships:

1. Public ordering works end-to-end (product -> order -> success) with zero new fields required from customers.
2. Public tracker: create -> confirm -> ship -> deliver all reflect on the customer timeline; wrong phone/id -> identical 404; rate limit -> 429.
3. Non-ready product unreachable publicly; ready product appears without merchant re-action; `is_active=false` stays hidden.
4. DELIVERED->RETURNED with reason updates order, summary, daily/weekly, and audit coherently (current-status semantics).
5. Expired store: login OK (limited mode), storefront off, merchant order create blocked (422 Arabic), existing order transitions still work; suspended store login -> 403.
6. Manual order creation matches public validation (variants, quantity 1..10, fees) and records an explicit audit note.
7. Regression suite from Section 12 passes for showcase store and a scratch tenant.
8. No hardcoded Arabic strings outside the established i18n pattern; RTL intact; dates `ar-DZ-u-nu-latn`.

---

## 12. Regression Requirements

Must continue working (unchanged behavior) after any combination of the five implementations:

| # | Area | Must keep working |
|---|---|---|
| 12.1 | Public ordering | `GET /s/:slug`, `GET /s/:slug/p/:product`, `POST …/order` incl. legacy `/p/:slug` flows; quantity 1..10; variant validation; fee calculation; customer upsert; ORDER_CREATED audit. |
| 12.2 | Showcase store | reseed + show-case store public pages and slug route (used as demo tenant). |
| 12.3 | Merchant auth | login/logout/me/password change; session cookie lifecycle (Phase 7.4 fix intact). |
| 12.4 | Provider provisioning | lead create/list/patch/convert; store create/reset-password; subscription renew patch; summary counts. |
| 12.5 | Delivery calculation | zone fees (office/home/return), commune disabling, SHED_MED -> OFFICE forcing, wilaya/commune validation. |
| 12.6 | Reports | orders summary, daily, weekly (status groups + revenue + delivery revenue + return loss + net). |
| 12.7 | Multi-tenant isolation | store A data never visible in store B queries (all new predicates scoped by store_id/order row). |
| 12.8 | Audit logs | every order action filtered by store+order; new return events logged; track/status reads do NOT write audit rows (read-only). |

---

## 13. Dependencies

| Feature | Depends on | Reason |
|---|---|---|
| P1-02 Readiness | (none) | Pure derived predicates + read-model fields; foundation for public correctness. |
| P1-04 Expiry | (none) | Auth guard + store lifecycle predicate; independent of delivery readiness. Shares the "derived store gate" pattern with P1-02 but adds no coupling. |
| P1-03 Return | P1-04 (soft) | Return transitions belong to order management that P1-04 keeps open for EXPIRED stores; the two touches cross in `orders.ts` but only via the shared store-lifecycle helper. |
| P1-01 Tracking | P1-02 (soft) | A live storefront is the main source of trackable orders, but the endpoint reads any order row regardless of readiness - no hard dependency. Cleanest user story comes after public surface is trustworthy. |
| P2-01 Manual order | P1-04 (hard) | The create endpoint must enforce `storeAcceptsNewOrders` (expired block); wiring the screen before the lifecycle guard exists would reintroduce the loop. Also touches quantity contract (X-08). |

Explanation of why this differs from Phase 8 ordering: (a) P1-02 and P1-04 are small, self-contained gates that reduce the blast radius of everything else (they define what is "public" and "allowed"); (b) P1-03 is cheap and improves report/state correctness before any new customer or capture surface ships; (c) P1-01 adds the largest new surface and is best built on top of stable status values (P1-03) and a trustworthy storefront (P1-02); (d) P2-01 is last because it is a capture UI whose correctness depends on the lifecycle guard and the now-bounded quantity contract.

---

## 14. Recommended Implementation Sequence

| Step | Feature | Rationale | Est. surface (spec only) |
|---|---|---|---|
| 1 | P1-02 Publication Readiness | Foundation: defines what "live" means; tiny (predicates + 3 read fields); removes a live defect cheaply. | predicates + list/read fields |
| 2 | P1-04 Expiry Enforcement | Foundation: defines who can operate and create; small auth surface; unblocks P2-01 and de-risks storefront trust. | lifecycle lib + auth guard + /me fields |
| 3 | P1-03 Return After Delivery | Small, contained; aligns state machine + reports before any consumer surface promotes the RETURNED node. | 1 column + transition + dialog |
| 4 | P1-01 Customer Tracking | Builds on stable statuses + trustworthy storefront; largest surface (public endpoint + tracker + /track). | endpoint + limiter + 2 UI areas |
| 5 | P2-01 Manual Order Entry | Depends on steps 1-2 (lifecycle guard, quantity contract); crowns the merchant workflow. | new screen + contract tighten |

Recommended to implement steps in order 1->5, landing each on `main` with its own tests (per 11.7) before the next starts.

---

## 15. Deferred Decisions (explicitly out of scope, recorded so future phases don't re-litigate)

| ID | Decision | Status / reason |
|---|---|---|
| D-01 | Human-readable order number (`ORD-xxxx`) | Deferred (P1-01 internal tracking uses numeric id). Revisit with marketing/receipt requirements. |
| D-02 | `orders.source` column (online vs manual vs partner) | Deferred; audit note covers provenance for now (P2-01 section 7.1). |
| D-03 | `cancelled_at` / `rejected_at` timestamp columns | Deferred; tracking shows `updatedAt` for terminal states until reporting-by-change-date lands. |
| D-04 | Two-step return request (Option B) | Rejected for COD MVP - no operator exists for the intermediate state; revisit only if a courier/self-service returns channel is introduced. |
| D-05 | Reports keyed by status-change date (vs creation date) | Documented limitation (5.4); requires audit or status-date table; FUTURE. |
| D-06 | Renewal expiry anchor (from previous expiry vs from now) | Recommended improvement; requires product-owner sign-off before implementing (6.2-Q7). |
| D-07 | Merchant-owned "storefront off" (vs provider suspension) | Requires decision on ownership of `is_active` (P1-04 6.6); separate future control if needed. |
| D-08 | Automated notifications (WhatsApp/SMS on status change) | Out of scope (no channel infrastructure); P1-01 makes status *viewable*, not *pushed*. |
| D-09 | Order tracking via WhatsApp/SMS/tracking code | FUTURE; requires digitization of courier handoff. |
| D-10 | Reject feasible-but-deleted UI (X-06 role scoping) | Ties into D-07; not required by any acceptance criterion this phase. |
| D-11 | Product readiness "image required" | Explicitly NOT added - would change create rules; only enforced-via-app completeness is used (P1-02 4.2). |

---

> **Phase 9 complete - product gap specification delivered. No code, schema, API, UI, data, or deployment was modified. Stopping here; implementation begins only on explicit direction.**