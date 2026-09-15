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
    create table if not exists order_os.sessions (
      sid varchar not null,
      sess json not null,
      expire timestamp(6) not null
    );
  `);

  await pool.query(`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'sessions_pkey'
          and conrelid = 'order_os.sessions'::regclass
      ) then
        alter table order_os.sessions
          add constraint sessions_pkey primary key (sid);
      end if;
    end
    $$;
  `);

  await pool.query(`
    create index if not exists sessions_expire_idx
      on order_os.sessions (expire);
  `);

  await pool.query("commit");
  console.log("Session table is ready.");
} catch (error) {
  await pool.query("rollback").catch(() => {});
  throw error;
} finally {
  await pool.end();
}
