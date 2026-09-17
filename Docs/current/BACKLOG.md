# BACKLOG — Open Work & Deferred Items

> Forward-looking registry of **open work, deferred decisions and tracked risks**. Nothing here reflects a committed plan; each item cites its provenance. New open items must be added with a source link. When an item closes, change its status and move the note to the closing phase-report — never edit a historical source.

<!-- DOC-META
type: state
status: active
verified-as-of: 2026-09-17
related: Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md, Docs/PHASE-8-PRODUCT-AUDIT.md, Docs/PHASE-10.1-PUBLICATION-READINESS-REPORT.md, Docs/PHASE-10.2-SUBSCRIPTION-LIFECYCLE-REPORT.md, Docs/PHASE-10.3-RETURN-AFTER-DELIVERY-REPORT.md, Docs/PHASE-10.4-CUSTOMER-ORDER-TRACKING-REPORT.md, Docs/PHASE-10.5-MANUAL-ORDER-REPORT.md
-->

## A. Deferred / rejected decisions (canonical source: Phase 9 §15)

| ID | Title | Status | Note |
|---|---|---|---|
| D-01 | Human-readable order number (`ORD-xxxx`) | deferred | internal tracking uses numeric `orders.id`; revisit with marketing/receipt requirements (Phase 9 §15) |
| D-02 | `orders.source` column (online/manual/partner) | deferred | provenance via audit note today; revisit if source analytics/returns-eligibility needed (see B-01) |
| D-03 | `cancelled_at` / `rejected_at` timestamp columns | deferred | tracking shows `updatedAt` until reporting-by-change-date lands |
| D-04 | Two-step return request (Option B) | rejected | no operator exists for the intermediate state; revisit only with courier/self-service returns |
| D-05 | Reports keyed by status-change date | future | requires audit-or-status-date table (Phase 9 §5.4) |
| D-06 | Renewal expiry anchor | **implemented** | adopted in Phase 10.2 (ADR-001) — remove goal, keep as decision |
| D-07 | Merchant-owned storefront off (vs provider suspension) | requires owner decision | tied to `is_active` ownership (ADR-002); see B-07 |
| D-08 | Automated notifications (WhatsApp/SMS on status change) | out of scope | no channel infrastructure; tracking is viewable-not-pushed |
| D-09 | Tracking via WhatsApp/SMS/tracking code | future | requires digitization of courier handoff |
| D-10 | Reject feasible-but-deleted UI (X-06 role scoping) | deferred | ties into D-07 |
| D-11 | Product readiness "image required" | not added | only app-level completeness is enforced (P1-02 §4.2) |

## B. Open technical & product items

| ID | Item | Priority | Status | Sources |
|---|---|---|---|---|
| B-01 | Introduce `order_source` only if source analytics return (currently covered by audit note `طلب يدوي عبر التاجر`) | P3 | open (decision D-02) | 10.5 §16.1 |
| B-02 | Payment/renewal channel: renewal modal has no manual expiry input; provider renewal reads plan days from client value; no schedules/invoices | P2 | open | 10.2 §15, Phase 9 §14 |
| B-03 | Expiry reminders: no auto reminder (banner + provider view are the only channels) | P2 | open | 10.2 §15 |
| B-04 | Define whether EXPIRED merchant entry is further restricted (read-only) — product-owner call | P3 | open | 10.2 §17 |
| B-05 | Return-reason as free text → optional LOV later (keep contracts/DB) | P3 | open | 10.3 §15 |
| B-06 | Return time-window (e.g., within X days) — no constraint today | P2 | open | 10.3 §15, Phase 9 §5 |
| B-07 | Store closure/archival workflow (no delete; FK RESTRICT protects data) + merchant-owned storefront-off (D-07) | P2 | open | Phase 8 X-07/O-08, D-07 |
| B-08 | Provider drill-down: orders/revenue/customers per store | P3 | future | Phase 8 P-04/O-09 |
| B-09 | Public lead submission rate limit (leads are public + unrate-limited) | P2 | open | Phase 8 P-02 |
| B-10 | Tracking PIN / tracking code beyond orderId+phone | P3 | open | 10.4 §14 |
| B-11 | Contract sync is manual across api-zod/api-client-react/openapi; residual drift risk (see STATE-ARCHITECTURE §7) | P3 | open (process) | 10.1 §11, 10.2 §9, Phase 8 X-04 |
| B-12 | Duplicate `formatOrder` implementations (orders.ts + confirmations.ts) | P3 | open | CURRENT-SYSTEM-STATE-AUDIT OB-06 |
| B-13 | `zod` vs `zod/v4` import divergence | P3 | open | ARCHITECTURAL-AUDIT |
| B-14 | Two runtime entrypoints sharing one cookie session (static rewrites) | P3 | watch | ARCHITECTURAL-AUDIT |
| B-15 | StatusBadge raw-enum fallback + duplicate status label sources | P3 | open | Phase 8 V-03 |
| B-16 | Customer lifecycle tooling (reorder, broadcast, repeat analytics) | future | flagged | Phase 8 B-04 |
| B-17 | Lead pipeline enrichment (quality score, source, notes, deal-owner) | P3 | future | Phase 8 B-05 |
| B-18 | No cart / no repeat-order shortcut | future | by design (landing-page model) | Phase 8 C-06, B-06 |
| B-19 | Seed password-cost anomaly root cause still not fully isolated (cost 10 vs 12 across seeds) | P3 | watch | PHASE-6-HARDENING-BASELINE |
| B-20 | Manual-order input has no `customerCity`; customer `city` is always derived from the order's delivery-zone wilaya and refreshed on existing customers (same as public flow) | P3 | resolved (code-verified at d9e8c6a; 10.5 §16.3 overstated) | `order-creation.ts`, `manual-order.ts`, 10.5 §16.3 |

## C. Docs-process debt

| ID | Item | Status |
|---|---|---|
| C-01 | Docs validation tooling (DOC-META/INDEX/link/freshness lint) — doesn't exist yet; quality gates are manual | open |
| C-02 | README "V1 limits" section is stale relative to delivered Phase 10 features (notes kept, see README fix) | open (tracked here) |

## Rules for this file

- One source per item minimum; prefer phase-report/historical file + section for provenance.
- Keep item text neutral (describe, don't prescribe); planning detail belongs in a future SPEC.
- When a phase closes, move closed items into the phase report and remove from here.