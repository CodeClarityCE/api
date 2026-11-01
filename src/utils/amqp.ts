import * as fs from "fs";

/**
 * Builds amqplib socket options for TLS, mirroring the PostgreSQL SSL handling
 * in datasources/base-options.ts. Driven by AMQP_SSLMODE / AMQP_SSLROOTCERT.
 *
 * - "disable"               -> no TLS options (plain amqp:// connection)
 * - "require"               -> encrypted but skip verification (self-signed dev cert)
 * - "verify-ca"/"verify-full" -> verify the server cert against AMQP_SSLROOTCERT
 */
export function buildAmqpSocketOptions(): Record<string, unknown> {
  const env = process.env["ENV"] ?? "dev";
  const sslMode =
    process.env["AMQP_SSLMODE"] ?? (env === "prod" ? "verify-ca" : "disable");

  if (sslMode === "disable") {
    return {};
  }

  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }

  // verify-ca / verify-full
  const opts: Record<string, unknown> = { rejectUnauthorized: true };
  const caPath = process.env["AMQP_SSLROOTCERT"];
  if (caPath) {
    // Operator-supplied path from env; not user input.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    opts["ca"] = [fs.readFileSync(caPath, "utf-8")];
  }
  return opts;
}
