# PHYSIOLOGICAL-SYSTEM-AND-OPPORTUNITY-AUDIT — Ordely Boutique

<!-- DOC-META
type: study
status: active
verified-as-of: 2026-09-18
commit: 6f40257 ("PHASING-1" local `main` == `origin/main`)
language: en
notes: Evidence-grounded analysis of Ordely Boutique as a living system — every operational domain as a connected lifecycle (actor -> action -> state -> entity -> API -> UI -> evidence -> closure). Sources: repository code at the verified commit, the live DB schema (`order_os`), api-zod/openapi contracts, docs under `Docs/`, and phase reports. This study is derived evidence; it is NOT a spec, ADR, or change list. No code, schema, or app changes accompany it. Final normalization pass: single verdict taxonomy, table-derived counts, opportunity model in three layers, decision surface.
-->

---

## 0. Executive summary

Ordely Boutique is a **multi-tenant SaaS platform with provider-managed merchant stores**. Each merchant operates a boutique through a session-scoped merchant console, guarded by `requireStoreAccess`, and each store is an isolated tenant (per-store users, unique `(store_id, phone)` customers, per-store slugs). A provider (Ordely admin) owns store state (`is_active`) and subscription lifecycles across all tenants. The core commercial loop is **COD (cash-on-delivery) commerce**: a public storefront of per-product landing pages, customer self-order intake by phone identity, merchant-managed order lifecycles (confirm → ship → deliver / return), WhatsApp-first confirmations, a delivery zone/commune fee engine, customer deduplication by phone, and daily/weekly money reports.

### 0.1 Loop health — derived directly from the domain verdict table (Part E, §E.4)

The organization has **14 analyzed operational domains**, each assigned exactly **one primary verdict** from the taxonomy `CLOSED / PARTIAL / BROKEN-LEAKY / EXTERNALIZED-BY-DESIGN / DEFERRED-BY-DESIGN / OPPORTUNITY`:

| Verdict | Domains | Count |
|---|---|---|
| CLOSED | Identity & sessions; Catalog; Delivery network; Manual order intake; Public tracking; Customer base; Provider console; Media uploads | **8** |
| EXTERNALIZED-BY-DESIGN | Store & subscription lifecycle; Order operations machine | **2** |
| BROKEN-LEAKY | Public storefront intake; Reports & money visibility; Merchant-lead intake | **3** |
| PARTIAL | Evidence layer | **1** |
| DEFERRED-BY-DESIGN (primary) | — (deferred items exist only as observations) | **0** |
| OPPORTUNITY (primary) | — (opportunities are in Part I, not verdicts) | **0** |
| **Total** | | **14** |

The same distribution holds for the end-to-end task inventory (Part M, table T3, defined 1:1 with the domains): 14 tasks → 8 fully closed, 1 partial, 3 broken/leaky, 2 externalized-by-design, 0 deferred-by-design. All counts below are reconstructable row-by-row from the named tables.

### 0.2 Current-system problems vs. design-limitation separation

To keep defect counts honest, findings are classified (Part F) as:

- **A — current system problems** (verified): merchant has no reliable new-order notification; COD settlement visibility is incomplete and reports are anchored to *creation date* (a July delivery reports under June); public lead intake lacks rate limiting/dedup; audit coverage misses order/customer contact edits and provider lifecycle ops; the WhatsApp confirmation message uses the wrong money field (`totalPrice` instead of `payableTotal`).
- **B/C/D/E — design and future layers**: renewal via WhatsApp/provider (C — externalized-by-design); customer relationship loop and broadcast (D — deferred); pending-order SLA, tracking PIN, social links, and lightweight stock visibility (E — opportunity candidates). None of these inflate the defect counts.

### 0.3 Immediate decision signal

- **Fix Now (Layer A):** 5 low-cost corrections — confirmation message money field; audit rows on contact/order edits; lead-intake rate limit + dedup; report anchoring on the event date; de-duplication of `formatOrder` / `effectiveActiveStoreSql` / readiness helpers.
- **Investigate Next (Layer B):** 8 opportunity candidates led by merchant new-order notification and store identity/social links.
- **Future Capability (Layer C):** 7 high-pain / high-complexity areas (inventory, payments, CRM, messaging, billing, customer intelligence, marketplace) — none assumed to be built.
- **Do Not Touch Yet:** binding decisions — order state machine (ADR-003), `is_active` ownership (ADR-002), renewal anchor (ADR-001), COD money model (ADR-006), orderId+phone tracking paradigm (ADR-004), no `order_source` (ADR-005).

---

## Part A — Purpose, method, and grounding

- **Purpose.** Analyze Ordely as a *connected* functional system (not a feature list): for every operational domain answer — goal, actors, preconditions, actions, state-before/after, entity, API, UI, evidence recorded, next step, failure modes, recovery, clean ending, external/manual workarounds, and exactly one verdict from the §taxonomy.
- **Method.** Read-only audit at commit `6f40257` (== `origin/main`): repository code, `lib/db` schema, api-zod/openapi contracts, `Docs/current/*`, `Docs/decisions/*`, `Docs/specs/*`, `Docs/runbooks/*`, and `PHASE-*.md` reports. Every factual claim below cites its anchor. Absences are reported as absences, not inferred features.
- **What this is NOT.** Not a spec (spec = `PHASE-9-PRODUCT-GAP-SPECIFICATION.md`, now *implemented*), not a decision record (`Docs/decisions/ADR-*.md`), not a phase closure, not a roadmap.
- **Source-of-truth hierarchy** (from `Docs/INDEX.md §3`): code + live DB win; `Docs/current/*` mirror them under `verified-as-of`; ADRs bind interpretation; phase reports are evidence only.

### Verdict taxonomy (single primary category per domain)

| Category | Definition (as used in this study) |
|---|---|
| **CLOSED** | The current system completes the intended operational task with a stable outcome and no material internal dead-end. |
| **PARTIAL** | The core workflow works, but one or more important operational capabilities remain incomplete. |
| **BROKEN-LEAKY** | The workflow contains a material defect, uncontrolled leak, misleading result, unsafe gap, or operational dead-end that should be considered a current system problem. |
| **EXTERNALIZED-BY-DESIGN** | The workflow intentionally leaves the system and completes through a human or external channel according to a documented product decision. |
| **DEFERRED-BY-DESIGN** | The capability is intentionally not implemented according to an existing product/architecture decision or deferred scope. |
| **OPPORTUNITY** | The current system works, but there is a credible improvement opportunity whose value should be evaluated separately. |

Rules applied: no BROKEN label merely because a future feature is absent; an intentionally external workflow is not called broken unless the current design decision itself is demonstrated to be failing.

---

## Part B — The organism at a glance

### B.1 Actors and planes

| Actor | Plane | Identity proof | Authority |
|---|---|---|---|
| Customer (end buyer) | Public storefront | Phone number (self-declared, no OTP) | Create orders; track by orderId+phone |
| Merchant operator (per-store user) | Merchant SPA | Email+password session | Manage own store only (`requireStoreAccess`) |
| Provider (Ordely admin) | Provider SPA | `PROVIDER_EMAIL` + `PROVIDER_PASSWORD_HASH` session | All stores, subscription lifecycle, `is_active`, leads |
| Frontends (SPAs) | Web | Signed httpOnly cookie | Call their own plane's APIs |
| Delivery/cash (external) | Human/external COD | n/a | Cash movement declared by ADR-006 |

Planes (organ systems): **session/identity** · **store & subscription** · **catalog** · **delivery network** · **order intake (public + manual)** · **order operations machine** · **customer base** · **tracking** · **reports/money** · **provider console** · **lead intake** · **media storage** · **evidence (audit/health/tests)**.

### B.2 The core instinct: one COD money loop

1. Customer (or merchant) creates an order against a published landing page.
2. Merchant confirms by WhatsApp (human copy/paste) → pending→confirmed.
3. Delivery happens externally (COD). Merchant ships → delivered, or returns.
4. Money visibility: aggregate daily/weekly reports only; no per-order settlement ledger.

Terminal truth lives in `audit_logs` for every order event. Verdict per sub-loop in Part E.

