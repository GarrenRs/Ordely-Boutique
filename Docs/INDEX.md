# Docs Index (INDEX)

> Single entry point for the Ordely documentation. **Read this file first.** It routes any question to the correct, non-duplicated source of truth and keeps the filesystem inventory in one place.

<!-- DOC-META
type: index
status: active
verified-as-of: 2026-09-17
notes: Documentation closure complete. Full model: current/ + decisions/ + specs/ + runbooks/ + historical at root.
-->

## 1. Latest state (2026-09-17)

- **HEAD:** `d9e8c6a` — Phase 10.5 Manual Order Entry (P2-01). Phase 10.1–10.5 all implemented/closed.
- **Docs model:** closed ("documentation operating system"). Living truth lives in `Docs/current/`, decisions in `Docs/decisions/`, operational knowledge in `Docs/runbooks/`, spec classification in `Docs/specs/`; all phase reports + audits remain at root, unmodified, as immutable history.
- **Latest verified DB baseline:** stores 3 · orders 24 · customers 15 · landing_pages 8 · delivery_zones 58 · audit_logs 74 · sandbox 0.

## 2. Read-first routing

| Goal | Read |
|---|---|
| I'm a new session — how does the system look **right now**? | `Docs/current/STATE-SYSTEM.md` → `STATE-ARCHITECTURE.md` |
| Domain entities / fields | `Docs/current/STATE-PRODUCT-MODEL.md` |
| Order states / subscription states / readiness | `Docs/current/STATE-LIFECYCLE.md` |
| Rules enforced in code (money, validation, auth) | `Docs/current/STATE-BUSINESS-RULES.md` |
| What's open / deferred / future | `Docs/current/BACKLOG.md` |
| Why a behavior is what it is | `Docs/decisions/ADR-*.md` (register below) |
| Spec → implementation mapping | `Docs/specs/REGISTRY.md` + §4 of this file |
| How to run DB / tests / smokes | `Docs/runbooks/RUNBOOK-DB.md`, `RUNBOOK-VERIFY.md` |
| How docs themselves are operated | `Docs/GOVERNANCE.md` |
| History of phase X / why something changed | the matching `Docs/PHASE-*.md` (evidence, never truth) |
| Pre-restoration snapshots (empty DB) | the two audits — **historical, superseded** |

## 3. Source-of-truth hierarchy (see GOVERNANCE §4 for the full ruleset)

1. **Code + live DB win** — schema (`lib/db`), `openapi.yaml`, route handlers, business logic. Docs are derived.
2. **STATE docs** (`Docs/current/`) mirror code+DB under `verified-as-of`.
3. **DECISIONS** (`Docs/decisions/`) bind interpretations (non-negotiable until superseded by a new ADR).
4. **SPEC** (`PHASE-9`) binds not-yet-implemented intent; it is `implemented` (closed record).
5. **PHASE-REPORTS / AUDITS** are evidence and traceability — never edited.

## 4. Spec → implementation mapping (authoritative)

| Spec | Phase 9 § | Report | Status |
|---|---|---|---|
| P1-02 Publication readiness | §4 | `PHASE-10.1-PUBLICATION-READINESS-REPORT.md` | implemented/closed |
| P1-04 Subscription expiry | §5 | `PHASE-10.2-SUBSCRIPTION-LIFECYCLE-REPORT.md` | implemented/closed |
| P1-03 Return after delivery | §6 | `PHASE-10.3-RETURN-AFTER-DELIVERY-REPORT.md` | implemented/closed |
| P1-01 Customer tracking | §3 | `PHASE-10.4-CUSTOMER-ORDER-TRACKING-REPORT.md` | implemented/closed |
| P2-01 Manual order entry | §7 | `PHASE-10.5-MANUAL-ORDER-REPORT.md` | implemented/closed |

> The 10.2/10.3/10.4/10.5 reports each cite a wrong `القسم` number (see `specs/REGISTRY.md` §2); treat the table above as authoritative.

## 5. Decision records (ADR register)

