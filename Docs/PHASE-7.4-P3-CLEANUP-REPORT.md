# Phase 7.4 - P3 Cleanup Report: Logout Cookie + Dependency + Orphan Script

> **Scope:** Three P3 cleanups only - (A) fix the logout cookie-name mismatch, (B) remove the unused native `bcrypt` dependency and its config, (C) audit and resolve the orphaned `ensure-store-subscriptions` script. No schema/business-data/auth-architecture changes.
>
> **Status:** All P1/P2 issues resolved. This phase makes no P1/P2 changes.

---

## 1. Logout Root Cause

Express session middleware registers the session cookie under **`name: "order_os.sid"`** (`apps/api-server/src/app.ts:85`), with `cookie: { httpOnly, secure, sameSite: "lax", maxAge: 7d }`.

The merchant logout handler destroyed the server-side session correctly but then issued `res.clearCookie("connect.sid")` (`apps/api-server/src/routes/auth.ts:53`) - i.e., it tried to clear a cookie **that is never set**. Result:

- `POST /api/auth/logout` -> server session destroyed, but the **client-side `order_os.sid` cookie was never cleared**.
- The browser kept a stale (now-orphaned) session cookie - incorrect client-side cleanup behavior.

Expected behavior (login -> cookie created -> logout -> **cookie cleared** -> server session destroyed -> `/api/auth/me` unauthenticated) was violated on the client-side clearing half.

## 2. Logout Fix

`apps/api-server/src/routes/auth.ts:53`:
```diff
-    res.clearCookie("connect.sid");
+    res.clearCookie("order_os.sid");
```

Nothing else changed: session store (`connect-pg-simple`, `schema order_os`, `table sessions`), cookie config, and session middleware are untouched. This restores destroy + client-side clear symmetry.

Targeted regression (live API, new build, actual `SHOWCASE_PASSWORD`):

| Step | Observed |
|---|---|
| 1. `POST /api/auth/login` | **200**; `Set-Cookie: order_os.sid=...` present; no `connect.sid` sent |
| 2. `GET /api/auth/me` w/ cookie | **200**, `user.email = showcase@ordely.local` (authenticated) |
| 3. `POST /api/auth/logout` w/ cookie | **200**; `Set-Cookie: order_os.sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT` (client cleared) |
| 4. `GET /api/auth/me` w/ old cookie | **200**, `user = null` (unauthenticated) |

**PASS** - login creates the session cookie, logout clears the same named cookie, session destroyed, `/me` reports unauthenticated.

## 3. Provider Logout Audit

`apps/api-server/src/routes/provider.ts:195`:
```ts
providerRouter.post("/auth/logout", (req, res): void => {
  delete req.session.providerUserId;
  delete req.session.providerEmail;
  delete req.session.providerName;
  res.json({ ok: true });
});
```

Findings:
- Provider logout does **not** reference `connect.sid` (or any cookie name) - the wrong-cookie-name bug is **not present** in the provider path.
- It intentionally removes only the provider identity fields from the shared session, leaving the underlying session (and any merchant identity) intact.
- Verified `GET /api/provider/auth/me` returns `user: null` (unauthenticated) after this behavior.
- Per scope ("if provider logout uses the same incorrect cookie name, apply the same minimal correction") - it does **not**, so **no change made**. Provider logout already renders the provider unauthenticated.

## 4. bcrypt Dependency Audit

Searched the whole repository (`apps`, `lib`, root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, all `.ts/.mjs/.json/.yaml` config):

| Reference | Found | Notes |
|---|---|---|
| `import ... from "bcrypt"` | **No** | only `bcryptjs` imports exist (`auth.ts`, `provider.ts`, `password.ts`, `tenant.mjs`, `seed-showcase-store.mjs`, `create-provider-user.mjs`) |
| `require("bcrypt")` | **No** | - |
| `bcrypt@6.0.0` in lockfile importers | was root-only importer `.:` | removed this phase |
| `allowBuilds: bcrypt` | `pnpm-workspace.yaml:7` | removed this phase |
| `build.mjs` external list | `"bcrypt"` | **left intentionally** - the list is documented future-proofing boilerplate covering many non-installed native packages (`sharp`, `argon2`, `sqlite3`, ...); harmless, not a dependency reference |
| `@types/bcryptjs` / `bcryptjs` | present (`bcryptjs` is the runtime lib) | **kept** per scope - do not remove `bcryptjs` |

Conclusion: native `bcrypt` (root dependency, `^6.0.0`) is **unused** - pre-existing Phase 6 cleanup candidate; only `bcryptjs 3.0.3` is the runtime library.

## 5. bcrypt Cleanup

| Item | Before | After |
|---|---|---|
| root `package.json` `dependencies` | `{ "bcrypt": "^6.0.0" }` | removed (block deleted) |
| `pnpm-workspace.yaml` `allowBuilds` | `bcrypt: true`, `esbuild: true` | `esbuild: true` only |
| `pnpm-lock.yaml` | `bcrypt@6.0.0` entries (importer + snapshot) | regenerated - gone |
| `node_modules/.pnpm/bcrypt@6.0.0` | physical dir present | pruned by reinstall + manual removal |

- `pnpm install` then re-run: **exit 0**, "Lockfile is up to date / Already up to date".
- Re-verified lockfile: only `bcryptjs` / `@types/bcryptjs` remain; root importer no longer lists any `dependencies`.
- `bcryptjs` untouched (`apps/api-server`, `lib/db`).

## 6. ensure-store-subscriptions Audit

