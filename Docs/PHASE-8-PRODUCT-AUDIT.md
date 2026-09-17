# Phase 8 - Product Audit (Visual + Business + Lifecycle)

<!-- DOC-META
type: audit
status: historical
verified-as-of: 2026-09-17
related: Docs/INDEX.md
notes: Closure stamp. Immutable historical record - not current truth. See Docs/current/ and Docs/decisions/ for the living model.
-->

> **Scope:** Discovery-only product audit of the closed Ordely baseline. No source code, database, deployment, or business-data changes were made. No features added.
>
> **Method:** Full read of `apps/web` (routes, pages, components, contexts), `apps/api-server` (all routes, middleware, lib), `lib/db` (schema, scripts), `lib/api-spec/openapi.yaml`, and the compiled API spec. Each finding carries `file:line` evidence.
>
> **Classification discipline:** Findings are tagged BUG / MISSING WORKFLOW / PRODUCT DECISION / FUTURE FEATURE. "Missing feature" is NOT automatically a bug.
>
> **Status:** Audit complete. This document ends the phase. No code was modified.

---

## 1. Executive Summary

Ordely is a **Code-on-Delivery (COD) store-builder platform for the Algerian market**. A provider (platform operator) reviews applicant leads, converts them into merchant stores (14-day trial, then 30/180/365-day paid plans), and the merchant manages catalog + deliveries + orders through an admin SPA while customers order through public product landing pages.

The system is **functionally complete as a closed baseline** — every database state (8 order statuses, 5 lead statuses, 2 delivery methods) is reachable through a route, every admin screen has loading/empty/disabled states, and the public funnel works end-to-end. The baseline is sound and internally consistent at the infrastructure level.

The audit found **zero P0 issues** (nothing makes the system unusable). The most important business gaps are **two P1 (major-business-flow) findings**:

1. **Customer post-order visibility does not exist (C-01/X-02).** After placing an order the customer receives a static success screen and an order number (`#123`) but has **no way to see order status** (confirmed/shipped/delivered) — a dead-end in the customer lifecycle for a COD model that runs on phone trust.
2. **Product publication is implicit and unsafe (M-02/X-11).** New landing pages default to `is_active = true`, so a page is public **before delivery zones are configured** — customers can reach it and read "طريقة التوصيل غير متاحة" failures. Publication has no readiness gate.

Below those, ~13 P2 findings (missing error/retry UI, destructive actions without confirmation, session-fixation on login, type-contract drift in the generated client, orphaned manual-order endpoint, uncovered audit logging, provider console leaking a dev tool, credentials displayed as plaintext in provider UI, lead endpoint without rate limiting or transition validation) and a P3/tech-debt group (40 unused shadcn components, duplicated component/table-constant patterns, locale and terminology inconsistencies).

The current **commerce model is a product decision, not a bug**: COD-only with no payment records, manual WhatsApp renewal, phone+name customer identity, and "landing page = product" abstraction. These are recorded as PRODUCT DECISION or FUTURE FEATURE, not defects.

---

## 2. Current Product Model

### 2.1 Platform structure

| Layer | Model | Evidence |
|---|---|---|
| Tenant | `stores` = a merchant shop (name, slug unique, logo, `is_active`, `subscription_plan_days`, `subscription_expires_at`) | `lib/db/src/schema/stores.ts:6-21` |
| Merchant identity | One `users` row per store; email unique; bcrypt hash | `lib/db/src/schema/users.ts:5-13` |
| Provider identity | Env-driven (`PROVIDER_EMAIL` + hash) **or** `provider_users` DB rows | `routes/provider.ts:53-76, 180-193`; schema `provider-users.ts:4-10` |
| Product | **`landing_pages` IS the product.** Name, price, description, images, sizes/colors JSONB, template, theme, transport mode, whatsapp number | `lib/db/src/schema/landing-pages.ts:9-34` |
| Catalog grouping | `product_categories` (slug, is_default, sort_order) | `lib/db/src/schema/product-categories.ts:8-22` |
| Delivery | 58 static wilayas; per-store `delivery_zones` (home/office/return fee, is_active) + `delivery_commune_settings` (per-commune toggles) | `lib/db/src/schema/delivery-zones.ts:12-44`; `lib/algeria-locations.ts` |
| Customer | `customers` unique per `(store_id, phone)` | `lib/db/src/schema/customers.ts:7-19` |
| Order | `orders` serial PK, denormalized customer/delivery/variant/price snapshot, `order_status` enum (8 states), COD assumption | `lib/db/src/schema/orders.ts:10-58` |
| Lead pipeline | `merchant_leads` with `merchant_lead_status` enum (5 states) | `lib/db/src/schema/merchant-leads.ts:7-33` |
| Audit | `audit_logs` (store_id, order_id, action, from/to status, note) | `lib/db/src/schema/audit-logs.ts:6-17` |
| Sessions | `order_os.sessions` (connect-pg-simple), **not** in Drizzle schema | `lib/db/scripts/ensure-sessions.mjs:16-21` |

### 2.2 Money model (PRODUCT DECISION)

- All orders are **Cash on Delivery**. No `payment_method`, no `paid_amount` anywhere in schema or API. Revenue is computed from `DELIVERED` orders only. Evidence: `reports.ts:54-58`; `orders.ts` format; `lib/db/src/schema/orders.ts` (no payment columns).
- Currency is hard-coded **Algerian Dinar** (`"دج"`) in the frontend (`apps/web/src/lib/currency.ts:1,5`), and in public storefronts.

### 2.3 Subscription model (PRODUCT DECISION)

- Trial = **14 days** on conversion (`provider.ts:92, 306-307, 418-419`).
- Renewal plans = **30 / 180 / 365 days** only (`provider.ts:93, 445-454`).
- Renewal **rewinds `expires_at` to now + days** (not "extend from current expiry"). Simple, deterministic; acceptable for current model.
- Expiry is **read-time computed**, no cron: `effectiveActiveStoreSql = is_active AND (expires_at IS NULL OR expires_at > now())` (`public.ts:11`, `provider.ts:106`).
- **No payment/billing layer** — renewal is a manual WhatsApp + provider `PATCH` (`Layout.tsx:473-507`, `ProviderStores.tsx`). This is the chosen commercial model (see 8B/B-04).

### 2.4 Delivery model

- 2 methods: `HOME` (office + home surcharge) and `OFFICE` (office fee only); zone inactive unless `office_fee` set + `is_active` (`delivery-zones.ts:171-176`, `public.ts:130`).
- Per-product `transport_mode`: `DELIVERY_COMPANY` (normal) or `SHED_MED` (forces OFFICE hand-delivery flow) (`public.ts:198`, `orders.ts:187`).
- Static commune/daira reference data lives in code (`algeria-locations.ts`), DB only stores per-store overrides (`delivery_commune_settings`).