---

## Part C — Data organs (entities)

All per `lib/db/src/schema/*` under `order_os` (11 tables):

| Entity | Role | Key invariants (verified) |
|---|---|---|
| `users` | merchant login | email lowercased+unique; session refused while store SUSPENDED |
| `stores` | tenant root (multi-tenant) | unique `slug`; `is_active` provider-owned (ADR-002); subscription fields |
| `provider_users` | Ordely admin | `PROVIDER_EMAIL` invariant |
| `product_categories` | product grouping | unique `(store_id, slug)`; one partial-unique default per store (not deletable/renamable) |
| `landing_pages` | the product | unique `(store_id, slug)`; `whatsapp_number` optional per page; delete blocked while orders exist (409) |
| `delivery_zones` | fee + commune set | ≥1 enabled commune per usable zone; `office_fee` null semantically disables zone |
| `orders` | the lifecycle unit | 8-value `order_status` enum; `delivery_method` HOME/OFFICE; quantity 1..10; price snapshot at creation |
| `customers` | dedup identity | unique `(store_id, phone)` — one customer per phone per store |
| `audit_logs` | evidence | `order_created` / `status_changed` entries; write-failure silent |
| `merchant_leads` | acquisition inbox | 5-value `merchant_lead_status`; publicly writable |
| `delivery_commune_settings` (per zone) | commune toggles | enabled communes feed order intake |

Enums: `order_status` = NEW, PENDING_CONFIRMATION, CONFIRMED, SHIPPED, DELIVERED, RETURNED, CANCELLED, REJECTED; `delivery_method` = HOME, OFFICE; `merchant_lead_status` = NEW, CONTACTED, QUALIFIED, REJECTED, CONVERTED.

---

## Part D — Domain lifecycle matrices (14 domains)

### D.1 Domain — Identity, sessions, credentials

| Item | Answer (with evidence) |
|---|---|
| **Goal** | One session per actor; bind every request to the correct tenant/plane. |
| **Actors** | Merchant (`users`), Provider (`provider_users`). |
| **Preconditions** | Store exists; store not SUSPENDED for merchant login; provider env configured (`PROVIDER_EMAIL` + `PROVIDER_PASSWORD_HASH`). |
| **Actions** | Merchant: `POST /api/auth/login` — email lowercased (`eq(usersTable.email, email.toLowerCase().trim())`, `auth.ts:19`), bcrypt compare, 403 `المتجر موقوف مؤقتاً. تواصل معنا.` if suspended → session (`userId`/`storeId`/`email`/`storeName`). Provider: `POST /api/provider/login` (same `loginLimiter`). Merchant self-change `PATCH /api/auth/password` (current required; min 6). Provider resets merchant passwords (min 8, returned once). |
| **State before → after** | Anonymous → signed httpOnly cookie (7-day window; production store = Postgres `connectPgSimple`). `GET /api/auth/me` returns profile + `storeStatus`/`daysLeft` → drives UI banner states. Middleware: 401 `غير مصرح` / 403 `ممنوع`. |
| **Entities** | `users`, `provider_users`, session store. |
| **API** | `/api/auth/login`, `/api/auth/me`, `/api/auth/password`, `/api/provider/login`. |
| **UI** | `Login`, `ProviderLogin`; `AuthContext` bootstraps `/me`. |
| **Evidence** | No auth events in `audit_logs` (audit is order-scoped). |
| **Next step** | Each subsequent API call within the session. |
| **Failure modes** | Bad creds 401; suspended store 403 (no session); `loginLimiter` 10/15 min. |
| **Recovery** | Re-login; password change; provider reset. No email-verification / OTP / self-serve reset (deferred). |
| **Clean ending** | Logout clears session + cookie. |
| **Manual workarounds** | Provider communicates a reset password externally (no email/SMS). |
| **Verdict** | **CLOSED.** Observations: no merchant self-reset (D — deferred); phone never verified anywhere (OPPORTUNITY candidate). |

### D.2 Domain — Store & subscription lifecycle

| Item | Answer |
|---|---|
| **Goal** | A store must be ACTIVE-and-paid to accept new orders while degrading gracefully to EXPIRED for read/manage-only. |
| **Actors** | Provider (owns `is_active`, ADR-002); merchant (read-only; PATCH cannot touch it). |
| **Actions** | `computeStoreLifecycle` (`lib/storeLifecycle.ts`): `!isActive → SUSPENDED`; no expiry → ACTIVE; `expiry <= now → EXPIRED` (keeps `is_active=true`). `EXPIRING_SOON_DAYS=7`; `daysUntil = Math.ceil((expiresAt − now)/DAY_MS)`. Renewal: plans `{30,180,365}`; `computeRenewalExpiry` — extend from current expiry when still valid, else from now; then `is_active=true` (reactivates even from SUSPENDED). Effective-active predicate centralized in `lib/readiness.ts`: `is_active = true AND (subscription_expires_at IS NULL OR subscription_expires_at > now())`. |
| **State → after** | ACTIVE → EXPIRING_SOON (≤7d) → EXPIRED → (provider renew) → ACTIVE. SUSPENDED ↔ ACTIVE via provider. |
| **Entities** | `stores`. |
| **API** | Merchant `GET/PATCH /api/stores/:storeId` — **`UpdateStoreBody` has no `isActive`** (api-zod contract; merchant can never write lifecycle). Provider: create (trial 14d), renew, suspend, list with status, reset password. |
| **UI** | `Layout.tsx`: EXPIRED → barrier banner with renewal CTA; EXPIRING_SOON → amber banner; ACTIVE → days-left chip; plans modal 30/180/365 (2500/10500/21000 DZD); renewal CTA opens WhatsApp `wa.me/213549990984` / `+213777826223`. |
| **Evidence** | Renewal/suspend ops not written to `audit_logs` (see D.14 gap). |
| **Next step** | Renewal intent leaves the system → WhatsApp human conversation. |
| **Failure modes** | EXPIRED: merchant logs in, manages existing orders/customers/products; new orders refused (manual `422 اشتراك المتجر منتهي`; public storefront not-live via `effectiveActiveStoreSql`; `productPubliclyLive=false`). SUSPENDED: merchant login refused 403. |
| **Recovery** | Provider renews (single writer). |
| **Clean ending** | Renewal → ACTIVE; or full suspension → provider contact. |
| **Manual workarounds** | Renewal = human/WhatsApp exchange; no self-serve payment/invoice (backlog B-02), no reminders beyond banner (B-03). |
| **Verdict** | **EXTERNALIZED-BY-DESIGN** (the payment/subscription completion intentionally exits the system per B-02/B-03 and provider-ownership decisions). Observation: the internal state machine itself is CLOSED. |

### D.3 Domain — Catalog: product categories & landing pages

| Item | Answer |
|---|---|
| **Goal** | Merchant publishes product pages behind categories; publication gated by readiness; unpublished/expired/suspended store stays hidden publicly. |
| **Actors** | Merchant operator; customer (read). |
| **Actions** | Category: `uniqueSlug`, default-category guarantee (`resolveCategoryId`), delete 409 if orders attached or default; default cannot be renamed/deleted. Landing page: unique `(store_id, slug)` 409; completeness = name + price>0 + description + slug (not image — D-11 deferred); publish/unpublish; delete → 409 while orders reference it. Optional per-page `whatsapp_number`. |
| **State → after** | Draft → published → public; stop = unpublish (no hard delete while used). Readiness reasons surfaced in `LandingPagesList` (incl. `subscription_expired`, `no_usable_delivery_zone`, `product_incomplete`). |
| **Entities** | `product_categories`, `landing_pages`. |
| **API** | `/api/stores/:storeId/landing-pages`, `/api/stores/:storeId/product-categories`, public page views. |
| **UI** | `LandingPagesList`, `LandingPageForm`, `PublicStorePage`, `PublicLandingPage`. |
| **Evidence** | Readiness computed server-side; slugs enforced per store. |
| **Next step** | Published pages feed public storefront and manual-order picker. |
| **Failure modes** | Missing category/name/price/description/slug → `product_incomplete`; no usable zone → `no_usable_delivery_zone`; store not effective-active → page not publicly live. |
| **Recovery** | Complete data; publish; re-activate store. |
| **Clean ending** | Page reachable; or deliberately unpublished/unready. |
| **Manual workarounds** | None needed. |
| **Verdict** | **CLOSED.** Observation: image never blocks readiness (D-11 deferred). |

