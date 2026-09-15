# Phase 6 — Production-Hardening Baseline

> **Scope:** Entirely **READ-ONLY** inventory of the Ordely system as it stands on **2026-09-15**, after Phase 4 (end-to-end verification) and Phase 5 (P1 fix + regression). This document is the exact starting point for **Phase 7 (production hardening fix phase)**.
>
> **Constraint compliance:** No source code was modified, no DB row was inserted/updated/deleted, no schema was changed, no destructive command was run, no showcase reseed was executed, and the Provider manual verification was **not** repeated (done by the operator in the UI already). This phase only ran read-only queries, the standard build pipeline, and inspection commands.

---

## 1. Purpose and Scope

Produce a trustworthy, reproducible snapshot of:

1. Repository/working-tree state (no VCS), incl. all changes made during the audit + restoration.
2. Environment configuration present in `.env`.
3. Live database state (all 12 tables of schema `order_os`).
4. Test/QA data classification and retention decisions.
5. Build baseline (typecheck, API, web) with warnings.
6. Currently verified working functional state (from Phases 4 and 5 — **not re-run**).
7. P2/P3 readiness review with fix-before-production verdicts.

Non-goals: fixing anything, deleting anything, changing configuration, deploying.

---

## 2. Repository Baseline

- **Version control:** There is **no `.git` repository** at `C:\Users\stormpc\Desktop\Ordely Store`. `git status` is not available; "modified vs generated vs new" is derived from **file timestamps**, contents, and the documented histories of Phases 3–5.

### 2.1 Source-code changes during the restore/fix effort (all phases)

| File | Change | When | Phase |
|---|---|---|---|
| `apps/api-server/src/lib/ensureDefaultCategory.ts` | **NEW** — shared helper `ensureDefaultCategory` (1,331 B) encapsulating the P1 fix (advisory lock → SELECT existing default → INSERT if missing with `ON CONFLICT (store_id, slug) DO UPDATE SET is_default=true`) | 2026-09-15 10:48 | 5 |
| `apps/api-server/src/routes/product-categories.ts` | **MODIFIED** — removed local `ensureDefaultCategory` duplicate + unused `pool` import; now imports the shared helper | 2026-09-15 10:49 | 5 |
| `apps/api-server/src/routes/landing-pages.ts` | **MODIFIED** — same deduplication (local default-category logic + unused `pool` import removed) | 2026-09-15 10:50 | 5 |

No other `.ts`/`.mjs`/`.js` source files changed since the original snapshot (2026-05-27 03:22). All 16 scripts under `lib/db/scripts/` retain their original timestamps.

### 2.2 Root metadata changes (restoration-era)

| File | Change | LastWriteTime |
|---|---|---|
| `package.json` | Added dependency **`bcrypt ^6.0.0`** (NATIVE) at root; added `pnpm.overrides["path-to-regexp"] = "^8.4.0"`; `packageManager: pnpm@11.1.2` | 2026-09-15 09:50 |
| `pnpm-lock.yaml` | Re-resolved; now includes `bcrypt@6.0.0`, `bcryptjs@3.0.3`, `path-to-regexp@8.4.2` | 2026-09-15 09:50 |
| `pnpm-workspace.yaml` | Added `allowBuilds: bcrypt, esbuild`, catalog entries, `minimumReleaseAge: 1440`, `onlyBuiltDependencies`, `overrides.path-to-regexp` | 2026-09-15 09:51 |
| `.env` | Updated with provider/showcase keys (see §3) | 2026-09-15 09:52 |

**Important observation:** native `bcrypt` is **never imported** anywhere in application code (only `bcryptjs` is used: `auth.ts`, `provider.ts`, `showcaseSeed.ts`, and the `lib/db` scripts). The root `bcrypt` dependency + `allowBuilds` are **unused** — a residual restoration artifact, harmless but removable in Phase 7.

**No changes** to any `apps/*/package.json`, `lib/db/package.json`, Vite config, or `vercel.json` (all original timestamps).

### 2.3 Generated files (gitignored, re-producible)

- `apps/api-server/dist/` (build output, rebuilt in §5)
- `apps/web/dist/` (build output)
- `node_modules/` (pnpm workspace install)
- Dashboard/public HTML assets referenced by the web build (`*.png` screenshots)

