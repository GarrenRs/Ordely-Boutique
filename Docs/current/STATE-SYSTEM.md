# STATE-SYSTEM — Current System State

> Living mirror of the deployed/runnable system. This is the authoritative current-truth document for **infrastructure, environments, deployments, baseline data, security posture and operational facts**. Code and DB always win over this document; update this file within the same change that alters the facts.

<!-- DOC-META
type: state
status: active
verified-as-of: 2026-09-17
related: Docs/current/STATE-ARCHITECTURE.md, Docs/CURRENT-SYSTEM-STATE-AUDIT.md, Docs/PHASE-7.5-REPOSITORY-PUBLICATION-REPORT.md, Docs/PHASE-3-RESTORATION-REPORT.md
supersedes: Docs/CURRENT-SYSTEM-STATE-AUDIT.md
-->

## 1. Product snapshot

- **Project:** Ordely (`conversational-order-os`) — closed SaaS "Conversational Order OS" for Arab merchants (primary market: Algeria).
- **Business model:** single-product landing pages ordered by customers, Cash-on-Delivery (COD), merchant confirms/ships/delivers/returns through a dashboard; provider administers stores/subscriptions.
- **V1 scope:** Landing Pages, Orders, Confirmation, Customers, Delivery Zones, Reports, Customer Tracking, Manual Order Entry. Explicitly out of V1: AI, workflow builder, marketplace, inbox, page builder.

## 2. Repository & identity

- **Remote:** `https://github.com/GarrenRs/Ordely-Boutique.git`, branch `main`.
- **Workspace:** pnpm monorepo (`packageManager: pnpm@11.1.2`), TypeScript ~5.9, React 19, Express 5.
- **Commit history (master line):** `e27eec2` initial → `22d2227` publication baseline → `d133c85` Phase 8 audit → `e49f3d0` Phase 10.1-10.3 → `f2f9011` Phase 10.4 tracking → `d9e8c6a` Phase 10.5 manual order → `e047f53` docs baseline (final physiological/system audit) → **Layer A remediation (5 fixes, current)**.
- Provenance: `PHASE-7.5-REPOSITORY-PUBLICATION-REPORT.md`.

## 3. Environments

| Env | API | Web | DB | Notes |
|---|---|---|---|---|
| Development (local) | `http://localhost:8080` | Vite `http://localhost:5173` | Supabase PostgreSQL | API reads `.env` from repo root; cookies + CORS localhost |
| Production | Vercel Function, origin `https://ordely.vercel.app` | Vite static `apps/web/dist/public` | Supabase PostgreSQL | Postgres-backed sessions; Supabase Storage for images |

- Supabase project ref: `kofvrrcixoakvwjlmhzm` (dev + prod share the Supabase project; env differs in URL/host).
- App origins: live origin `https://ordely.vercel.app`; allowlist via `ALLOWED_ORIGINS`.

## 4. Data layer

- **PostgreSQL schema `order_os`**, Drizzle ORM source in `lib/db/src/schema/` (11 application tables, 3 enum types).
- **Schema workflow = `drizzle-kit push`** (no migration files). `npm run db:prepare` runs push + the full `ensure-*` chain. See `Docs/runbooks/RUNBOOK-DB.md`.
- **Tables:** `users`, `stores`, `landing_pages`, `product_categories`, `orders`, `customers`, `delivery_zones`, `delivery_commune_settings`, `audit_logs`, `provider_users`, `merchant_leads`.
- **Sessions:** Postgres-backed via `connect-pg-simple` in table `order_os.sessions` (restored Phase 3; `npm run sessions:ensure` recreates it). Browser cookie `order_os.sid`.
- **Storage:** Supabase Storage bucket `product-images` (public) for product/store images (restored Phase 3/4). In production `UPLOAD_DIR` is not used. Bucket config/verification: `Docs/runbooks/RUNBOOK-DB.md §5`.
- **Enum types:** `order_status` (`NEW, PENDING_CONFIRMATION, CONFIRMED, SHIPPED, DELIVERED, RETURNED, CANCELLED, REJECTED`) + delivery-method + additional delivery enums (see `STATE-PRODUCT-MODEL`).

### Baseline data (last verified 2026-09-17, dev DB)

| Table | Count |
|---|---|
| stores | 3 |
| orders | 24 |
| customers | 15 |
| landing_pages | 8 |
| delivery_zones | 58 |
| audit_logs | 74 |
| users (merchant) | 3 |
| provider_users | 1 |
| sandbox stores | 0 |
| `@test.local` accounts | 0 |

- Baseline is invariant across Phase 10.x (10.1/10.2/10.3 all re-verified identical). Re-verify against DB before quoting.
- Demo data: store `ordely-showcase` is the public demo store (8 active complete products, delivery fee 450 DZD for Algiers).

## 5. Security & hardening

- **Session:** signed session-ID cookie `order_os.sid` (express-session secret-signs the session id; cookie content is **not encrypted** — session data lives server-side in `order_os.sessions`); logout clears cookie (Phase 7.4).
- **Passwords:** bcrypt cost **12** — canonical, enforced across seed/provider/tenant scripts (Phase 7.2).
- **Auth:** session-based; `requireAuth` for merchants, `requireStoreAccess` scopes all `/:storeId` resources to the session store; provider route guarded by provider session.
- **Suspended store login:** blocked (`403 "المتجر موقوف مؤقتاً. تواصل معنا."`, no session created). Expired store: restricted login allowed (existing orders operable, new orders refused `422`).
- **Rate limits (express-rate-limit):**
  - `loginLimiter` — 10 req / 15 min (provider login).
  - `publicOrderLimiter` — 20 req / 60 min (public order creation).
  - `trackOrderLimiter` — 20 req / 10 min (public tracking).
  - `leadLimiter` — 8 req / 60 min (public merchant-lead intake).
- **Env secrets** (`.env`, never committed): `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `PROVIDER_EMAIL/PASSWORD_HASH/NAME`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `PORT`/`API_PORT`.

## 6. Operations

- Full command reference: `Docs/runbooks/RUNBOOK-DB.md` (DB) and `Docs/runbooks/RUNBOOK-VERIFY.md` (build/test/smoke).
- Root scripts: `db:push`, `db:push-force`, `db:prepare`, `db:reset` (destructive: reset-schema + push-force + seed), `db:seed`, `tenant:create`, `provider:create`, `typecheck`, `build`, `vercel:build`, plus per-domain `ensure-*`/`sessions:ensure`.
- Integration tests (5 suites, transactional rollback): readiness (30), lifecycle (47), return (58), tracking, manual-order.

## 7. Known caveats (tracked; not defects of this doc)

- Bundle-size warning ~1.08 MB (pre-existing, out of V1 scope).
- `lib/api-zod` generated contract had a temporary gap for `subscriptionExpiresAt`/`subscriptionPlanDays` (flagged at 10.1 §11); filled during 10.2 contract sync — the three contracts are manually synchronized (`state` guardrail, see `STATE-ARCHITECTURE §7`).
- `effectiveActiveStoreSql` is centralized in `readiness.ts` for `/public` usage; non-public reporting paths display (not enforce) store status — enforcement elsewhere is via login guard + order guard + manual-order guard.
- `showcaseSeed` demo timeline still shows the deprecated `SHIPPED → RETURNED` cosmetic path (seed-only; does not affect `VALID_TRANSITIONS` or real data).