### D.4 Domain — Delivery network: zones & communes

| Item | Answer |
|---|---|
| **Goal** | Merchant defines delivery areas/fees; a **usable zone** (office_fee not null AND ≥1 enabled commune) is the floor gate for both intake paths. |
| **Actors** | Merchant operator. |
| **Actions** | `PATCH /delivery-zones` fees (`UpdateDeliveryZoneSchema`); commune toggles (`UpdateDeliveryCommunesSchema`). Fee logic: OFFICE fee always applies; HOME fee when commune enabled → `deliveryFee` snapshotted on each order. |
| **State → after** | Zone usable ↔ not usable; communes enabled ↔ disabled. `hasUsableDeliveryZone` blocks readiness and both intakes. |
| **Entities** | `delivery_zones`, `delivery_commune_settings`. |
| **API** | `/api/stores/:storeId/delivery-zones` + communes. |
| **UI** | `DeliverySystem` (draft-fee editing + commune toggles), `NewOrder` (`useListDeliveryZones`, `useListDeliveryCommunes`). |
| **Evidence** | Fees + enabled-commune flags persisted per zone. |
| **Next step** | Zone consumed by public storefront + manual order. |
| **Failure modes** | No usable zone → storefront ordering disabled + manual order blocked. |
| **Recovery** | Add zone with office_fee + ≥1 enabled commune. |
| **Clean ending** | Zone usable; no money path without usable zone. |
| **Manual workarounds** | None. |
| **Verdict** | **CLOSED.** |

### D.5 Domain — Manual order intake (merchant)

| Item | Answer |
|---|---|
| **Goal** | Merchant converts offline/WhatsApp conversations into system orders with correct pricing. |
| **Actors** | Merchant → system. |
| **Actions** | `POST /api/stores/:storeId/orders` (manual, `createOrderCore`): quantity int 1..10 else 422 `الكمية يجب أن تكون بين 1 و 10`; store guard → 404/422; delivery method HOME/OFFICE — SHED_MED commute **forces OFFICE**; OFFICE fee from zone; total = unitPrice×qty; payable = total + deliveryFee; customer upsert by `(store_id, phone)`; audit note `طلب يدوي عبر التاجر`; final status **NEW**. |
| **State → after** | None → `orders` row NEW + `customers` updated + `audit_logs`. |
| **Entities** | `orders`, `customers`, `audit_logs`. |
| **API** | Manual-order endpoints; `ManualOrderBody` rejects `customerCity` (unknown keys stripped), quantity defaults 1 (`manual-order.test.ts`). |
| **UI** | `NewOrder` (product/zone/commune/variant/size/color/notes). |
| **Evidence** | `ORDER_CREATED` audit entry at creation. |
| **Next step** | Order enters the operations machine as NEW. |
| **Failure modes** | Quantity 422; store 404; expired 422; suspended 422; missing method/phone 400. |
| **Recovery** | Fix payload; store must be ACTIVE. |
| **Clean ending** | Order created transactionally; no partial writes. |
| **Manual workarounds** | None. |
| **Verdict** | **CLOSED.** Observation: provenance only via audit note (ADR-005 binds no `order_source`). |

### D.6 Domain — Public storefront & customer self-order intake

| Item | Answer |
|---|---|
| **Goal** | Anyone can view published pages and place an order with just a phone number. |
| **Actors** | Customer; system. |
| **Actions** | `/api/public/...`: `findActiveStore` by normalized slug (effective-active only); order body customerName 2..100, phone 9..20, commune from enabled set, method HOME/OFFICE, quantity 1..10 default 1; rate-limited `publicOrderLimiter` 20/h (`طلبات كثيرة، حاول لاحقاً`); SHED→OFFICE forced; fee/price identical to manual path. |
| **State → after** | None → order NEW + customer upserted; customer never sees staff state. |
| **Entities** | `orders`, `customers`. |
| **API** | Public landing + order endpoints (no auth). |
| **UI** | `PublicLandingPage`, `PublicStorePage`, `TrackOrder`. |
| **Evidence** | Creation audit entry (`طلب جديد من … عبر صفحة …`). |
| **Next step** | Order lands in merchant `OrdersList`. |
| **Failure modes** | Validation 400/422; store not live → readiness reasons/404; rate limit 429. |
| **Recovery** | Retry valid payload. |
| **Clean ending** | Order created; customer keeps orderId for tracking. |
| **Manual workarounds** | Post-purchase WhatsApp conversation. |
| **Verdict** | **BROKEN-LEAKY** — the intake itself works, but the loop dead-ends at *attention*: **no notification channel exists** (verified: no mail/SMS/webhook/socket/push dependency anywhere in `apps/api-server`), so a landed order is only visible after the merchant manually refreshes. A missed order is a dead COD sale. |

### D.7 Domain — Order operations machine

| Item | Answer |
|---|---|
| **Goal** | Progress orders NEW → … → DELIVERED / RETURNED with legal moves only. |
| **Actions** | `lib/transitions.ts` `VALID_TRANSITIONS` (14 lines): NEW→{PENDING_CONFIRMATION,CANCELLED}; PENDING_CONFIRMATION→{CONFIRMED,REJECTED}; CONFIRMED→{SHIPPED,CANCELLED}; SHIPPED→{DELIVERED}; DELIVERED→{RETURNED}; RETURNED/CANCELLED/REJECTED terminal. Every status edit validated (`orders.ts:187-192`; UI mirrors in `OrderDetail`). Confirmation channel: WhatsApp — `OrdersConfirmationsPanel` builds `wa.me/213…` link + copyable Arabic message the merchant pastes to the customer; confirm→(PENDING→)CONFIRMED; reject→REJECTED. Return requires reason; only after DELIVERED; `returnFee` honored (`orders.ts:195-201`). Active set = NEW, PENDING_CONFIRMATION, CONFIRMED, SHIPPED. |
| **State → after** | Status transition + `audit_logs` `status_changed`; Delivered feeds reports. |
| **Entities** | `orders`, `audit_logs`. |
| **API** | Status endpoints under `/api/stores/:storeId/orders/:orderId` + `/confirmations` (confirm/reject), `requireStoreAccess`. |
| **UI** | `OrdersList` (filters/search/dates), `OrderDetail` (timeline + per-status actions + return reason), `OrdersConfirmationsPanel` (copy/wa.me/confirm/reject). |
| **Evidence** | Every status write logs `STATUS_CHANGED` with from/to + actor. |
| **Next step** | Terminal statuses leave the machine; reports read them. |
| **Failure modes** | Illegal transition 422; price/size immutable; variant/return constraints; duplicate phone on edit 409; PENDING_CONFIRMATION can persist indefinitely (merchant can always close it via REJECTED — no systemic dead-end, but attention friction). |
| **Recovery** | reject/cancel paths; terminal states are final. |
| **Clean ending** | DELIVERED (money in) · RETURNED (return-fee loss) · CANCELLED / REJECTED. |
| **Manual workarounds** | *The confirmation step is inherently a human WhatsApp exchange* — copy/paste, no in-app thread (by-design). |
| **Verdict** | **EXTERNALIZED-BY-DESIGN** — the confirmation/follow-up step intentionally completes through the human WhatsApp channel per ADR-003/COD decisions. Observation: no pending-order SLA/flag → OPPORTUNITY (B-4), not a defect. |

### D.8 Domain — Customer tracking (public)

