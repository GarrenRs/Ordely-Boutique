# RUNBOOK-DB — Database Operations

> Current DB operations for the Drizzle + Supabase PostgreSQL setup. Follow `Docs/current/STATE-SYSTEM.md` for environment facts. All commands run from the repo root unless noted. `.env` must exist at root (`DATABASE_URL` etc.).

<!-- DOC-META
type: reference
status: active
verified-as-of: 2026-09-17
related: Docs/current/STATE-SYSTEM.md, Docs/PHASE-7.3-DRIZZLE-SCHEMA-MANAGEMENT-REPORT.md
-->

## 1. Schema change (the only sanctioned path)

```bash
npm run db:push          # drizzle-kit push — applies schema diff to DB (no migration files)
npm run db:push-force    # push with --force (only when push is blocked and you accept risk)
```

- **No migration files exist.** Push is the project's mechanism; a time-travelling / destructible diff should be reviewed before merging the schema change.
- After schema changes, run the idempotent data-fixes (safe to re-run):

```bash
npm run db:prepare       # push + ALL ensure-* below in sequence
```

`db:prepare` runs: push → ensure-store-slugs → ensure-returned-status → ensure-delivery-system → ensure-delivery-communes → ensure-order-product-images → ensure-landing-page-store-slugs → ensure-landing-page-transport-mode → ensure-merchant-lead-conversion → ensure-sessions.

## 2. Individual data-fix / ensure scripts

| Command | Purpose |
|---|---|
| `npm run db:seed` | seed dev baseline (default login `admin@store.com` / `admin123`) |
| `npm run db:reset` | **DESTRUCTIVE**: reset-schema + push-force + seed (wipes all data) |
| `npm run tenant:create` | create a merchant tenant (store + user) via `create-tenant.mjs` |
| `npm run provider:create` | create/adjust provider user via `create-provider-user.mjs` |
| `npm run sessions:ensure` | recreate `order_os.sessions` (needed on fresh prod DB) |
| `npm run delivery:ensure-communes` | backfill delivery commune settings |
| `npm run orders:ensure-product-images` | backfill order product images |
| `npm run landing-pages:ensure-store-slugs` | backfill landing page store slugs |

## 3. Production first-time setup (Vercel/Supabase)

```bash
npm run db:push
npm run sessions:ensure
npm run delivery:ensure-communes
npm run orders:ensure-product-images
npm run landing-pages:ensure-store-slugs
```

## 4. Baseline verification (expected dev-DB counts)

```sql
SELECT (SELECT count(*) FROM order_os.stores)           AS stores,
       (SELECT count(*) FROM order_os.orders)           AS orders,
       (SELECT count(*) FROM order_os.customers)        AS customers,
       (SELECT count(*) FROM order_os.landing_pages)    AS landing_pages,
       (SELECT count(*) FROM order_os.delivery_zones)   AS delivery_zones,
       (SELECT count(*) FROM order_os.audit_logs)       AS audit_logs,
       (SELECT count(*) FROM order_os.merchant_leads)   AS merchant_leads;
-- expected baseline: 3 / 24 / 15 / 8 / 58 / 74 / 0
-- sandbox stores = 0; @test.local users = 0
```

- After any smoke/HTTP test, sandbox rows must be 0 and business counts must match the baseline (re-verify, don't assume — see `Docs/current/STATE-SYSTEM §4`).

## 5. Supabase Storage (`product-images` bucket)

Product/store images are uploaded to Supabase Storage (production path). Bucket name is `SUPABASE_STORAGE_BUCKET` (currently `product-images`); upload requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` present (service-role write; if not set, the API falls back to local `UPLOAD_DIR` in non-production and returns 503 in production).

- **Bucket contract (verified, Phase 4):** `public=true`, `file_size_limit=5242880`, `allowed_mime_types=[image/jpeg, image/png, image/webp]`.
- **Upload path:** `stores/{storeId}/[{folder}/]{timestamp}-{uuid}-{safeName}.{ext}` via `POST {SUPABASE_URL}/storage/v1/object/{bucket}/{objectPath}` with headers `apikey` + `Authorization: Bearer <service_role>`, `x-upsert: "false"`, `Cache-Control: 31536000`, `Content-Type`.
- **Public URL:** `SUPABASE_STORAGE_PUBLIC_URL` if set, else default `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{objectPath}`.
- **API-side limits (enforced before storage):** max 5 MB (`413 "Image size must be 5MB or less"`); content type limited to `image/jpeg`, `image/png`, `image/webp`.
- **Verify the bucket exists:**
  ```bash
  curl -s "$SUPABASE_URL/storage/v1/bucket/$SUPABASE_STORAGE_BUCKET" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
  ```
  A 200/`{"name":"product-images",...}` confirms existence; 404 `NoSuchBucket` means it is missing and must be created in the Supabase Dashboard (public read, 5 MB limit, the three image types).
- **Config verification:** `.env` must define `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` (optionally `SUPABASE_STORAGE_PUBLIC_URL`). Legacy current-state audit treats `SUPABASE_STORAGE_BUCKET` present-but-missing-bucket as a mismatch — see `Docs/CURRENT-SYSTEM-STATE-AUDIT.md`.

## 6. Safety rules

- Never commit `.env`; never print secrets in logs/docs.
- `db:reset` destroys data — use only on the dev DB and only when intended.
- Smoke-created rows must be cleaned in the same run (tests roll back via a thrown sentinel; HTTP smokes delete sandbox rows explicitly).
- Current schema changes across Phase 10.x: exactly one column (`orders.return_reason`, Phase 10.3).