### 2.5 Order state machine

```
NEW -> {PENDING_CONFIRMATION, CANCELLED}
PENDING_CONFIRMATION -> {CONFIRMED, REJECTED}
CONFIRMED -> {SHIPPED, CANCELLED}
SHIPPED -> {DELIVERED, RETURNED}
DELIVERED / RETURNED / CANCELLED / REJECTED -> terminal
```
Evidence: `lib/transitions.ts:1-14`, enforced at `orders.ts:348-353`; timestamps `confirmedAt/shippedAt/deliveredAt/returnedAt` (`orders.ts:356-359`); **no `cancelledAt`/`rejectedAt` columns**.

---

## 3. Visual Audit

All findings below are observations from `apps/web`; see code paths in evidence. This section is about visual coherence, and it reports defects/polish — do not read into reductions.

### 3.1 Design system consistency

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| V-01 | **~40 of ~50 shadcn `ui/` components are dead code.** Only `button, input, label, select, tooltip, toaster, toast` are imported; `dialog, alert-dialog, card, table, skeleton, empty, badge, spinner, tabs, sheet, drawer, calendar, chart, carousel, sidebar, form, field, switch, accordion, dropdown-menu, popover` etc. are unused. Admin screens use hand-rolled raw-HTML+Tailwind patterns instead. | P3 (tech debt, no user impact) | grep imports across `apps/web/src`; `src/components/ui/` (50 files) |
| V-02 | **Duplicated hand-rolled primitives:** `headCell`/`bodyCell` class constants repeated with small drift (`px-3` vs `px-4`) in 5 files; `StatCard` re-defined in both `Dashboard.tsx:13` and `ProviderDashboard.tsx:23`; `Field` re-defined in `LandingPageForm.tsx:72` and `Settings.tsx:27`; bespoke modal CSS `dashboard-modal-*` exists while `Dialog`/`AlertDialog`/`Sheet` sit unused. | P3 | OrdersList.tsx:30-31; CustomersList.tsx:8-9; ConfirmationsPanel.tsx:16-17; DeliverySystem.tsx:33-35; ProviderStores.tsx:26-30; index.css 749-793 |
| V-03 | **`StatusBadge` falls back to raw enum text** for unknown statuses; duplicate status label sources exist (`STATUS_OPTIONS`, `STATUS_CONFIG`, notification config). Drift risk for the 8-status enum used in 3+ files. | P3 | StatusBadge.tsx:44; OrdersList.tsx:11-21; Layout.tsx:60-93 |
| V-04 | `whitespace-nowrap` table headers with `px-3` risk horizontal clipping on long phone numbers in narrow admin columns. | P3 | OrdersList.tsx:30-31; CustomersList.tsx:8 |

### 3.2 UX states coverage

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| V-05 | **Admin load-error states are missing.** On API failure these screens render their **empty state** instead of an error (no message, no retry): OrdersList, OrdersConfirmationsPanel, CustomersList, LandingPagesList, DeliverySystem (partial — has its own `"تعذر تحميل ولايات التوصيل"`), Settings (form renders even with no store), Dashboard sections, Reports. Only **global `retry: 1`** exists; no retry button. | P2 | OrdersList.tsx:170; CustomersList.tsx:66-67; LandingPagesList.tsx:369; Dashboard.tsx; Settings.tsx; App.tsx:30-34 |
| V-06 | **Destructive actions run without confirmation** in merchant UI: order "رفض" (reject), "استرجاع" (return), "إلغاء" (cancel) in `OrderDetail` fire immediately. Store activation toggle and page "إيقاف/تفعيل الصفحة" also have no confirm. The **only** `window.confirm` in the app is the internal provider showcase reseed (`ProviderDashboard.tsx:140`) — and it uses a browser-native dialog inconsistent with the styled confirm modal used only for page delete. | P2 | OrderDetail.tsx:22-37; Layout.tsx:465-467; LandingPagesList.tsx:420; ProviderDashboard.tsx:140 |
| V-07 | **Loading gaps:** auth guards return `null` while `/me` resolves → blank flash on refresh (`App.tsx:87,94,105`); OrderDetail audit log has no skeleton; Settings upload only changes button label. | P3 | App.tsx; OrderDetail.tsx:86-106; Settings.tsx |
| V-08 | **Success feedback is toast-only with no undo** on forms/mutations; toasts transient (top-center, bottom-right on small). | P3 | `ui/toast.tsx:17`; hook `use-toast.ts` |
| V-09 | **Accessibility minor:** `ProviderLogin` show-password button `tabIndex={-1}` unreachable by keyboard; several icon-only buttons rely on `title` only (no `aria-label`); custom modals are not `aria-modal`-labeled; toasts have no aria-live region. | P3 | ProviderLogin.tsx:74; ConfirmationsPanel.tsx:163-193; LandingPagesList.tsx:405-420 |
| V-10 | Icons/actions: icon-only buttons mix `title` vs `aria-label` conventions. | P3 | ConfirmationsPanel.tsx vs ProviderStores.tsx:380 |

### 3.3 RTL / typography / locale

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| V-11 | **Locale inconsistency:** some screens use `ar-DZ-u-nu-latn` (OrdersList:229, ConfirmationsPanel:155, Layout, ProviderStores, ProviderDashboard, ProviderLeads), others `ar-SA-u-nu-latn` (Dashboard:36, Reports:44, CustomerDetail:161, OrderDetail), and **money uses `en-US` grouping** (`currency.ts:5`). Arabic numerals grouping for `دج` will therefore vary `10,000` vs `10.000`. | P3 | see evidence |
| V-12 | `uppercase` class applied to Arabic headings — a CSS no-op for Arabic script but signals intent mismatch (e.g. `"اجمالي الطلبات"`). | P3 | Dashboard.tsx:46,70,82; ProviderStores.tsx:442 |
| V-13 | RTL handled consistently (logical `dir="rtl"`, `text-right` headers, `dir="ltr"` on latin inputs email/phone/slug). No RTL defects found. | — (positive) | index.html `lang=ar dir=rtl`; Page inputs |
| V-14 | Tailwind classes use physical `right-3`/`text-right` for RTL in a few spots (works because RTL flows mirror; flagged as audit note, not defect). | P3 | CustomersList.tsx:40 |