| Item | Answer |
|---|---|
| **Goal** | Customer follows an order without auth; nothing else leaks. |
| **Actions** | `POST /api/public/track` `{orderId, phone}`; sanitized snapshot (status, prices, payable, timestamps) with customerName/Phone/Address/notes stripped (proven by `tracking.test.ts`); uniform 404 for wrong phone/unknown id; cross-store isolation tested; `trackOrderLimiter` 20/10min. |
| **State → after** | None (read-only). |
| **Entities** | `orders` (read). |
| **API** | `/api/public/track`. |
| **UI** | `TrackOrder`. |
| **Evidence** | Sanitization + isolation enforced by tests. |
| **Next step** | Customer sees status; re-enters WhatsApp. |
| **Failure modes** | Wrong id/phone 404; 429 under load. |
| **Recovery** | Re-enter correct values. |
| **Clean ending** | Terminal status visible. |
| **Manual workarounds** | None. |
| **Verdict** | **CLOSED.** Observation: identity = global numeric orderId + phone (ADR-004 paradigm); hardening = OPPORTUNITY (B-7). |

### D.9 Domain — Customer base

| Item | Answer |
|---|---|
| **Goal** | One persisted customer per phone per store; lookup, search, spend visibility. |
| **Actions** | Upsert on every intake; unique `(store_id, phone)`; list with `ordersCount`, `totalSpent`; search/filter. No broadcasts/segments/automation (B-16 deferred). |
| **State → after** | New contact row or updated address/city; counts/spend recomputed. |
| **Entities** | `customers`, `orders` (aggregate). |
| **API** | `/api/stores/:storeId/customers`. |
| **UI** | `CustomersList`, `CustomerDetail`. |
| **Evidence** | Counts derived from orders; edits to phone/city/address are written without history (see F.5). |
| **Next step** | Merchants manually reach out (WhatsApp). |
| **Failure modes** | Duplicate phone 409 on edit. |
| **Recovery** | Fix phone/notes. |
| **Clean ending** | Customer persists; repeat = new order on same phone. |
| **Manual workarounds** | Growth communication external. |
| **Verdict** | **CLOSED** as a directory. Observation: relationship/retention loop intentionally deferred (B-16) → OPPORTUNITY (B-5), not a defect. |

### D.10 Domain — Reports & money visibility

| Item | Answer |
|---|---|
| **Goal** | Merchant sees daily/weekly money outcomes. |
| **Actions** | `/reports/daily`, `/reports/weekly`: group by day/week **of `created_at`** (`reports.ts:26-27` — `gte(createdAt, dayStart), lt(createdAt, dayEnd)`), **not** the status-event date (D-05 deferred). `revenue` = sum(total_price) of DELIVERED; `deliveryRevenue` = sum(delivery_fee) of DELIVERED; `returnLoss` = sum(return_fee) of RETURNED; `netRevenue = revenue − returnLoss`; counts by status. |
| **State → after** | Report snapshot (stateless aggregation over orders). |
| **Entities** | `orders` (read-only). |
| **API** | `/reports/daily`, `/reports/weekly`, `/orders/summary`. |
| **UI** | `Dashboard` (stat cards), `Reports` (recharts). |
| **Evidence** | Aggregation derives entirely from orders. |
| **Next step** | Merchant reads numbers (no export). |
| **Failure modes** | None structural. |
| **Recovery** | n/a. |
| **Clean ending** | Daily/weekly read-only truth. |
| **Manual workarounds** | Spreadsheet by hand. |
| **Verdict** | **BROKEN-LEAKY** — two material issues: (1) **COD settlement is not modeled** — no expected-cash ledger, no collected-cash field, no export; the merchant's real cash position is approximate; (2) reports are **anchored to order `created_at`**, so a June order delivered in July reports in June — a misleading money result. |

### D.11 Domain — Provider console & store stewardship

| Item | Answer |
|---|---|
| **Goal** | Provider creates/stewards stores, sets plans, suspends/reactivates, triages leads. |
| **Actions** | Create store (slug regex, unique slug 409, trial=14d, random-or-given password ≥8 returned once); renew (plans {30,180,365}, ADR-001 anchor); suspend/reactivate; list with computed `subscriptionStatus` (active/expiringSoon/expired/suspended/noSubscription) + `daysLeft`; summary active-count via `effectiveActiveStoreSql`; lead convert → store. |
| **State → after** | Store lifecycle fields change; provider is the single writer of `is_active`. |
| **Entities** | `stores`. |
| **API** | `/api/provider/*` behind `requireProviderAuth`. |
| **UI** | `ProviderStores`, `ProviderLogin`, `ProviderDashboard`, `ProviderLeads`. |
| **Evidence** | Renew/suspend not surfaced in `audit_logs` (see D.14 gap). |
| **Next step** | Store returns to ACTIVE; human contact for payment (WhatsApp). |
| **Failure modes** | None structural. |
| **Recovery** | Provider edits. |
| **Clean ending** | Store ACTIVE or SUSPENDED. |
| **Manual workarounds** | All renewal money/settlement external. |
| **Verdict** | **CLOSED** operationally. Observation: provider has no revenue/invoice visibility (B-02 deferred) → OPPORTUNITY (B-8). |

### D.12 Domain — Merchant-lead intake (acquisition)

| Item | Answer |
|---|---|
| **Goal** | Prospects apply as merchant leads; provider triages. |
| **Actors** | Anonymous prospect; provider. |
| **Actions** | `POST /api/provider/leads` (public, **no auth**, `provider.ts:220`; validated by `MerchantLeadSchema`); provider updates status NEW → {CONTACTED,QUALIFIED,REJECTED,CONVERTED}; lead convert creates the store (`/leads/:leadId/convert`). |
| **State → after** | Row created; provider triages; conversion → store. |
| **Entities** | `merchant_leads`, `stores`. |
| **API** | `/api/provider/leads` (public write; provider read/update/convert). |
| **UI** | Apply page, `ProviderLeads`. |
| **Evidence** | Row persistence only. **No rate limiting, no dedup, no honeypot** on the public write path — the only public write endpoint without protection (login, order, and track are all rate-limited). |
| **Next step** | Provider manually QCs + messages. |
| **Failure modes** | Unbounded spam/abusive submissions; duplicate leads. |
| **Recovery** | Provider marks REJECTED manually. |
| **Clean ending** | CONVERTED or REJECTED. |
| **Manual workarounds** | Provider contacts lead by hand. |
| **Verdict** | **BROKEN-LEAKY** — uncontrolled public write surface (unsafe gap); B-09 awaits. |

### D.13 Domain — Media storage & uploads

| Item | Answer |
|---|---|
| **Goal** | Store logo + product images, bounded by type/size. |
| **Actions** | Uploads jpg/png/webp ≤ 5 MB (`Settings.tsx:8`); base64 POST → prod Supabase storage / dev local fs; public URL persisted. |
| **State → after** | File stored; URL attached. |
| **Entities** | Media (no table). |
| **API** | `/api/stores/:storeId/uploads/...`. |
| **UI** | `Settings` logo card, `LandingPageForm` images. |
| **Evidence** | contentType/size gates server+client. |
| **Next step** | URL consumed in UI. |
| **Failure modes** | Oversized / wrong type rejected. |
| **Recovery** | Re-upload. |
| **Clean ending** | URL attached. |
| **Manual workarounds** | None. |
| **Verdict** | **CLOSED.** |

### D.14 Domain — Evidence layer: audit trail, health, tests

| Item | Answer |
|---|---|
| **Goal** | Reconstructable order history; heartbeat; regression-proof machines. |
| **Actions** | `logAudit` writes `audit_logs` (fail-silent `.catch(() => {})`); `GET /healthz` → `{status:"ok"}`; test suites: readiness (30 checks), lifecycle (47), return (58), tracking, manual-order. |
| **State → after** | Append-only evidence. |
| **Entities** | `audit_logs`. |
| **API** | Internal only + `/healthz`. |
| **UI** | `OrderDetail` timeline renders audit entries. |
| **Evidence** | Creation + status changes yield rows. |
| **Next step** | Traces feed reports/troubleshooting. |
| **Failure modes** | Audit write failure invisible (fail-open by design). |
| **Recovery** | n/a (no WAL for audit). |
| **Clean ending** | Rows persist per event. |
| **Manual workarounds** | None. |
| **Verdict** | **PARTIAL** — order-event audit is complete, but two important write-types leave no trace: (1) **order/customer contact edits** — `orders.ts:217-235` updates customer phone/city and order notes without a `logAudit` call; (2) **provider lifecycle ops** (renew/suspend) are not logged. |

