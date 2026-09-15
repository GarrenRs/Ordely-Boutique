import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const {
  DATABASE_URL,
  PROVIDER_EMAIL,
  PROVIDER_PASSWORD,
  PROVIDER_NAME = "Provider Admin",
} = process.env;

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} must be set`);
  return normalized;
}

const pool = new Pool({ connectionString: required(DATABASE_URL, "DATABASE_URL") });

try {
  const email = required(PROVIDER_EMAIL, "PROVIDER_EMAIL").toLowerCase();
  const password = required(PROVIDER_PASSWORD, "PROVIDER_PASSWORD");
  const name = required(PROVIDER_NAME, "PROVIDER_NAME");
  if (password.length < 8) {
    throw new Error("PROVIDER_PASSWORD must be at least 8 characters");
  }

  await pool.query("begin");
  await pool.query(`
    create table if not exists order_os.provider_users (
      id serial primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      created_at timestamp with time zone not null default now()
    );
  `);

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `
      insert into order_os.provider_users (name, email, password_hash)
      values ($1, $2, $3)
      on conflict (email) do update
      set name = excluded.name,
          password_hash = excluded.password_hash
      returning id, email, name
    `,
    [name, email, passwordHash],
  );
  await pool.query("commit");
  const user = result.rows[0];
  console.log(`Provider user ready: id=${user.id} email=${user.email} name=${user.name}`);
} catch (error) {
  await pool.query("rollback").catch(() => {});
  throw error;
} finally {
  await pool.end();
}