### 3.4 Terminology consistency

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| V-15 | **Status gender drift:** `"مسترجع"` (OrdersList:18, StatusBadge:25) vs `"مسترجعة"` (Reports:69); `"ملغي"` (OrdersList:19) vs `"ملغية"` (Reports:70). Delivered: `"تم التسليم"` (StatusBadge) vs `"مسلمة"` (Reports weekly:111). | P3 | see evidence |
| V-16 | **Revenue label drift:** `"الايراد"` (Reports:73, Dashboard:104) vs `"الايرادات (مسلمة)"` (Dashboard:70) vs `"اجمالي الايراد"` (Reports:126). `"اجمالي"` (informal, no hamza) used in most aggregates. | P3 | see evidence |
| V-17 | **`بانتظار التأكيد` used for both a status and a filter-tab label** (`OrdersList:14,102`), plus quick action `"التأكيدات المعلقة"` (Dashboard:121) — same concept, 3 phrasings. | P3 | see evidence |
| V-18 | **Showcase object has 3 names:** `"متجر العرض التجريبي"` (ProviderDashboard:104), `"متجر العرض"` (140,168), `"متجر المعاينة"` (105). | P3 | see evidence |
| V-19 | **Plan copy duplicated with drift** between `Layout.tsx:37-47` and `ProviderStores.tsx:47-51` (same plans, different shape). | P3 | see evidence |

### 3.5 Product/model complexity leaking into UI

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| V-20 | **Raw DB primary key shown to merchant:** `"رقم المتجر"` = `STORE_ID` in Settings. | P2 | Settings.tsx:292 |
| V-21 | **Merchant passwords rendered as plaintext** in provider UI after create/convert (`merchantPassword` in response, printed in banner). Real credential exposure in the provider console. | P2 | ProviderLeads.tsx:26-35; ProviderStores.tsx:21-24 |
| V-22 | **Internal enum/state-machine vocabulary shown to user:** audit log renders raw `action` + from/to enum values; `STATUS_AR` only maps CANCELLED/REJECTED, so e.g. `PENDING_CONFIRMATION` prints raw. | P2 | OrderDetail.tsx:58-60,62-69,415 |
| V-23 | **Transport-mode code shown to customers:** `MANUAL_DELIVERY_LABEL = "تسليم واستلام يدوي"` mirrors API `SHED_MED` and is customer-facing copy incl. constraint text; merchants also see `"اتفاق مباشر مع الزبون بنفس دورة الطلب."`. | P2 | PublicLandingPage.tsx:90,352,402,712,723; LandingPageForm.tsx:67-70 |
| V-24 | **Platform concept surfaced to merchants:** `"تشغيل المتجر العام"`, `"انتهى تشغيل المتجر العام"`, `"المتجر العام متوقف"`. | P3 | Layout.tsx:151,465-467; ProviderStores.tsx:77 |
| V-25 | **Subscription plan-day model leaked** in provider UI (`14 -> تجربة مجانية`, `30/180/365 -> خطة مدفوعة`, else `غير محدد`). | P3 | ProviderStores.tsx:53-57 |
| V-26 | **Internal dev/showcase tool exposed in provider console** ("أداة متجر العرض التجريبي" reseed) + hardcoded `/s/ordely-showcase` on a **public marketing page**. | P2 | ProviderDashboard.tsx:104-168; ProviderApply.tsx:24,112 |
| V-27 | **Gendered theme names (`رجالي/نسائي`)** couple product taxonomy to presentation and power color fallbacks. | P3 | LandingPageForm.tsx:50-64 |
| V-28 | Homepage/NotFound/etc. are otherwise empty/consistent; the `/provider/login` subtitle is English ("Provider Console", ProviderLayout.tsx:29) amid Arabic. | P3 | ProviderLayout.tsx:29 |

---

## 4. Provider Business Lifecycle

### 4.1 Stage-by-stage trace

| Stage | UI | API | DB state | Clear user action | Failure state | Operational owner | Happens next |
|---|---|---|---|---|---|---|---|
| Lead submission | `POST /api/provider/leads` (public) + `ProviderApply`/`Login#apply` + WhatsApp CTA | `provider.ts:217-230` | `merchant_leads` row, `status=NEW` | Merchant applicant submits form + optional WhatsApp follow-up (`ProviderApply.tsx:23,365`) | 400 zod, no retry guidance; no confirmation email/SMS to lead | Platform provider | Provider reviews in `ProviderLeads` |
| Review | `ProviderLeads` list + status `<Select>` | `GET/PATCH /api/provider/leads/:id` (`provider.ts:232-261`) | status any of 5 values | Provider updates status dropdown | 404 if lead gone; toast `"تعذر تحديث حالة الطلب"` | Provider | Qualify or reject |
| Qualification | status options only (**no qualification notes field**, no manual disposition reason) | PATCH (status only) | status | Set QUALIFIED | — | Provider | Convert |
| Conversion | convert button per row | `POST /leads/:id/convert` (`provider.ts:263-336`) | creates store+merchant, sets lead CONVERTED + `converted_store_id` | Provider clicks convert; **plaintext merchant password shown once** | 409 if already converted / email in use; 409 generic on txn failure | Provider | Merchant gets password (offline relay) |
| Store creation | Showcase of converted store in ProviderStores + manual create | `POST /api/provider/stores` (`provider.ts:403-429`) | store row + user row | Provider fills name/email/phone/plan | 422/409 toasts | Provider | Merchant logs in |
| Trial | `subscription_plan_days=14` set on convert/manual | set in `provider.ts:306-307,418-419` | store fields | — | — | System (implicit) | Expiry in 14d |
| Activation | `isActive=true` default; storefront live once store exists | `effectiveActiveStoreSql` | `is_active`, `expires_at` | — | — | System | Public storefront live |
| Subscription | Plan select in ProviderStores edit modal | `PATCH /stores/:id` `subscriptionDays` `[30,180,365]` (`provider.ts:445-454`) | plan + expires_at (+ forced `isActive=true`) | Provider selects plan | 400/422 toasts | Provider + merchant WhatsApp | Merchant storefront stays live |
| Expiration | Provider sees `"منتهي"/"قريب الانتهاء"` computed client-side | read-time computed, no cron | `expires_at < now()` | Provider manual PATCH to renew | — | Provider (manual) | Storefront 404; **merchant still logs in** (see X/B gaps) |
| Suspension | Provider `isActive` toggle in edit modal | `PATCH /stores/:id` (`provider.ts:441-444`) | `is_active=false` | Provider toggles | — | Provider | Storefront 404; merchant dashboard still usable |
| Renewal | Manual: merchant WhatsApp → provider PATCH | same PATCH | expires_at reset to now+days | WhatsApp exchange then provider PATCH | None automated | Provider (manual) | Storefront live again |

