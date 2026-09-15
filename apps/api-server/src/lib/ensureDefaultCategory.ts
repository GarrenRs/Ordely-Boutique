import { pool } from "@workspace/db";

const DEFAULT_CATEGORY_NAME = "عام";
const DEFAULT_CATEGORY_SLUG = "general";

export async function ensureDefaultCategory(storeId: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('order_os:default_category:' || $1))", [storeId]);

    const existing = await client.query<{ id: number }>(
      "select id from order_os.product_categories where store_id = $1 and is_default = true limit 1",
      [storeId],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0].id;
    }

    const created = await client.query<{ id: number }>(
      `
        insert into order_os.product_categories (store_id, name, slug, is_default, is_active, sort_order)
        values ($1, $2, $3, true, true, 0)
        on conflict (store_id, slug) do update
        set is_default = true,
            is_active = true,
            updated_at = now()
        returning id
      `,
      [storeId, DEFAULT_CATEGORY_NAME, DEFAULT_CATEGORY_SLUG],
    );

    await client.query("COMMIT");
    return created.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}