---

## Part E — Closed-loop map & final verdict taxonomy

### E.1 Final domain verdict map

| # | Domain | Verdict (single primary) | Evidence anchor |
|---|---|---|---|
| D1 | Identity, sessions, credentials | **CLOSED** | `routes/auth.ts`, middleware |
| D2 | Store & subscription lifecycle | **EXTERNALIZED-BY-DESIGN** | `lib/storeLifecycle.ts`, B-02/B-03 |
| D3 | Catalog (categories + landing pages) | **CLOSED** | `routes/landing-pages.ts`, readiness |
| D4 | Delivery network (zones/communes) | **CLOSED** | `routes/delivery-zones.ts` |
| D5 | Manual order intake | **CLOSED** | `lib/manual-order.ts`, `createOrderCore` |
| D6 | Public storefront & self-order intake | **BROKEN-LEAKY** | public routes; no notification infra |
| D7 | Order operations machine | **EXTERNALIZED-BY-DESIGN** | `lib/transitions.ts`, confirmations |
| D8 | Public tracking | **CLOSED** | `/api/public/track`, `tracking.test.ts` |
| D9 | Customer base | **CLOSED** | `routes/customers.ts` |
| D10 | Reports & money visibility | **BROKEN-LEAKY** | `routes/reports.ts` |
| D11 | Provider console & stewardship | **CLOSED** | `routes/provider.ts` |
| D12 | Merchant-lead intake | **BROKEN-LEAKY** | `routes/provider.ts:220` |
| D13 | Media storage & uploads | **CLOSED** | `routes/uploads.ts` |
| D14 | Evidence layer | **PARTIAL** | `lib/audit.ts`, `routes/orders.ts` |

### E.2 Counts (primary verdicts only)

- CLOSED = **8** (D1, D3, D4, D5, D8, D9, D11, D13)
- EXTERNALIZED-BY-DESIGN = **2** (D2, D7)
- BROKEN-LEAKY = **3** (D6, D10, D12)
- PARTIAL = **1** (D14)
- DEFERRED-BY-DESIGN (primary) = **0**
- OPPORTUNITY (primary) = **0**
- **Total = 14.** · 8 + 2 + 3 + 1 = 14 ✓

### E.3 Map rules (applied to every row)

- A loop is **CLOSED** only when its operational task completes cleanly inside the system with a stable outcome — never merely because "a feature exists".
- **EXTERNALIZED-BY-DESIGN** never counts as broken unless the current design decision is itself demonstrated to be failing.
- **DEFERRED-BY-DESIGN** and **OPPORTUNITY** appear as observations/inventories, never as extra domain verdicts.

---

## Part F — Current-system problems (classified A–E)

Classification keys: **A** current system problem (verified) · **B** design limitation (accepted scope) · **C** externalized-by-design workflow · **D** deferred capability · **E** future opportunity candidate.

| # | Finding | Class | Verified evidence | Retention |
|---|---|---|---|---|
| F.1 | Merchant has **no reliable new-order notification** — must poll/refresh | **A** | No mail/SMS/webhook/socket/push dependency in `apps/api-server`; intake paths produce only DB rows + audit | **RETAINED** |
| F.2 | COD **settlement visibility incomplete** — no expected-cash ledger, no collected-cash field, no export | **A** | `routes/reports.ts` aggregates only statuses/fees; no settlement fields in schema | **RETAINED** |
| F.3 | **Reports anchored to creation date**, not event date (June order delivered in July counts in June) | **A** | `routes/reports.ts:26-27` `createdAt` range | **RETAINED** |
| F.4 | **Public lead intake lacks rate limiting/dedup protection** — only unprotected public write | **A** | `routes/provider.ts:220` no limiter; every other public write is limited | **RETAINED** |
| F.5 | **Audit coverage gaps** — order/customer contact edits + provider lifecycle ops leave no trace | **A** | `routes/orders.ts:217-235` no `logAudit`; provider routes don't log | **RETAINED** |
| F.6 | **Confirmation message uses the wrong money field**: `المبلغ الإجمالي: totalPrice` while the customer pays `payableTotal` | **A** | `OrdersConfirmationsPanel.tsx:43` (`totalPrice`) vs `formatOrder` `payableTotal` | **RETAINED** |
| F.7 | **PENDING_CONFIRMATION has no expiry/SLA flag** — silent customers stay in the active set until merchant acts | **E** (recovery exists via REJECTED; friction not dead-end) | `transitions.ts`; `ACTIVE_ORDER_STATUSES` in `Layout.tsx:70` | **RETAINED as E** |
| F.8 | **Customer tracking identity remains relatively weak** (global numeric orderId + phone secret) | **D/E** (ADR-004 paradigm; hardening = OPPORTUNITY) | `tracking.test.ts` isolation proven; no PIN/code | **RETAINED** |
| F.9 | **Customer relationship loop is limited** — no broadcast/segments/follow-up (B-16) | **D** | no CRM surface in code | **RETAINED as D** |
| F.10 | **Renewal remains externally mediated** (WhatsApp/human provider) | **C** — by design | B-02/B-03 + provider-ownership ADRs; `Layout.tsx` CTA | **RETAINED as C (not a defect)** |
| F.11 | No email/SMS **identity verification** for customers or merchants | **D** | no OTP/verify infra | Retained as D |
| F.12 | Readiness does not require a product **image** (D-11 deferred) | **D** | `lib/readiness.ts` completeness check excludes image | Retained as D |

Defect totals (class A only, to keep counts honest): **6 current-system problems** (F.1–F.6). Design-layer totals: C = 1 (F.10), D = 4 (F.8,F.9,F.11,F.12 — F.8 dual, counted as D here), E = 1 (F.7).

---

## Part G — UX / interface findings (task completion, not visual styling)

Findings where the interface materially affects *task completion*. Pure styling is out of scope here.

| # | Finding | Operational effect | Grounding |
|---|---|---|---|
| G.1 | **New orders are not surfaced reactively** | Task "process today's orders" requires manual refresh; no unread badge beyond refetch | no push infra; `OrdersList` query refetch |
| G.2 | **Dashboard composition puts money aggregates first, action queue last** | The merchant's top daily task is processing NEW/PENDING_CONFIRMATION; dashboard stat cards prioritize summary/daily-report money figures; the action queue requires separate navigation | `Dashboard` uses `useGetOrdersSummary` + `useGetDailyReport` stat cards |
| G.3 | **Blocking state is discoverable only by inspecting each page** | Public storefront silently filters unready pages (`readyPages` filter), while reasons surface in `LandingPagesList`; a merchant must open each product to learn why ordering is closed | `public.ts:88` ready filter; readiness reason map |
| G.4 | **Expired-store state is a banner, not a mode** | Merchant still logs in and manipulates existing data; visitors get a store that simply has no live products — status must be inferred | `Layout.tsx` banner; `effectiveActiveStoreSql` |
| G.5 | **Confirmation is a copy-paste manual step** | Confirmations cannot complete without manually firing the copy → send in WhatsApp; no one-click progress from the panel | `OrdersConfirmationsPanel` copy + `wa.me` link |
| G.6 | **No visual attention signal per order** | No "needs action now"/age highlight separates orders needing operator attention from the long tail | `OrdersList` filters exist; no priority badge |
| G.7 | **Status vocabulary is clear** | Arabic labels across StatusBadge/OrderDetail are complete (mirrors server matrix) | `StatusBadge.tsx`, `OrderDetail` |
| G.8 | **Future (non-requirement)**: a Boutique interface language + Tabler-style lightweight iconography could unify the merchant corridor | Design-system opportunity only; NOT an implementation requirement of this study | — |

---

## Part H — Small-surface / high-value search

Each candidate is evaluated on **"can this solve real merchant/customer pain at low architectural cost?"** — not "does SaaS usually have it?".