### 4.2 Provider findings

| ID | Area | Severity | Finding | Evidence |
|---|---|---|---|---|
| P-01 | Lifecycle validation | P2 | **Lead status transitions are unvalidated** — PATCH accepts any of the 5 statuses with no state machine (REJECTED → QUALIFIED allowed; CONVERTED can be overwritten back to NEW; only the convert endpoint double-checks). Conversion and status are two independent controls that can disagree. | `provider.ts:241-261` (PATCH), `provider.ts:275-278` (only convert guard) |
| P-02 | Public abuse surface | P2 | **Lead submission is public AND not rate-limited** (only login + public-order have limiters). Spam-pipeline risk for a form that creates unverified merchant interest records. | `provider.ts:217-230`; `rateLimiter.ts:3-19` |
| P-03 | Credential handling | P2 | **Manual store creation never shows a chosen short password** — `requestedPassword` used only if `<8` else random, and password flow is ambiguous vs the dedicated create screen. Rejected input silently falls back to random instead of telling the provider their password was too weak. | `provider.ts:407-410,422-426` |
| P-04 | Operational visibility | P3 | **Provider cannot see orders/revenue/customers of stores** — only store count + today's order aggregates. No store drill-down. Acceptable for console scope; flagged as FUTURE. | `provider.ts:338-358` |
| P-05 | Showcase/dev tool in prod console | P2 | Reseed tool lives in provider dashboard + `ordely-showcase` store embedded in a public marketing page. | `ProviderDashboard.tsx:104-168`; `ProviderApply.tsx:24,112` |
| P-06 | Two identity paths | P3 | Env provider and `provider_users` both valid at runtime; cookie session can hold **both** merchant and provider identities simultaneously (shared session object). No conflict today because routes are disjoint. | `provider.ts:180-193`; `types/session.d.ts:4-12`; `app.ts:83-104` |
| P-07 | Subscription semantics | P3 | `subscriptionPlanDays`/`expiresAt` on `GET /stores` are exposed to merchant PATCH too — merchant can PATCH their own `isActive`. Provider-only controls aren't isolated in the API contract (see X-06/X-07). | `stores.ts:36-57`; update schema `api.ts:297-304` |

---

## 5. Merchant Business Lifecycle

### 5.1 Stage-by-stage trace

| Stage | UI | API | DB state | Clear action | Failure state | Owner | Next |
|---|---|---|---|---|---|---|---|
| Provisioning | Provider creates/convert; password delivered offline | convert / POST store | store+user rows | — | 409/422 | Provider | Merchant logs in |
| Login | `/login` + guard | `POST /api/auth/login` (`auth.ts:9-44`) | session `userId/storeId` | Email+password | 400/401 Arabic | Merchant | Dashboard |
| First-time state | Dashboard with skeleton+empty states | summary + reports | seeded/empty data | Quick actions (`تأكيدات`, orders, new product) | — | Merchant | Set up |
| Store profile | `Settings` tabs | `PATCH /stores/:id`, logo upload | name/logo/etc. | Save form | toast | Merchant | — |
| Delivery setup | `DeliverySystem` (58 zones, fees, communes) | zone + commune PATCHes | zones/settings | Set officeFee → activate zone; toggle communes | 422 no-office-fee; `"تعذر حفظ..."` toasts | Merchant | **Prerequisite for orders** |
| Category setup | Category UI in LandingPagesList | categories CRUD | `product_categories` | Create category | 409 default protected | Merchant | Product grouping |
| First product | `LandingPageForm` | `POST /landing-pages`, uploads | `landing_pages` row | Save page | 409 duplicate slug; upload fail | Merchant | **Page auto-public** (P-gap) |
| Publication | `is_active` default true on create (no explicit publish step); toggle in list | PATCH isActive | flag | Toggle `إيقاف/تفعيل` | — | Merchant | Public link shareable |
| First order | OrdersList realtime notifications + confirmations view | public order / confirm | order row | Customer orders | 422 delivery not available etc. | Merchant | Confirm |
| Order confirmation | ConfirmationsPanel + WhatsApp template message | `POST /orders/:id/confirm` (`confirmations.ts:84-116`) | CONFIRMED + confirmedAt | One-click confirm + WhatsApp copy | toast | Merchant | Ship |
| Shipping | Status buttons in OrderDetail | `PATCH` (`orders.ts:321-388`) | SHIPPED + shippedAt | Button per transition | 422 invalid transition | Merchant | Deliver/return |
| Delivery | `تم التسليم` | PATCH | DELIVERED + deliveredAt (terminal) | Button | — | Merchant | Revenue counted |
| Return | `استرجاع` (SHIPPED only) | PATCH | RETURNED + returnedAt (terminal) | Button (no reason captured) | 422 if not SHIPPED | Merchant | Report loss |
| Customer mgmt | CustomersList/Detail + notes | customers API | customers | Search/notes | — | Merchant | Follow-up |
| Reports | Reports daily/weekly + chart | daily/weekly (DELIVERED revenue) | aggregates | — | blank on error | Merchant | Business insight |
| Subscription expiry | Sidebar banner + modal (WhatsApp) | no API | store fields | WhatsApp manual renewal | — | Merchant+Provider | Storefront 404 (dashboard live) |
| Password mgmt | Settings account tab | `PATCH /auth/password` (min 6) | hash | Change | 400 wrong current | Merchant | — |

### 5.2 Merchant findings

| ID | Area | Severity | Finding | Evidence |
|---|---|---|---|---|
| M-01 | Onboarding | P2 | **No delivery-readiness gate.** New stores have 58 zones all `is_active=false` with null `officeFee`; a merchant can publish products and share links before any delivery zone is configured. Orders then fail at `422` delivery-zone/method errors. No UI surfaces "configure delivery first" until the merchant opens DeliverySystem. | `delivery-zones.ts:173-176`; `public.ts:205-238`; `Layout.tsx` nav |
| M-02 | Manual order entry | P2 | **`POST /orders` exists but has no UI.** Merchant manual order creation (for phone-sourced orders) is unreachable in the shipped admin. | `orders.ts:160-277`; grep no `createOrder` in web |
| M-03 | Order reference | P2 | **No human-readable order number.** Only numeric `id` (`#123`) returned to customer and shown in dashboards; gaps in the reference are likely in multi-store ops and customer cash-collection calls. | `orders.ts:35-36`; openapi PublicOrderResult |
| M-04 | Report correctness edge | P3 | Revenue = DELIVERED only; `RETURNED` from `SHIPPED` reduces revenue in the same period only if not already counted — consistent. Weekly/daily label mix (`مسلمة` vs `تم التسليم`). | `reports.ts:54-58,67` |
| M-05 | Password policy skew | P3 | Merchant self-change min **6** chars (`auth.ts:76`); provider reset min **8** (`provider.ts:474`). Inconsistent policy across the two credential paths. | `auth.ts:74-96`; `provider.ts:471-487` |
| M-06 | First-run UX | P3 | Empty states exist everywhere (good), but **no guided setup checklist** (delivery → product → share) on Dashboard for brand-new stores. | Dashboard.tsx; empty-state strings in lists |
| M-07 | Landing-page delete safety | P2 | Delete blocked when orders exist but message + icon-only title hints the pattern; keep (good) UI. | `landing-pages.ts:184-191`; LandingPagesList.tsx:439-441 |

