# CURRENT-SYSTEM-STATE-AUDIT

**Project:** Ordely (conversational-order-os)
**Audit date:** 2026-09-15
**Auditor:** opencode (discovery-only phase — **no code, data, schema, credentials, or deployment modified**)
**Scope:** Live Supabase PostgreSQL + Supabase Storage + local `.env` + repository source, scripts, frontend, API, business logic, security, build.

---

## 1. Executive Summary

The system is a **schema-provisioned but business-empty** installation:

- ✅ PostgreSQL schema `order_os` exists **and exactly matches the Drizzle source** — all 11 application tables, columns, types, defaults, indexes, unique constraints, foreign keys, and all 3 enum types are present and correct.
- ✅ A single **provider admin** account exists in `provider_users` (Admin), created 2026-09-12.
- ⚠️ **No business data exists**: stores=0, merchant users=0, landing pages=0, orders=0, customers=0, delivery zones=0, commune settings=0, audit logs=0, merchant leads=0.
- ❌ **`order_os.sessions` table does NOT exist** — required for the Postgres session store in production.
- ❌ **Supabase Storage bucket `product-images` does NOT exist** — product/store-logo uploads will fail in production.
- ✅ Environment is **coherent**: `DATABASE_URL` host, `SUPABASE_URL` project ref `kofvrrcixoakvwjlmhzm`, and the service-role JWT `ref/iss` claim all point to the same Supabase project; the JWT is valid and unexpired (expires far in the future).
- ✅ **Build pipeline is green**: `pnpm install --frozen-lockfile`, full `typecheck`, API server esbuild, and Vite web build all succeed (one non-blocking chunk-size warning).
- ✅ Generated API client is consistent with server routes and typechecks; no broken frontend↔API paths detected at compile time.

**Bottom line:** The database is ready to accept seed/provisioning but has **two blocking gaps for production runtime**: the sessions table and the storage bucket. The recommended restore path is: create bucket → run `sessions:ensure` → run `db:prepare` (idempotent) → seed a tenant/provider-facing demo via `db:seed` or the showcase script → smoke-test.

---

## 2. Actual Database State

### 2.1 Schema & Tables
- Schema `order_os` — **exists**.
- Application tables present (11/11): `audit_logs`, `customers`, `delivery_commune_settings`, `delivery_zones`, `landing_pages`, `merchant_leads`, `orders`, `product_categories`, `provider_users`, `stores`, `users`.
- **Missing:** `sessions` (connect-pg-simple session store table).

### 2.2 Enum Types (all present and correct)
| Enum | Values |
|---|---|
| `order_os.delivery_method` | HOME, OFFICE |
| `order_os.merchant_lead_status` | NEW, CONTACTED, QUALIFIED, REJECTED, CONVERTED |
| `order_os.order_status` | NEW, PENDING_CONFIRMATION, CONFIRMED, SHIPPED, DELIVERED, RETURNED, CANCELLED, REJECTED |

### 2.3 Columns / Types / Defaults
Every column in the live DB matches `lib/db/src/schema` exactly:
- `serial` PKs with `nextval('order_os.<t>_id_seq'...)` defaults on all tables.
- `timestamptz` created_at/updated_at with `now()` defaults; `updated_at` is not timestamp-triggered in DB (Drizzle `$onUpdate` only applies via ORM writes) — consistent with existing app behavior.
- `numeric(10,2)` for money columns; `jsonb` for `product_images`, `available_sizes`, `available_colors`; enums for `delivery_method`/`status`.
- `stores.subscription_plan_days` + `subscription_expires_at` present (nullable, no default).
- `orders.product_image_url`, `orders.returned_at` present (added by ensure-* scripts).
- `merchant_leads.converted_store_id`, `status` present.

### 2.4 Indexes
All expected indexes exist, including:
- Unique: `stores_slug_unique`, `users_email_unique`, `provider_users_email_unique`, `customers_store_phone_unique`, `landing_pages_store_slug_unique`, `delivery_zones_store_wilaya_unique`, `delivery_communes_store_wilaya_name_unique`, `product_categories_store_slug_unique`, `product_categories_store_default_unique` (partial `WHERE is_default = true`).
- Non-unique: `orders_store_id_idx`, `orders_store_status_idx`, `orders_landing_page_id_idx`, `orders_customer_id_idx`, `orders_delivery_zone_id_idx`, `audit_logs_store_order_idx`, `customers_store_id_idx`, `delivery_zones_store_id_idx`, `delivery_communes_store_wilaya_idx`, `landing_pages_store_id_idx`, `landing_pages_store_category_idx`, `merchant_leads_status_idx`, `merchant_leads_created_at_idx`, `product_categories_store_id_idx`, `users_store_id_idx`.