| Candidate | Current state (evidence) | Pain | Low-cost? |
|---|---|---|---|
| Click-to-WhatsApp per product | **Already exists** — `landing_pages.whatsapp_number` → `wa.me/…` CTAs on `PublicLandingPage:455,851`; confirmations panel builds `wa.me` to customer | solved today | — (exists) |
| **Store-level contact card / official WhatsApp** | Absent at store level (only per-page number and provider support number `+213777826223` exist) | Store identity lacks a single official contact; page number mismatch confusion | **Yes** — one `stores` column + storefront footer |
| **Instagram / Facebook link** | Absent from schema (no social fields; only `whatsapp_number`) | Algerian boutiques live on IG/FB; storefront cannot syndicate identity | **Yes** — see Part J |
| Lightweight customer follow-up | Only manual WhatsApp; no templated "thanks / delivered / feedback" draft for customers | Post-delivery engagement requires rewriting messages each time | **Yes** — reuses confirmation-panel builder pattern |
| Lightweight stock visibility | No stock data anywhere | "is this item still available?" unanswerable; over-sell risk | **Probable** — see Part K |
| Operational shortcuts (advance status from list) | Status changes live in `OrderDetail` only | Extra clicks for routine ship/deliver | **Yes** — small UI addition |
| Notification mechanisms | Absent entirely | F.1 — the flagship gap | **B-1** (higher than trivial) |

Full per-candidate decision records are in Part I (Layers A/B), with the mandated fields.

---

## Part I — Opportunity model (Layers A / B / C)

Every candidate carries: opportunity · pain · affected actor · current workaround · expected value · implementation surface · architectural impact · migration/data impact · lifecycle impact · maintenance impact · verdict on further investigation.

### Layer A — Immediate low-cost corrections (fix a verified problem, minimal architectural impact)

| Field | A-1 Confirmation message money field | A-2 Audit rows for contact/order edits | A-3 Lead-intake protection | A-4 Report anchoring on event date | A-5 Deduplicate shared helpers |
|---|---|---|---|---|---|
| **Opportunity** | Show `payableTotal = totalPrice + deliveryFee` in the confirmation message | Log `ORDER_UPDATED` before/after on phone/city/address/notes edits | Rate-limit + soft-dedup + optional honeypot on `POST /provider/leads` | Report by `status_changed` event date (or dual pillar) | Export `formatOrder`, `effectiveActiveStoreSql`, readiness once |
| **Pain** | Doorstep under-collection surprise (F.6) | Cannot answer "who/when changed the phone" (F.5) | Spam/unbounded public write (F.4) | Misleading money lines (F.3) | Duplication `OrdersConfirmationsPanel` vs routes; provider vs readiness copy (B-12/13/14) |
| **Affected actor** | Customer + merchant | Merchant/provider | Provider | Merchant | Team |
| **Current workaround** | Merchant hand-corrects the amount | None (history lost) | Provider manually deletes spam | Merchant reconciles by hand | Manual keep-in-sync |
| **Expected value** | High (money correctness, trust) | Medium (integrity) | High (ops hygiene + security) | High (financial truth) | Medium (maintainability) |
| **Surface** | `OrdersConfirmationsPanel.buildConfirmationMessage` (1-line) | order PATCH handler + `customers` PATCH | `provider.ts` leads route | `reports.ts` grouping read switch | refactor into `lib/` |
| **Arch impact** | None | None | None (reuse rate limiter) | None (data already in `audit_logs`) | None |
| **Migration/data** | None | None (append-only) | None | None | None |
| **Lifecycle impact** | None | None | None | None | None |
| **Maintenance** | Trivial | Trivial | Low | Low | Low |
| **Investigate further?** | **Yes — do first** | **Yes** | **Yes** | **Yes** | **Yes** |

### Layer B — High-value opportunity candidates (capability additions, low-to-moderate complexity)

| Field | B-1 Merchant new-order notification |
|---|---|
| **Opportunity** | Notify the merchant on order creation via in-app badge/email/SMS/WhatsApp-bot |
| **Pain** | F.1 — merchant is a poller; missed orders = dead COD sales |
| **Affected actor** | Merchant (customer benefit: faster confirmation) |
| **Current workaround** | Manual refresh; WhatsApp discipline |
| **Expected value** | Highest of Layer B (direct revenue-protection) |
| **Surface** | Hook in `createOrderCore` + `public.ts` intake; badge in Layout; emissions adapter |
| **Arch impact** | Low–Med (adds an outbound channel abstraction) |
| **Migration/data** | None |
| **Lifecycle impact** | None on the order machine |
| **Maintenance** | Adapter per channel |
| **Investigate further?** | **Yes — top of Layer B** |

| Field | B-2 Social links (Instagram/Facebook) | B-3 Store contact card & official click-to-WhatsApp | B-4 Pending-order SLA flag | B-5 Customer retention nudge | B-6 Lightweight stock visibility | B-7 Tracking PIN / order code | B-8 Provider revenue glance |
|---|---|---|---|---|---|---|---|
| **Opportunity** | Store identity URLs on public storefront + settings | Single official store WhatsApp + contact card | Highlight pending orders > threshold (e.g. 48h) | Repeat-customer chip + follow-up WhatsApp draft | Per-product availability flag ("out of stock") | Derived order code / PIN for tracking | Per-store revenue/count card in provider console |
| **Pain** | Identity + discovery on the channel where the market lives | Fragmented WhatsApp numbers | F.7 attention friction | Relationship loop dead-end (F.9) | First-order over-sell/doubt (Part K) | Weak tracking secret (F.8) | No provider revenue visibility (B-02) |
| **Actor** | Merchant + customer | Merchant + customer | Merchant | Merchant + customer | Merchant + customer | Customer | Provider |
| **Workaround** | Manual reposting | Page-number channels | Manual sorting | Manual WhatsApp messages | Merchant refuses order after sale | None | Manual DB/spreadsheet |
| **Value** | Medium-high | Medium | Medium | Medium-high | Medium | Medium | Medium |
| **Surface** | `stores`/`landing_pages` columns + storefront + Settings | `stores` column + storefront footer | `OrdersList`/OrderDetail badge | Customers list + message builder reuse | `landing_pages` optional qty + intake check | track endpoint derivation | provider summary reuse |
| **Arch impact** | None | None | None | None | Low (§K) | Low | None |
| **Migration/data** | 1–2 new columns (nullable) | 1 new column (nullable) | None | None | 1 nullable column | None | None |
| **Lifecycle impact** | None | None | None | None | Cancel/return restore step | None | None |
| **Maintenance** | Trivial | Trivial | Low | Low | Low-Med | Low | Trivial |
| **Investigate further?** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes — concept eval first (Part K)** | **Yes** | **Yes** |

### Layer C — High-pain / high-complexity future capabilities (do not assume they must be built)

| Field | C-1 Inventory/stock (systemic) | C-2 Payments (PSP/online) | C-3 CRM (segments, broadcast, automation) | C-4 Messaging infrastructure | C-5 Subscription billing (self-serve) | C-6 Customer intelligence | C-7 Marketplace layer (LMARCHÉ context) |
|---|---|---|---|---|---|---|---|
| **Opportunity** | Full SKU/stock management | COD + online mix | Retention/upsell automation | In-app threads + notifications platform | Self-serve renew, invoices, collection | LTV, cohorts, product signals | Merchant aggregation & discovery |
| **Pain** | Oversell + unavailable-product doubt | Cash-only limits | Relationship dead-end (F.9) | F.1 + confirmation friction | C-layer renovation of D.2 | Blind marketing | New growth domain |
| **Actor** | Merchant | Customer + merchant | Merchant | Merchants + customers | Provider + merchant | Merchant/provider | Providers + merchants + buyers |
| **Arch impact** | High (systemic model) | High (PCI/PSP integration) | High | High | High | High | Very high |
| **Investigate further?** | See Part K — full inventory currently too expensive vs identified pain | Not now | Not now | Not now | Not now | Not now | Future context only (Part L) |

---

## Part J — Social links opportunity (explicit)

