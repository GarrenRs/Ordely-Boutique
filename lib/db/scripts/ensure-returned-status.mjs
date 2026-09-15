import pg from "pg";

const { Pool } = pg;

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  await pool.query("alter type order_os.order_status add value if not exists 'RETURNED'");
  await pool.query("alter table order_os.orders add column if not exists returned_at timestamp with time zone");
  console.log("Returned order status is ready.");
} finally {
  await pool.end();
}