### 2.5 Constraints
- Foreign keys (12 total) present on all store-scoped tables → `stores(id)`; `orders` → customers/landing_pages/delivery_zones; `landing_pages` → product_categories; `merchant_leads` → stores (converted_store_id). No FKs on `sessions` (expected).
- Unique constraints declared as unique indexes (Drizzle style); standalone `UNIQUE (email)` constraints exist on `users` and `provider_users`.

### 2.6 Sequences
All 11 serial sequences exist. No gaps detected.

### 2.7 Row counts (live)
| Table | Rows |
|---|---|
| provider_users | **1** |
| stores | 0 |
| users | 0 |
| landing_pages | 0 |
| product_categories | 0 |
| orders | 0 |
| customers | 0 |
| audit_logs | 0 |
| delivery_zones | 0 |
| delivery_commune_settings | 0 |
| merchant_leads | 0 |
| sessions | **table missing** |

### 2.8 Existing provider user
`provider_users.id=1`, name=`Admin`, email=`raesonrs@gmail.com` (matches env `PROVIDER_EMAIL` after normalization), created `2026-09-12T19:30:15Z`. Password hash is set (bcrypt). Does **not** guarantee it matches the env `PROVIDER_PASSWORD_HASH`; both paths exist for login (env-first).

---

## 3. Actual Storage State (Supabase Storage)

Checked via Storage REST API using the configured service-role key:
- `GET /storage/v1/bucket` → **200, empty array `[]`** → **no buckets exist in this project**.
- `GET /storage/v1/bucket/product-images` → **404 `Bucket not found` / `NoSuchBucket`**.
- **The expected bucket `product-images` does NOT exist.** Listing objects is therefore impossible (400).
- Result: any product-image or store-logo upload in production returns HTTP **502** (`تعذر رفع الصورة إلى التخزين`).
- Showcase/seed product images are external **Unsplash URLs** (already baked into the seed scripts), so they are NOT storage objects — no dependency on the bucket for the demo data.

---

## 4. Environment State

File `.env` at repo root (present locally; git-ignored via `.gitignore`; no git repo initialized in working dir). **Only variable names and metadata are listed below — no secrets.**

Present (12): `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `PROVIDER_EMAIL`, `PROVIDER_PASSWORD_HASH`, `PROVIDER_NAME`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `LOG_LEVEL`, `SESSION_STORE`.

| Var | Status | Notes |
|---|---|---|
| DATABASE_URL | ✅ present | `postgres.<ref>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`; ref = `kofvrrcixoakvwjlmhzm` |
| SESSION_SECRET | ✅ present | length 63 (> 32 required) |
| APP_ORIGIN | ✅ present | `https://ordely.vercel.app` |
| ALLOWED_ORIGINS | ✅ present | `https://ordely.vercel.app` |
| PROVIDER_EMAIL | ✅ present | normalized `raesonrs@gmail.com` |
| PROVIDER_PASSWORD_HASH | ✅ present | `$2b$12$...` bcrypt (cost 12, structurally valid) |
| PROVIDER_NAME | ✅ present | `Admin` |
| SUPABASE_URL | ✅ present | ref `kofvrrcixoakvwjlmhzm` |
| SUPABASE_SERVICE_ROLE_KEY | ✅ present | JWT, `iss=supabase`, `role=service_role`, same ref, unexpired |
| SUPABASE_STORAGE_BUCKET | ✅ present | `product-images` (**but bucket does not exist — mismatch**) |
| LOG_LEVEL | ✅ present | `info` |
| SESSION_STORE | ✅ present | `postgres` → Postgres-backed sessions in all environments |
| PORT | ❌ absent | optional; web defaults 5173 |
| API_PORT | ❌ absent | optional; API defaults 8080 |
| UPLOAD_DIR | ❌ absent | optional; dev-only local uploads |
| BASE_PATH | ❌ absent | optional; Vite base `/` |
| PROVIDER_PASSWORD | ❌ absent | optional plaintext fallback (hash preferred) |
| PROVIDER_ID | ❌ absent | optional; defaults 1 |
| DEV_ADMIN_* / DEV_STORE_* / DEV_DEMO_* / SHOWCASE_* | ❌ absent | only used by seed scripts |