---

## 6. Customer Lifecycle

### 6.1 Stage-by-stage trace

| Stage | UI | API | DB state | Clear action | Failure state | Owner | Next |
|---|---|---|---|---|---|---|---|
| Visit/discovery | PublicSta... storefront + legacy `/p/:slug` | `GET /api/public/s/:slug`, `/p/:slug` | store, products (is_active) | Browse carousel/categories, search client-side | 404 `"المتجر غير متاح"` | — | Select product |
| Product discovery | cards + client-side category/search filter | same storefront payload | `landing_pages` | — | — | — | Product detail |
| Product detail | `PublicLandingPage` template; `p/:slug` legacy alias | `GET /s/:slug/p/:productSlug` | landing page + related (`max 6` same category) | View variants/prices | 404 `"الصفحة غير موجودة"` | — | Order form |
| Variants | available_sizes/colors JSONB; `__label:` option groups | part of payload | JSONB arrays | Select size/color | invalid variant → 422 | Merchant | — |
| Delivery zone | public deliveryZones (active only) | `GET /s/:slug` payload `deliveryZones` | zones + settings | Choose wilaya | zone unlisted → disabled | — | Communes |
| Commune | select from enabled communes | in payload | settings | Choose commune | 422 disabled/mismatch | — | Method |
| Delivery method | HOME/OFFICE (+ manual transport label for SHED_MED) | zone fees | fees | Choose HOME/OFFICE | 422 method unavailable (SHED_MED forces OFFICE) | — | Quantity |
| Quantity | input 1..10 | in payload / schema | — | Set qty | zod 400 | — | Submit |
| Order submit | form + validation | `POST /api/public/s/:slug/order` (rate-limited 20/hr) | order + upsert customer | Submit | 422 delivery errors; 400 zod; 404 store | — | Success |
| Success | static `"تم استلام طلبك"` + order number + WhatsApp CTA | 201 body `{id, productName, totalPrice, deliveryFee, payableTotal, status}` | ORDER_CREATED audit | See number, WhatsApp | — | Merchant | **Dead-end (X-01/C-01)** |
| Post-order visibility | **NONE** | **NO public order-status endpoint** | status transitions visible only via merchant | none | — | Merchant (phone) | Merchant confirms by phone |
| Successful delivery | (none; only merchant marks DELIVERED) | PATCH (merchant-side) | DELIVERED | — | — | Merchant | Repeat purchase |
| Return/reject/cancel | customer has **no UI**; merchant-side only | merchant PATCH / reject | RETURNED/REJECTED/CANCELLED terminal | — | — | Merchant | — |
| Repeat purchase | `customers` upsert by (store, phone) | public order | same customer row | new order → same customer | — | — | Loop |

### 6.2 Customer findings

| ID | Area | Severity | Finding | Evidence |
|---|---|---|---|---|
| C-01 | Post-order visibility | P1 | **No customer-facing order-status view or track endpoint.** Customer never sees CONFIRMED/SHIPPED/DELIVERED; status only exists in merchant dashboards. For a COD/telephone-trust model this is the largest customer-lifecycle gap. | public.ts (no tracking route); PublicLandingPage.tsx:429-468; orders.ts:293-319 (merchant-only) |
| C-02 | Status communication | P2 | **No automated status communication** (SMS/WhatsApp/webhook) on confirm/ship/deliver; merchant must manually WhatsApp. The confirmations screen *prepares* a WhatsApp message for the merchant — customer contact is entirely human-initiated. | OrdersConfirmationsPanel.tsx:25-45; no message-send endpoint |
| C-03 | Reference identifier | P2 | Numeric serial `id` is the only reference (`#12`); no slug/order number; risk of `"mention order #12"` ambiguity across stores in phone support. | orders.ts:35-36 |
| C-04 | Invalid-delivery UX | P2 | When delivery info is invalid the customer gets a 422 with Arabic `{error}` text and their **submitted form data is not preserved/explained**, just an inline error; retry friction. (Client-side schema catches most field errors first, but server-side zone/commune/method failures land as inline text.) | public.ts:205-238; PublicLandingPage.tsx:352 |
| C-05 | Manual transport label to customer | P2 | SHED_MED appears to customers as `"تسليم واستلام يدوي"` with no explanation of what to expect (see V-23). | PublicLandingPage.tsx:90,723 |
| C-06 | No cart / no repeat-order shortcut | FUTURE | Single-product funnel with no cart; repeat purchase = full re-fill of form. By design for landing-page model. | PublicLandingPage.tsx |
| C-07 | Order success lacks next-steps copy | P3 | Success screen shows total + WhatsApp but no explicit "the merchant will call you to confirm" expectation-setting. | PublicLandingPage.tsx:429-468 |

---

## 7. Cross-System Lifecycle

### 7.1 Frontend ↔ API ↔ DB ↔ workflow comparison

| Capability | Frontend | API | DB | Workflow | Verdict |
|---|---|---|---|---|---|
| Storefront lookup by slug | PublicStorePage | public.ts findActiveStore (slug or numeric id) | stores.slug unique | live | OK |
| Product page | PublicLandingPage | public.ts product+related | landing_pages | live | OK |
| Order create (public) | PublicLandingPage form | public order | orders+customers | live | OK |
| Order create (merchant manual) | **none** | **orders.ts:160-277 exists** | orders | **no workflow** | **orphan capability (X-01)** |
| Customer order tracking | **none** | **none** | statuses exist | **workflow has no state-transition UI** | **dead-end (X-02)** |
| Confirmations | OrdersConfirmationsPanel | confirm/reject | CONFIRMED/REJECTED | live | OK |
| Ship/deliver/return | OrderDetail buttons | PATCH | transitions+timestamps | live | OK |
| Cancellation | OrderDetail cancel | PATCH | CANCELLED terminal | live | OK |
| Subscription renew | Layout modal (manual WhatsApp) | **provider PATCH only** | store fields | **no self-service** | manual/payment gap (B) |
| Merchant self-toggle isActive | Layout store status chip | PATCH store (merchant) | is_active | store on/off | OK (product decision) |
| Lead pipeline | ProviderLeads | leads CRUD+convert | merchant_leads | live | OK |
| Showcase reseed | ProviderDashboard tool | post /showcase/reseed | rebuilds demo | dev artifact | exposure (P-05/V-26) |
| Reports | Reports + Dashboard | daily/weekly/summary | aggregates | live | OK |
| Audit | OrderDetail audit list | GET /audit | audit_logs ORDER_* only | orders-only | coverage gap (X-03) |
| Password change/reset | Settings + provider UI | auth/password + provider reset | users hash | live | policy skew (M-05) |
| Store delete | none | none | none (RESTRICT FK) | **no closure workflow** | FUTURE (X-07) |

