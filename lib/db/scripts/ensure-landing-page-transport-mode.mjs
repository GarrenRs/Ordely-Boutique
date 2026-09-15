import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  await pool.query(`
    alter table order_os.landing_pages
    add column if not exists transport_mode text not null default 'DELIVERY_COMPANY';
  `);

  await pool.query(`
    update order_os.landing_pages
    set transport_mode = 'DELIVERY_COMPANY'
    where transport_mode is null or transport_mode not in ('DELIVERY_COMPANY', 'SHED_MED');
  `);

  console.log("Landing page transport mode is ready.");
} finally {
  await pool.end();
}
