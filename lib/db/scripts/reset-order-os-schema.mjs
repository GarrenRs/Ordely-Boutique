import pg from "pg";

const { Pool } = pg;

const { DATABASE_URL, RESET_ORDER_OS_SCHEMA } = process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

if (RESET_ORDER_OS_SCHEMA !== "YES_RESET_ORDER_OS") {
  throw new Error(
    'Refusing to reset database. Set RESET_ORDER_OS_SCHEMA="YES_RESET_ORDER_OS" explicitly.',
  );
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const info = await pool.query("select current_database() as database, current_user as user");
  const { database, user } = info.rows[0] ?? {};

  console.log(`Reset target database=${database} user=${user}`);
  console.log("Dropping schema order_os cascade...");

  await pool.query("begin");
  await pool.query("drop schema if exists order_os cascade");
  await pool.query("create schema order_os");
  await pool.query("commit");

  console.log("Schema order_os was reset. Run db:push-force and db:seed next.");
} catch (error) {
  await pool.query("rollback").catch(() => {});
  throw error;
} finally {
  await pool.end();
}
