import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${name} must be set`);
  }
  return normalized;
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

async function uniqueStoreSlug(pool, preferred, fallback) {
  const base = slugBase(preferred) || slugBase(fallback) || "store";
  for (let index = 0; index < 100; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await pool.query(
      `
        select id
        from order_os.stores
        where slug = $1
        limit 1
      `,
      [slug],
    );
    if (!existing.rows[0]) return slug;
  }
  return `${base}-${Date.now()}`;
}

export async function createTenant({
  databaseUrl = process.env.DATABASE_URL,
  email,
  password,
  storeSlug,
  storeName,
  ownerName = "Store Owner",
  phone = "0500000000",
  city = "Alger",
  demoSlug,
  demoProductName = "Demo Product",
  demoPrice = "149.00",
  demoDescription = "Demo order page for the merchant dashboard.",
  demoDeliveryInfo = "Delivery inside Algeria.",
} = {}) {
  const safeDatabaseUrl = required(databaseUrl, "DATABASE_URL");
  const safeEmail = normalizeEmail(required(email, "tenant email"));
  const safePassword = required(password, "tenant password");
  const safeStoreName = required(storeName, "tenant store name");
  const safeOwnerName = required(ownerName, "tenant owner name");
  const safePhone = required(phone, "tenant phone");
  const safeCity = required(city, "tenant city");

  const pool = new Pool({ connectionString: safeDatabaseUrl });

  try {
    await pool.query("begin");

    const passwordHash = await bcrypt.hash(safePassword, 12);

    const existingUser = await pool.query(
      `
        select id, store_id
        from order_os.users
        where email = $1
        limit 1
      `,
      [safeEmail],
    );

    let storeId = existingUser.rows[0]?.store_id;
    let safeStoreSlug = "";

    if (storeId) {
      const currentStore = await pool.query(
        `
          select slug
          from order_os.stores
          where id = $1
          limit 1
        `,
        [storeId],
      );
      safeStoreSlug = currentStore.rows[0]?.slug
        || await uniqueStoreSlug(pool, storeSlug ?? safeStoreName, safeEmail);

      await pool.query(
        `
          update order_os.stores
          set name = $1,
              slug = $2,
              owner_name = $3,
              phone = $4,
              city = $5,
              is_active = true,
              updated_at = now()
          where id = $6
        `,
        [safeStoreName, safeStoreSlug, safeOwnerName, safePhone, safeCity, storeId],
      );

      await pool.query(
        `
          update order_os.users
          set password_hash = $1
          where id = $2
        `,
        [passwordHash, existingUser.rows[0].id],
      );
    } else {
      safeStoreSlug = await uniqueStoreSlug(pool, storeSlug ?? safeStoreName, safeEmail);
      const storeResult = await pool.query(
        `
          insert into order_os.stores (name, slug, owner_name, phone, city, is_active)
          values ($1, $2, $3, $4, $5, true)
          returning id
        `,
        [safeStoreName, safeStoreSlug, safeOwnerName, safePhone, safeCity],
      );

      storeId = storeResult.rows[0]?.id;
      if (!storeId) {
        throw new Error("Could not create tenant store");
      }

      await pool.query(
        `
          insert into order_os.users (store_id, email, password_hash)
          values ($1, $2, $3)
        `,
        [storeId, safeEmail, passwordHash],
      );
    }

    const safeDemoSlug = String(demoSlug ?? "").trim();
    const defaultCategoryResult = await pool.query(
      `
        insert into order_os.product_categories (store_id, name, slug, is_default, is_active, sort_order)
        values ($1, 'عام', 'general', true, true, 0)
        on conflict (store_id, slug) do update
        set name = excluded.name,
            is_default = true,
            is_active = true,
            updated_at = now()
        returning id
      `,
      [storeId],
    );
    const defaultCategoryId = defaultCategoryResult.rows[0]?.id;
    if (!defaultCategoryId) {
      throw new Error("Could not create default category");
    }

    if (safeDemoSlug) {
      const existingPage = await pool.query(
        `
          select id, store_id
          from order_os.landing_pages
          where slug = $1
          limit 1
        `,
        [safeDemoSlug],
      );

      if (existingPage.rows[0] && existingPage.rows[0].store_id !== storeId) {
        throw new Error(`Landing page slug "${safeDemoSlug}" is already used by another tenant`);
      }

      if (existingPage.rows[0]) {
        await pool.query(
          `
            update order_os.landing_pages
            set product_name = $1,
                price = $2,
                description = $3,
                category_id = $4,
                delivery_info = $5,
                is_active = true,
                updated_at = now()
            where id = $6 and store_id = $7
          `,
          [
            demoProductName,
            demoPrice,
            demoDescription,
            defaultCategoryId,
            demoDeliveryInfo,
            existingPage.rows[0].id,
            storeId,
          ],
        );
      } else {
        await pool.query(
          `
            insert into order_os.landing_pages (
              store_id,
              category_id,
              product_name,
              price,
              description,
              template,
              slug,
              delivery_info,
              is_active
            )
            values ($1, $2, $3, $4, $5, 'classic', $6, $7, true)
          `,
          [
            storeId,
            defaultCategoryId,
            demoProductName,
            demoPrice,
            demoDescription,
            safeDemoSlug,
            demoDeliveryInfo,
          ],
        );
      }
    }

    await pool.query("commit");

    return { storeId, storeSlug: safeStoreSlug, email: safeEmail, storeName: safeStoreName };
  } catch (error) {
    await pool.query("rollback");
    throw error;
  } finally {
    await pool.end();
  }
}
