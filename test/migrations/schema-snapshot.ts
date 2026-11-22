import { Client } from "pg";

export const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};

export async function query<T = Record<string, unknown>>(
  database: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ ...connection, database });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

// Public objects of a database, leaving out TypeORM's own migrations table.
const PUBLIC_RELATION = `n.nspname = 'public' AND c.relname NOT IN ('migrations', 'migrations_id_seq')`;

// The schema of a database and the rows it holds, as plain JSON to compare.
// Column values filled by a random default (uuid_generate_v4(), now()) show as "<default>".
export async function schemaSnapshot(
  database: string,
): Promise<Record<string, unknown[]>> {
  const columns = await query<{
    table: string;
    column: string;
    default: string | null;
  }>(
    database,
    `SELECT c.relname AS table, a.attname AS column,
            row_number() OVER (PARTITION BY c.relname ORDER BY a.attnum)::int AS position,
            format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS not_null, a.attidentity AS identity, a.attgenerated AS generated,
            co.collname AS collation,
            pg_get_expr(d.adbin, d.adrelid) AS default
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_type t ON t.oid = a.atttypid
     LEFT JOIN pg_collation co ON co.oid = a.attcollation AND a.attcollation <> t.typcollation
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attnum > 0 AND NOT a.attisdropped
       AND ${PUBLIC_RELATION}
     ORDER BY c.relname, a.attnum`,
  );
  return {
    extensions: await query(
      database,
      `SELECT extname FROM pg_extension ORDER BY extname`,
    ),
    types: await query(
      database,
      `SELECT t.typname AS name, t.typtype AS kind,
              array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
       LEFT JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typtype IN ('e', 'd', 'c', 'r', 'm')
         AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid)
       GROUP BY t.typname, t.typtype
       ORDER BY t.typname`,
    ),
    relations: await query(
      database,
      `SELECT c.relname AS name, c.relkind AS kind, c.relpersistence AS persistence,
              c.reloptions AS options
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE ${PUBLIC_RELATION}
       ORDER BY c.relname`,
    ),
    columns,
    constraints: await query(
      database,
      `SELECT c.relname AS table, k.conname AS name, k.contype AS kind,
              pg_get_constraintdef(k.oid) AS definition
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE ${PUBLIC_RELATION}
       ORDER BY c.relname, k.conname`,
    ),
    indexes: await query(
      database,
      `SELECT tablename AS table, indexname AS name, indexdef AS definition
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename <> 'migrations'
       ORDER BY tablename, indexname`,
    ),
    functions: await query(
      database,
      `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
       )
       ORDER BY 1, 2`,
    ),
    triggers: await query(
      database,
      `SELECT tgrelid::regclass::text AS table, tgname AS name
       FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`,
    ),
    rows: await rows(database, columns),
  };
}

// Every row of every table, with randomly defaulted values masked.
async function rows(
  database: string,
  columns: { table: string; column: string; default: string | null }[],
): Promise<unknown[]> {
  const random = /uuid_generate|gen_random_uuid|now\(\)|CURRENT_TIMESTAMP/i;
  const tables = [...new Set(columns.map((c) => c.table))];
  const found: { table: string; row: string }[] = [];
  for (const table of tables) {
    const masked = columns
      .filter((c) => c.table === table && random.test(c.default ?? ""))
      .map((c) => c.column);
    const data = await query<{ row: Record<string, unknown> }>(
      database,
      `SELECT to_jsonb(t) AS row FROM "${table}" t`,
    );
    for (const { row } of data) {
      for (const column of masked) row[column] = "<default>";
      found.push({ table, row: JSON.stringify(row) });
    }
  }
  return found.sort((a, b) =>
    `${a.table} ${a.row}`.localeCompare(`${b.table} ${b.row}`),
  );
}
