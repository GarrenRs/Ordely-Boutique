# Phase 7.1 — Provider Login Rate-Limit Hardening Report

> **Scope:** The single confirmed P2 issue — `POST /api/provider/auth/login` had **no rate limiter**. Fixed with the smallest possible change by reusing the existing shared `loginLimiter`. No architecture change, no schema change, no credential change. Follows directly from the Phase 6 baseline (`Docs/PHASE-6-HARDENING-BASELINE.md`, §8 row 2).

---

## 1. Root Cause

The provider root account authenticates against `POST /api/provider/auth/login` (`apps/api-server/src/routes/provider.ts:157`). The route handler ran without any rate-limiting middleware, leaving the root admin account open to unlimited brute-force attempts from a single IP.

The merchant `POST /api/auth/login` was already protected by the shared `loginLimiter` (`middleware/rateLimiter.ts`), and public order creation had `publicOrderLimiter`. The provider login was the only unguarded login surface.

## 2. Files Changed

**One file only:** `apps/api-server/src/routes/provider.ts`

Two lines:

1. Added import (after the `requireProviderAuth` import):
   ```ts
   import { loginLimiter } from "../middleware/rateLimiter.js";
   ```
2. Applied the middleware to the provider login route registration:
   ```ts
   providerRouter.post("/auth/login", loginLimiter, async (req: AppRequest, res: AppResponse): Promise<void> => {
   ```

No other source file, config, package file, or dependency was touched.

## 3. Exact Change

| Before | After |
|---|---|
| `providerRouter.post("/auth/login", async (req, res) => …)` | `providerRouter.post("/auth/login", loginLimiter, async (req, res) => …)` |

The **same instance** of `loginLimiter` already imported and used by merchant login is reused — no second limiter implementation, no new config knob.

Effective limiter configuration (unchanged, from `middleware/rateLimiter.ts`):
- Window: **15 minutes** (`windowMs: 15 * 60 * 1000`)
- Maximum: **10 requests** per window per key (`max: 10`)
- Key: `req.ip` (socket address) — `validate.xForwardedForHeader: false`, X-Forwarded-For not trusted
- 429 body: `{ "error": "محاولات كثيرة، حاول بعد 15 دقيقة" }`
- `standardHeaders: true` (`RateLimit-*` headers), `legacyHeaders: false`
- In-memory store per process (counters reset on server restart)

## 4. Previous Provider-Login Behavior

- Every request reached the handler with **no throttling**.
- Missing email/password → `400 { "error": "البريد الإلكتروني وكلمة المرور مطلوبان" }`.
- Wrong/unknown credentials (env-provider or DB-provider path) → `401 { "error": "بيانات الدخول غير صحيحة" }`.
- Correct credentials → sets `providerUserId/providerEmail/providerName` on session, returns `200 { user }`.
- No `RateLimit-*` headers ever present.

## 5. New Provider-Login Behavior

- `loginLimiter` now runs **before** the handler on `/auth/login`.
- **1st–10th** requests in any 15-min window (per IP): unchanged behavior — `400` / `401` / `200` exactly as above.
- **11th+** requests in the window: **`429`** with the standard Arabic message and `RateLimit-Limit: 10`, `RateLimit-Remaining: 0`.
- Because the **same shared instance** is used, provider and merchant login attempts from the same IP share one counter (a brute-force on the provider also locks merchant login for the same IP — intended consequence of reuse).
- Successful provider authentication path, session fields, `400` validation, and `401` wrong-credential responses are byte-for-byte unchanged (limiter only intercepts excessive traffic).

## 6. Rate-Limit Test (bounded, ordered — no over-brute-force)

Run directly against `http://127.0.0.1:8080/api` (fresh server process → empty limiter store). Sequence:

| # | Request | Status |
|---|---|---|
| 0 | `GET /healthz` | 200 |
| 1 | `POST /provider/auth/login {}` | 400 (validation) |
| 2 | `POST /provider/auth/login {email}` | 400 (validation) |
| 3 | `POST /provider/auth/login {unknown email}` | 401 |
| 4 | `POST /provider/auth/login {wrong password}` | 401 |
| 5 | `POST /auth/login {merchant, correct}` | 200 (done **before** exhausting shared window) |
| 6–10 | `POST /provider/auth/login {wrong password ×5}` | 401 |
| 11 | `POST /provider/auth/login {wrong password}` | **429** `RateLimit-Limit: 10`, `RateLimit-Remaining: 0`, body `{"error":"محاولات كثيرة، حاول بعد 15 دقيقة"}` |
| 12 | `POST /auth/login {merchant, correct}` while limited | **429** (proves provider + merchant share ONE instance) |

