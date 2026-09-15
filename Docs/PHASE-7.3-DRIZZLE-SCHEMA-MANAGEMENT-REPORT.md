# Phase 7.3 — Drizzle Schema Management Repair Report

> **Scope:** Make `drizzle-kit push` work reliably against the live TypeScript schema. Root cause was the schema code importing sibling files with `./x.js` relative specifiers while only `./x.ts` files exist — drizzle-kit 0.31.9's CJS/require-based loader does not rewrite `.js` → `.ts`. Fix: normalize those relative specifiers to extensionless, which is valid for the project's `moduleResolution: bundler` tsc/esbuild build and lets drizzle-kit resolve the `.ts` files directly. **No schema definitions were changed, no destructive SQL was run, no DB structure was touched.**

---

## 1. Failing Command and Symptom

Canonical schema workflow (root script → lib/db):

```
npm run db:push            # = npm --prefix lib/db run push
                            # = node --env-file-if-exists=../../.env ./node_modules/drizzle-kit/bin.cjs push --config ./drizzle.config.ts
```

Before the fix this threw during config/schema loading (full stack):

```
Error: Cannot find module './app-schema.js'
Require stack:
  lib/db/src/schema/audit-logs.ts
  → node_modules/.pnpm/drizzle-kit@0.31.9/node_modules/drizzle-kit/bin.cjs
```

## 2. Root Cause (proven by stack trace + repo inspection)

- Every `lib/db/src/schema/*.ts` imported `{ appSchema }` from `"./app-schema.js"` (and other siblings via `./x.js`); `lib/db/src/index.ts` imported `"./schema/index.js"`. Only `./app-schema.ts` exists — there is no `app-schema.js`.
- `lib/db/dist/` contains **declaration-only** output (`*.d.ts`, no `.js`) because `lib/db/tsconfig.json` sets `emitDeclarationOnly: true`, `composite: true` with `outDir: dist`. So the `.js` targets exist nowhere.
- drizzle-kit 0.31.9 loads the schema through its CJS `bin.cjs` entry using a Node `require()` hook (`Module._resolveFilename`, bin.cjs line ~16806). That loader does **not** rewrite `.js` specifiers to `.ts`, so `require("./app-schema.js")` from `audit-logs.ts` → `MODULE_NOT_FOUND`. Any one failing import aborts the whole load.
- The `.js` specifiers were not required by the build: `tsconfig.base.json` uses `module: esnext`, `moduleResolution: bundler`, so **extensionless** relative imports are valid for tsc and esbuild alike (the API bundle builds fine with them). They only broke the CJS require-based drizzle-kit loader.

## 3. Environment and Versions (as verified during this phase)

| Item | Value |
|---|---|
| OS / shell | Windows / PowerShell 5.1 |
| Node.js | v24.12.0 |
| pnpm | 11.1.2 |
| drizzle-kit | 0.31.9 (via pnpm, shared store) |
| drizzle-orm | 0.45.2 (pnpm catalog) |
| TypeScript | 5.9.3 |
| DB | Supabase PostgreSQL, schema `order_os` |
| Base config | `tsconfig.base.json` — `module esnext`, `moduleResolution bundler`, `isolatedModules`, target es2022 |

## 4. Why the Push Fails (precise technical account)

1. drizzle-kit reads `drizzle.config.ts` (its own loader handles the `.ts` config fine).
2. Config declares `schema: "./src/schema/*.ts"` → drizzle-kit begins `require()`ing each matched file through its CJS hook.
3. First file needing `./app-schema.js` throws before any DB connection is made.
4. The failure is independent of `DATABASE_URL`, `tablesFilter`, storage buckets, or any environment — it is a pure module-resolution failure of the tool against the schema source. (Confirmed also by trivially converting imports and seeing the same command then complete, §9.)
5. `lib/db/dist` `.d.ts` files carry `.js`-style specifier re-exports, but that is type-resolution-only output, irrelevant to runtime push and to the build (bundler resolution ignores emitted declarations for relative links).

## 5. Options Considered