- **Why it may matter to Algerian merchants:** the boutique's market presence lives on Instagram/Facebook/TikTok; the Ordely storefront is the transactional layer, but discovery and relationship signals arrive from socials. A store without its social handles present is a store that cannot consolidate identity in one place.
- **Relation to store identity:** store identity today = name, owner, phone, city, logo (`stores`), plus per-page WhatsApp number (`landing_pages.whatsapp_number`). Social handles would complete the identity model as display-only fields.
- **Customer-friction reduction:** a visitor can verify the boutique across channels and reach the official WhatsApp from a single storefront footer instead of hunting the page number; reduces the "is this the official store?" doubt before purchase.
- **Schema changes:** two **nullable** columns (`instagram_url`, `facebook_url`) on `stores` (and optional reuse per landing page) — additions only, no migration of existing data. No new tables.
- **Affected surfaces:** public storefront only (+ merchant `Settings` for management). No effect on order machine, reports, auth.
- **Implementation surface:** storefront header/footer badge row + Settings inputs + contract addition (api-zod). Small, self-contained.
- **Potential value:** medium — identity consolidation and trust, not a direct transaction driver. **Not automatically high priority.** It sits at B-2 in Layer B alongside the stronger B-1 (notification).

---

## Part K — Stock / inventory candidate assessment

Observed (no fabrication): there is **no inventory data** in the schema today. The question is not "stock is missing" but "does a lightweight model resolve the first-order pain without turning Ordely into an ERP?".

**Conceptual lightweight model** (assessment only — not built):

```
Product (landing_page)
  → available_quantity (nullable; null = unlimited)
  → reservation_on_intake (decrement at order creation)
  → deduction (confirmed)
  → restore on CANCELLED / RETURNED / REJECTED reach terminal
```

**Assessment:**
- **Plausible as a low-complexity extension?** Yes, *for the visibility variant* (B-6): one nullable column + an intake check ("sold out" guard) + a restore step on cancel/return is small and does not touch the COD money model.
- **Likely to become systemic?** Yes, *if* it grows to SKUs, variants-as-inventory, warehouses, reservations, replenishment — that is ERP-class and contradicts the current single-product-per-page architecture.
- **Currently too expensive relative to identified pain?** For the *full* model, yes — there is **no evidence the current system is failing because stock is absent**; the COD confirmation step already lets the merchant decline before shipping. The pain is customer *doubt* ("is it still available?") and post-sale oversell — meaningful but not system-failing.
- **Verdict:** keep as **Layer-B concept-evaluation candidate (B-6)**; do **not** build now; do **not** fold into the order machine without decision control.

---

## Part L — Future context: Boutique & LMARCHÉ

- **Boutique** = the merchant commerce operating system trajectory (the platform as it exists and evolves). This study concerns Boutique today.
- **LMARCHÉ** = a *future* marketplace / merchant-aggregation and discovery layer. **Future context only** — this study does not assume it, and no current-system decision should be made around marketplace assumptions.

**Present capabilities that could later support a marketplace layer (identified, not acted on):**
- per-store public storefronts with unique slugs (discoverable store identity);
- per-product landing pages (portable product catalog);
- provider console with per-store aggregates and lead intake (existing multi-tenant supervision);
- delivery-zone/commune network (geographic grounding for discovery);
- public tracking + phone-identity customers (transactional trust primitives);
- the multi-tenant isolation model itself (`is_active`, per-tenant guards) — the seed of marketplace governance.

None of these imply any schema or code change today.

---

## Part M — Final task & opportunity counts (inventories)

### M.1 Table T1 — Business objectives (6)

| # | Objective | Grounding |
|---|---|---|
| O1 | End-to-end COD boutique commerce (intake → delivery → terminal status) | order machine + intake paths |
| O2 | Monetization via provider-managed store subscriptions (trial → paid) | `stores` subscription fields, provider renew |
| O3 | Merchant operational control (catalog, delivery, orders, customers) | merchant SPA + `requireStoreAccess` |
| O4 | Customer post-purchase visibility (track without auth) | `/api/public/track` |
| O5 | Merchant-network growth (public lead intake → store conversion) | `merchant_leads` + `/convert` |
| O6 | Money visibility (daily/weekly reports) | `routes/reports.ts` |

**Total business objectives = 6.**

### M.2 Table T2 — Capability / domain inventory (14) — Part E.1

| Capability | Verdict |
|---|---|
| D1 Identity & sessions | CLOSED |
| D2 Store & subscription | EXTERNALIZED-BY-DESIGN |
| D3 Catalog | CLOSED |
| D4 Delivery network | CLOSED |
| D5 Manual order intake | CLOSED |
| D6 Public intake | BROKEN-LEAKY |
| D7 Order operations machine | EXTERNALIZED-BY-DESIGN |
| D8 Public tracking | CLOSED |
| D9 Customer base | CLOSED |
| D10 Reports & money | BROKEN-LEAKY |
| D11 Provider console | CLOSED |
| D12 Lead intake | BROKEN-LEAKY |
| D13 Media uploads | CLOSED |
| D14 Evidence layer | PARTIAL |

**Total capabilities = 14.** Distribution: CLOSED 8 · EXTERNALIZED-BY-DESIGN 2 · BROKEN-LEAKY 3 · PARTIAL 1 · DEFERRED-BY-DESIGN 0 · OPPORTUNITY 0.

### M.3 Table T3 — End-to-end operational task inventory (14, 1:1 with domains)

| # | End-to-end task | Verdict |
|---|---|---|
| E1 | Authenticate & maintain session | CLOSED |
| E2 | Keep store paid & active (gate intake) | EXTERNALIZED-BY-DESIGN |
| E3 | Provider stewardship: create/renew/suspend | CLOSED |
| E4 | Publish a product page (category + readiness) | CLOSED |
| E5 | Configure & resolve delivery (zones/communes/fees) | CLOSED |
| E6 | Create an order manually (merchant) | CLOSED |
| E7 | Accept an order from the public storefront | BROKEN-LEAKY |
| E8 | Confirm → ship → deliver → return/reject | EXTERNALIZED-BY-DESIGN |
| E9 | Track an order publicly | CLOSED |
| E10 | Persist & search the customer directory | CLOSED |
| E11 | Report daily/weekly money | BROKEN-LEAKY |
| E12 | Capture merchant leads | BROKEN-LEAKY |
| E13 | Upload & serve media | CLOSED |
| E14 | Record & replay evidence | PARTIAL |

### M.4 Table T4 — Opportunity candidate inventory (20)

| Layer | Candidates | Count |
|---|---|---|
| A — Immediate low-cost corrections | A-1 confirmation money field · A-2 edit audit rows · A-3 lead protection · A-4 event-date reports · A-5 helper dedup | 5 |
| B — High-value candidates | B-1 notification · B-2 social links · B-3 contact card · B-4 pending SLA · B-5 retention nudge · B-6 stock visibility · B-7 tracking code · B-8 provider revenue | 8 |
| C — Future capabilities | C-1 inventory · C-2 payments · C-3 CRM · C-4 messaging · C-5 billing · C-6 customer intelligence · C-7 marketplace | 7 |

### M.5 Final counts (explicit, reproducible)

1. **Business objectives** = **6** (T1)
2. **Capabilities** = **14** (T2)
3. **End-to-end operational tasks** = **14** (T3)
4. **Fully closed tasks** = **8** (E1, E3, E4, E5, E6, E9, E10, E13)
5. **Partial tasks** = **1** (E14)
6. **Broken/leaky tasks** = **3** (E7, E11, E12)
7. **Externalized-by-design tasks** = **2** (E2, E8)
8. **Deferred-by-design tasks** = **0** (only observations)
9. **Opportunity candidates** = **20** (T4: A5 + B8 + C7)

Arithmetic check: fully-closed 8 + partial 1 + broken/leaky 3 + externalized 2 + deferred 0 = **14** = end-to-end tasks ✓.

---

## Part N — Decision surface

This is a decision-support surface based on the evidence above — not a roadmap. Items state why, pain, value, complexity, architectural impact, and whether evidence is sufficient.

### N.1 Fix Now (Layer A — evidence sufficient, low cost)

