import bcrypt from "bcryptjs";

/**
 * Canonical bcrypt cost for all merchant password hashing.
 * Consistent across db:seed, showcase seed, tenant:create, provider-created
 * merchants, lead conversion, password reset, and merchant password change.
 */
export const PASSWORD_HASH_COST = 12;

export async function hashMerchantPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_COST);
}
