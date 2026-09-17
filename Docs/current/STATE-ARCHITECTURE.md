# STATE-ARCHITECTURE — Current Architecture

> Living mirror of the repository structure, packages, contracts, auth boundaries and request flows. Code wins over this document; keep it in sync within the same change that alters the code it describes.

<!-- DOC-META
type: state
status: active
verified-as-of: 2026-09-17
related: Docs/current/STATE-SYSTEM.md, Docs/ARCHITECTURAL-AUDIT.md, Docs/PHASE-7.3-DRIZZLE-SCHEMA-MANAGEMENT-REPORT.md
supersedes: Docs/ARCHITECTURAL-AUDIT.md
-->

## 1. Monorepo layout

```text
apps/
  web/                    React 19 + Vite merchant panel & public order pages (dev :5173)
  api-server/             Express 5 API (dev :8080), esbuild build to dist/, tests/
lib/
  db/                     Drizzle schema + DB access + ensure-*/seed/tenant scripts
  api-spec/               OpenAPI contract (openapi.yaml) — hand maintained
  api-client-react/       Generated React Query client (api.schemas.ts) — hand-synced
  api-zod/                Generated Zod schemas (api.ts + types/*) — hand-synced
api/                      Vercel serverless entry (deploys api-server as Vercel Function)
vercel.json               Vercel build config (npm run vercel:build)
```

> **Note:** the three API contracts (api-zod, api-client-react, api-spec/openapi.yaml) share types but are **hand-synchronized manually**. Any change to a route response/body must update all three in the same change (see `runbooks/RUNBOOK-VERIFY.md`).

## 2. API surface (all paths under `/api`)

Router registration (`apps/api-server/src/routes/index.ts`):

| Area | Routes | Auth |
|---|---|---|
| `/health` | health check | none |
| `/auth` | login, logout, `/me` | session (login: unauthenticated, rate-limited) |
| `/public` | storefront, product, order creation, legacy `/p`, tracking `/orders/status` | **public/unauthenticated** (rate-limited) |
| `/provider` | stores list/detail/update (incl. renewal + suspension) | provider session |
| `/stores` | store list/detail (PATCH self-update) | `requireAuth` |
| `/stores/:storeId/landing-pages` · `product-categories` · `delivery-zones` · `orders` · `customers` · `confirmations` · `reports` · `uploads` | merchant CRUD + business flows | `requireStoreAccess` |

Guard model: `requireAuth` (merchant session) + `requireStoreAccess` (session `storeId` must equal `:storeId`, else 403). Provider uses its own session/guard.

## 3. Key business modules (`apps/api-server/src/lib`, `apps/api-server/src/routes`)

| Module | Responsibility |
|---|---|
| `storeLifecycle.ts` | Store lifecycle states, `storeAcceptsNewOrders`, provider status map, **D-06 renewal math** (`computeRenewalExpiry`). Single source. |
| `readiness.ts` | Derived readiness: `effectiveActiveStoreSql`, usable delivery-zone predicate, product completeness, reason codes. |
| `transitions.ts` | `VALID_TRANSITIONS` state-machine matrix; consumed by order PATCH. |
| `order-creation.ts` | `createOrderCore` — shared validation + pricing + customer upsert + insert + audit. Used by public, legacy and manual flows. |
| `order-format.ts` | Response shaping, variant validation, first-product-image helper. |
| `manual-order.ts` | `executeManualOrder` — P2-01 entry, guards lifecycle + product, audit note "طلب يدوي عبر التاجر". |
| `audit.ts` | `logAudit` → `audit_logs`. |
| `algeria-locations.ts` | Wilaya/commune reference + lookups. |
| `password.ts` | bcrypt (cost 12). |
| `showcaseSeed.ts` | Demo-store seed data (cosmetic timeline note — see `STATE-SYSTEM §7`). |

## 4. Auth & session flow

1. Merchant login `POST /api/auth/login` → validates bcrypt password (provider/merchant paths) → stores session in `order_os.sessions` (connect-pg-simple) → signed cookie `order_os.sid`.
2. Suspended store → `403` at login (no session). Expired store → allowed restricted entry.
3. `/api/auth/me` returns `storeStatus`, `isActive`, `subscriptionExpiresAt`, `daysLeft` for the merchant.
4. Merchant self-update `PATCH /api/stores/:storeId` via `UpdateStoreBody` — **cannot** change `isActive` (field removed from contract; provider owns suspension).
5. Provider `PATCH /api/provider/stores/:id` handles `name/ownerName/phone/city/isActive` + `subscriptionDays` (renewal via D-06, sets `isActive=true`).

## 5. Public flows

- **Storefront** `GET /api/public/s/:storeSlug`: resolves active+subscribed store (slug or numeric id), returns active categories + products filtered by `storeReady && productDataComplete`.
- **Product page** `GET /api/public/s/:storeSlug/p/:productSlug` → 404 if store/product not publicly live; returns page + delivery zones + related products.
- **Public order** `POST /api/public/s/:storeSlug/p/:productSlug/order` and legacy `/p/:slug/order` (409 on slug ambiguity): shared `createOrderCore`; hard guard `422` if store loses readiness (no row inserted).
- **Tracking** `POST /api/public/orders/status` `{orderId, phone}` → `{orderId, status, createdAt, updatedAt, returnedAt, deliveredAt}`; `Cache-Control: no-store`; 404 if no match; unauthenticated, rate-limited (ADR-004).

## 6. Merchant order flow (incl. manual entry P2-01)

- `PATCH /api/stores/:storeId/orders/:orderId` enforces `VALID_TRANSITIONS` (422 otherwise); `RETURNED` additionally requires non-empty `returnReason`; sets `returned_at`.
- `POST /api/stores/:storeId/orders` (merchant) = **manual order entry**: guards expired/suspended, validates product ownership, runs `createOrderCore` with `requireAddressForHome: true`, audit `ORDER_CREATED` note "طلب يدوي عبر التاجر". No `order_source` column (ADR-005).
- Reporting endpoints (`/orders/summary`, `/reports/daily`, `/reports/weekly`, provider dashboard summary) group by status; `RETURNED` reflected in `returnLoss`/`netRevenue`.

## 7. Contract sync guardrail

- Route changes must update, in one change: `lib/api-zod/src/generated/api.ts` + `types/*`, `lib/api-client-react/src/generated/api.schemas.ts`, `lib/api-spec/openapi.yaml`.
- Existing caveat: optional (nullish) field additions do not require touching React-client `api.ts` signatures.
- Typecheck is the compile-time tripwire: `npm run typecheck` covers libs + api-server + web.

## 8. Deployment topology

- **Local:** `npm --prefix apps/api-server run dev` (:8080) + `npm --prefix apps/web run dev` (:5173); API reads `.env` from repo root.
- **Vercel:** `vercel:build` (typecheck + api-server build + web build); Vite static served from `apps/web/dist/public`; Express API deployed as Vercel Function via `api/[...path].ts`; Postgres-backed sessions + Supabase Storage in production. Env vars listed in `STATE-SYSTEM §5`.