**Coherence verdict:**
- DB host pooler ref == Supabase URL ref == service-role JWT ref (`kofvrrcixoakvwjlmhzm`) → **same environment**. ✅
- Provider auth config complete (email + hash + name) → env-based provider login is usable **if the password matching the hash is known**. ✅
- Session config coherent (`SESSION_STORE=postgres` matches production requirement), but the `sessions` table itself is absent. ⚠️
- Storage config **declared but the bucket is missing**. ❌

---

## 5. Code ↔ Database Comparison

| Component | Expected by code | Exists in DB | Correct | Missing | Unexpected |
|---|---|---|---|---|---|
| Schema `order_os` | Yes | Yes | Yes | — | — |
| All 11 app tables | Yes | Yes | Yes | — | — |
| `sessions` table | Yes (SESSION_STORE=postgres, ensure-sessions) | **No** | — | **Yes** | — |
| Enums (3) | Yes | Yes | Yes | — | — |
| Columns of all 11 tables | matches schema TS | exact match | Yes | — | — |
| Indexes | matches schema TS | exact match | Yes | — | — |
| Unique constraints/idx | matches schema TS | exact match | Yes | — | — |
| Foreign keys | matches schema TS | exact match | Yes | — | — |
| Sequences | implied by serial | present (11) | Yes | — | — |
| Provider user | optional (env-first) | 1 × Admin | Yes | — | — |
| Business data | populated by seed in dev; empty is valid | all 0 | Yes (empty state) | — | — |
| Storage bucket | `SUPABASE_STORAGE_BUCKET` | **No bucket anywhere** | — | **Yes** | — |

**Conclusion:** The only code↔DB mismatches are (a) the missing `sessions` table and (b) the missing storage bucket. The relational schema itself is fully and correctly provisioned — likely via `drizzle-kit push` + the `ensure-*` scripts (except `ensure-sessions`), and no seed has been run yet.

---

## 6. Script Analysis

Run order implied by `db:prepare` (`lib/db/package.json`): `push` → `ensure-store-slugs` → `ensure-returned-status` → `ensure-delivery-system` → `ensure-delivery-communes` → `ensure-order-product-images` → `ensure-landing-page-store-slugs` → `ensure-landing-page-transport-mode` → `ensure-merchant-lead-conversion` → `ensure-sessions`.

| Script | What it does | Idempotent | Destructive | Safe on current DB |
|---|---|---|---|---|
| `db:push` (drizzle-kit push) | Syncs schema from Drizzle | Yes | No | Need to run (idempotent, should be no-op now) |
| `ensure-store-slugs` | Backfills store slugs | Yes | No | Yes |
| `ensure-returned-status` | Adds RETURNED enum + returned_at | Yes | No | Yes (already present) |
| `ensure-delivery-system` | delivery_zones + enum + order columns | Yes | No | Yes (already present) |
| `ensure-delivery-communes` | commune settings table | Yes | No | Yes (already present) |
| `ensure-order-product-images` | product_image_url snapshot col | Yes | No | Yes (already present) |
| `ensure-landing-page-store-slugs` | per-store slug fix | Yes | No | Yes (0 rows) |
| `ensure-landing-page-transport-mode` | transport_mode col | Yes | No | Yes (already present) |
| `ensure-merchant-lead-conversion` | converted_store_id cols | Yes | No | Yes (already present) |
| **`ensure-sessions`** | **creates order_os.sessions** | **Yes** | **No** | **Yes — but NOT yet run (table absent)** |
| `ensure-store-subscriptions` | adds subscription cols + 30-day backfill | Yes | No (updates nulls only) | Yes — **but NOT in db:prepare chain (orphaned)** |
| `db:seed` (seed-dev) | `createTenant` demo store + admin | Yes | No | Yes |
| `tenant:create` | idempotent tenant (store/user/default cat/demo page) | Yes | No | Yes |
| `provider:create` | inserts provider user | No (insert; dup email fails on unique) | No | Yes (only for new) |
| `seed-showcase-store` | full showcase (8 products, 20 orders, etc.) | Partial — deletes showcase data for its own slug then recreates | **Deletes showcase-scoped data** | Yes, but only touches order_os-showcase slug; requires `SHOWCASE_PASSWORD` |
| `POST /provider/showcase/reseed` | same as above via API | Same | Same (showcase-scoped) | Yes (needs provider session) |
| `reset-order-os-schema` | **DROPS schema order_os** | N/A | **DESTRUCTIVE** | ❌ **DO NOT RUN** |
| `db:reset` | reset-schema + push-force + seed | N/A | **DESTRUCTIVE** | ❌ **DO NOT RUN** |

