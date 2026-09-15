# Phase 4 — End-to-End Verification Report (التقرير النهائي للتحقق الشامل)

> Date run: 2026-09-15 | Environment: local (Vite `:5173` → API `:8080` → PostgreSQL Supabase `kofvrrcixoakvwjlmhzm`) | No application source code was modified during this phase.

---

## Executive summary (ملخص تنفيذي)

Restoration verified end to end. Showcase store lives at `/s/ordely-showcase`; merchant login, order lifecycle, reporting, image upload and multi-tenant isolation all work. **No P0** issues. **One P1** bug found (product categories page 500). Several P2/P3 items recorded for later fixing. Provider dashboard password **could not be verified** (only a bcrypt hash exists in `.env`, no plaintext).

---

## 1. Storage bucket (تخزين الصور)

- Bucket `product-images` exists and is **public**, created manually by the operator at `2026-09-15T08:43:18Z` (confirmed as a manual action from Phase 3).
- Config: `public=true`, `file_size_limit=5242880`, `allowed_mime_types=[image/jpeg, image/png, image/webp]`.
- Verified via service-role API: upload → 200, public URL fetch → 200 (`image/png`), delete → 200.
- **Anomaly (P3):** listing objects via service-role returned a non-array `400` response shape; single-object publish/delete work fine. Non-blocking.
- Merchant flow (Step 11) re-verified the bucket end to end.

## 2. Showcase seed (بيانات المتجر التجريبي)

- Ran directly (no `npm run seed-showcase-store` script exists):
  `node --env-file-if-exists="...\.env" ./scripts/seed-showcase-store.mjs`
- Output: **"Showcase store ready: /s/ordely-showcase", "Seeded products: 8", "Seeded orders: 20", "Active delivery zones: 26/58".**
- Script is single-transaction, scope-limited to showcase entities; re-runs cleanly (verified twice).

## 3. Post-seed database state (حالة القاعدة بعد البذر)

| Entity | Count / detail |
|---|---|
| Stores | 1 — `Ordely Showcase` (`ordely-showcase`), active, subscription 365d → expires `2027-09-15` |
| Merchant user | id=1 `showcase@ordely.local`, bcrypt hash (cost 12 after re-seed) |
| Categories | 5 — `perfumes` (default) + home-decor, small-appliances, professional-tools, fashion-accessories |
| Landing pages | 8 — e.g. `lina-rose-mist` 3900, `sovage-pure` 4500, `wood-decor-set` 6800, … |
| Delivery zones | 58 total / 26 active; 7 disabled communes |
| Customers | 12 |
| Orders | 20, all statuses present, linked to customers + landing pages, audit paths |
| Sessions | 0 initially (table empty and ready) |

## 4. Local run + sessions + CORS (التشغيل المحلي والجلسات)

- `/api/healthz` → 200; CORS reflects `https://ordely.vercel.app` for API.
- Vite proxies `/api` and `/uploads` to `127.0.0.1:8080`.
- Sessions live in Postgres under `order_os.sessions` — created, PK `(sid)`, index on `(expire)`, write + rollback test passed (Phase 3).
- During testing the sessions table held **12 rows, all with `userId`**, 7-day expiry (`expire ≈ 2026-09-22`), cookie name `order_os.sid` — persistence confirmed across requests.

## 5. Provider verification (لوحة المزود)

- `/api/provider/auth/me` unauth → `{"user":null}`; dashboard/summary/leads/stores unauth → 401; wrong password (email+password) → 401; missing email/password → 400.
- **Provider real login NOT verified**: only `PROVIDER_PASSWORD_HASH` is in `.env`, no plaintext available — recorded as a verification gap, not a defect.
- Code review confirms env-provider fallback + `provider_users` table path both compare bcrypt.

## 6. Merchant verification (لوحة التاجر)

- Login → 200 `{user:{id:1, storeId:1, storeName:"Ordely Showcase"}}`, session cookie persisted.
- Endpoints: store 🔹 landing-pages 🔹 orders 🔹 customers 🔹 delivery-zones 🔹 reports/daily 🔹 reports/weekly 🔹 confirmations 🔹 orders/summary → all **200**.
- Cross-store `/api/stores/99999999/orders` → **403**.
- **Anomaly (P2):** first merchant login failed (401). The original `.env` didn't match the first seed — after re-running the seed the stored hash verifies (cost 12). Re-seeding fixed it. Recorded for attention.

