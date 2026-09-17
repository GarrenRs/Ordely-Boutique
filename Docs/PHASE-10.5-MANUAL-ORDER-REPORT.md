# Phase 10.5 — Manual Order Entry (P2-01) Report

<!-- DOC-META
type: phase-report
status: historical
verified-as-of: 2026-09-17
related: Docs/INDEX.md
notes: Closure stamp. Immutable historical record - not current truth. See Docs/current/ and Docs/decisions/ for the living model.
-->

## 1. Root cause

The merchant had no way to log manually received COD orders into the system. The only order entry path was the public storefront flow (visitor-facing). This forced merchants to track off-platform orders separately, causing data gaps and inconsistent reporting.

## 2. Scope

**Implemented:**
- New order creation endpoint: `POST /api/stores/:storeId/orders` (upgraded) + alias `POST /api/stores/:storeId/orders/manual`
- Shared core creation library used by both public and manual flows (zero duplication)
- Zod validation: customer name (2-100), phone (9-20), landing page valid + owned by store, quantity (1-10 integer), wilaya valid, commune valid + belongs to wilaya, delivery method HOME/OFFICE, HOME requires address, OFFICE optional, size/color validated against product options
- Server-side product ownership check: store A cannot use store B's product
- Customer find-or-create by (storeId, phone) with name update on reuse
- Delivery zone/commune enforcement, HOME address rule, SHED_MED transport override
- Store lifecycle guard: EXPIRED → 422, SUSPENDED → reject (existing auth behavior)
- Audit note `طلب يدوي عبر التاجر` for all manual orders (ORDER_CREATED action)
- UI: `/orders/new` page with product/delivery/customer form, redirect to Order Detail on success
- "طلب جديد" action button on orders list header
- Full Zod/OpenAPI/TypeScript/React-client contract updates
- 20-case unit test suite + 40-assertion HTTP live smoke

**Not in scope (preserved, not modified):**
- Existing order lifecycle and status transition matrix (unchanged)
- Public storefront order flow (refactored to shared core; all messages/statuses identical)
- P1-01 through P1-04 features (tracking, confirmations, returns, lifecycle)
- `order_source` column (not introduced)
- No commit made

## 3. UI

**Route:** `/orders/new` (registered BEFORE `/orders/:orderId` in App.tsx)

**Page components:**
- `apps/web/src/pages/NewOrder.tsx` — full form with 3 card sections:
  - العميل: name input, phone input (dir=ltr)
  - المنتج: product select (all store products, unpublished marked), size/color selects (conditional on available options), quantity (1-10), price summary card
  - التوصيل: wilaya select (usable zones only), commune select (enabled after wilaya, filtered by isActive), HOME/OFFICE toggle (HOME disabled when transportMode=SHED_MED or no homeFee), address (shown only for HOME), notes textarea
- Redirect to `/orders/{id}` on success
- Error toast with Arabic messages from server

**Orders list:** "طلب جديد" button added to header (Plus icon, primary style matching LandingPagesList pattern)

## 4. API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/stores/:storeId/orders` | Create manual order (primary) |
| POST | `/api/stores/:storeId/orders/manual` | Create manual order (alias) |

Both use the same `executeManualOrder(storeId, rawBody, client)` function.

**Response 201:**
```json
{
  "id": 123,
  "productName": "...",
  "unitPrice": 1200,
  "totalPrice": 1200,
  "deliveryFee": 500,
  "returnFee": 200,
  "payableTotal": 1700,
  "status": "NEW",
  "customerName": "...",
  "customerPhone": "...",
  "transportMode": "DELIVERY_COMPANY",
  "landingPageName": "...",
  "selectedSize": "M",
  "selectedColor": "أسود"
}
```

**Error responses:** 400 (validation), 404 (store/product not found), 422 (lifecycle, zone, commune, address rule)

## 5. Validation

**Server-side (Zod + core pipeline):**
- `ManualOrderBody`: landingPageId (int, positive), customerName (2-100), customerPhone (9-20), customerAddress (max 500, optional), deliveryZoneId (int, positive), deliveryCommuneName (1-100), deliveryMethod (HOME|OFFICE), selectedSize/Color (max 50, optional), quantity (1-10 integer, default 1), notes (max 1000, optional)
- `customerCity` is NOT accepted by `ManualOrderBody` (stripped by zod.safeParse) — differentiates from legacy CreateOrderBody

