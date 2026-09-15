import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  await pool.query(`
    create table if not exists order_os.delivery_commune_settings (
      id serial primary key,
      store_id integer not null references order_os.stores(id),
      wilaya_code text not null,
      commune_name text not null,
      daira_name text not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create index if not exists delivery_communes_store_wilaya_idx
    on order_os.delivery_commune_settings (store_id, wilaya_code);
  `);

  await pool.query(`
    create unique index if not exists delivery_communes_store_wilaya_name_unique
    on order_os.delivery_commune_settings (store_id, wilaya_code, commune_name);
  `);

  console.log("Delivery commune settings schema is ready.");
} finally {
  await pool.end();
}
