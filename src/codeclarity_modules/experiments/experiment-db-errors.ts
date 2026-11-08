import { QueryFailedError } from "typeorm";

/** Postgres reports a broken unique constraint as SQLSTATE 23505. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { code?: string }).code === "23505"
  );
}