**Core pipeline checks (in order):**
1. Quantity must be integer 1-10 → "الكمية يجب أن تكون بين 1 و 10"
2. Store must have at least one usable delivery zone → "الولاية غير متاحة للتوصيل حاليا"
3. HOME method requires non-empty address → "العنوان مطلوب عند التوصيل إلى المنزل"
4. Size/color must match product options if available
5. Zone lookup by (id, storeId, isActive) → "الولاية غير متاحة للتوصيل حاليا"
6. Delivery fees must not be null → "طريقة التوصيل غير متاحة لهذه الولاية"
7. Commune must exist in wilaya → "البلدية لا تتبع الولاية المختارة"
8. Commune must not be disabled → "البلدية غير متاحة للتوصيل حاليا"
9. Product price must be positive → "المنتج غير صالح للإضافة"

## 6. Customer handling

Reuses the exact same find-or-create logic as the public flow:
- Query `customers` by (storeId, phone)
- If exists: update name only (city is NOT overwritten for manual orders since there's no wilaya input)
- If new: insert with city = wilaya name from the delivery zone
- Customer is store-scoped: same phone number on different stores creates separate customer rows

## 7. Delivery handling

- Usable delivery zones: `isActive=true AND officeFee IS NOT NULL`
- SHED_MED transport mode: forces effective delivery method to OFFICE (no home delivery)
- HOME delivery: address is required; `deliveryFee = officeFee + homeFee`
- OFFICE delivery: address is optional; `deliveryFee = officeFee`
- `returnFee` always taken from the delivery zone

## 8. Lifecycle integration

| Store status | Behavior |
|---|---|
| ACTIVE | Order created successfully |
| EXPIRING_SOON (< 7 days) | Order created successfully |
| EXPIRED | 422: "اشتراك المتجر منتهي" |
| SUSPENDED (isActive=false) | Login blocked (existing behavior): 403: "المتجر موقوف مؤقتاً" |

## 9. Audit

- Action: `ORDER_CREATED`
- toStatus: `NEW`
- note: `طلب يدوي عبر التاجر` (constant exported as `MANUAL_ORDER_AUDIT_NOTE`)
- Log written via the same `logAudit` function used by the public flow
- Audit visible via `GET /api/stores/:storeId/orders/:orderId/audit`

## 10. Reports

- Manual orders appear in `GET /api/stores/:storeId/reports/summary` automatically
- Status groupings include manual orders in the NEW bucket
- No report schema changes required — all aggregations run over the shared `orders` table

## 11. Contracts

**Zod (api-zod):**
- `CreateManualOrderParams` (store id)
- `ManualOrderBody` (full manual order payload)

**OpenAPI:**
- `POST /stores/{storeId}/orders` → `ManualOrderInput` requestBody
- `POST /stores/{storeId}/orders/manual` → `ManualOrderInput` requestBody
- `ManualOrderInput` component schema added

**TypeScript types:**
- `lib/api-zod/src/generated/types/manualOrderInput.ts`

**React client:**
- `ManualOrderInput` interface in api.schemas.ts
- `useCreateManualOrder` hook + `createManualOrder` + `getCreateManualOrderMutationOptions`

## 12. Tests

`apps/api-server/src/tests/manual-order.test.ts` — **20 scenarios, 73 assertions**

| # | Scenario |
|---|----------|
| 1 | Quantity bounds (1 and 10 pass; 0, 11, -1, 1.5 rejected) |
| 2 | Required fields enforced, default quantity=1, missing phone/method rejected |
| 3 | ManualOrderBody strips customerCity; CreateOrderBody legacy still accepts it |
| 4 | Full success flow (201, status=NEW, correct prices/fees/snapshots) |
| 5 | Default quantity saves as 1; quantity=10 doubles total |
| 6 | Variant validation: missing size→422, invalid size→422, bare product→success |
| 7 | Customer reuse: same phone→same customerId, name updated, no duplicate row |
| 8 | New customer: new phone→new row, city=wilaya name |
| 9 | Cross-store product→404; nonexistent store→404 |
| 10 | Customer isolation: B's customer not reused by A |
| 11 | Zone isolation: B's zone rejected for A→422 |
| 12 | Invalid commune (not in wilaya)→422 |
| 13 | Disabled commune setting→422 |
| 14 | Invalid delivery method enum→400 |
| 15 | HOME without address→422; HOME with address→success, fee=office+home |
| 16 | OFFICE without address→success, fee=office only |
| 17 | EXPIRED subscription→422; EXPIRING_SOON allowed |
| 18 | SUSPENDED store→422 |
| 19 | Audit log: ORDER_CREATED + "طلب يدوي عبر التاجر" |
| 20 | Reports include order; GetOrderResponse contract accepts manual order |

## 13. HTTP smoke

Live smoke against `http://127.0.0.1:8080` — **12 scenarios, 40 assertions**:

Live against `http://127.0.0.1:8080`:
1. DB seed (stores A/expired/suspended, pages, zones, users)
2. Merchant login → 200 + session cookie
3. POST `/orders/manual` → 201 (status=NEW, fees correct)
4. GET `/orders/:id` → 200 (full order details)
5. Lifecycle: NEW→PENDING_CONFIRMATION→CONFIRMED→SHIPPED→DELIVERED→RETURNED with reason
6. Audit: ORDER_CREATED with "طلب يدوي عبر التاجر"
7. Cross-store product → 404
8. Invalid commune → 422
9. HOME without address → 422
10. Expired store login + create → 422
11. Suspended store login → 403
12. Sandbox cleanup verified (0 stores with `manual-smoke%` slug)

## 14. Regression

| Suite | Result |
|---|---|
| test:manual-order | 73 assertions pass |
| test:tracking | 23 assertions pass |
| test:return | 58 assertions pass |
| test:lifecycle | 47 assertions pass |
| test:readiness | 30 assertions pass |
| npm run typecheck | clean (libs + apps) |
| npm run build | clean (api + web) |
| Manual HTTP smoke | 40 assertions pass |
| Web UI /orders/new served | 200 |

## 15. DB integrity

| Column | Baseline (after 10.4) | After 10.5 | Status |
|--------|----------------------|------------|--------|
| stores | 3 | 3 | ✅ Identical |
| orders | 24 | 24 | ✅ Identical |
| customers | 15 | 15 | ✅ Identical |
| landing_pages | 8 | 8 | ✅ Identical |
| delivery_zones | 58 | 58 | ✅ Identical |
| audit_logs | 74 | 74 | ✅ Identical |
| sandbox_stores | 0 | 0 | ✅ Identical |
| orders_total | 24 | 24 | ✅ Identical |

Smoke residue: 2 (pre-existing orders #42/#43, phone 0555000999, created 2026-09-15 — part of baseline, not smoke artifacts)

## 16. Remaining risks

1. **`order_source` not introduced:** Manual vs public orders are not distinguished in the orders table. If source tracking becomes needed later (e.g., analytics, returns eligibility), a `order_source ENUM('PUBLIC','MANUAL')` column with migration will be required. The audit note `طلب يدوي عبر التاجر` provides traceability in the interim.

2. **Rate limiting:** Login rate limit (10/15min) can be hit by repeated smoke runs against the same server instance. Mitigated by in-memory store reset on server restart. No impact on production since merchants log in once per session.

3. **No customerCity overwrite:** When a customer already exists and their name is updated via a manual order, the `city` field is not updated (unlike the public flow which sets city = wilaya). This is intentional — the manual flow has no city/wilaya input field. If a customer places orders through both channels, their city may reflect the public flow's wilaya.

4. **Variant check ordering:** The variant validation fires before the address rule, meaning a request with invalid variant AND missing HOME address will return the variant error first. This is acceptable and consistent with the public flow.

## 17. Explicit confirmation of excluded features

The following features were explicitly requested to remain **unchanged and excluded** from Phase 10.5 scope:

- P1-01: Customer order tracking (/track page) — ✅ Unchanged
- P1-02: Order confirmations panel — ✅ Unchanged
- P1-03: Order return with mandatory reason — ✅ Unchanged
- P1-04: Subscription lifecycle management — ✅ Unchanged
- P2-02 through P2-14: Payment, stock management, CRM, notifications, custom domains, multi-role, store deletion, cart — ✅ Not touched
- Order lifecycle/status transition matrix — ✅ Unchanged
- `order_source` column — ✅ Not introduced (no commit, no migration)