### 7.2 Cross-system findings

| ID | Area | Severity | Finding | Evidence |
|---|---|---|---|---|
| X-01 | Orphan API | P2 | Merchant manual-order **API exists with zero UI** (`POST /stores/:id/orders` not called anywhere in web). Either wire it or remove it — today it is invisible capability. | `orders.ts:160-277`; no `createOrder` in apps/web |
| X-02 | Dead-end workflow | P1 | Customer lifecycle has a **hard terminal at order-success**: no tracking, no status UI, no automated message. Follows from C-01. | PublicLandingPage.tsx:429-468; no public status route |
| X-03 | Audit coverage | P2 | `audit_logs` only records ORDER_CREATED/STATUS_CHANGED/CONFIRMED/REJECTED (`audit.ts`, `confirmations.ts`). Store, delivery, catalog, product, customer, subscription, auth, lead events are **not logged**. | grep action strings: `audit.ts`, `orders.ts:275,379`, `confirmations.ts:108,141` |
| X-04 | Generated contract drift | P2 | `api-zod`/`api-client-react` generated types **omit fields the server actually returns/accepts**: `UpdateProviderStoreBody` lacks `subscriptionDays` (accepted at provider.ts:445) and `ListProviderStoresResponseItem` lacks subscription/formatStore fields the provider UI consumes. Runtime/type mismatch risk for the merchant/pay renewal path. | `lib/api-zod/src/generated/api.ts:180-223`; `provider.ts:131-133,445-454`; `ProviderStores.tsx:14-15` |
| X-05 | Session identity coexistence | P3 | One cookie holds both merchant and provider identities (`userId`+`storeId` and `providerUserId`); provider logout deletes keys only (no cookie clear) while merchant logout clears cookie — inconsistent logout semantics. | `auth.ts:51-56`; `provider.ts:195-200`; `session.d.ts:4-12` |
| X-06 | Merchant self-deactivation | P3 | Merchant PATCH may set own `isActive` false/true — this is exposed alongside provider controls; harmless today but API surface isn't role-scoped. | `stores.ts:36-57`; update schema `api.ts:297-304` |
| X-07 | Store lifecycle absence | FUTURE | No store delete/closure or store-archival workflow at any layer (FK RESTRICT protects data; provider must deactivate). | schema FKs (no onDelete), `ProviderStores.tsx` has no delete |
| X-08 | Quantity bounds mismatch | P2 | Public order caps quantity 1..10 (`public.ts:23`); merchant manual-order schema has **unbounded** quantity (`api.ts:733`). Two creation paths disagree. | `public.ts:13-25`; `api.ts:722-735` |
| X-09 | Pagination nominal | P3 | Orders list returns `page:1, limit:length` — pagination is a facade; a store with thousands of orders will grow the payload unbounded. | `orders.ts:147-157` |
| X-10 | Error shape inconsistency | P3 | Error payloads mix shapes: `{error}` (most), `{error, details}` (zod), Arabic vs English messages; storage 502/503; convert txn catch-all 409. Not user-facing today (toasts show `error`), but a contract-quality issue. | `public.ts:192-194`; `provider.ts:333-335`; `uploads.ts:91,97` |
| X-11 | Implicit publication | P1 | New landing pages auto-active before delivery config (see M-01/P-gap). Same root cause surfaced twice. | `landing-pages.ts:27`; `public.ts:75`; LandingPageForm |
| X-12 | Subscription only-informational | P2 | Expiry is purely derived — dashboard banner and storefront gate diverge (store can be 404 while merchant keeps managing). No "expired" computed field from server; no renewal API. | Layout.tsx:148-178; public.ts:11; ProviderStores.tsx:74-82 |

---

## 8. Business Gaps

Business gaps = places where the business operating model has no automated or clearly-owned workflow.

| ID | Gap | Severity | Type | Finding |
|---|---|---|---|---|
| B-01 | Subscription renewal requires **manual WhatsApp + provider PATCH** | P2 | PRODUCT DECISION (current model is manual renewal) | No self-service renew, no online payment, no reminder automation. Merchant sees a "manual renewal" modal (`Layout.tsx:473-507`). For the COD/commercial model this is accepted; flagged as the #1 **commercial** gap if growth target changes. |
| B-02 | Storefront/merchant divergence on expiry | P2 | BUG-ADJACENT gap | Store with `expires_at < now()` is 404 to customers (`public.ts:11`) but the merchant still **logs in and manages** orders silently. No hard-stop or explicit "subscription needed" modal in merchant flow. |
| B-03 | No commission/take-rate measurement | P3 | PRODUCT DECISION | Provider has no revenue/commission view (only counts). Order volume is tracked; monetary platform take is not computed anywhere. |
| B-04 | No customer lifecycle retention tooling | P2 | FUTURE FEATURE | No reorder, no customer broadcast/WhatsApp campaign, no repeat-purchase analytics beyond customer order history. |
| B-05 | Lead pipeline has no quality/notes data | P3 | FUTURE | Only a 5-state status; no qualification score, source, notes, or deal-owner fields. |
| B-06 | COD-only means no pre-payment risk tooling | P3 | PRODUCT DECISION | No deposit/advance concept, no payment capture. Matches market norm. |
| B-07 | No store directory/discovery | P3 | PRODUCT DECISION | Storefronts are reachable only by direct link/slug, not by any public directory/search. Fine for current funnel. |

---

## 9. UX Gaps

Combined, cross-layer UX gaps (severity-scored).

