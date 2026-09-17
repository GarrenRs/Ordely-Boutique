# SPECS — Specifications Registry

> Classification of every product/technical specification and of each doc's role. The only formal specification in this repository is Phase 9. All its features are implemented. "Proposed/approved" slots are reserved for future specs.

<!-- DOC-META
type: reference
status: active
verified-as-of: 2026-09-17
related: Docs/INDEX.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## 1. Specification status vocabulary

`proposed` → `approved` → `implemented` (closed, evidence in phase-reports) · `deferred` · `rejected` · `out-of-scope (V1)`.

## 2. Formal specifications (only one exists)

| Spec | Section (Phase 9) | Status | Implemented by | Notes |
|---|---|---|---|---|
| P1-02 Publication readiness | §4 | **implemented** | `PHASE-10.1-PUBLICATION-READINESS-REPORT.md` | derived readiness, no schema change |
| P1-04 Subscription expiry | §5 | **implemented** | `PHASE-10.2-SUBSCRIPTION-LIFECYCLE-REPORT.md` | lifecycle model + D-06 (ADR-001) |
| P1-03 Return after delivery | §6 | **implemented** | `PHASE-10.3-RETURN-AFTER-DELIVERY-REPORT.md` | `return_reason` column (only schema change of Phase 10) |
| P1-01 Customer tracking | §3 | **implemented** | `PHASE-10.4-CUSTOMER-ORDER-TRACKING-REPORT.md` | public status endpoint, no schema change |
| P2-01 Manual order entry | §7 | **implemented** | `PHASE-10.5-MANUAL-ORDER-REPORT.md` | reuse of `createOrderCore`, no schema change |

> **Section-reference corrections (preserved as known historical inaccuracies in the reports):** Phase 10.2/10.3 cite `القسم 4` but P1-04/P1-03 are §5/§6 respectively; Phase 10.4 cites `القسم 4` and P1-01 is §3; Phase 10.5 cites `القسم 4` and P2-01 is §7. The spec→report mapping above is authoritative.

## 3. Deferred / rejected / out-of-scope

- **Deferred decisions:** D-01…D-11 — canonical in `PHASE-9 §15`, live status in `Docs/current/BACKLOG.md §A`.
- **Future features recorded (Phase 8):** cart C-06, customer retention B-04, lead enrichment B-05, provider drill-down P-04, store closure X-07 — mirrored in BACKLOG §B.

## 4. Doc-type classification (every file in `Docs/`)

| Type | Where it lives | Editable? |
|---|---|---|
| `index` | `INDEX.md` | yes |
| `governance` | `GOVERNANCE.md` | yes |
| `state` (living truth) | `current/` | yes (with code change) |
| `decision` (ADR) | `decisions/` | no (amend via new ADR) |
| `reference` / `runbook` | `runbooks/`, `specs/REGISTRY.md` | yes (factual updates) |
| `spec` | `PHASE-9-…` | no (implemented, immutable) |
| `phase-report` | `PHASE-*.md` | no |
| `audit` | the two audits + `PHASE-8-…` | no |

Full file inventory: `Docs/INDEX.md` (must always match the filesystem).