# STATE-PRODUCT-MODEL — Current Data & Product Model

> Living mirror of the domain entities and their fields/relations as implemented in `lib/db/src/schema`. Code wins; keep in sync with schema changes. Field lists focus on behaviorally-significant fields; the schema files remain the complete definition.

<!-- DOC-META
type: state
status: active
verified-as-of: 2026-09-17
related: Docs/current/STATE-LIFECYCLE.md, Docs/current/STATE-BUSINESS-RULES.md, Docs/ARCHITECTURAL-AUDIT.md, Docs/PHASE-9-PRODUCT-GAP-SPECIFICATION.md
-->

## 1. Entities overview

Schema namespace: `order_os` (Drizzle) · 11 tables · 3 enum types.

| Entity | Table | Role |
|---|---|---|
| Store | `stores` | merchant tenant row; `is_active`, `subscription_expires_at`, `subscription_plan_days`, `slug`, `owner_name`, `phone`, `city`, `logo_url` |
| Merchant user | `users` | login credential tied to a store |
| Provider user | `provider_users` | platform admin (single provider, email+password hash) |
| Landing page | `landing_pages` | a single product page; `product_name`, `price`, `description`, `slug`, `is_active`, `image_url`, `product_images[]`, `available_sizes[]`, `available_colors[]`, `gallery_display`, `theme_color`, `transport_mode`, `delivery_info`, `whatsapp_number`, `category_id` |
| Product category | `product_categories` | optional grouping; `name`, `slug`, `is_active`, `is_default`, `sort_order` |
| Order | `orders` | order row (details in §3) |
| Customer | `customers` | dedup key = `store_id + phone` |
| Delivery zone | `delivery_zones` | wilaya-level; `home_fee`, `office_fee`, `return_fee`, `is_active` |
| Commune setting | `delivery_commune_settings` | per-commune on/off switch per store |
| Audit log | `audit_logs` | `action`, `from_status`, `to_status`, `note` |
| Merchant lead | `merchant_leads` | intake of prospective merchants |

## 2. Relations (key)

- `orders.store_id → stores.id` (not null) · `orders.landing_page_id → landing_pages.id` (not null) · `orders.customer_id → customers.id` (nullable) · `orders.delivery_zone_id → delivery_zones.id` (nullable).
- `landing_pages.store_id → stores.id` · `landing_pages.category_id → product_categories.id` (nullable).
- `delivery_zones.store_id → stores.id` · `delivery_commune_settings.store_id → stores.id`.
- Order indexes: `store_id`, `store_id+status`, `landing_page_id`, `customer_id`, `delivery_zone_id`.
- Customers deduped by `(store_id, phone)` — reused across orders; on **every** order (public, legacy, manual) the existing customer's `name` and `city` are refreshed. `city` is always derived from the order's delivery-zone wilaya in `createOrderCore` (`sourceWilaya.name`) — no flow accepts a merchant-supplied `customerCity` (manual input / `OrderCreationInput` has no such field; the public schema accepts an optional `customerCity` but the core ignores it).

## 3. Orders (`orders`) — authoritative field list

| Field | Type | Notes |
|---|---|---|
| `id` | serial PK | numeric id is the **internal/public tracking id** (no ORD-xxx, see ADR-007/D-01) |
| `store_id` / `landing_page_id` | int FK | required |
| `product_image_url` | text | snapshot at order creation |
| `customer_id` | int FK | nullable |
| `customer_name` / `customer_phone` | text notNull | phone is the tracking factor |
| `customer_city` | text notNull | = wilaya name |
| `customer_address` | text | optional; **required for HOME when `requireAddressForHome`** (manual orders) |
| `delivery_zone_id` · `delivery_wilaya_code` · `delivery_wilaya_name` · `delivery_commune_name` · `delivery_daira_name` | | snapshot of zone/commune at creation |
| `delivery_method` | enum | `HOME` / `OFFICE`; `transport_mode = SHED_MED` forces `OFFICE` |
| `delivery_fee` | numeric(10,2) notNull default 0 | `office_fee` (+ `home_fee` if HOME) |
| `return_fee` | numeric(10,2) notNull default 0 | zone `return_fee` at creation |
| `selected_size` / `selected_color` | text | optional, validated against page variants |
| `quantity` | int notNull default 1 | contract 1..10 enforced (422) |
| `unit_price` | numeric(10,2) notNull | = page price at creation |
| `total_price` | numeric(10,2) notNull | `unit_price × quantity` |
| `status` | enum notNull default `NEW` | see STATE-LIFECYCLE |
| `notes` | text | free text |
| `return_reason` | text nullable | **added Phase 10.3**; mandatory (non-empty) for `RETURNED` |
| `confirmed_at` · `shipped_at` · `delivered_at` · `returned_at` | timestamptz | per-state timestamp snapshot |
| `created_at` / `updated_at` | timestamptz | `updated_at` auto on update |

**Money representation:** all monetary DB columns are `numeric(10,2)` stored as strings; API outputs are mapped through `Number()`; null fees are preserved as null in public delivery-zone payloads.

## 4. Subscription fields (store)

- `subscription_expires_at` — nullable timestamptz; `null` = no subscription configured (provider reports `noSubscription`; merchant is treated `ACTIVE`/accepting orders).
- `subscription_plan_days` — plan length; **plans are 30 / 180 / 365 days** (not persisted per-day elsewhere).
- `is_active` — merchant visibility switch; renewal auto-sets `true`. **Owned by provider** (ADR-002).

## 5. Product (landing page) publication model

A page is **publicly live** only when all of: store active+subscribed, store has ≥1 usable delivery zone, product data complete (name, `price > 0`, description, slug), and `landing_pages.is_active = true`. Readiness is **derived at request time** — no persisted flag (ADR from P1-02).