| ID | Gap | Severity | Finding |
|---|---|---|---|
| U-01 | Admin screens: **no error state / no retry** | P2 | All list dashboards silently show empty content on API failure (V-05). Global `retry:1` hides transient failure but escalation to "empty" is misleading. |
| U-02 | **Destructive actions lack confirm** in merchant UI | P2 | Reject/return/cancel fire immediately; page/order toggles unconfirmed (V-06). |
| U-03 | **First-run guidance missing** | P2 | New merchant has no "do these 3 steps" checklist (delivery fees, product, share link); delivery-readiness not gated (M-01/X-11). |
| U-04 | **Device responsiveness is good** on carousel/cards/tables | positive | Desktop QA-pass; admin tables have mobile card fallback in every list. RTL/typography consistent (V-13). |
| U-05 | **Terminology drift** across status/aggregate labels | P3 | `مسترجع/مسترجعة`, `تم التسليم/مسلمة`, `ايراد/ايرادات (مسلمة)` (V-15..V-19). |
| U-06 | **Accessibility** gaps | P3 | Icon-only buttons, no aria-live toasts, no aria-modal dialogs, show-password unbranched focus (V-09). |
| U-07 | **Loading feedback** partial | P3 | No skeletons in audit/notifications; auth-guard blank flash (V-07). |
| U-08 | **Locale inconsistency** (numbers/dates) | P3 | `ar-SA` vs `ar-DZ` vs `en-US` grouping across screens (V-11). |
| U-09 | **Customer funnel trust cues** | P2 | No status tracker, no expected-next-step copy on success, manual-transport wording unexplained (C-01,C-05,C-07). |

---

## 10. State/Transition Gaps

State-machine level findings (DB enum/state ↔ workflow coverage).

| ID | Gap | Severity | Finding |
|---|---|---|---|
| S-01 | **`RETURNED` can only be reached from `SHIPPED`** — a `DELIVERED` order cannot be returned/voided, so a "customer returns after delivery" has **no state transition**; merchant must leave it DELIVERED (revenue already counted) with no refund mechanism. | P1 | `transitions.ts:1-14`; `reports.ts:54-58` counts DELIVERED as revenue. Return-after-delivery is a real COD scenario, unmodeled. |
| S-02 | **No `cancelledAt` / `rejectedAt` timestamps** | P2 | Audit/traceability of why/when cancel/reject happened is absent (only `notes`, no column). Cart abandonment reason lost. | `orders.ts:356-359` columns list |
| S-03 | **`CANCELLED`/`REJECTED`/`RETURNED` are terminal** with no un-terminal action; a mis-click cannot be undone. | P2 | One-way transitions only. |
| S-04 | **Lead status transitions unvalidated** (same as P-01) | P2 | Any status → any status via PATCH. |
| S-05 | **Order statuses observed but untested for concurrency** — two simultaneous PATCHes could race; no `optimistic` versioning (`updated_at` exists but unused). | P3 | `orders.ts:356-359` uses `updated_at` but PATCH doesn't compare. |
| S-06 | **Merchant login ignores `is_active`/expiry** (see B-02) | P2 | Login only checks user row existence (`auth.ts:30-34`); a suspended merchant still operates the admin. |
| S-07 | **New store has no "storefront-on" readiness state** — the moment a store exists (is_active default true), its storefront is reachable/live even with no products, delivery config, or logo. | P2 | `stores.ts:13` default true; `public.ts` effective-active check. |

---

## 11. Missing Operational Capabilities

Capabilities that exist nowhere in the system but are needed to run the business.

| ID | Capability | Severity | Notes |
|---|---|---|---|
| O-01 | Customer order-status **tracking endpoint + UI** | P1 | Covers C-01/X-02. Even a "check by {order id + phone}" public page would resolve the largest lifecycle gap. |
| O-02 | Automated status **notification** (WhatsApp/SMS) to customer & merchant | P2 | Currently fully manual (ConfirmationsPanel prepares copy; nothing sends). |
| O-03 | Merchant **renewal self-service** or at least an in-app renewal request | P2 | Currently merchant → copy/paste WhatsApp → provider PATCH. Circular offline loop (B-01). |
| O-04 | **Expiry/suspension enforcement UI** for merchant | P2 | Dashboard uses a passively computed banner; the admin never hard-interrupts on expired subscription with a clear next step (B-02/S-06). |
| O-05 | **Return-after-delivery** workflow (refund/reversal) | P1 | See S-01. Requires a transition or an `is_delivered_returnable` flow. |
| O-06 | **Manual order entry UI** (merchant captures phone orders) | P2 | API orphan exists (X-01); merchant gets orders by phone in COD reality, this UI is likely the highest-value near-term add. |
| O-07 | **Lead review/qualification notes + tracking** | P3 | See B-05. |
| O-08 | **Store deletion/closure** (safe archival) | FUTURE | X-07. |
| O-09 | **Provider drill-down** (orders/revenue per store) | FUTURE | P-04. |
| O-10 | **Reminder of trial expiry** (email/SMS to merchant) | P2 | No proactive channel at all. Manual renewal depends on merchant opening the dashboard. |
| O-11 | **Audit expansion** beyond order events | P2 | X-03. |
| O-12 | **Consistent role-scoped API for store controls** | P3 | X-06. Merchant can self-toggle `is_active` (storefront on/off) which overlaps provider's suspension semantics — decision needed on who owns activation. |

---

## 12. Priority Matrix

### P1 (major business workflow gap)

| ID | Area | Current behavior | Expected business behavior | User impact | Operational impact | Recommendation direction |
|---|---|---|---|---|---|---|
| C-01/X-02 | Customer lifecycle | Order ends at a static success screen; no status view, no tracking | Customer can confirm/ship/delivery status after ordering (at minimum by order id + phone) | Customer anxiety/trust; no evidence for COD dispute resolution | Personnel answer "where is my order" calls manually with no tool | Add `GET /api/public/orders/:id/status` + public status lookup page (ID/phone guard). |
| S-01/O-05 | Return handling | DELIVERED is terminal; revenue counted; no reversal | Return-after-delivery supported (reason + refund/reversal) | Merchant can't officially log customer returns post-delivery | Revenue/report accuracy distorts COD returns | Add `DELIVERED -> RETURNED` transition (or a `returned_after_delivery` flow) + return reason. |
| M-01/X-11 | Publication readiness | New landing page auto-active = live before delivery config; no readiness gate | A page becomes purchasable only when the store has ≥1 active zone/fee configured | Customers hit "delivery unavailable" 422; merchant confused | Orders rejected at checkout; merchant trust drop | Gate publication (explicit publish or auto-unpublish until delivery ready). |
| B-02/S-06 | Expiry enforcement | Expired store: storefront 404, merchant still logs in and runs dashboard | Expired merchant gets explicit in-dashboard interrupt: renew/contact to resume | Merchant unaware storefront is down | Revenue leak (store down without owner notified) | Server-computed status field; merchant dashboard gate + renewal CTA; notify on expiry. |

