# Docs Governance (GOVERNANCE)

> Operating model for the `Docs/` folder. Applies to every file here and to every session working in this repository. The docs are a **closed knowledge system**: one entry point, one truth per topic, immutable history.

<!-- DOC-META
type: governance
status: active
verified-as-of: 2026-09-17
notes: Final model (documentation closure): current/ + decisions/ + specs/ + runbooks/ are live; historical reports/audits stay at root, immutable.
-->

## 1. Why this exists

Docs must answer — from a single entry point (`INDEX.md`), with minimal context — what the system _is_ now, why it behaves so, what is open, and how to operate it — **without duplicating a fact in two places**.

## 2. Directory roles (the closed model)

| Path | Role | Editable? |
|---|---|---|
| `INDEX.md` | entry point + routing + inventory | yes |
| `GOVERNANCE.md` | these rules | yes |
| `current/` | **living truth** — mirrors code+DB (`STATE-*.md`, `BACKLOG.md`) | yes, only with the code change that alters the fact |
| `decisions/` | **ADR records** — bind interpretations | no (amend via new ADR only) |
| `specs/REGISTRY.md` | spec classification + doc-type table | yes (factual) |
| `runbooks/` | operational procedures | yes (factual) |
| `PHASE-*.md`, audits | **immutable history** | **never** |
| `PHASE-9-…` | implemented spec | **never** |

## 3. Taxonomy & lifecycle

| Type | Meaning | Lifecycle |
|---|---|---|
| `index` / `governance` | operating entry point & rules | active, editable |
| `state` | living mirror of code+DB truth | active; `verified-as-of`; supersedes audits |
| `decision` | immutable ADR | closed at birth; superseded by new ADR |
| `reference` | runbook / registry | active, factual edits |
| `spec` | product/technical spec | created open → approved → implemented (then closed) |
| `phase-report` | record of what a phase did | closed at birth, never edited |
| `audit` | point-in-time snapshot | closed at birth, never edited |

```
DRAFT → ACTIVE/CANONICAL → SUPERSEDED (marked, linked, never rewritten) → ARCHIVED (never deleted)
```

- A phase closes only when: phase-report written + affected `current/` docs updated + INDEX/BACKLOG updated + superseded markers updated + docs committed with the code.
- Supersede **by marker** (`superseded-by` / `planned-replacement` now resolves to real files) — never by rewriting history.

## 4. Source-of-truth hierarchy & conflict rules

1. **Code + live DB win.** Schema (`lib/db`), `openapi.yaml`, route handlers, business logic. All docs are derived.
2. **STATE docs** mirror code+DB with `verified-as-of`.
3. **DECISIONS (ADR)** bind interpretations: D-06 (ADR-001), provider owns `is_active` (ADR-002), transition matrix + return (ADR-003), tracking = orderId+phone (ADR-004), no `order_source` (ADR-005), COD money model (ADR-006), deferred registry (ADR-007).
4. **SPEC** (Phase 9) is implemented and closed — binds only as intent already shipped.
5. **PHASE-REPORTS / AUDITS** are evidence. Never quote the two audits as current facts (15-09 snapshots, superseded).
6. Conflict rule: code vs docs → code wins; spec vs audit → spec wins for intended behavior; reports vs DB → DB + latest state wins; reports keep their own numbers (immutable).

## 5. Cross-linking & metadata

- Every doc carries a `DOC-META` header block (after the first heading):

```
<!-- DOC-META
type: <index|governance|state|decision|reference|spec|phase-report|audit>
status: <active|implemented|historical|accepted|closed|superseded|archived>
verified-as-of: <YYYY-MM-DD>
supersedes: <relative path>
superseded-by: <relative path|pending>
planned-replacement: <relative path>
related: <relative paths, comma-separated>
implemented-by: <relative paths, comma-separated>
notes: <free text>
-->
```

- References must use **anchored filenames** (`Docs/….md#anchor`), never bare section numbers, in new docs. Historical reports keep their (sometimes wrong) section-number references untouched — the correct mapping lives in `specs/REGISTRY.md §2`.
- New docs must link their authoritative source (STATE → code; ADR → code + phase; current/STATE → the superseded audit it replaces).
- `INDEX.md` must list every file; the inventory and the filesystem must never drift apart.

## 6. Naming conventions (binds new files only)

- `INDEX.md`, `GOVERNANCE.md` (fixed names).
- `STATE-<AREA>.md`, `BACKLOG.md` in `current/`.
- `ADR-<NNN>-<KICKER>.md` in `decisions/` (sequence continues beyond 007).
- `RUNBOOK-<AREA>.md` in `runbooks/`; `REGISTRY.md` in `specs/`.
- `SPEC-<ID>-<KICKER>.md`, `PHASE-<X.Y>-<KICKER>-REPORT.md`, `AUDIT-<SUBJECT>-<YYYY-MM-DD>.md`, `BASELINE-<SUBJECT>-<YYYY-MM-DD>.md`.
- **Forbidden in new names:** `CURRENT-*`, `FINAL-*`, `v1/v2`.
- Existing files keep their names (no renames; links + history preserved).

## 7. LLM operating rules (opencode)

1. Start at `Docs/INDEX.md`; never glob-read `Docs/**` during normal work.
2. Trust `current/STATE-*` + `decisions/` + active `spec` first; treat `PHASE-*` and audits as evidence.
3. Never quote the two audits as current facts; never reuse a report's DB count without re-verifying against DB + `STATE-SYSTEM`.
4. Answer "is X handled?" via the spec→report mapping (INDEX §4 / REGISTRY §2), not raw Phase 8 findings.
5. Respect recorded decisions before touching a feature (ADR-001…007). To change one → write a new ADR, update STATE/BACKLOG, never edit the old ADR.
6. Put output in the right slot: state → `current/`, decision → `decisions/`, phase work → `PHASE-*-REPORT`, procedure → `runbooks/`. Never invent ad-hoc filenames.
7. Updating a living doc is normal; editing a report/ADR/implemented spec is a defect.
8. To correct a doc, supersede-by-marker or update the living analogue — don't rewrite history.
9. Do not touch `Docs.zip` or any non-doc artifact unless asked.
10. Run `Docs/runbooks/RUNBOOK-VERIFY.md §4` after any docs change.

## 8. Maintenance

- No docs-validation tool exists (walkthrough: `runbooks/RUNBOOK-VERIFY.md §4`; tracked as BACKLOG C-01). Closure checks were manual.
- On every phase close: INDEX §1/§7, affected STATE docs, BACKLOG, superseded markers.
- New feature work that ships must land with: spec-or-phase-report + affected STATE + ADR (if a decision) + INDEX. Otherwise the docs close loop breaks.