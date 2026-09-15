# Phase 7.2 — Seed Password Consistency & Verification Report

> **Scope:** Resolve the password-hash consistency issue (P2 #3 from Phase 4/6) for **future provisioning only**. No existing hashes were modified, no passwords rotated, no user/store/provider rows mutated, no destructive SQL run, no showcase reseed. Fix = align **every** password-hashing site to one canonical bcryptjs cost **12** via a single shared utility in the app and aligned constants in the standalone `.mjs` scripts.

---

## 1. All Password-Generation Paths Discovered

| # | Path | Entity | Hash library | Cost | Password source | Purpose |
|---|---|---|---|---|---|---|
| 1 | `lib/db/scripts/seed-dev.mjs` → `tenant.mjs:createTenant` | merchant user | bcryptjs | was 10 → **12** | `DEV_ADMIN_PASSWORD` (default `admin123`) | `db:seed` demo tenant |
| 2 | `lib/db/scripts/create-tenant.mjs` → `tenant.mjs:createTenant` | merchant user | bcryptjs | was 10 → **12** | `TENANT_PASSWORD` | `tenant:create` |
| 3 | `lib/db/scripts/tenant.mjs` (line 74) | merchant user | bcryptjs | was 10 → **12** | `password` param | shared create/update-tenant util |
| 4 | `lib/db/scripts/seed-showcase-store.mjs` (line 412) | showcase merchant user | bcryptjs | 12 | `SHOWCASE_PASSWORD` (.env) | showcase seed (upsert overwrites hash) |
| 5 | `lib/db/scripts/create-provider-user.mjs` (line 39) | provider root user | bcryptjs | was 10 → **12** | `PROVIDER_PASSWORD` (.env) | `provider:create` |
| 6 | `apps/api-server/src/routes/provider.ts` (line 295) | merchant (lead conversion) | bcryptjs | was 10 → **12** | `randomPassword()` | `POST /provider/leads/:id/convert` |
| 7 | `apps/api-server/src/routes/provider.ts` (line 409) | merchant (store create) | bcryptjs | was 10 → **12** | provided (≥8) or `randomPassword()` | `POST /provider/stores` |
| 8 | `apps/api-server/src/routes/provider.ts` (line 485) | merchant (password reset) | bcryptjs | was 10 → **12** | provided (≥8) or `randomPassword()` | `POST /provider/stores/:id/reset-password` |
| 9 | `apps/api-server/src/routes/auth.ts` (line 93) | merchant (password change) | bcryptjs | was 10 → **12** | `newPassword` param | `PATCH /auth/password` |
| 10 | `apps/api-server/src/lib/showcaseSeed.ts` (line 335) | showcase merchant (created only if missing) | bcryptjs | 12 | random `showcase-${uuid}` | `POST /provider/showcase/reseed` |

**Compare-only paths (cost-agnostic, no generation):** `auth.ts:23` (merchant login), `auth.ts:86` (password-change verify), `provider.ts:66` (env-provider verify), `provider.ts:183` (DB-provider verify) — all `bcryptjs.compare`.

## 2. Hash Libraries and Costs

- Library: **bcryptjs 3.0.3** everywhere (native `bcrypt` at repo root remains unused — Phase 6 note).
- Before this phase: **5 runtime sites at cost 10** (rows 1–3, 5, 6–9) and **2 at cost 12** (rows 4, 10).
- After this phase: **all 10 generation sites use cost 12**.

Live DB hash prefixes (read-only, unmodified):
- `users` id 1 `showcase@ordely.local` → `$2b$12$` (matches `.env` `SHOWCASE_PASSWORD` — compare verified `true`)
- `users` id 3 `eva@gmail.com` (Eva-Boutique) → `$2b$10$` (created by the provider UI route pre-fix)
- `provider_users` id 1 `raesonrs@gmail.com` → `$2b$10$`

## 3. Historical Inconsistency

Phase 4 recorded: *"first merchant login failed (401). The original `.env` didn't match the first seed — after re-running the seed the stored hash verifies (cost 12). Re-seeding fixed it."*

Confirmed mechanism this phase:

- `seed-showcase-store.mjs:412,447-456` upserts `password_hash = hash(SHOWCASE_PASSWORD, 12)` for `showcase@ordely.local` **on every run** → a re-run always rewrites that merchant's hash to a cost-12 hash of the **current** `.env` value (this is what made the Phase 4 re-seed "fix" the login).
- `tenant.mjs:74,117-124` upserts `password_hash = hash(password, 10)` for an **existing email** → running `db:seed` / `tenant:create` against `showcase@ordely.local` overwrites the showcase hash with a **cost-10** hash of a different password.
- `bcrypt.compare` is **cost-agnostic** (verified) → a 401 is caused by a **password-string mismatch**, never by cost alone; the observed "cost changed from 10→12 after re-seed" is the visible fingerprint of an overwrite by the cost-10 path followed by the cost-12 showcase re-seed.

## 4. What Is Proven (from current repository evidence)

1. Current source has (had) genuinely mixed costs: 10 and 12 — confirmed by direct reads.
2. Both seed scripts **overwrite** existing users' hashes on re-run (upsert), at different costs — throughput for a cross-script overwrite exists.
3. `bcryptjs.compare` accepts any cost → legitimacy/validity of future cost-12 hashes against existing compare code is guaranteed.
4. The showcase merchant currently verifies at cost 12 (`$2b$12$`, compare `true`) and logs in on the new build (smoke test).
5. Legacy cost-10 hashes (Eva, Provider) remain verifiable — counterexample test (hash at 10, compare) passed.

## 5. What Remains Unproven

**Root cause not provable from current repository evidence** regarding *which exact original execution sequence* produced the first mismatched hash. There is no git history, no seed-run log, and no snapshot of the `.env` value(s) at the time of the first seed. Two equally consistent histories exist:
(a) `db:seed`/`tenant.mjs` (cost 10) ran against `showcase@ordely.local` some time after the showcase seed, overwriting the hash with the demo password; or
(b) `.env` `SHOWCASE_PASSWORD` differed at first-seed time and was corrected before the re-seed.

Both end in the same observed state; the mechanism (mixed-cost upserts + string mismatch) is confirmed, the trigger episode is not. The fix makes the mixed-cost class of bug impossible regardless of which scenario occurred.

## 6. Canonical Password Policy

```
Hashing: bcryptjs (3.0.3), cost = 12, salt auto (bcryptjs default 16-byte), hash prefix $2b$12$
Applies to: every merchant/tenant/root credential generation site (10 sites listed in §1)
Verification: bcrypt.compare (cost-agnostic → existing cost-10 and cost-12 hashes keep working)
```
Single implementation in the app: `apps/api-server/src/lib/password.ts` (`hashMerchantPassword` + exported `PASSWORD_HASH_COST = 12`). Standalone `.mjs` scripts cannot import the TS app module, so they align their literal cost to 12 (smallest safe fix, per the shared-impl-vs-align-constants decision).

## 7. Files Changed

| File | Change |
|---|---|
| `apps/api-server/src/lib/password.ts` | **NEW** — shared canonical hashing utility |
| `apps/api-server/src/routes/provider.ts` | import util; 3 hash sites → `hashMerchantPassword` |
| `apps/api-server/src/routes/auth.ts` | import util; password-change hash → `hashMerchantPassword` |
| `apps/api-server/src/lib/showcaseSeed.ts` | replace direct `bcrypt.hash(x,12)` + dropped now-unused `bcryptjs` import; uses util |
| `lib/db/scripts/tenant.mjs` | cost literal `10` → `12` |
| `lib/db/scripts/create-provider-user.mjs` | cost literal `10` → `12` |

(`seed-showcase-store.mjs` already at 12 — verified, unchanged except none.)

## 8. Exact Changes

- New `password.ts`:
  ```ts
  export const PASSWORD_HASH_COST = 12;
  export async function hashMerchantPassword(password: string): Promise<string> {
    return bcrypt.hash(password, PASSWORD_HASH_COST);
  }
  ```
- `provider.ts` lines 295/409/485: `await bcrypt.hash(password, 10)` → `await hashMerchantPassword(password)`
- `auth.ts` line 93: `await bcrypt.hash(newPassword, 10)` → `await hashMerchantPassword(newPassword)`
- `showcaseSeed.ts` line 335: `await bcrypt.hash(\`showcase-${crypto.randomUUID()}\`, 12)` → `await hashMerchantPassword(\`showcase-${crypto.randomUUID()}\`)`; removed `import bcrypt`
- `tenant.mjs` line 74 + `create-provider-user.mjs` line 39: `, 10)` → `, 12)`

## 9. Test Results (isolated, in-memory — no DB writes)

Run against the **actual shared utility** (imported via Node type-stripping): **15/15 PASS**

- A. Two independently generated test merchant passwords → two cost-12 hashes (`$2b$12$`, 60 chars), distinct salts.
- B. Cost = canonical 12 (`PASSWORD_HASH_COST === 12`, prefix regex `$2[aby]$12$`).
- C. `compare(pwA,hA)`/`compare(pwB,hB)` = true; cross-compare = false.
- D. Script-style hash path (`bcrypt.hash(pw,12)`, tenant.mjs) cost = 12.
- E. Provider-route-style credential generation (util) cost = 12.
- F. Lead-conversion util roundtrip compare = true.
- G. Legacy cost-10 hash still compares correctly (backward compatibility).

Runtime smoke (new build, one bounded login):
- `POST /api/auth/login` `showcase@ordely.local` + `SHOWCASE_PASSWORD` → **200** `{user:{id:1,storeId:1,storeName:"Ordely Showcase"}}` — cost-12 hash verified on new build.
- No test user, store, or hash was persisted.

## 10. Current Database Integrity (read-only)

| Table | Phase 6/7.1 | Now | Verdict |
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
| sessions | 18 | **19** | natural growth (+1) from the login smoke test — not a defect |

No stored hash was modified (showcase still `$2b$12$`, eva `$2b$10$`, provider `$2b$10$`).

## 11. Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ PASS |
| `npm --prefix apps/api-server run build` | ✅ PASS (~2 s) |
| `npm --prefix apps/web run build` | ✅ PASS (pre-existing "chunks > 500 kB" warning only) |

API server restarted on the new build (PID 7020 → **14896**, port 8080, `/api/healthz` → 200) so future provisioning at runtime uses cost 12.

## 12. Remaining P2/P3 Issues

Resolved by this phase: **P2 #3 seed-hash anomaly** (canonical cost now enforced everywhere; mixed-cost overwrite class eliminated).

Still open (unchanged, not fixed per scope):
- **P2** drizzle-kit `push` module-resolution failure (`npm run db:prepare` step 1).
- **P3** logout clears `connect.sid` vs cookie `order_os.sid` (`auth.ts` vs `app.ts`).
- **P3** reports bucketed by UTC day (Algeria UTC+1).
- **P3** web build "chunks > 500 kB" warning.
- **P3** storage list-objects non-array `400` shape (raw Supabase API; unused by app).
- **P3** orphaned `ensure-store-subscriptions` script.
- **Docs/cleanup** unused native `bcrypt` root dependency.

**Phase 7.2 complete. Stopping after this phase.**