### 2.4 Documentation produced during the effort

| File | Size | Time |
|---|---|---|
| `Docs/ARCHITECTURAL-AUDIT.md` | 33,520 B | 08:42 |
| `Docs/CURRENT-SYSTEM-STATE-AUDIT.md` | 27,712 B | 09:12 |
| `Docs/PHASE-3-RESTORATION-REPORT.md` | 11,484 B | 09:32 |
| `Docs/PHASE-4-END-TO-END-REPORT.md` | 11,955 B | 10:38 |
| `Docs/PHASE-5-P1-FIX-REPORT.md` | 7,876 B | 11:03 |
| `Docs/PHASE-6-HARDENING-BASELINE.md` | this document | — |

---

## 3. Environment and Runtime Baseline

### 3.1 `.env` keys present (13 keys; values intentionally not printed)

`DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `PROVIDER_EMAIL`, `PROVIDER_PASSWORD_HASH`, `PROVIDER_NAME`, `SHOWCASE_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `LOG_LEVEL`, `SESSION_STORE`

Notably **absent**: `PROVIDER_PASSWORD` (only the bcrypt hash — provider real-password login remains untestable locally), `PORT` (must be set explicitly at launch), and `SUPABASE_STORAGE_PUBLIC_URL` (optional; code falls back to `<SUPABASE_URL>/storage/v1/object/public/<bucket>`).

### 3.2 Running processes (at baseline time)

| Port | Process | PID | State |
|---|---|---|---|
| 8080 | API server (`node --env-file-if-exists=../../.env dist/index.mjs`, `PORT=8080`) | 5576 | Listening; `GET /api/healthz` → `200 {"status":"ok"}` |
| 5173 | Vite web dev server (proxy `/api` + `/uploads` → 8080) | 7548 | Listening |

Health route is `GET /api/healthz` (mounted under `/api`). `/healthz`, `/health` return 404 (correct).

### 3.3 Server launch requirement

The API must be launched with an explicit `PORT` (e.g. `$env:PORT=8080; npm --prefix apps/web run dev` in conjunction), because `PORT` is **not** in `.env`. A prior launch without it failed (no listener).

---

## 4. Database Baseline (schema `order_os`, read-only)

Total table count: **12** — `stores`, `users`, `provider_users`, `product_categories`, `landing_pages`, `delivery_zones`, `delivery_commune_settings`, `customers`, `orders`, `audit_logs`, `merchant_leads`, `sessions`. No other tables exist in the schema.

### 4.1 Row counts

| Table | Rows |
|---|---|
| stores | 2 |
| users | 2 |
| provider_users | 1 |
| product_categories | 6 |
| landing_pages | 8 |
| delivery_zones | 58 |
| delivery_commune_settings | 7 |
| customers | 15 |
| orders | 24 |
| audit_logs | 74 |
| merchant_leads | 0 |
| sessions | 17 |

### 4.2 Stores

| id | name | slug | is_active | plan_days | subscription_expires_at | effective active | created_at |
|---|---|---|---|---|---|---|---|
| 1 | Ordely Showcase | ordely-showcase | true | 365 | 2027-09-15 10:13 UTC+01 | ✔ | 2026-09-15 09:55 |
| 3 | Eva-Boutique | evaboutique | true | 14 | 2026-09-29 11:08 UTC+01 | ✔ | 2026-09-15 11:08 |

Store id **2 does not exist** (id gap; no historical evidence in DB — recorded as-is, not investigated further).

- Store 1 = main showcase tenant (seed-dev + seed-showcase-store, Phase 3).
- Store 3 = **manual Provider-flow verification artifact** created by the operator in the UI after Phase 5: Provider login → dashboard → create store (14-day sub) → generated merchant credentials → merchant login → dashboard. It holds user `eva@gmail.com` and one default category `general`.

### 4.3 Authentication rows

- `provider_users`: id=1, Admin (`raesonrs@gmail.com`) — root provider/admin account.
- `users`: id=1 → store 1 (`showcase@ordely.local`); id=3 → store 3 (`eva@gmail.com`).
- `sessions`: 17 rows, `order_os.sid` cookie, expiry window 2026-09-22 (UTC) — 7-day rolling window with `connect-pg-simple` under `SESSION_STORE=postgres`.

