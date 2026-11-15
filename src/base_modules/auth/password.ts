import * as bcrypt from "bcrypt";

import { CONST_PASSWORD_SALT_ROUNDS } from "./constants";

// Hashes a password the way every account's password is stored.
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, CONST_PASSWORD_SALT_ROUNDS);
}
