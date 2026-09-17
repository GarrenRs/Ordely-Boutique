# STATE-BUSINESS-RULES — Current Business Rules

> Living mirror of the domain rules that are **enforced in code** today. Binding decisions are recorded in `Docs/decisions/`. Code wins; update this file only within a change that alters the rule.

<!-- DOC-META
type: state
status: active
verified-as-of: 2026-09-17
related: Docs/current/STATE-LIFECYCLE.md, Docs/current/STATE-PRODUCT-MODEL.md, Docs/decisions/ADR-006-COD-MONEY-MODEL.md, Docs/PHASE-8-PRODUCT-AUDIT.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## 1. Money & pricing model (COD, ADR-006)

| Rule | Formula / detail |
|---|---|
| Unit price | `page.price` (must be finite and > 0, else 422) |
| Product total | `unit_price × quantity` |
| Quantity | integer, **1..10** enforced at creation (`422 "الكمية يجب أن تكون بين 1 و 10"`) |
| Delivery fee | `office_fee` for `OFFICE`; `office_fee + home_fee` for `HOME`; `HOME` unavailable if `home_fee = null`; `office_fee = null` → zone unusable |
| Transport mode | `transport_mode = SHED_MED` forces delivery method `OFFICE` regardless of input |
| Return fee | zone `return_fee` at creation |
| **Payable total** | `product_total + delivery_fee` (COD collected at delivery) |
| Return impact | `returned` count + `returnLoss = Σ return_fee`; `netRevenue = revenue − returnLoss` (reports already group by status; no report changes needed in 10.3) |
| Storage | DB `numeric(10,2)`; API maps via `Number()`; null zone fees stay null for public zones |

## 2. Order creation rules (all entry points)

Inputs validated identically via `createOrderCore`:

1. Body zod validation (400).
2. Quantity integer 1..10 (422).
3. Store has ≥1 usable delivery zone (422 "الولاية غير متاحة للتوصيل حاليا").
4. Address required when `HOME` **and** `requireAddressForHome` (manual orders only) (422 "العنوان مطلوب عند التوصيل إلى المنزل").
5. Variant selection (size/color) must exist in page `available_sizes`/`available_colors` if provided (422).
6. Delivery zone must belong to the page's store and be active; fee availability by method (422).
7. Commune must belong to the wilaya and be enabled in `delivery_commune_settings` (422).
8. Customer upsert by `(store, phone)`; name and `city` (= delivery-zone wilaya, derived in `createOrderCore`) refreshed for existing customers in **every** flow — the manual/legacy input has no `customerCity`; order row inserted with `status=NEW`; audit `ORDER_CREATED`.

## 3. Lifecycle enforcement (ADR-001, ADR-002)

- Merchant login suspended → 403 (no session). Expired → restricted: no new orders (422), existing orders fully operable.
- New order guards: public (422 readiness), merchant manual entry (422 expired/suspended). See `STATE-LIFECYCLE §2`.
- `is_active` mutation is **provider-only**: removed from merchant `UpdateStoreBody`; provider `PATCH` may set it; renewal auto-reactivates.

## 4. Tracking (ADR-004)

- Public lookup factor = **`orderId` + `customerPhone`** (knowledge factor), unauthenticated, `trackOrderLimiter` 20/10min, response `Cache-Control: no-store`.
- Returns: `orderId, status, createdAt, updatedAt, returnedAt, deliveredAt`. 404 on no match.
- Status is *viewable*, not *pushed* (no WhatsApp/SMS automation — D-08/D-09 deferred).

## 5. Manual order entry (P2-01, ADR-005)

- Merchant-only `POST /stores/:storeId/orders`; guards expired/suspended (422); product must belong to the store (404).
- Runs the same core validation (incl. `requireAddressForHome=true`).
- Audit note: `"طلب يدوي عبر التاجر"` (provenance marker). **No `order_source` column** by decision — provenance lives in audit notes.

## 6. Publication & catalog rules

- Page publicly live only when store ready (DERIVED — no persisted flag). See `STATE-LIFECYCLE §3`.
- Storefront filters: active categories + `is_active` pages that are data-complete; a ready store with no usable zone returns store with `products: []`.
- Legacy `/p/:slug`: 404 if none; **409 "رابط المنتج يحتاج رابط المتجر"** on slug ambiguity (>1 matching active page across ready stores).
- Related products on product page: same-category first, capped at 6.

## 7. Reporting semantics

- `/orders/summary`: counts by status + `returnLoss` + `netRevenue` (return-fee adjusted).
- `/reports/daily` & `/reports/weekly`: include a `RETURNED` category. Provider dashboard summary includes today counts.
- Reports key by creation dates (D-05 documents the by-status-change-date keyed variant as FUTURE). Reports are display/enforcement-neutral for store status (see `STATE-SYSTEM §7`).

## 8. Security & integrity rules

- bcrypt cost 12; sessions in Postgres; cookie `order_os.sid`; no secrets in docs/repo.
- Rate limits: login 10/15min, public order 20/60min, tracking 20/10min.
- Variant/fee/zone input is always re-validated server-side (client is not trusted).
- All order writes go through one core (public/legacy/manual) to keep rules in one place.