**Hidden dependencies / notes:**
- All scripts require `DATABASE_URL` (loaded from root `.env` via `--env-file-if-exists`).
- `db:seed`/`tenant:create` use `demoSlug` global-slug lookups (legacy `/p/:slug` assumption) but are safe on empty DB.
- The **only missing schema object** is created by `ensure-sessions`, which is NOT part of `db:push` — it is only in `db:prepare`/`sessions:ensure`.

---

## 7. Provider State

- **Env-based identity is authoritative**: `verifyEnvProvider` compares normalized email against `PROVIDER_EMAIL` and bcrypt-compares against `PROVIDER_PASSWORD_HASH` (plaintext `PROVIDER_PASSWORD` only as fallback). Config is complete → **provider login is enabled** (requires the matching password).
- **DB fallback**: `provider_users` row id=1 (Admin) exists with the same normalized email + its own hash → second login path available.
- Session creation sets `providerUserId/providerEmail/providerName`; `requireProviderAuth` protects all provider routes; frontend `ProviderAuthContext` gates `/provider` (redirects to `/provider/login`). Provider dashboard + stores + leads + showcase-reseed all ready.
- ⚠️ Provider login endpoint is **not rate-limited** (merchant login is).
- ⚠️ Cannot verify plaintext passwords without attempting a login — flagged as unverifiable, not as broken.

---

## 8. Merchant / Store State

- **No stores, no merchant users** exist. Nothing to isolate or verify yet.
- Provisioning paths available:
  1. Provider UI: `POST /provider/leads/:id/convert` or `POST /provider/stores` (generates password, 14-day trial, `TRIAL_DAYS=14`, subscriptionExpiresAt = now+14d).
  2. CLI: `npm run tenant:create`, `npm run db:seed`, `npm run provider:create`.
- Store isolation: every table store-scoped; `requireStoreAccess` enforces session.storeId == :storeId; public storefront filters by `isActive AND subscription not expired`.
- Subscription: `subscription_expires_at IS NULL OR > now()` defines active; no enforcement job (soft check only in public endpoint + provider summary).

---

## 9. Showcase Store State

- **Does not exist**: zero stores → no showcase rows to inspect.
- Expected (per seed source): slug `ordely-showcase`, name `Ordely Showcase`, merchant `showcase@ordely.local`, 8 products, 5 categories, 58 wilayas / 26 active zones, 7 disabled communes, 12 customers, 20 orders across all statuses, full audit timelines, 365-day subscription.
- Recreation (missing items ✓ re-listed): run `npm run db:seed` equivalent showcase script `seed-showcase-store.mjs` (requires `SHOWCASE_PASSWORD`) OR login as provider and `POST /provider/showcase/reseed`. Both are showcase-scoped deletes+recreates — safe for other tenants, but they ARE destructive to existing showcase data (none currently).
- Showcase images are external Unsplash URLs — no storage dependency.

---

## 10. API ↔ Frontend Consistency