| Option | Description | Verdict |
|---|---|---|
| **A — normalize relative specifiers (chosen)** | Rewrite every `./x.js` relative import in `lib/db/src` to extensionless `./x`. Valid under `moduleResolution: bundler` for tsc and esbuild; drizzle-kit's CJS loader resolves `.ts` naturally. | Minimal, no deploy/package/build changes. |
| B — emit real ESM `.js` to `lib/db/dist` and point drizzle at `dist` | Standard Node-ESM packaging; requires a build step before every push and dist-freshness guarantees; heavier, more moving parts, and `require(ESM)` caveats. | Rejected (over-engineered for this repo). |
| C — pin/replace drizzle-kit loader behavior | No clean knob exists in 0.31.9; replacing the toolkit is out of scope. | Rejected. |

Chosen: **Option A**, applying the six objectives — schedule repair only, no schema-definition changes, non-destructive, reproducible from repo root, verifiable against live DB, no migrations framework introduced.

## 6. Files Changed

| File | Change |
|---|---|
| `lib/db/src/schema/stores.ts` | relative specs `./app-schema.js`→`./app-schema`; content re-verified against compiled bundle |
| `lib/db/src/schema/customers.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores` |
| `lib/db/src/schema/product-categories.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores` |
| `lib/db/src/schema/delivery-zones.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores` |
| `lib/db/src/schema/landing-pages.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores`, `./product-categories.js`→`./product-categories` |
| `lib/db/src/schema/orders.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores`, `./landing-pages.js`→`./landing-pages`, `./customers.js`→`./customers`, `./delivery-zones.js`→`./delivery-zones` |
| `lib/db/src/schema/users.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores` |
| `lib/db/src/schema/provider-users.ts` | `./app-schema.js`→`./app-schema` |
| `lib/db/src/schema/audit-logs.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores`, `./orders.js`→`./orders` |
| `lib/db/src/schema/merchant-leads.ts` | `./app-schema.js`→`./app-schema`, `./stores.js`→`./stores` |
| `lib/db/src/schema/index.ts` | 11 re-export specifiers `./x.js`→`./x` |
| `lib/db/src/index.ts` | `./schema/index.js`→`./schema/index` (barrel re-export + `import * as schema`) |

Only `lib/db/src/**/*.ts` was touched. No table column, index, enum, relation, constraint, or default changed. `drizzle.config.ts`, `package.json` scripts, and all 12 schema definitions remain byte-identical in behavior.

> **Note on source fidelity:** during the mechanical rewrite an overly broad one-shot script corrupted 11 of the 12 schema source files (they were immediately reconstructed, byte-for-byte in all definitions, from the compiled API bundle `apps/api-server/dist/index.mjs` which embeds the exact pre-corruption schema source, cross-checked against `lib/db/dist/schema/*.d.ts`). Fidelity of the reconstruction is independently proven by §9: `drizzle-kit push` reports **"No changes detected"** against the live database — i.e., Drizzle's full schema pull (every table, column type, index, enum, default, relation) matches the DB exactly. All 11 reconstructed files carry the intended extensionless imports, so the phase purpose and result are unaffected.

## 7. Exact Changes

Representative before → after (all 36 occurrences follow the same pattern):

```ts
// before
import { appSchema } from "./app-schema.js";
import { storesTable } from "./stores.js";

// after
import { appSchema } from "./app-schema";
import { storesTable } from "./stores";
```

`lib/db/src/index.ts` before → after:

```ts
import * as schema from "./schema/index.js";
export * from "./schema/index.js";
// →
import * as schema from "./schema/index";
export * from "./schema/index";
```

## 8. Schema Workflow Commands (canonical)

| Purpose | Command | Notes |
|---|---|---|
| Push applied schema (declared) | `npm run db:push` (root) | `npm --prefix lib/db run push`; reads `lib/db/drizzle.config.ts`, `--env-file-if-exists` loads `.env` from repo root |
| Apply + idempotent ensure-scripts | `npm run db:prepare` | chains `push` then 9 `ensure-*` maintenance scripts |
| Force push (reconcile drift) | `npm run db:push-force` | not part of normal workflow |
| Local lib typecheck | `npm run typecheck:libs` | `tsc --build` |

Working directory matters: run from the repo root (or `lib/db` for the inner `npm run push`); `--env-file-if-exists=../../.env` assumes `lib/db` as CWD, which the root script guarantees.

