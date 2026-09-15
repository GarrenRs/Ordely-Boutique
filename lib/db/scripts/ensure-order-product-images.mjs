import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  await pool.query(`
    alter table order_os.orders
    add column if not exists product_image_url text;
  `);

  await pool.query(`
    update order_os.orders as o
    set product_image_url = coalesce(
      nullif(lp.product_images ->> 0, ''),
      nullif(lp.image_url, '')
    )
    from order_os.landing_pages as lp
    where o.landing_page_id = lp.id
      and o.product_image_url is null;
  `);

  console.log("Order product image snapshots are ready.");
} finally {
  await pool.end();
}