- Generated client (`lib/api-client-react/src/generated/api.ts`) references the same endpoints implemented in `apps/api-server/src/routes/*` — spot-checked paths (`/api/auth/*`, `/api/provider/*`, `/api/stores/:storeId/orders|confirmations|summary|confirm|reject`) all present server-side. Typecheck of web + api-client passes → generated contracts in sync.
- Frontend logout posts `/api/auth/logout` (exists) — but server clears cookie `connect.sid` while the session is named `order_os.sid` → **logout leaves the session cookie on the client** (server session destroyed; cookie lingers with no valid sid). Functional, but the cookie is never cleared.
- No frontend calls were found to endpoints that don't exist (compile-time + grep check).
- Order status flow in UI: `OrderDetail.tsx` exposes "إرسال للتأكيد" (NEW→PENDING_CONFIRMATION), then Confirmations panel handles CONFIRMED/REJECTED. So the NEW→PENDING_CONFIRMATION handoff exists via PATCH, matching `VALID_TRANSITIONS`.

---

## 11. Business Logic Findings

- **NEW → PENDING_CONFIRMATION**: no *automatic* transition and no dedicated endpoint; the merchant manually PATCHes status in OrderDetail. Confirmation/Reject actions require status `PENDING_CONFIRMATION` (422 otherwise). Works, but orders can linger in NEW with no reminder/queue.
- **Delivery fee** = `officeFee` (base) + `homeFee` surcharge for HOME; return fee separate. Displayed payable = `totalPrice + deliveryFee`. ✅
- **Customer upsert** keys on (storeId, phone); name + city refreshed each order. ✅
- **Revenue logic**: only DELIVERED contributes revenue and delivery revenue; RETURNED subtracts return_fee as loss; net = revenue + deliveryRevenue − returnLoss. Consistent between `/orders/summary`, daily and weekly reports. ✅
- **Commune validation**: public order validates commune ∈ wilaya via static `algeria-locations.ts` and respects disabled-commune settings. ✅
- **Reports timezone**: daily/weekly reports key on `created_at` in UTC `YYYY-MM-DD` windows (server-time); no explicit Algeria (UTC+1) handling → possible day-boundary skew of ±1d on local calendars.

---

## 12. Security Findings (classification)

| ID | Severity | Finding |
|---|---|---|
| SE-01 | CRITICAL | Live **production-grade credentials** stored in plain root `.env` (DB URL + service-role key + session secret). Present locally by design per operator (git-ignored, no git repo here). Risk = accidental sharing / exfiltration of the file. |
| SE-02 | HIGH | **No Row-Level Security** on Postgres. All isolation is app-layer. The service-role key grants full DB + storage access; if the key or DB URL leaks, every tenant's data is exposed. |
| SE-03 | HIGH | **Storage bucket missing** → uploads fail in prod (availability/security-adjacent). Also no bucket policy hardened (service-role only). |
| SE-04 | MEDIUM | **Provider login not rate-limited** (merchant login and public orders are). |
| SE-05 | MEDIUM | **Logout does not clear the session cookie** (`connect.sid` vs `order_os.sid`). |
| SE-06 | MEDIUM | Public order endpoint upserts customers with minimal validation (20/hr/IP global limit, no per-store cap, phone format not enforced). |
| SE-07 | MEDIUM | `PATCH /stores/:storeId` (merchant) contains duplicated access logic; relies on `req.session.storeId` captured at login (stale after provider reassigns). |
| SE-08 | MEDIUM | `logAudit` swallows all errors (`.catch(()=>{})`) — audit trail can silently miss events. |
| SE-09 | LOW | Rate limiter `validate.xForwardedForHeader=false` + `trust proxy 1` — relies on correct proxy header handling on Vercel. |
| SE-10 | LOW | Provider store-create endpoint (`POST /provider/stores`) uses manual string checks, no zod body schema (unlike lead endpoints). |

---

## 13. Build / Runtime Findings

| ID | Result |
|---|---|
| Package manager | pnpm 11.1.2 (lockfile packageManager `pnpm@11.1.2`) ✅ |
| Node | v24.12.0 (generates) ✅ |
| `pnpm install --frozen-lockfile` | ✅ 503 packages resolved/reused, 43.9s |
| `npm run typecheck` | ✅ libs + api-server + web all pass |
| `apps/api-server` build (esbuild) | ✅ `dist/app.mjs` + `dist/index.mjs` (~2.7 MB each) + pino workers |
| `apps/web` build (Vite) | ✅ 2483 modules, `dist/public` produced |
| Chunk warning | ⚠️ main JS 1.08 MB (302 KB gzip) > 500 KB — perf, non-blocking |