## 7. Public storefront (الصفحة العمومية)

- `/api/public/s/ordely-showcase` → 200 (store + 5 categories + 8 products).
- `/api/public/s/ordely-showcase/p/sovage-pure` → 200: price 4500, 3 images, sizes/colors (with `__label:` convention), 26 delivery zones, wilaya 16 → 55 communes (disabled commune correctly excluded), HOME=450+250, OFFICE=450.

## 8. Real end-to-end test orders (طلبات تجريبية حقيقية)

3 orders created via the **public order endpoint** (no extra code):

| Order | Customer | Method | Totals | Outcome |
|---|---|---|---|---|
| 41 | QA Test Customer | HOME wilaya 16 | 4500 + 700 = **5200** | DELIVERED attempt → 422 (invalid); drove NEW→PENDING_CONFIRMATION→**REJECTED** |
| 42 | QA Full Path | NEW | 4500 + 450 | NEW→**CANCELLED** |
| 43 | QA Full Path | OFFICE wilaya 16 | 4500 + 450 = **4950** | NEW→PENDING_CONFIRMATION→CONFIRMED→SHIPPED→**DELIVERED** |

Delivery fee math verified: HOME = officeFee + homeFee (450+250=700); OFFICE = officeFee (450). `payableTotal = totalPrice + deliveryFee` matches DB.

## 9. Order state machine (آلة الحالات)

`VALID_TRANSITIONS`: NEW→[PENDING_CONFIRMATION, CANCELLED]; PENDING_CONFIRMATION→[CONFIRMED, REJECTED]; CONFIRMED→[SHIPPED, CANCELLED]; SHIPPED→[DELIVERED, RETURNED]; terminal states have no exits.

- **Invalid** NEW→DELIVERED → **422** (Arabic error). ✓
- Happy path order 43 → all 200; `confirmedAt`/`shippedAt`/`deliveredAt` all set. ✓
- Audit trail (order 43): `ORDER_CREATED → STATUS_CHANGED NEW→PENDING_CONFIRMATION → …→CONFIRMED → …→SHIPPED → …→DELIVERED`. ✓
- Cancel (42) and reject (41) paths also audited. ✓

## 10. Reporting (التقارير)

- `/orders/summary`: total 23 | new 3, pending 2, confirmed 3, shipped 3, delivered 4, returned 2, cancelled 3, rejected 3 | **totalRevenue 40200, deliveryRevenue 3900, returnLoss 560, netRevenue 43540**.
- Numbers reconcile with computing from `/orders` (the 4 DELIVERED orders → 40200 + 3900). `net = revenue + deliveryRevenue − returnLoss`. ✓
- Daily `2026-09-15`: 10 orders, 1 delivered, revenue 4500, dRev 450, net 4950. ✓
- Weekly: 7 days; returned-loss days (09-10, 09-11: −280 each) and revenue days (09-12: 14400/750, 09-13: 21300/2700) all consistent.
- **Note (P3, do not change logic):** daily/weekly bucket by **UTC day** (`new Date(dateStr + "T00:00:00.000Z")` and `toISOString()`). Algeria is UTC+1, so local-day boundaries are shifted by 1h. Recorded only.

## 11. Image upload (رفع الصور)

Via merchant API `/api/stores/1/uploads/product-image`:
- Unauth → 401 ✓; auth → **201 + public Supabase URL** ✓; bad `contentType` → 400 ✓; >5MB guard present (413). ✓
- Whole circle: uploaded object → linked into `landing_pages.product_images` (PATCH) → served by **public storefront** → image fetch 200 (`image/png`) → original image restored afterwards. ✓
- Upload path stored as `stores/{storeId}/{timestamp}-{uuid}-{name}.{ext}`.

## 12. Security & access (الأمان والصلاحيات)

- **Multi-tenant isolation:** all 10 merchant routes for `storeId=99999999` → **403** (orders, orders/summary, single order, landing-pages, single page, customers, delivery-zones, reports/daily, confirmations, product-categories). Own store → 200 (product-categories 500, the known P1).
- **Unauth (no cookie):** orders, landing-pages, customers, delivery-zones, reports, product-categories, uploads → **401**; provider summary → 401; provider `/dashboard` path → 404 (no such route).
- **Public:** active showcase → 200; nonexistent slug → 404; `../..` traversal-ish → 404; numeric slug → 404.
- **Rate limiting:** merchant login 10/15 min/IP → **429 "حاول بعد 15 دقيقة"** (live-verified); public order POST 20/hour. **Provider login has no limiter (P2).**
- `requireStoreAccess` middleware (`requireAuth.ts`) enforces `storeId === session.storeId` on all merchant routes — confirmed by code on router index.
- Merchant logout destroys session → `/auth/me` returns `{"user":null}`. ✓

