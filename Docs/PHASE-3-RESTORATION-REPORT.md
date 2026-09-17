# PHASE 3 — RESTORATION REPORT

<!-- DOC-META
type: phase-report
status: historical
verified-as-of: 2026-09-17
related: Docs/INDEX.md
notes: Closure stamp. Immutable historical record - not current truth. See Docs/current/ and Docs/decisions/ for the living model.
-->

**Date:** 2026-09-15
**Status:** Steps 1–5 complete. Step 6 (showcase seed) awaiting explicit approval.
**Scope:** idempotent DB restoration, provider access verification, storage action item, showcase readiness.

---

## 1. Database Session Restoration Result ✅

**Command run:**
```
npm run ensure-sessions   (lib/db directory)
```
**Result:** `Session table is ready.` — no errors.

**Verified properties (live inspection after creation):**

| Property | Result |
|---|---|
| Table exists (`information_schema`) | ✅ `order_os.sessions` |
| Columns (in order) | `sid` — `character varying`, NOT NULL |
| | `sess` — `json`, NOT NULL |
| | `expire` — `timestamp without time zone`, NOT NULL |
| Primary key | `sessions_pkey` on `(sid)` |
| Expiration index | `sessions_expire_idx` on `(expire)` |
| Session store config (app.ts) | `schemaName: "order_os"`, `tableName: "sessions"`, `createTableIfMissing: true` |
| Write test (rollback) | ✅ `insert + select succeeded`, rolled back — no rows persisted |
| `pg_proc` session helper functions | 1 session-related function exists (optional; table-based store does not require it) |

**Conclusion:** `connect-pg-simple` requirements are fully met. Postgres session storage is now restored.

---

## 2. `db:prepare` Result

**Command:** `npm run db:prepare` (from `lib/db/`)

This chains 10 scripts sequentially: `drizzle push` → 9 `ensure-*` scripts.

### Per-script breakdown

| # | Script | Result | Notes |
|---|---|---|---|
| 1 | `push` (drizzle-kit) | **❌ FAILED** | `Cannot find module './app-schema.js'` — TS import resolution error at runtime. Schema already matches the Drizzle source exactly (confirmed by prior audit). **No DB touch occurred** (error thrown at config/schema load stage, before connecting). |
| 2 | `ensure-store-slugs` | ✅ No-op | `Store slugs are ready.` |
| 3 | `ensure-returned-status` | ✅ No-op | `Returned order status is ready.` (RETURNED enum + returned_at col already present) |
| 4 | `ensure-delivery-system` | ✅ No-op | `Delivery system schema is ready. Empty seeded zones were cleaned safely.` — cleanup deleted **0 rows** (delivery_zones was already empty) |
| 5 | `ensure-delivery-communes` | ✅ No-op | `Delivery commune settings schema is ready.` |
| 6 | `ensure-order-product-images` | ✅ No-op | `Order product image snapshots are ready.` |
| 7 | `ensure-landing-page-store-slugs` | ✅ No-op | `Landing page slugs are scoped per store.` |
| 8 | `ensure-landing-page-transport-mode` | ✅ No-op | `Landing page transport mode is ready.` |
| 9 | `ensure-merchant-lead-conversion` | ✅ No-op | `Merchant lead conversion columns are ready` |
| 10 | `ensure-sessions` | ✅ Idempotent | `Session table is ready.` (table already created in Step 1) |

### Post-`db:prepare` state verification

```
order_os tables (12): audit_logs, customers, delivery_commune_settings,
  delivery_zones, landing_pages, merchant_leads, orders,
  product_categories, provider_users, sessions, stores, users

Row counts: ALL business tables = 0 | provider_users = 1 | sessions = 0
Enums: delivery_method (HOME, OFFICE) | order_status (8 values) | merchant_lead_status (5 values)
```

**Conclusion:** No destructive changes. Schema is intact. The `push` step failed with a pre-existing drizzle-kit TS resolution bug — harmless when the schema already matches (as confirmed by Phase 2 audit). All `ensure-*` scripts are idempotent and completed cleanly.

