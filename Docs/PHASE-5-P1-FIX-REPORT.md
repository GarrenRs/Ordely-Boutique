# Phase 5 — P1 Bug Fix + Regression Report

<!-- DOC-META
type: phase-report
status: historical
verified-as-of: 2026-09-17
related: Docs/INDEX.md
notes: Closure stamp. Immutable historical record - not current truth. See Docs/current/ and Docs/decisions/ for the living model.
-->

> Date: 2026-09-15 | Scope: fix the `product-categories` 500 bug (P1) with the minimal, race-safe code change. No schema, data, architecture or destructive operations.

---

## 1. Root cause (السبب الجذري)

`GET /api/stores/:storeId/product-categories` returned **HTTP 500** with:

```
duplicate key value violates unique constraint "product_categories_store_default_unique"
Key (store_id)=(1)
  at async ensureDefaultCategory2 (...\routes\product-categories.ts:25:18)
```

Two identical `ensureDefaultCategory(storeId)` functions existed — in `product-categories.ts` and `landing-pages.ts`. Both did:

```sql
insert into order_os.product_categories (store_id, name, slug, is_default, is_active, sort_order)
values ($1, 'عام', 'general', true, true, 0)
on conflict (store_id, slug) do update
set name = excluded.name, is_default = true, ...
```

`ON CONFLICT (store_id, slug)` targets the unique index `product_categories_store_slug_unique (store_id, slug)`. It does **not** target the partial unique index:

```sql
product_categories_store_default_unique ON (store_id) WHERE (is_default = true)
```

When `'general'` does not yet exist for the store, the insert adds a **second** row with `is_default = true` — violating the partial unique constraint (the store already had `perfumes` as default). Result: the partial index fires and Postgres raises the 500.

Live evidence (verified against the database):
- Index `product_categories_store_default_unique` = unique btree `(store_id)` **WHERE** `is_default = true`.
- 5 categories for store 1: `perfumes` (default) + 4; no `general` row; exactly 1 default.

## 2. Exact files changed (الملفات المعدّلة)

| File | Change |
|---|---|
| `apps/api-server/src/lib/ensureDefaultCategory.ts` | **NEW** — shared race-safe helper (single implementation) |
| `apps/api-server/src/routes/product-categories.ts` | Removed local duplicated function + unused `pool` import; imports shared helper |
| `apps/api-server/src/routes/landing-pages.ts` | Removed local duplicated function + unused `pool` import; imports shared helper |

No other files touched.

## 3. Exact logic changed (المنطق الجديد)

New shared helper (`lib/ensureDefaultCategory.ts`):

1. Acquire a **per-store advisory lock** (`pg_advisory_xact_lock(hashtext('order_os:default_category:' || storeId))`) inside a transaction — serializes concurrent callers per store;
2. **SELECT** the existing default: `... where store_id = $1 and is_default = true limit 1` → if found, commit and return its id (existing default reused, never renamed/replaced);
3. Only **if missing**, INSERT `'عام'/'general'` with `is_default = true`, using `ON CONFLICT (store_id, slug) DO UPDATE SET is_default = true` (also promotes a legacy non-default `general` row), then return the id;
4. COMMIT / ROLLBACK (on error) / always release the client.

Both routes now call this single function; `landing-pages.ts` reaches it via its existing `resolveCategoryId` (which delegates to `ensureDefaultCategory` when `categoryId` is undefined/null).

## 4. Why the fix is safe (لماذا الإصلاح آمن)

- **Exactly one default per store** — guaranteed by logic (SELECT-first under lock) and still enforced by the untouched partial unique constraint as a hard backstop.
- **Existing defaults reused** — the seeded `perfumes` default is returned as-is; nobody renames/overwrites it (the old `ON CONFLICT DO UPDATE` that could rewrite rows no longer applies to an existing default).
- **Created only when needed** — insert happens only after confirming no default exists.
- **Race-safe** — per-store advisory lock serializes; no double-insert between concurrent requests.
- **Consistent** — duplicated implementations replaced by one shared helper (no divergence), no large refactor.
- **No schema change, no data migration, no destructive op** — pure app code change.