| Item | Why | Pain | Value | Complexity | Arch impact | Evidence sufficient? |
|---|---|---|---|---|---|---|
| **A-1** Confirmation money field | Verified wrong field (`totalPrice` vs `payableTotal`) | F.6 | High | Trivial | None | ✓ (code + tests) |
| **A-2** Audit rows on edits | Verified missing `logAudit` | F.5 | Medium | Low | None | ✓ |
| **A-3** Lead-intake protection | Verified only unprotected public write | F.4 | High | Low | None | ✓ (reuse limiter) |
| **A-4** Event-date reports | Verified `createdAt` anchoring | F.3 | High | Low | None (data in `audit_logs`) | ✓ |
| **A-5** Helper dedup | Verified duplication | B-12/13/14 | Medium | Low | None | ✓ |

### N.2 Investigate Next (Layer B — value/feasibility to confirm, not to build blindly)

| Item | Why | Pain | Value | Complexity | Arch impact | Evidence sufficient? |
|---|---|---|---|---|---|---|
| **B-1** Merchant notification | Highest revenue-protection gap (F.1) | F.1 | Highest | Low–Med | Outbound channel abstraction | ✓ (gap proven) |
| **B-2** Social links | Market lives on IG/FB; identity consolidation (Part J) | Identity friction | Medium | Low | None | ✓ (schema absence proven) |
| **B-3** Store contact card / official WhatsApp | Fragmented numbers | Friction | Medium | Low | None | ✓ |
| **B-4** Pending-order SLA flag | Silent customers in active set (F.7) | Attention friction | Medium | Low | None | ✓ |
| **B-5** Retention nudge | Relationship loop dead-end (F.9/D) | Defection | Medium-high | Low | None | Partial (customer value unmeasured) |
| **B-6** Stock visibility | Oversell/unavailability doubt (Part K) | Doubt | Medium | Low–Med | Low | ✓ (no failing evidence; concept eval) |
| **B-7** Tracking code/PIN | Weak tracking secret (F.8) | Enumeration risk | Medium | Low | None | ✓ (isolation proven) |
| **B-8** Provider revenue glance | No provider revenue visibility (B-02) | Ops blind spot | Medium | Trivial | None | ✓ |

### N.3 Future Capability (Layer C — high pain / high complexity; do not assume)

| Item | Why it is future | Notes |
|---|---|---|
| C-1 Inventory (systemic) | Contradicts product-per-page architecture; part becomes B-6 first | See Part K |
| C-2 Payments | PSP/PCI + money-model change (ADR-006 binds current COD) | Requires a new ADR |
| C-3 CRM | High arch; B-5 covers first-order value | — |
| C-4 Messaging infrastructure | B-1 provides the first channel slice | — |
| C-5 Subscription billing | Current renewal is EXTERNALIZED-BY-DESIGN; D.2 shows the machine is otherwise sound | Requires new ADR for invoice/payment |
| C-6 Customer intelligence | Requires data-depth beyond reports | — |
| C-7 Marketplace (LMARCHÉ) | Future context only (Part L) | — |

### N.4 Do Not Touch Yet (binding decisions — evidence in ADRs)

| Item | Reason |
|---|---|
| Order state machine (`transitions.ts`) | Frozen by ADR-003; changing requires new ADR |
| `is_active` ownership | Provider-owned (ADR-002); merchant PATCH must never write it |
| Renewal anchor = current expiry | ADR-001; enforced in `computeRenewalExpiry` and tested |
| COD money model (fees/returns/revenue) | ADR-006; `netRevenue = revenue − returnLoss` is the declared model |
| Tracking identity paradigm (orderId+phone) | ADR-004; hardening only via B-7, paradigm kept |
| No `order_source` column | ADR-005; provenance stays in audit |
| Deferred registry D-01…D-11 | Active deferrals; revisit only with a new ADR |

---

## Part O — Document status, validation & provenance

- **Status:** `type: study`, `status: active` — a living analysis, not an ADR, spec, or phase report. `verified-as-of: 2026-09-18`, commit `6f40257` (local `main` == `origin/main`).
- **Scope of evidence.** Anchored in: `apps/api-server/src/{lib,routes,middleware,app,index}.ts`, `lib/db/src/schema/*`, `lib/api-zod/src/generated/api.ts`, `apps/web/src/**`, `apps/api-server/src/tests/*`, `api/*.js` serverless entries, and the docs hierarchy (`INDEX`, `GOVERNANCE`, `current/*`, `decisions/*`, `specs/*`, `runbooks/*`).
- **Key verification greps performed this pass:**
  - `OrdersConfirmationsPanel.tsx:43` — confirmation message uses `totalPrice` (F.6 confirmed).
  - `reports.ts:26-27` — `gte/lte` on `ordersTable.createdAt` (F.3 confirmed).
  - `provider.ts:220` + `provider.ts:19` — `/leads` POST has no limiter (F.4 confirmed).
  - `orders.ts:217-235` — customer/order contact edits have no `logAudit` (F.5 confirmed).
  - `landing-pages.ts:26` — `whatsapp_number` exists; no social URL fields (Part J confirmed).
  - `apps/api-server` — no mail/SMS/webhook/socket/push dependency (F.1 confirmed).
- **Not in scope of evidence:** live DB row counts (docs baseline: stores 3 · orders 24 · customers 15 · landing_pages 8 · delivery_zones 58 · audit_logs 74); runtime-only behavior.
- **Change discipline:** no application code, schema, database, or deployment changes; no historical reports edited; one documentation file updated (itself) plus `Docs/INDEX.md` routing.

---

## Appendix — Evidence anchor index

| Claim area | Anchor |
|---|---|
| Order state machine | `apps/api-server/src/lib/transitions.ts`; `tests/lifecycle.test.ts` |
| Store lifecycle & expiry math | `apps/api-server/src/lib/storeLifecycle.ts` |
| Effective-active predicate / readiness | `apps/api-server/src/lib/readiness.ts` |
| Manual order guard + audit note | `apps/api-server/src/lib/manual-order.ts` (`MANUAL_ORDER_AUDIT_NOTE`) |
| Order creation rules (qty 1..10, SHED→OFFICE) | `apps/api-server/src/lib/order-creation.ts` |
| Audit writer | `apps/api-server/src/lib/audit.ts` |
| Order update + missing edit-audit | `apps/api-server/src/routes/orders.ts:187-238` |
| Reports created_at anchoring | `apps/api-server/src/routes/reports.ts:12-27` |
| Lead intake without limiter | `apps/api-server/src/routes/provider.ts:220` |
| Rate limiters | `apps/api-server/src/middleware/rateLimiter.ts` |
| Merchant login/session | `apps/api-server/src/routes/auth.ts` |
| Provider login/create/renew lists | `apps/api-server/src/routes/provider.ts` |
| Public intake & tracking sanitization | `apps/api-server/src/routes/public.ts`; `tests/tracking.test.ts` |
| Schema (enums, uniques, whatsapp_number) | `lib/db/src/schema/*` |
| Contracts (no `isActive`, no `customerCity`) | `lib/api-zod/src/generated/api.ts` |
| Serverless entries | `api/index.js`, `api/[...path].js` |
| SPA routes | `apps/web/src/App.tsx` |
| Subscription banner + plans + CTA | `apps/web/src/components/Layout.tsx:47-59` |
| Confirmation panel + money field | `apps/web/src/pages/OrdersConfirmationsPanel.tsx:43` |
| Status actions mirror | `apps/web/src/pages/OrderDetail.tsx` |
| Settings (logo/password; no lifecycle write) | `apps/web/src/pages/Settings.tsx` |
| Public page WhatsApp CTA | `apps/web/src/pages/PublicLandingPage.tsx:455,851` |
| Provider plans/status UI | `apps/web/src/pages/provider/ProviderStores.tsx` |
| Deferred index D-01…D-11 | `Docs/decisions/ADR-007-DEFERRED-DECISIONS-INDEX.md`; `PHASE-9` §15 |
| Money/return model binding | `Docs/decisions/ADR-006-COD-MONEY-MODEL.md` |
| Order source / tracking identity bindings | `Docs/decisions/ADR-004` / `ADR-005` |
| Backlog refs (B-02/B-03/B-09/B-12..16) | `Docs/current/BACKLOG.md` |