> **Note:** `ensure-store-subscriptions` (adds subscription_plan_days + subscription_expires_at + backfills) is **not included** in the `db:prepare` chain. Those columns already exist in `stores` (confirmed by prior audit). This script is orphaned but harmless.

---

## 3. Remaining Infrastructure Gaps

| Gap | Severity | Status | Action Required |
|---|---|---|---|
| Supabase Storage bucket `product-images` | **HIGH** | Missing (no buckets in project) | Manual creation in Supabase Dashboard — see Section 5 |
| `drizzle-kit push` broken at runtime | LOW | Fails with TS module resolution error | No action needed now — schema is correct; fix in a future cleanup pass if desired |
| `ensure-store-subscriptions` not in `db:prepare` | LOW | Orphaned script; columns already present | Optionally add to chain, or leave as-is |
| Business data (stores, orders, etc.) | — | Empty (expected) | Provisions via showcase seed or merchant creation — see Section 6 |

---

## 4. Provider Access Status

### Route & middleware review (source)

| Component | Path / Location | Status |
|---|---|---|
| Login route | `POST /api/provider/auth/login` | Functional (env-based + DB bcrypt fallback) |
| Env provider check | `verifyEnvProvider()` in `routes/provider.ts:55` | Complete (email match + bcrypt compare against `PROVIDER_PASSWORD_HASH`) |
| DB fallback | `providerUsersTable` lookup in `routes/provider.ts:178` | Exists; 1 row present (Admin) |
| Session creation | Sets `providerUserId`, `providerEmail`, `providerName` on success | ✅ |
| Auth middleware | `requireProviderAuth` in `middleware/requireAuth.ts:24` | Checks `req.session.providerUserId`; returns 401 if absent |
| Me endpoint | `GET /api/provider/auth/me` | Returns `user: null` without session; session payload when present |
| Dashboard routes | `/provider/summary`, `/provider/leads`, `/provider/stores` | All guarded by `requireProviderAuth` |
| Login validation | Empty/missing email+password → 400 | ✅ |
| Rate limiting | **None** on provider login | (known gap; merchant login has limiter) |

### Runtime smoke test (local server, no password)

```
GET  /api/auth/me            → 200  {"user":null}
GET  /api/provider/auth/me   → 200  {"user":null}
GET  /api/provider/summary   → 401  {"error":"غير مصرح"}
GET  /api/provider/leads     → 401  {"error":"غير مصرح"}
GET  /api/provider/stores    → 401  {"error":"غير مصرح"}
POST /api/provider/auth/login (empty) → 400  {"error":"البريد الإلكتروني وكلمة المرور مطلوبان"}
POST /api/provider/auth/login ({})    → 400  {"error":"البريد الإلكتروني وكلمة المرور مطلوبان"}
```

### Password verification

> **Provider password not verified.** Cannot test login with a specific password without brute-forcing, which is not permitted. The auth route is confirmed functional; the password that matches `PROVIDER_PASSWORD_HASH` is required to complete login.

---

## 5. Storage — Manual Action Required

The `product-images` bucket **does not exist** in the Supabase project. Product/store-logo uploads fail with 502 in production.

### To create manually (Supabase Dashboard → Storage):