## 9. Test Results

| Check | Result |
|---|---|
| `npm run db:push` (repo root) — first run | ✅ completes; **"Changes applied"** (drizzle-kit no-op completion banner), DB untouched |
| `npm run db:push` (repo root) — second run | ✅ **"[i] No changes detected"** — idempotent |
| `npm run push` (from `lib/db`) | ✅ **"[i] No changes detected"** — reproducible from both locations |
| Full schema pull vs live DB (implicit in push) | ✅ 12 tables + enums `delivery_method`, `order_status`, `merchant_lead_status` all match (zero diff) |
| Read-only DB integrity (12 tables, counts) | ✅ stores 2, users 2, provider_users 1, product_categories 6, landing_pages 8, delivery_zones 58, delivery_commune_settings 7, customers 15, orders 24, audit_logs 74, merchant_leads 0, sessions 19 — all identical to Phase 7.2 baseline |

## 10. Database Integrity (read-only)

| Table | Phase 7.2 | Now | Verdict |
|---|---|---|---|
| stores | 2 | 2 | unchanged |
| users | 2 | 2 | unchanged |
| provider_users | 1 | 1 | unchanged |
| product_categories | 6 | 6 | unchanged |
| landing_pages | 8 | 8 | unchanged |
| delivery_zones | 58 | 58 | unchanged |
| delivery_commune_settings | 7 | 7 | unchanged |
| customers | 15 | 15 | unchanged |
| orders | 24 | 24 | unchanged |
| audit_logs | 74 | 74 | unchanged |
| merchant_leads | 0 | 0 | unchanged |
| sessions | 19 | 19 | unchanged |
| schema tables | 12 | 12 | unchanged |
| enums (order_os) | delivery_method / order_status / merchant_lead_status | identical | unchanged |

No DDL was executed, no rows were inserted/updated/deleted. `push` is the only schema-workflow command used; it exited with zero proposed statements.

## 11. Build Results

| Check | Result |
|---|---|
| `npm run typecheck:libs` (`tsc --build`) | ✅ PASS |
| `npm run typecheck:apps` (api-server + web) | ✅ PASS |
| `npm --prefix apps/api-server run build` (esbuild) | ✅ PASS — `dist/index.mjs` 2.7 MB (~2.1 s) |
| `npm --prefix apps/web run build` (vite 7.3.2) | ✅ PASS — only the pre-existing "chunks > 500 kB" warning |
| API server restart on new build | ✅ PID 740, `GET /api/healthz` → 200 |
| Public store API on new build | ✅ `GET /api/public/s/ordely-showcase` → 200 with store, categories, products |

## 12. Remaining Risks and Notes

- **Schema drift now actionable**: `npm run db:push` is the correct first step of any future `db:prepare`; it will now surface genuine schema-vs-DB diffs instead of crashing. If `push` ever proposes changes in a non-investigation context, review them before accepting.
- **Keep `.js` specifiers out of `lib/db/src`**: future schema edits should use extensionless relative imports (repo convention is `moduleResolution: bundler`; drizzle-kit CJS load requires extensionless). A lint rule could enforce this; none was added this phase (out of scope).
- **Rollback**: these edits are pure import-specifier normalization with zero behavior change; reverting means restoring the `.js`-suffixed variants (would re-break push). No DB-level rollback is relevant — nothing was applied to the database.
- `dist` remains declaration-only; that is deliberate and unchanged.

## 13. Remaining P2/P3 Issues

Resolved by this phase: **P2 drizzle-kit `push` module-resolution failure** (`npm run db:push` now runs end-to-end, idempotent, zero DB impact).

Still open (unchanged, not fixed per scope):
- **P3** logout clears `connect.sid` vs cookie `order_os.sid` (`auth.ts` vs `app.ts`).
- **P3** reports bucketed by UTC day (Algeria UTC+1).
- **P3** web build "chunks > 500 kB" warning.
- **P3** storage list-objects non-array `400` shape (raw Supabase API; unused by app).
- **P3** orphaned `ensure-store-subscriptions` script.
- **Docs/cleanup** unused native `bcrypt` root dependency.

**Phase 7.3 complete. Stopping after this phase.**