**Verdict:** the repository is currently **buildable** as-is. Vercel `vercel:build` (typecheck + both builds) will succeed. Runtime correctness depends on sessions table + bucket.

---

## 14. Every Discovered Mismatch

| ID | Severity | Component | Current state | Expected state | Evidence | Impact | Recommended action | Code change? | Safe now? |
|---|---|---|---|---|---|---|---|---|---|
| MM-01 | HIGH | DB `sessions` | table missing | `order_os.sessions` exists | `information_schema.tables` has no sessions; rowCounts loop skipped it | No session persistence in production (connect-pg-simple may self-create at runtime if privileges allow, otherwise auth is broken) | Run `npm run sessions:ensure` (or `db:prepare`) | No | **YES** |
| MM-02 | HIGH | Supabase Storage | bucket `product-images` missing (no buckets at all) | bucket exists, public or service-role-write | `GET /storage/v1/bucket` → `[]`; `GET …/product-images` → 404 `NoSuchBucket` | All product-image/logo uploads fail 502 in prod | Create bucket `product-images` in Supabase dashboard (public read, restricted write) | No | **YES** |
| MM-03 | LOW | Env config | `PORT`, `API_PORT`, `UPLOAD_DIR`, `BASE_PATH`, `PROVIDER_PASSWORD`, `PROVIDER_ID` absent | optional vars only | `.env` parsed (names only) | None (defaults used); UPLOAD_DIR irrelevant in prod | Add only if dev flow needs them | Optional | YES |
| MM-04 | LOW | Scripts | `ensure-store-subscriptions` not in `db:prepare` chain | included | `lib/db/package.json` chain omits it | Orphaned; column present anyway (from push) | Add to chain or document manual run | No | YES |
| MM-05 | MEDIUM | Auth/logout | merchant logout clears `connect.sid`, session named `order_os.sid` | clear `order_os.sid` | `auth.ts:52` | Session cookie not cleared on logout | Fix cookie name in logout | Yes | YES |
| MM-06 | MEDIUM | Provider auth | provider login unlimited | rate-limited like merchant | `routes/provider.ts` login | Brute-force on admin | Add rate limiter | Yes | YES |
| MM-07 | MEDIUM | Orders | list has no pagination; response `page:1,limit:n` placeholders; in-memory filter | SQL pagination | orders.ts | Degradation at scale | Implement SQL pagination | Yes | No (post-restore) |
| MM-08 | LOW | Public delivery | only zones with `officeFee != null` returned; HOME-only stores show zero zones | zones w/o officeFee should still appear for HOME | public.ts `deliveryZonesForStore` | HOME-only merchant invisible publicly | Review filter | Yes | No (needs product decision) |
| MM-09 | LOW | Reports | UTC day windows; no Algeria TZ | local-day alignment | reports.ts builds `T00:00:00.000Z` | Day-boundary skew on daily/weekly calendars | Decide TZ handling | Yes | No |
| MM-10 | LOW | Security-at-rest | `.env` with live creds on disk | rotated; gitignored (already), file removed after use | file present, git repo absent | Exposure if machine/file shared | Rotate secrets, delete after provisioning | No | YES |

---

## 15. Every Missing Component

| ID | Missing | See |
|---|---|---|
| CM-01 | `order_os.sessions` table | MM-01 (fix: `sessions:ensure`/`db:prepare`) |
| CM-02 | Supabase bucket `product-images` | MM-02 |
| CM-03 | Any merchant/tenant (store + user) | DB has 0; provision via lead-convert, `tenant:create`, or `db:seed` |
| CM-04 | Showcase demo data | recreate via `seed-showcase-store.mjs` or provider `showcase/reseed` |
| CM-05 | `.env.example` | gitignore allows; absent; document required vars |
| CM-06 | Backup/dump tooling in-repo | data has no export script (use pg_dump/Supabase) |

---

## 16. Every Obsolete Component

