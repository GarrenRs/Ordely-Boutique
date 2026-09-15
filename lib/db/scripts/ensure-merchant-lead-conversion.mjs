import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows: [table] } = await pool.query(`
    select to_regclass('order_os.merchant_leads') as table_name;
  `);

  if (!table?.table_name) {
    throw new Error("order_os.merchant_leads does not exist. Run drizzle push before this ensure script.");
  }

  await pool.query(`
    alter table order_os.merchant_leads
      add column if not exists email text,
      add column if not exists store_name text,
      add column if not exists store_slug text,
      add column if not exists converted_store_id integer;
  `);

  await pool.query(`
    update order_os.merchant_leads
    set
      email = coalesce(email, concat('lead-', id, '@pending.local')),
      store_name = coalesce(store_name, full_name)
    where email is null or store_name is null;
  `);

  await pool.query(`
    alter table order_os.merchant_leads
      alter column email set not null,
      alter column store_name set not null;
  `);

  await pool.query(`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'merchant_leads_converted_store_id_stores_id_fk'
      ) then
        alter table order_os.merchant_leads
          add constraint merchant_leads_converted_store_id_stores_id_fk
          foreign key (converted_store_id)
          references order_os.stores(id);
      end if;
    end $$;
  `);

  await pool.query(`
    create index if not exists merchant_leads_email_idx
      on order_os.merchant_leads (email);
  `);

  await pool.query(`
    create index if not exists merchant_leads_store_slug_idx
      on order_os.merchant_leads (store_slug);
  `);

  await pool.query(`
    create index if not exists merchant_leads_converted_store_id_idx
      on order_os.merchant_leads (converted_store_id);
  `);

  console.log("Merchant lead conversion columns are ready");
} finally {
  await pool.end();
}