### P2 (important usability/operational gap)

| ID | Area | Recommendation |
|---|---|---|
| V-05/U-01 | Error/retry UI | Add per-screen error + retry states; never collapse an API failure into the "empty" state. |
| V-06/U-02 | Destructive confirmations | Confirm reject/return/cancel/toggle (use existing `ConfirmActionDialog` pattern). |
| C-02/O-02 | Automated notifications | At minimum a whatsapp:// send on confirm/ship/deliver; follow with SMS/webhook. |
| C-03/M-03 | Order reference | Add a human-readable order number (`slug-number`) or keep numeric but normalize display. |
| C-04 | Invalid-delivery UX | Preserve form draft, explain which field to fix, offer retry. |
| X-01/O-06 | Manual order entry UI | Wire existing `POST /orders` into a merchant "New order" screen (highest-value near-term). |
| X-04 | Contract drift | Regenerate api-zod/api-client-react after updating openapi; add `subscriptionDays` + subscription response fields. |
| X-08 | Quantity bounds | Unify 1..10 across both creation paths. |
| S-02/S-03 | State traceability | Add cancel/reject timestamps; consider undo/terminal-flexible transitions with confirmation. |
| P-01/S-04 | Lead machine | Enforce allowed lead transitions in API. |
| P-02 | Lead rate limit | Rate-limit `POST /provider/leads`. |
| P-03/P-05/V-21/V-22/V-26 | Provider console hygiene | Show password via a reveal/one-time mask; hide active dev/reseed tool behind an env gate; translate raw enums; remove showcase slug from public marketing page. |
| O-10 | Trial-expiry reminders | Add proactive notify (in-app + optional SMS) before trial end. |
| O-11/X-03 | Audit breadth | Log store/delivery/catalog/subscription/auth events (config-driven). |

### P3 (improvement / polish)

V-01..V-04 (unify design system and remove dead kit), V-07..V-12/V-15..V-19 (locales, terminology, a11y), X-09 (real pagination), X-10 (error-shape contract), X-05 (logout/session semantics), M-05 (password policy), O-12 (role-scoped API), X-06 (self-toggle polish).

---

## 13. Recommended Product Fix Order

Suggested sequencing (not a build plan; candidates for the next phase once approved):

1. **Customer order-status tracking (C-01/X-02/O-01)** — closes the #1 lifecycle dead-end. Public endpoint + lightweight "status lookup" page (order id + phone).
2. **Publication readiness gate (M-01/X-11)** — stop auto-publishing until delivery is configured; add first-run checklist.
3. **Return-after-delivery + reason (S-01/O-05)** — reflect true COD return economics in transitions and reporting.
4. **Expiry/suspension enforcement + notification (B-02/O-10)** — server-computed status, dashboard gate, pre-expiry reminder.
5. **Manual order entry UI (O-06)** — high merchant value, reuses existing API.
6. **Error/retry states + destructive confirmations (U-01/U-02)** — merchant UX baseline.
7. **Automated status messaging (O-02)** — WhatsApp-first.
8. **Provider console hygiene (P-03/P-05/V-21)** — credential masking, retract dev tool, hide implementation labels.
9. **Contract alignment + quantity bounds (X-04/X-08)** — API/Zod regeneration.
10. **Hardening/tech-debt sweep (P3 group)** — design system unification, locale, pagination, audit breadth, lead/rate-limit validation.

---

## 14. Explicitly Deferred / Future Features

These are intentionally NOT in the current product model. They are recorded here so no future phase treats them as bugs:

| ID | Item | Reason |
|---|---|---|
| F-01 | **Online payment / prepayment / payment capture** | COD-only is the current commercial model (B-06). Business decision, not defect. |
| F-02 | **Inventory/stock/SKU/variant pricing** | The "landing page = product" model has no catalog layer (C-06/F-design). Matches the storefront-funnel concept today. |
| F-03 | **Store directory / discovery / analytics facilities** | Direct-link discovery only (B-07). |
| F-04 | **Customer reorder / wishlist / cart** | Single-product funnel by design (C-06). |
| F-05 | **Provider revenue/commission dashboard** | No commercial instrumentation yet (B-03/P-04). |
| F-06 | **Lead quality/notes/CRM fields** | Lead pipeline is deliberately minimal (B-05/O-07). |
| F-07 | **Store deletion / merge / archival** | Data-protection practice today is provider deactivation (X-07/O-08). |
| F-08 | **Customer email / cross-store identity** | Phone is the identity per store; suitable for market, no email field (B-04/O-04). |
| F-09 | **Multi-role merchant (staff, cashiers)** | Exactly one user per store; no role hierarchy (X-05/M-06). |
| F-10 | **SMS/WhatsApp broadcasting & campaigns** | Client-retention tooling (B-04) — no such channel today. |

---

## Appendix A — Finding index

- **Visual:** V-01..V-28 (sections 3.1–3.5)
- **Provider:** P-01..P-07 (section 4.2)
- **Merchant:** M-01..M-07 (section 5.2)
- **Customer:** C-01..C-07 (section 6.2)
- **Cross-system:** X-01..X-12 (section 7.2)
- **Business:** B-01..B-07 (section 8)
- **UX:** U-01..U-09 (section 9)
- **State/transition:** S-01..S-07 (section 10)
- **Operational:** O-01..O-12 (section 11)
- **Deferred/future:** F-01..F-10 (section 14)

## Appendix B — Evidence sources

- `apps/web/src/App.tsx` — routing/guards/query config
- `apps/web/src/pages/*` + `apps/web/src/pages/provider/*` — UI states
- `apps/web/src/components/{Layout,ProviderLayout,StatusBadge,ProductImageThumb,product-options}.tsx`
- `apps/web/src/index.css`, `index.html`, `src/lib/currency.ts`
- `apps/api-server/src/routes/{auth,provider,stores,orders,confirmations,customers,delivery-zones,landing-pages,product-categories,public,reports,uploads}.ts`
- `apps/api-server/src/lib/{transitions,showcaseSeed,ensureDefaultCategory,audit,password}.ts`
- `apps/api-server/src/middleware/{requireAuth,rateLimiter}.ts`, `src/app.ts`
- `lib/db/src/schema/*.ts`, `lib/db/scripts/*.mjs`, `lib/db/drizzle.config.ts`
- `lib/api-spec/openapi.yaml`, `lib/api-zod/src/generated/api.ts`

> **Phase 8 complete — product audit delivered. No code, database, business data, or deployment was modified. Stopping here. Visual, commercial and lifecycle audits were the deliverable; next changes require explicit direction.