Inspected `lib/db/scripts/ensure-store-subscriptions.mjs` (since removed):

```sql
ALTER TABLE order_os.stores ADD COLUMN IF NOT EXISTS subscription_plan_days integer;
ALTER TABLE order_os.stores ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
UPDATE order_os.stores
  SET subscription_plan_days   = COALESCE(subscription_plan_days, 30),
      subscription_expires_at  = COALESCE(subscription_expires_at, now() + interval '30 days')
  WHERE subscription_expires_at IS NULL;
```

| Question | Answer |
|---|---|
| 1. Covered elsewhere? | **Yes.** Both columns are declared in the Drizzle schema (`lib/db/src/schema/stores.ts:15-16`) - created by `db:push`; live DB already has both (Phase 7.3 `push` = "No changes detected"). |
| 2. What does it do? | Legacy DDL if-not-exists + a **one-time 30-day backfill** default for stores with `NULL` expiry. |
| 3. Safe/idempotent? | Yes (`IF NOT EXISTS`, nulls-only backfill), but its default (30 days) is **not** the app policy. |
| 4. Required for fresh envs? | **No.** Schema comes from `db:push`; all provisioning paths set explicit values: showcase seed = 365 days; provider store-create/lead-conversion = `TRIAL_DAYS` + `addSubscriptionDays`; `showcaseSeed.ts` = 365. |
| 5. Why absent from `db:prepare`? | Pre-dates the Drizzle-schema era; superseded once columns moved into `stores.ts`. |
| 6. Policy conflict | App treats `subscription_expires_at IS NULL` as "active / not expired" (`public.ts:11`, `provider.ts:106` - `isActive AND (expires IS NULL OR expires > now())`). A 30-day auto-backfill would turn intentionally-permanent stores into expiring ones - the script is now **dangerous, not just dead**. |

## 7. Decision: Wire or Remove

**Decision: Option B - remove the script as obsolete (and inconsistent with current policy).**

- No active references: **0** hits in `lib/db/package.json`, root `package.json`, any npm script, or the `db:prepare` chain. Only historical mentions in prior-phase docs remain (Phase 3/4/5/6 note it as orphaned).
- Its DDL responsibility is fully owned by the Drizzle schema (`db:push`).
- Its 30-day backfill contradicts the application's `NULL = active` convention and could corrupt subscription semantics if ever wired into `db:prepare` - the key reason to prefer removal over wiring.
- Wiring (Option A) would make `npm run db:prepare` mutate store subscription data - violates this phase's "no destructive changes" guard.

Performed: deleted `lib/db/scripts/ensure-store-subscriptions.mjs`. Verified no package script/config references it; prior docs remain as historical records (Phase 7.4 supersedes their recommendations).

## 8. Files Changed

| File | Change |
|---|---|
| `apps/api-server/src/routes/auth.ts` | `clearCookie("connect.sid")` -> `clearCookie("order_os.sid")` (line 53) |
| `package.json` (root) | removed `dependencies.bcrypt = ^6.0.0` (empty deps block now omitted) |
| `pnpm-workspace.yaml` | removed `allowBuilds: bcrypt: true` |
| `pnpm-lock.yaml` | regenerated (bcrypt@6.0.0 removed; only bcryptjs/types remain) |
| `node_modules/.pnpm/bcrypt@6.0.0` | pruned physical store dir |
| `lib/db/scripts/ensure-store-subscriptions.mjs` | **deleted** (obsolete; policy-conflicting) |

Unchanged (intentionally): `apps/api-server/src/app.ts` (session config), `routes/provider.ts` (provider logout - no same bug), `apps/api-server/build.mjs` (external list is future-proofing boilerplate, not a dependency), all `bcryptjs` deps, `drizzle.config.ts`, all schema definitions, business data.

## 9. Build Results

| Check | Result |
|---|---|
| `npm run typecheck` (libs + api-server + web) | **PASS** |
| `npm --prefix apps/api-server run build` (esbuild) | **PASS** (`dist/index.mjs` 2.7 MB, ~2-8 s) |
| `npm --prefix apps/web run build` (vite 7.3.2) | **PASS** (only pre-existing "chunks > 500 kB" warning) |

API server restarted on the new build (PID 13688, port 8080, `/api/healthz` -> 200). Logout regression PASS on the new build (see section 2). `pnpm install` (twice) clean after dependency removal.

## 10. Database Integrity (read-only)

| Table | Phase 7.3 | Now | Verdict |
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
| schema tables | 12 | 12 | unchanged |
| sessions | 19 | 19 | login test added +1, logout destroyed it -> back to 19 (expected natural churn) |

No DDL, no data mutation, no `db:push`/`db:push-force`/`db:reset` run this phase. `db:prepare` untouched (script removed was never part of it).

## 11. Remaining Backlog

Resolved by this phase: **logout cookie mismatch** (A), **unused native bcrypt dependency + `allowBuilds` config** (B), **orphaned `ensure-store-subscriptions`** (C).

Still open (explicitly deferred per scope):
- **P3** reports bucketed by UTC day (Algeria UTC+1).
- **P3** web build "chunks > 500 kB" warning.
- **P3** storage list-objects non-array `400` shape (raw Supabase API; unused by app).

## 12. Left Intentionally Untouched

Per scope, the following were **not** addressed and remain backlog items:
- **UTC report timezone** - no change.
- **Bundle size warning** - no change (only the pre-existing vite warning surfaced in builds).
- **Supabase storage list-objects anomaly** - no change.

**Phase 7.4 complete. Stopping after this phase.**