### 4.4 Product categories

- store 1: **5** categories, **1 default**: `perfumes` (default).
- store 3: **1** category, **1 default**: `general`.
- Both stores have exactly one default category (P1 invariant satisfied post-fix).

### 4.5 Landing pages (all store 1, all active)

| slug | product | price (DZD) |
|---|---|---|
| sovage-pure | SOVAGE PURE | 4,500 |
| lina-rose-mist | LINA ROSE MIST | 3,900 |
| wood-decor-set | طقم ديكور خشبي راقي | 6,800 |
| ergonomic-office-chair | كرسي مكتب مريح | 18,500 |
| home-coffee-machine | ماكينة قهوة منزلية | 14,500 |
| leather-handbag | حقيبة يد جلدية | 7,200 |
| professional-tool-organizer | منظم أدوات مهني كبير | 12,900 |
| stainless-kitchen-mixer | خلاط مطبخ ستانلس | 9,800 |

All 8 carry `available_sizes` / `available_colors` with the `__label:` option prefix (order creation must pass `selectedSize`/`selectedColor`).

### 4.6 Delivery configuration (store 1)

- `delivery_zones`: **58** rows, **26 active** (wilayas 05,06,07,09,10,13,15,16,17,18,19,21,22,23,24,25,27,28,29,30,31,35,42,43,47,48).
- `delivery_commune_settings`: **7** rows, **0 active** (Béni-Ksila 06, Baba-Hassen 16, Errahmanya 16, Aïn-Smara 25, Hassi-Messaoud 30, Messerghine 31, Zelfana 47). No active commune overrides → communes fall back to zone fees.
- Store 3 has **no** delivery config yet.

### 4.7 Customers (store 1, 15 total)

- **12 seed customers** (ids 13–24): أمينة ب., ياسر ك., سلمى ر., مراد ح., نذير ع., هناء م., سفيان د., إكرام س., كمال ف., منى ل., رضا ب., لينا ت. — phones 0599000101..112, cities across Algeria.
- **3 QA customers** (ids 25–27): `QA Test Customer` 0555000123, `QA Full Path Customer` 0555000999, `QA Regression Customer` 0555999000.

### 4.8 Orders (store 1, 24 total)

Status distribution: `NEW=4, PENDING_CONFIRMATION=2, CONFIRMED=3, SHIPPED=3, DELIVERED=4, RETURNED=2, CANCELLED=3, REJECTED=3`.

- **20 seed orders** (ids 21–40) — cover the whole lifecycle; `audit_logs` show ORDER_CREATED + n×STATUS_CHANGED matching each terminal state (e.g. order 30–34 = 5 events → DELIVERED/RETURNED).
- **4 QA orders** (ids 41–44):

| id | customer | LP | status | total | dFee | payable | note |
|---|---|---|---|---|---|---|---|
| 41 | 25 QA Test | sovage-pure | REJECTED | 4,500 | 700 | 5,200 | Phase 4 reject path |
| 42 | 26 QA Full Path | sovage-pure | CANCELLED | 4,500 | 450 | 4,950 | Phase 4 cancel path |
| 43 | 26 QA Full Path | sovage-pure | DELIVERED | 4,500 | 450 | 4,950 | Phase 4 full-path order |
| 44 | 27 QA Regression | wood-decor-set | NEW | 6,800 | 450 | **7,250** | Phase 5 P1 regression order |

Store-wide aggregates: `total_price` 220,600 · `delivery_fee` 17,750 · loss (REJECTED+CANCELLED+RETURNED totals) 74,800.

### 4.9 Audit logs / merchant leads

- `audit_logs`: 74 events across all 24 orders (order 21–40 seed + 41–44 QA).
- `merchant_leads`: **empty**.

---

## 5. Test/QA Data Determination

Classifications and decisions (read-only conclusions; **nothing deleted** this phase):