| ID | Obsolete | Notes |
|---|---|---|
| OB-01 | `/confirmations` legacy route + redirect | kept for compatibility, harmless |
| OB-02 | `/p/:slug` legacy global-slug public URLs | compatibility only; 409 on cross-store collision |
| OB-03 | `apps/api-server/src/middlewares/` empty folder | dead path, only `.gitkeep` |
| OB-04 | `api/index.js` `__path` rewrite hack + matching vercel.json rewrites | legacy single-function bridge; works, but fragile |
| OB-05 | `ensure-store-slugs`, `ensure-returned-status`, `ensure-delivery-system` etc. — now redundant on this already-migrated DB | still safe/idempotent; needed for fresh environments |
| OB-06 | Two duplicate `formatOrder` implementations (orders.ts + confirmations.ts) | divergence risk |

---

## 17. Every Dangerous Script

| Script | Danger |
|---|---|
| `reset-order-os-schema.mjs` | **Drops the entire `order_os` schema.** Env-guarded but catastrophic if run against prod. |
| `db:reset` (reset-schema + push-force + seed) | **Destroys all data**, then recreates schema and seeds. |
| `db:push-force` (`--force`) | Forced Drizzle sync — can drop columns/constraints it doesn't recognize. Do not run on live. |
| `seed-showcase-store.mjs` / `provider/showcase/reseed` | Deleting + recreating showcase-scoped data. Safe scope (its own slug) but overwrites existing showcase rows. |

---

## 18. Exact Restoration / Recovery Requirements

To bring the environment to a verified-correct production state (discovery only — execute after this audit is approved):

1. **Backup first** — Supabase SQL editor `pg_dump` or `PITR` snapshot; record bucket contents (currently empty).
2. **Create storage bucket** `product-images` (public read; service-role/server write). Optionally set `SUPABASE_STORAGE_PUBLIC_URL` to match the public URL.
3. **Create sessions table**: `npm run sessions:ensure` (idempotent; creates `order_os.sessions` + PK + expire index).
4. **Replay migrations safely**: `npm run db:prepare` (drizzle push + all ensure-*; all idempotent, no-op on this DB except sessions).
5. **Verify** (read-only): re-run the inspector script → expect `sessions` table present.
6. **Provision a merchant/store** for smoke test: via provider UI (lead convert or manual create) or `npm run tenant:create` / `npm run db:seed`. Record generated credentials.
7. **Optionally seed showcase**: `SHOWCASE_PASSWORD=… npm run db:seed` variant or provider `showcase/reseed`.
8. **Smoke-test the full loop**: merchant login → create landing page → public order → NEW→PENDING_CONFIRMATION→CONFIRMED→SHIPPED→DELIVERED → daily report → upload product image (verifies bucket) → provider login → summary/stores/leads.
9. **Do NOT** run `db:reset`, `db:push-force`, or `reset-order-os-schema` on this environment.

---

## 19. Exact Recommended Fixes (priority-ordered)

| # | Fix | Type | Prereq |
|---|---|---|---|
| 1 | Create Supabase bucket `product-images` | Ops (dashboard) | none |
| 2 | Run `npm run sessions:ensure` | Ops (script) | / |
| 3 | Run `npm run db:prepare` (safe replay) | Ops | / |
| 4 | Rotate `.env` secrets & remove file after provisioning (create `.env.example`) | Security | ops decision |
| 5 | Provision at least one tenant + showcase for verification | Ops | 1–3 |
| 6 | Fix logout cookie name (`order_os.sid`) | Code | post-restore |
| 7 | Add provider-login rate limiter | Code | post-restore |
| 8 | Add SQL pagination to orders (and customers) lists | Code | post-restore |
| 9 | Review public zone filter (HOME-only stores) + reports TZ | Product/code | post-restore |
| 10 | RLS + least-privilege keys, backup automation, audit-error surfacing | Security | roadmap |

---

## 20. Priority Order (execution plan)

1. **P0 (blocking, no code):** create storage bucket → `sessions:ensure` → `db:prepare`.
2. **P0 verify:** re-inspect DB + storage; refresh data only.
3. **P1 (functional):** seed a merchant store + showcase; smoke-test end-to-end flows (login, order, confirmations, reports, upload).
4. **P1 (security):** rotate secrets, remove `.env`, create `.env.example`.
5. **P2 (hardening, code changes — do NOT block restore):** logout cookie, provider login limiter, pagination, audit-log error surfacing.
6. **P3 (product/refactor):** public zone filter decision, report timezone, legacy route cleanup, dedupe `formatOrder`.