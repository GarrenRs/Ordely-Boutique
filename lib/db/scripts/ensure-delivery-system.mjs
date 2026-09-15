import pg from "pg";

const { Pool } = pg;
const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  await pool.query("begin");

  await pool.query(`
    do $$
    begin
      if not exists (
        select 1
        from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        where t.typname = 'delivery_method'
          and n.nspname = 'order_os'
      ) then
        create type order_os.delivery_method as enum ('HOME', 'OFFICE');
      end if;
    end
    $$;
  `);

  await pool.query(`
    create table if not exists order_os.delivery_zones (
      id serial primary key,
      store_id integer not null references order_os.stores(id),
      wilaya_code text not null,
      wilaya_name text not null,
      home_fee numeric(10, 2),
      office_fee numeric(10, 2),
      return_fee numeric(10, 2) not null default 0,
      is_active boolean not null default false,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now()
    );
  `);

  await pool.query(`
    create unique index if not exists delivery_zones_store_wilaya_unique
      on order_os.delivery_zones (store_id, wilaya_code);
  `);
  await pool.query(`
    create index if not exists delivery_zones_store_id_idx
      on order_os.delivery_zones (store_id);
  `);

  await pool.query(`
    alter table order_os.orders
      add column if not exists delivery_zone_id integer references order_os.delivery_zones(id),
      add column if not exists delivery_wilaya_code text,
      add column if not exists delivery_wilaya_name text,
      add column if not exists delivery_commune_name text,
      add column if not exists delivery_daira_name text,
      add column if not exists delivery_method order_os.delivery_method,
      add column if not exists delivery_fee numeric(10, 2) not null default 0,
      add column if not exists return_fee numeric(10, 2) not null default 0;
  `);

  await pool.query(`
    create index if not exists orders_delivery_zone_id_idx
      on order_os.orders (delivery_zone_id);
  `);

  await pool.query(`
    delete from order_os.delivery_zones dz
    where dz.is_active = false
      and dz.home_fee is null
      and dz.office_fee is null
      and dz.return_fee = 0
      and not exists (
        select 1
        from order_os.orders o
        where o.delivery_zone_id = dz.id
      );
  `);

  await pool.query("commit");
  console.log("Delivery system schema is ready. Empty seeded zones were cleaned safely.");
} catch (error) {
  await pool.query("rollback").catch(() => {});
  throw error;
} finally {
  await pool.end();
}