## 5. Database state BEFORE (قبل)

Verified immediately before regression (matches Phase 4 end state):

| Table | Count |
|---|---|
| stores | 1 |
| product_categories | 5 |
| landing_pages | 8 |
| orders | 23 |
| customers | 14 |
| defaults | store 1 = 1 (`perfumes`) |
| sessions | 12 (transient dev sessions) |

## 6. Database state AFTER (بعد)

| Table | Count | Delta |
|---|---|---|
| stores | 1 | = |
| product_categories | 5 | = (QA test category 19/20 created then deleted via API) |
| landing_pages | 8 | = (QA test pages 17/18 created then deleted via API) |
| orders | 24 | **+1**: order 44 (regression L, `wood-decor-set`, OFFICE, payable 7250, status NEW) — kept as evidence; no API exists to delete orders and destructive SQL is forbidden |
| customers | 15 | **+1**: `QA Regression Customer` (phone 0555999000) created by order 44 |
| defaults | store 1 = 1 (`perfumes`) | = |

QA orders retained: 41 REJECTED (5200), 42 CANCELLED (4950), 43 DELIVERED (4950), 44 NEW (7250). Revenue metrics unchanged: **rev 40200 / drev 3900 / rloss 560**.

## 7. Regression test results (نتائج اختبارات الانحدار)

**53 / 53 checks passed** against the fixed server (one merchant login; tests run through the Vite proxy):

| ID | Check | Result |
|---|---|---|
| A | `GET product-categories` → 200 (array) | ✅ |
| B | Exactly 1 default (slug `perfumes`) | ✅ |
| C | Repeating GET ×3 → count unchanged, still 1 default (no duplicates) | ✅ |
| D | Creating a category → 201, `isDefault=false` | ✅ |
| E | Updating a category → 200 | ✅ |
| F | Creating a landing page **without** categoryId → 201, resolves to the existing default (`perfumes`) | ✅ |
| G | Updating a landing page without categoryId → 200 | ✅ |
| H | All 8 seeded showcase products intact (slugs + prices 3900/4500/6800) | ✅ |
| I | Orders intact (23 then +1 regression order; 4 delivered; summary 40200 / net 43540) | ✅ |
| J | Multi-tenant isolation → 403 on all six cross-store routes; own store 200 | ✅ |
| K | Public storefront functional (store 200, all 8 products, product page 200) | ✅ |
| L | Order flow functional (created order 44: 201, NEW, unit 6800, payable 7250) | ✅ |
| — | Delete QA landing page → 204; delete QA category → 204 (delete path also calls ensureDefaultCategory and works) | ✅ |

Note: an earlier flawed test run used incorrect seed slugs and omitted a required product variant — those failures were test-data errors, not regressions; corrected run is all green.

## 8. Build results (البناء)

| Command | Result |
|---|---|
| `npm run typecheck` (libs + api-server + web) | ✅ no errors |
| `apps/api-server` `npm run build` | ✅ (dist rebuilt; API restarted; `/api/healthz` ok) |
| `apps/web` `npm run build` | ✅ (pre-existing "chunks > 500 kB" warning — unrelated P3, not touched) |

## 9. Any remaining issues (مشاكل متبقية)

- **None introduced by this fix.** No new defect observed.
- Unchanged, out-of-scope pre-existing P2/P3 items (per instruction, not fixed in Phase 5): drizzle-kit `push` module-resolution failure; provider login has no rate limiter; logout clears `connect.sid` vs cookie `order_os.sid`; reports bucketed by UTC day; web chunk-size warning; orphaned `ensure-store-subscriptions` script; storage list-objects API shape; merchant seed hash anomaly.
- Provider dashboard real login still not verifiable (no plaintext password).

## 10. No destructive operation executed (لا عمليات مدمرة)

Confirmed **none** of the forbidden commands were run: `db:reset`, `db:push-force`, `reset-order-os-schema`, `DROP TABLE`, `DROP SCHEMA`. No schema alterations, no migrations. Only the application's own create/delete HTTP routes were used to create and then remove the QA test artifacts (categories 19/20, landing pages 17/18). Seeded showcase data untouched; default category `perfumes` intact.