| ADR | Decision |
|---|---|
| `decisions/ADR-001-RENEWAL-ANCHOR-D06.md` | Renewal anchor = current expiry (D-06) |
| `decisions/ADR-002-PROVIDER-OWNS-SUSPENSION.md` | `is_active` is provider-owned |
| `decisions/ADR-003-ORDER-STATE-MACHINE-AND-RETURN.md` | Transition matrix + mandatory return reason |
| `decisions/ADR-004-TRACKING-IDENTITY-ORDERID-PHONE.md` | Tracking = orderId+phone, no auth |
| `decisions/ADR-005-NO-ORDER-SOURCE-COLUMN.md` | No `order_source`; provenance via audit |
| `decisions/ADR-006-COD-MONEY-MODEL.md` | COD money/fees/returns model |
| `decisions/ADR-007-DEFERRED-DECISIONS-INDEX.md` | D-01…D-11 registry (Phase 9 §15 canonical) |

## 6. Directory map

```text
Docs/
├── INDEX.md                 you are here
├── GOVERNANCE.md            operating rules for the docs themselves
├── current/                 LIVING truth (edit with code)
│   ├── STATE-SYSTEM.md          infra / env / baseline / security
│   ├── STATE-ARCHITECTURE.md    packages / routes / flows / contracts
│   ├── STATE-PRODUCT-MODEL.md   entities, fields, relations
│   ├── STATE-LIFECYCLE.md       order + subscription + readiness machines
│   ├── STATE-BUSINESS-RULES.md  enforable domain rules
│   └── BACKLOG.md               open work + deferred items
├── decisions/ADR-*.md       immutable decision records
├── specs/REGISTRY.md        spec classification
├── runbooks/RUNBOOK-DB.md, RUNBOOK-VERIFY.md
├── ARCHITECTURAL-AUDIT.md        historical (replaced by current/STATE-ARCHITECTURE.md)
├── CURRENT-SYSTEM-STATE-AUDIT.md historical (replaced by current/STATE-SYSTEM.md)
└── PHASE-*.md               historical phase reports + Phase 9 (implemented spec)
```

## 7. Inventory (all 36 files — must always match the filesystem)

### Living / authoritative
| File | Type | Read when |
|---|---|---|
| `INDEX.md` | index | always first |
| `GOVERNANCE.md` | governance | operating rules |
| `current/STATE-SYSTEM.md` | state | system facts (env, data, security) |
| `current/STATE-ARCHITECTURE.md` | state | repo/API/flows architecture |
| `current/STATE-PRODUCT-MODEL.md` | state | entity model |
| `current/STATE-LIFECYCLE.md` | state | state machines & readiness |
| `current/STATE-BUSINESS-RULES.md` | state | enforced domain rules |
| `current/BACKLOG.md` | state | open/deferred work |
| `decisions/ADR-001…007` (7) | decision | why behaviors exist |
| `specs/REGISTRY.md` | reference | spec classification |
| `runbooks/RUNBOOK-DB.md` | reference | DB operations |
| `runbooks/RUNBOOK-VERIFY.md` | reference | build/test/smoke |

### Historical (immutable; evidence only)
| File | Type | Status |
|---|---|---|
| `ARCHITECTURAL-AUDIT.md` | audit | historical (superseded by `current/STATE-ARCHITECTURE.md`) |
| `CURRENT-SYSTEM-STATE-AUDIT.md` | audit | historical (superseded by `current/STATE-SYSTEM.md`) |
| `PHASE-3/4/5/6/7.1/7.2/7.3/7.4/7.5/8-…` (10) | phase-report/audit | historical |
| `PHASE-9-PRODUCT-GAP-SPECIFICATION.md` | spec | **implemented** (immutable) |
| `PHASE-10.1…10.5-…` (5) | phase-report | implemented/closed |

**Total:** 18 living/authoritative + 18 historical = 36. Adding a file? Update §6 §7 and §2 routing in the same change.

## 8. Maintenance rule

On every phase close: update §1 Latest, §7 statuses/§4 mappings, related STATE docs, BACKLOG, and mark superseded docs. Do not edit an implemented spec or any phase-report/audit.