Result: **10/10 assertions passed**, including the exact 429 at the 11th request and `limit=10`/`remaining=0` headers.

## 7. Successful Login Test

- **Merchant valid login:** `showcase@ordely.local` + `SHOWCASE_PASSWORD` → `200 { user: { email: showcase@ordely.local, … } }` — verified before exhausting the shared window (test #5 above).
- **Provider valid login:** **could not be exercised** — the real provider password has no plaintext anywhere (only `PROVIDER_PASSWORD_HASH` in `.env`), and per constraints credentials may not be changed. The provider success path (`verifyEnvProvider` → set session → `200`) is unchanged code; its handler-level behavior and session-writing logic are identical pre/post fix, and the 401 wrong-credential path (same handler, same responses) is verified live above. This is the same record as Phases 4/6.

## 8. Provider Session Test

- Direct provider session persistence cannot be re-verified (no valid provider login possible — see §7).
- **Guard unchanged:** `GET /api/provider/summary` without session → `401` (route + `requireProviderAuth` intact); `GET /api/provider/auth/me` → `200 { "user": null }`.
- **Session infra verified via merchant path:** new `order_os.sid` cookie created, then `GET /api/auth/me` with that cookie → `200 { user }` (session persists across requests, DB-backed).
- No session-related code was modified.

## 9. Merchant Regression Result

- Merchant valid login **before** threshold → `200` (PASS).
- Merchant login **at 429 state** → `429` — expected, demonstrating the single shared limiter instance (per scope: "reuse the same instance").
- No separate full 53-check suite run — shared login/rate-limiter middleware was not modified; only the provider route registration gained the existing middleware. Scope rule honored.

## 10. Build Result

| Check | Result |
|---|---|
| `npm run typecheck` (libs + api-server + web) | ✅ PASS |
| `npm --prefix apps/api-server run build` | ✅ PASS (`dist/index.mjs` 2.7 MB, ~2.3 s) |
| `npm --prefix apps/web run build` | ✅ PASS (pre-existing "chunks > 500 kB" warning only — unrelated P3) |

API server restarted on the new build for verification: **PID 5576 → PID 7020**, port 8080, `GET /api/healthz` → `200 {"status":"ok"}`.

## 11. Database Integrity Result (read-only)

| Table | Baseline (Phase 6) | Now | Verdict |
|---|---|---|---|
| stores | 2 | 2 | unchanged |
| users | 2 | 2 | unchanged |
| provider_users | 1 (Admin / raesonrs@gmail.com) | 1 | unchanged |
| product_categories | 6 | 6 | unchanged |
| landing_pages | 8 | 8 | unchanged |
| delivery_zones | 58 | 58 | unchanged |
| delivery_commune_settings | 7 | 7 | unchanged |
| customers | 15 | 15 | unchanged |
| orders | 24 | 24 | unchanged |
| audit_logs | 74 | 74 | unchanged |
| merchant_leads | 0 | 0 | unchanged |
| schema tables | 12 | 12 | unchanged |
| sessions | 17 | **18** | natural growth (+1) from the verified merchant login — not a defect |

No schema change, no business-row change, no provider/store/credential change, no destructive operation. `.env` untouched.

## 12. Remaining Issues

- **No other P2/P3 item fixed** (per scope): drizzle-kit `push`, seed-hash anomaly follow-up, logout-cookie mismatch, UTC report buckets, web chunk warning, storage list-objects shape, orphaned `ensure-store-subscriptions` script, unused root `bcrypt` dep remain open for later phases.
- **Transient test residue:** the bounded brute-force test exhausted the shared 10-per-15-min login window for `127.0.0.1`. Provider and merchant login from this host may return `429` for up to **15 minutes** after the test, then self-heals (in-memory counter). No action required.
- **Provider valid-login still untestable automatically** (plaintext password absent by design) — unchanged known gap.
- Provider ~ merchant attempt counts are now **shared per IP** (a consequence of reusing one instance). Acceptable for a 1-provider deployment; if separate budgets are ever desired, that would be an explicit Phase 7+ decision (out of scope here).

---

**Phase 7.1 complete. Stopping after this phase.**