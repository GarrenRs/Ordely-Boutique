import pg from "pg";

const { Pool } = pg;

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

function slugBase(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueSlug(base, used) {
  const safeBase = base || "store";
  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? safeBase : `${safeBase}-${index + 1}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = `${safeBase}-${Date.now()}`;
  used.add(fallback);
  return fallback;
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  await pool.query("begin");
  await pool.query("alter table order_os.stores add column if not exists slug text");

  const stores = await pool.query(`
    select id, name, slug
    from order_os.stores
    order by id
  `);

  const used = new Set(
    stores.rows
      .map((store) => String(store.slug ?? "").trim())
      .filter(Boolean),
  );

  for (const store of stores.rows) {
    const current = String(store.slug ?? "").trim();
    if (current) continue;
    const slug = uniqueSlug(slugBase(store.name) || `store-${store.id}`, used);
    await pool.query(
      "update order_os.stores set slug = $1, updated_at = now() where id = $2",
      [slug, store.id],
    );
    console.log(`store_id=${store.id} slug=${slug}`);
  }

  await pool.query("alter table order_os.stores alter column slug set not null");
  await pool.query("create unique index if not exists stores_slug_unique on order_os.stores (slug)");
  await pool.query("commit");

  console.log("Store slugs are ready.");
} catch (error) {
  await pool.query("rollback").catch(() => {});
  throw error;
} finally {
  await pool.end();
}