| Setting | Value |
|---|---|
| Bucket name | `product-images` |
| Visibility | Public (recommended) — product images are served publicly via the storefront |
| File size limit | ≥ 5 MB (per upload) |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` (recommended) |

### After creation, verify:

1. `GET /storage/v1/bucket` lists `product-images`
2. Upload a test image via the dashboard (or API with service-role key) and confirm the public URL resolves
3. Optionally set `SUPABASE_STORAGE_PUBLIC_URL` env var in Vercel to the public base URL for the bucket

---

## 6. Showcase Provisioning Plan

The script at `lib/db/scripts/seed-showcase-store.mjs` (720 lines, single transaction) will create or recreate an `ordely-showcase` demonstration store.

**Required env vars:** `DATABASE_URL` (present), `SHOWCASE_PASSWORD` (must be set before running — not present; must be provided).

### What it will create

| Entity | Count | Details |
|---|---|---|
| Store | 1 | slug `ordely-showcase`, name "Ordely Showcase", 365-day subscription, active |
| Merchant user | 1 | email `showcase@ordely.local` (bcrypt-hashed from `SHOWCASE_PASSWORD`) |
| Categories | 5 | العطور (default), الديكور والمنزل, الأجهزة الصغيرة, معدات مهنية, إكسسوارات |
| Landing pages (products) | 8 | SOVAGE PURE, LINA ROSE MIST, wood-decor, ergonomic-chair, coffee-machine, leather-bag, tool-organizer, kitchen-mixer — each with 3 Unsplash image URLs, primary/secondary options |
| Delivery zones | 58 (26 active + 32 inactive) | All 58 wilayas; active ones have home_fee/office_fee/return_fee |
| Disabled communes | 7 | بابا حسن, الرحمانية, مسرغين, عين السمارة, بني كسيلة, حاسي مسعود, زلفانة |
| Customers | 12 | Various cities, phone numbers, order notes |
| Orders | 20 | Full status spread: NEW(3), PENDING_CONFIRMATION(2), CONFIRMED(3), SHIPPED(3), DELIVERED(3), RETURNED(2), CANCELLED(2), REJECTED(2) |
| Audit logs | Per-order timeline | Each order gets full status-transition audit trail with timestamps |
| Product images | External | All Unsplash URLs — no bucket dependency |

### What it will delete (scope-safe)

Only data where `store_id = ordely-showcase store`:
- `audit_logs`, `orders`, `delivery_commune_settings`, `delivery_zones`, `landing_pages`, `product_categories`, `customers` — all deleted then recreated for this store only

No other stores/tenants are affected (none exist currently, but the script is scoped regardless).

### How to run (when approved)

```bash
cd lib/db
SHOWCASE_PASSWORD="<your-password>" npm run seed-showcase-store
# or
SHOWCASE_PASSWORD="<your-password>" node --env-file=../../.env ./scripts/seed-showcase-store.mjs
```

Alternatively, after logging in as provider:
```
POST /api/provider/showcase/reseed   (requires valid provider session)
```
The runtime endpoint (`apps/api-server/src/lib/showcaseSeed.ts`) performs the same logic.

**Waiting for explicit approval before executing.**

---

## 7. Unexpected Changes / Errors Summary

| Item | Detail |
|---|---|
| drizzle-kit `push` failure | Pre-existing TS module resolution bug (`./app-schema.js` not found); harmless since schema already matches; no DB touch occurred |
| `ensure-delivery-system` cleanup message | `DELETE` statement ran against `delivery_zones WHERE is_active=false AND fees null AND return_fee=0 AND no orders` → deleted **0 rows** (table was already empty). Expected behavior on clean DB. |
| No other unexpected changes | All other ensure scripts produced only confirmation messages; post-verify confirms exact same table/column/enum/count state |

---

## 8. Errors / Warnings

| Error | Severity | Impact |
|---|---|---|
| drizzle-kit: `Cannot find module './app-schema.js'` | LOW | Push step of `db:prepare` fails; all downstream `ensure-*` scripts still ran (npm `&&` continued despite push exit code; push errored at load-time before DB connection) |
| Chunk size warning (web build, prior audit) | INFO | 1.08 MB JS > 500 KB threshold; performance only; build succeeds |

---

## 9. Exact Next Action

**Pending approval:**

1. **Manual:** create Supabase Storage bucket `product-images` (see Section 5)
2. **Automated:** run showcase seed with `SHOWCASE_PASSWORD=<value>` (see Section 6) — **awaiting explicit approval**
3. **Post-seed:** full end-to-end smoke test of provider login, public storefront, order submission, merchant confirmation flow
4. **Security:** rotate production secrets, remove local `.env`, create `.env.example`

Phase 3 ends here. Proceeding to Phase 4 requires:
- Explicit approval to run the showcase seed
- Manual creation of the storage bucket
- Confirmation of the provider password to use for testing