| Type | Content | Delete-ability | Impact if deleted | Decision |
|---|---|---|---|---|
| **A — Golden seed** | store 1, user 1, 5 categories, 8 LPs, 58 zones, 12 customers (13–24), 20 orders (21–40), zone/commune config | Zones/LPs/categories deletable via API; orders/customers have **no delete endpoint** | Data/seed loss; requirement that dev/demo look production-like | **KEEP** — demo & regression baseline |
| **B — QA verification artifacts** | customers 25–27, orders 41–44, their audit_logs | No order/customer delete API; destructive SQL forbidden by policy | Small (4 orders) | **KEEP** (retained by operator policy) |
| **C — Operator-created tenant** | store 3 Eva-Boutique, user 3 (eva@gmail.com), category `general` | Deleting would require SQL teardown | Loses evidence of the verified Provider flow | **KEEP** (evidence of the operator's manual verification) |
| **D — Systemic/infrastructure** | provider_users row, sessions (17), health state | — (system-managed) | — | **KEEP** |

Conclusion: **the entire DB is the baseline; nothing should be deleted in Phase 7 without explicit operator approval.** If a cleaner baseline is ever required, candidates for API-based cleanup are QA categories/LPs (already deleted post-regression) — orders/customers can only be removed via a future maintenance endpoint or operator-authorized SQL.

---

## 6. Build Baseline (re-run this phase)

| Check | Result | Warnings / notes |
|---|---|---|
| `npm run typecheck` (libs + api + web) | ✅ PASS | none |
| `npm --prefix apps/api-server run build` | ✅ PASS | dist `index.mjs` 2.7 MB, `app.mjs` 2.7 MB, workers (~4.4 s) |
| `npm --prefix apps/web run build` | ✅ PASS | 2,483 modules, 17.1 s; **pre-existing warning** "some chunks > 500 kB" (`index-*.js` 1,079 kB, gzip 302 kB) — identical to Phases 4–5 (P3) |

Build output matches Phase 5 exactly; no regressions introduced by baseline activity.

---

## 7. Current Working Functional State (verified in Phases 4–5; not re-run in Phase 6)

Confirmed working:

1. **Public showcase storefront** — `/s/ordely-showcase`, all 8 landing pages render; orders placeable against all 8 (with size/color).
2. **Merchant auth + sessions** — `showcase@ordely.local` login (rate-limited 10/15 min/IP → live-verified 429), `order_os.sid` cookie, DB session rows with 7-day expiry, `/me` after reload.
3. **Order lifecycle** — create → confirm (via confirmation links) → ship → deliver; reject, cancel, return all reach their terminal states and audit-log properly (orders 35–44 exercised).
4. **Reports** — summary 40,200 revenue / 3,900 delivery / 560 return-loss → **net 43,540**; daily/weekly buckets consistent (UTC-bounded — see P3 #6).
5. **Image upload** — `POST /api/stores/:storeId/uploads/{product-image|store-logo}`: 401 unauth, 201 ok (local `/uploads/...`), 413 >5 MB, 413/502 storage-failure paths verified.
6. **Multi-tenant isolation** — 403 cross-store read ×10 attempts; 401 unauthorized; 404 path-traversal/object-not-found attempts; **no data leakage observed**.
7. **Provider flow** — manually verified by the operator in the real UI (not repeated this phase): login → dashboard → create store → generated merchant credentials → merchant login → dashboard; persisted as **store 3 Eva-Boutique**.
8. **Default category guarantee (P1)** — category/LP create+update without `categoryId` resolve to the store default (`perfumes`/`general`), idempotent, single default per store, no 500s (53/53 regression checks passed; QA categories 19/20 and QA LPs 17/18 created then deleted cleanly).

Do **not** re-run the large E2E suite in Phase 7 unless code touching order/category paths changes.

---

## 8. P2/P3 Readiness Review (all pre-existing, untouched)

| # | Sev | Item | Evidence (exists) | Impact | Fix-before-production? |
|---|---|---|---|---|---|
| 1 | P2 | drizzle-kit `push` fails: `Cannot find module './app-schema.js'` | `lib/db/drizzle.config.ts` (schema `./src/schema/*.ts`) — `npm run db:prepare` dies at step 1 | Every future schema change must be applied via hand-written SQL | **YES** — repair drizzle config or document SQL-only workflow |
| 2 | P2 | Provider `/auth/login` has **no rate limiter** | `routes/provider.ts` (`providerRouter.post("/auth/login", …)`); merchant `auth.ts` has `loginLimiter` (10/15min), public orders 20/h (`middleware/rateLimiter.ts`) | Brute-force surface on the root admin account | **YES** — add limiter |
| 3 | P2 | Merchant seed password hash anomaly (cost 10→12) — first login 401 until re-seed | `seed-dev.mjs` cost 10 vs `seed-showcase-store.mjs` cost 12; re-seed produced valid hash; root cause not fully isolated | Login worked after re-seed; residual risk on future re-seeds | Watch — order Phase 7 verification script |
| 4 | P3 | Logout clears wrong cookie: `res.clearCookie("connect.sid")` | `auth.ts:51-52` vs cookie named `order_os.sid` `app.ts:85` | Session row IS destroyed (`/me` → null); cookie lingers client-side only | No (cosmetic) |
| 5 | P3 | Reports bucket by **UTC day** (Algeria UTC+1 boundary shift) | `routes/reports.ts` (`new Date(dateStr+"T00:00:00.000Z")`, `toISOString()`) | 1h skew at day boundaries | No — documented, do not change logic |
| 6 | P3 | Web build "chunks > 500 kB" warning | `apps/web` build output (`index-*.js` 1,079 kB) | Perf only, no runtime impact | No |
| 7 | P3 | Storage list-objects API returns non-array `400` shape on error | Observed Phase 4 step-1 test against Supabase service-role API; single-object publish/delete fine; **not used by app code** | None for the app | No — document only |
| 8 | P3 | `ensure-store-subscriptions` script orphaned | `lib/db/scripts/ensure-store-subscriptions.mjs` exists; **0 references** in `lib/db/package.json`, not in `db:prepare` chain | Dead script; no impact | No — delete or wire in Phase 7 |

---

## 9. Known Gaps and Constraints

- Provider real-password login **cannot** be tested automatically (only `PROVIDER_PASSWORD_HASH` in `.env`, no plaintext, no UI-visible plaintext in the audit).
- No VCS: this baseline plus the previous report documents are the only durable record of changes.
- `PORT` not in `.env`; every server restart must set it explicitly.
- Native root `bcrypt` dependency is unused (see §2.2) — cleanup candidate.
- Store id-2 gap unexplained (recorded, not investigated).

---

## 10. Phase 7 Recommended Starting Point

All P2 items (§8 rows 1–3) plus opportunistic P3 cleanups (§8 rows 4, 8, and unused `bcrypt`) are the candidates. Recommended order:

1. **P2 #2** provider login rate limiter (single-file change, testable).
2. **P2 #3** seed-hash verification script + alignment (`seed-dev`/`seed-showcase-store` to identical cost; verify `showcase@ordely.local` hash).
3. **P2 #1** drizzle-kit `push` repair (config/absolute ESM) or explicit SQL-migration workflow.
4. **P3 #4** logout cookie name fix (one line).
5. **P3 #8** wire or drop `ensure-store-subscriptions`.
6. **Cleanup** remove root `bcrypt` dep + `allowBuilds` refs if unused.

Every phase-7 change must be followed by the Phase 5 regression suite (53 checks) and typecheck/build.

---

## 11. Read-Only Integrity Statement

During Phase 6: no source/`.env`/config file was edited; no DB write, `DROP`, `RESET`, or reseed was run; no provider test repeated; only `npm run typecheck`, API build, web build, and read-only queries/inspections executed. DB row counts and hashes are unchanged from the end of Phase 5 except for operator-driven runtime data (sessions grown from 12→17 due to subsequent logins).

---

## 12. Appendix — Commands/scripts used (read-only)

- `apps/api-server/src/routes/index.ts` route registry inspection (all endpoints mapped, no changes).
- Read-only SQL scripts (temp dir `%TEMP%\opencode\db-check\baseline-*.mjs`): schema introspection, per-table counts, stores/users/provider, categories+LPs, zones+communes, customers, orders (full + QA subset), audit aggreation, sessions.
- `npm run typecheck`, `npm --prefix apps/api-server run build`, `npm --prefix apps/web run build`.
- `Invoke-WebRequest /api/healthz`, port/`Get-NetTCPConnection` listener checks.
- Endpoint probes (login limiter). No mutation anywhere.