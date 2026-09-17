# RUNBOOK-VERIFY — Build, Test & Smoke Verification

> Verification procedure used to close a phase / before release. No docs-validation tool exists yet (BACKLOG C-01) — docs checks are manual (see §5).

<!-- DOC-META
type: reference
status: active
verified-as-of: 2026-09-17
related: Docs/runbooks/RUNBOOK-DB.md, Docs/current/STATE-SYSTEM.md
-->

## 1. Static checks

```bash
npm run typecheck          # libs (tsc --build) + api-server + web
npm run build              # full: typecheck + api-server (esbuild) + web (vite)
```

Expected: green. Known pre-existing non-blocking warning: ~1.08 MB web chunk size.

## 2. Integration test suites (transactional, self-rollback)

Run each; all use a single transaction that throws a sentinel at the end (full rollback) then asserts DB purity.

```bash
npm --prefix apps/api-server run test:readiness      # P1-02 — 30 checks (Phase 10.1)
npm --prefix apps/api-server run test:lifecycle      # P1-04/D-06 — 47 checks (Phase 10.2)
npm --prefix apps/api-server run test:return         # P1-03 — 58 checks (Phase 10.3)
npm --prefix apps/api-server run test:tracking       # P1-01 (Phase 10.4)
npm --prefix apps/api-server run test:manual-order   # P2-01 (Phase 10.5)
```

Each script first builds (esbuild) then runs the compiled test from `dist/tests/`.

## 3. Live HTTP smoke (against :8080)

Prereqs: server running on latest build, dev DB `.env`. Sanity path (matches Phase 10.x regression procedure):

1. `GET /api/public/s/ordely-showcase` → 200, 8 ready products.
2. `GET /api/public/s/ordely-showcase/p/:productSlug` → 200 with delivery zones + fees (Algiers = 450 DZD).
3. `GET /api/public/p/sovage-pure` (legacy) → 200.
4. Merchant login (showcase) + `/api/auth/me` → `storeStatus`, `daysLeft`.
5. Tracking: create order via public flow (201), then `POST /api/public/orders/status {orderId, phone}` → 200; cleanup the smoke order + audit + customer afterwards.
6. Negative: store without usable zone → no products, order guard 422, no row inserted.
7. Cleanup verification = baseline counts (§4 of RUNBOOK-DB).

## 4. Docs verification (manual, until tooling lands)

- `grep -c 'DOC-META' Docs/**/*.md` — every `.md` in `Docs/` carries a header (INDEX/GOVERNANCE included).
- `Docs/INDEX.md` inventory must equal the filesystem listing (`git ls-files Docs/ | sort` vs INDEX table). INDEX and filesystem must never drift.
- Relative links inside Docs must resolve (no broken paths); phase-reports keep their historical (10.2/10.3/10.4/10.5 section-number) references untouched by design.
- No bare secrets / connection strings in any doc.

## 5. Contract-sync check

After any API contract change, confirm the three consumers agree (they are hand-synced — see `STATE-ARCHITECTURE §7`):
`lib/api-zod/src/generated/api.ts` + `types/*` · `lib/api-client-react/src/generated/api.schemas.ts` · `lib/api-spec/openapi.yaml`.
Typecheck is the tripwire; do not let PATCH/POST bodies and response types diverge.