## 13. Build (البناء)

- `apps/web` build succeeds. Warning: **"Some chunks are larger than 500 kB after minification"** (P3 — no runtime impact; consider `manualChunks`).
- API server builds and boots (`dist/app.mjs`), needs `PORT` env (throws if absent) — by design.

---

## Issues & classifications (المشاكل وتصنيفها)

| ID | Severity | Issue | Evidence | Where |
|---|---|---|---|---|
| 1 | **P1** | `GET /api/stores/:id/product-categories` → **500**: `duplicate key value violates unique constraint "product_categories_store_default_unique"`. Root cause: `ensureDefaultCategory` inserts a second `is_default=true` (`'عام'/'general'`) with `ON CONFLICT (store_id, slug)` which does **not** target the partial unique index `(store_id) WHERE (is_default=true)`; a default already exists (perfumes). Live DB confirms: index exists, 1 default, 0 `general` rows. Reproduced repeatedly (8× in api-server.log; re-verified in final isolation run). Same `ensureDefaultCategory` copy exists in `landing-pages.ts` — creating/updating a landing page **without** a `categoryId` will hit the same 500. | stack `product-categories.ts:25` via :71 | `apps/api-server/src/routes/product-categories.ts`, `src/routes/landing-pages.ts` |
| 2 | **P2** | drizzle-kit `push` runtime failure: `Cannot find module './app-schema.js'` (ESM `.js` import vs `.ts` physical file). Non-blocking — DB schema already matches Drizzle. | `npm run db:prepare` step 1 | `drizzle.config.ts` |
| 3 | **P2** | Merchant login password anomaly — first login 401 until seed re-run (hash cost changed from 10 → 12). Cause of the initial mismatch not fully isolated; re-seed produces a valid hash. | step-6 merchant test | seed script + `.env` |
| 4 | **P2** | Provider `/auth/login` has **no rate limiter** (merchant: 10/15min, public orders: 20/h). | `middleware/rateLimiter.ts` | provider route |
| 5 | **P3** | Logout clears `connect.sid` but the session cookie is named **`order_os.sid`** → cookie not cleared client-side (session row IS destroyed; `/me` → null). | `auth.ts:52` vs `app.ts:85` | `apps/api-server/src` |
| 6 | **P3** | Reports bucket daily/weekly by **UTC** day (Algeria = UTC+1 boundary shift). Not changing logic. | `routes/reports.ts:12-13,96-98` | dev documentation |
| 7 | **P3** | Web build "chunks larger than 500 kB" warning. | `apps/web npm run build` | bundler config |
| 8 | **P3** | Storage list-objects API returned non-array `400` shape (single-object ops fine). | Step 1 test | Supabase API |
| 9 | **P3** | `ensure-store-subscriptions` script is orphaned (not in `db:prepare` chain). | package scripts | `lib/db` |
| 10 | **Gap (not a defect)** | Provider real login not verifiable — only `PROVIDER_PASSWORD_HASH` in `.env`. | — | env |

---

## Verification gaps (فجوات التحقق)

- Provider password (no plaintext available) — would require operator to supply it or a known-good login.
- Browser-level UI rendering (dashboard reactivity, gallery) not exercised; API contract, data and storefront payloads verified over HTTP.
- Hard-coded `__label:` prefix inside `availableSizes`/`availableColors` requires the frontend to strip it (checked downstream, no defect found).

## Artifacts (أدلة المسارات)

- API server log (with P1 stacks): `C:\Users\stormpc\AppData\Local\Temp\opencode\db-check\api-server.log`
- Test scripts (11): `…\db-check\test-{step5-provider,step6-merchant,e2e-order,state-machine,full-path,cancel,reports2,upload-api,image-render,security-noauth,isolation-final}.mjs`
- Phase 3 report: `Docs/PHASE-3-RESTORATION-REPORT.md`; audit: `Docs/CURRENT-SYSTEM-STATE-AUDIT.md`.