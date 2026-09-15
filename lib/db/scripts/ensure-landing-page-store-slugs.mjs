import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  await pool.query("drop index if exists order_os.landing_pages_slug_unique");
  await pool.query(`
    create unique index if not exists landing_pages_store_slug_unique
    on order_os.landing_pages (store_id, slug);
  `);

  console.log("Landing page slugs are scoped per store.");
} finally {
  await pool.end();
}
