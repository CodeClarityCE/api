import { testHelper, type TestUser } from "./integration-test-helper";

/** Rows left in the tables that reference an analysis or a project. */
export interface LeftoverRows {
  analyses: number;
  results: number;
  policyLinks: number;
  orgLinks: number;
  projects: number;
}

async function post(user: TestUser, url: string, body: object): Promise<any> {
  const response = await testHelper.makeAuthenticatedRequest(
    "POST",
    `/org/${user.organization.id}${url}`,
    user.accessToken,
    body,
  );
  if (response.statusCode !== 201) {
    throw new Error(`POST ${url} failed: ${response.body}`);
  }
  return response.json();
}

/** Creates a project through the API. */
export async function createProject(
  user: TestUser,
  name: string,
): Promise<string> {
  const body = await post(user, "/projects", { name, description: name });
  return body.id;
}

/**
 * Creates an analysis linked to a license and a vulnerability policy, with
 * one stored result, the way the dev stack audit left it.
 */
export async function createAnalysisWithPolicies(
  user: TestUser,
  projectId: string,
): Promise<string> {
  const analyzer = await post(user, "/analyzers", {
    name: `Analyzer ${projectId.slice(0, 8)}`,
    description: "Analyzer for deletion tests",
    steps: [
      [
        {
          name: "js-sbom",
          version: "1.0.0",
          config: {},
          persistant_config: {},
        },
      ],
    ],
  });
  const licensePolicy = await post(user, "/policies/license_policy", {
    name: "License policy",
    description: "Attached license policy",
    type: "BLACKLIST",
    licenses: ["GPL-3.0"],
    default: false,
  });
  const vulnerabilityPolicy = await post(
    user,
    "/policies/vulnerability_policy",
    {
      name: "Vulnerability policy",
      description: "Attached vulnerability policy",
      type: "BLACKLIST",
      vulnerabilities: ["CVE-2021-44228"],
      default: false,
    },
  );
  const analysis = await post(user, `/projects/${projectId}/analyses`, {
    analyzer_id: analyzer.id,
    tag: "v1.0.0",
    branch: "main",
    config: {
      "vuln-finder": {
        vulnerabilityPolicy: [licensePolicy.id, vulnerabilityPolicy.id],
      },
    },
  });

  await testHelper
    .getDataSource()
    .query(
      `INSERT INTO result (result, plugin, "analysisId") VALUES ('{}', 'js-sbom', $1)`,
      [analysis.id],
    );
  return analysis.id;
}

/** Counts what is still stored for the given analyses and project. */
export async function leftoverRows(
  analysisIds: string[],
  projectId: string,
): Promise<LeftoverRows> {
  const count = async (sql: string, param: unknown): Promise<number> => {
    const rows = await testHelper.getDataSource().query(sql, [param]);
    return Number(rows[0].n);
  };
  return {
    analyses: await count(
      `SELECT count(*) n FROM analysis WHERE id = ANY($1)`,
      analysisIds,
    ),
    results: await count(
      `SELECT count(*) n FROM result WHERE "analysisId" = ANY($1)`,
      analysisIds,
    ),
    policyLinks: await count(
      `SELECT count(*) n FROM policy_analyses_analysis WHERE "analysisId" = ANY($1)`,
      analysisIds,
    ),
    orgLinks: await count(
      `SELECT count(*) n FROM organization_projects_project WHERE "projectId" = $1`,
      projectId,
    ),
    projects: await count(
      `SELECT count(*) n FROM project WHERE id = $1`,
      projectId,
    ),
  };
}

/** Makes every project delete fail until the returned function is called. */
export async function failProjectDeletes(): Promise<() => Promise<void>> {
  return failDeletesOn("project");
}

/** Makes every analysis delete fail until the returned function is called. */
export async function failAnalysisDeletes(): Promise<() => Promise<void>> {
  return failDeletesOn("analysis");
}

/** Makes every organization delete fail until the returned function is called. */
export async function failOrganizationDeletes(): Promise<() => Promise<void>> {
  return failDeletesOn("organization");
}

async function failDeletesOn(table: string): Promise<() => Promise<void>> {
  const db = testHelper.getDataSource();
  const name = `fail_${table}_delete`;
  await db.query(`
    CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION '${table} delete blocked by test'; END;
    $$ LANGUAGE plpgsql`);
  await db.query(`
    CREATE TRIGGER ${name} BEFORE DELETE ON ${table}
    FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  return async () => {
    await db.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
    await db.query(`DROP FUNCTION IF EXISTS ${name}()`);
  };
}

/**
 * Recreates the join table keys without ON DELETE CASCADE, as the restored
 * production and dev schemas have them (synchronize adds the cascade).
 */
export async function useDeployedJoinTableKeys(): Promise<void> {
  const db = testHelper.getDataSource();
  const keys = [
    ["policy_analyses_analysis", "analysisId", "analysis"],
    ["organization_projects_project", "projectId", "project"],
  ];
  for (const [table, column, target] of keys) {
    const rows: { conname: string }[] = await db.query(
      `SELECT conname FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND a.attname = $2`,
      [table, column],
    );
    for (const { conname } of rows) {
      await db.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${conname}"`);
      await db.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${conname}" FOREIGN KEY ("${column}") REFERENCES "${target}"(id)`,
      );
    }
  }
}

/** Marks analyses as running, as the dispatcher does once it picks them up. */
export async function markAnalysesRunning(ids: string[]): Promise<void> {
  await testHelper
    .getDataSource()
    .query(`UPDATE analysis SET status = 'started' WHERE id = ANY($1)`, [ids]);
}

/** Reads the current status of each analysis that still exists. */
export async function analysisStatuses(
  ids: string[],
): Promise<Record<string, string>> {
  const rows: { id: string; status: string }[] = await testHelper
    .getDataSource()
    .query(`SELECT id, status FROM analysis WHERE id = ANY($1)`, [ids]);
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

/**
 * Records the status each analysis had at the moment it was deleted, so a test
 * can see whether it was cancelled first. Call the returned function to stop.
 */
export async function recordDeletedAnalysisStatuses(): Promise<{
  statuses: () => Promise<Record<string, string>>;
  stop: () => Promise<void>;
}> {
  const db = testHelper.getDataSource();
  await db.query(
    `CREATE TABLE IF NOT EXISTS deleted_analysis_status (id uuid, status text)`,
  );
  await db.query(`TRUNCATE deleted_analysis_status`);
  await db.query(`
    CREATE OR REPLACE FUNCTION record_deleted_analysis_status() RETURNS trigger AS $$
    BEGIN
      INSERT INTO deleted_analysis_status VALUES (OLD.id, OLD.status);
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql`);
  await db.query(`
    CREATE TRIGGER record_deleted_analysis_status BEFORE DELETE ON analysis
    FOR EACH ROW EXECUTE FUNCTION record_deleted_analysis_status()`);
  return {
    statuses: async () => {
      const rows: { id: string; status: string }[] = await db.query(
        `SELECT id, status FROM deleted_analysis_status`,
      );
      return Object.fromEntries(rows.map((r) => [r.id, r.status]));
    },
    stop: async () => {
      await db.query(
        `DROP TRIGGER IF EXISTS record_deleted_analysis_status ON analysis`,
      );
      await db.query(
        `DROP FUNCTION IF EXISTS record_deleted_analysis_status()`,
      );
      await db.query(`DROP TABLE IF EXISTS deleted_analysis_status`);
    },
  };
}
