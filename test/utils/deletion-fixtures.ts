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
  const db = testHelper.getDataSource();
  await db.query(`
    CREATE OR REPLACE FUNCTION fail_project_delete() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'project delete blocked by test'; END;
    $$ LANGUAGE plpgsql`);
  await db.query(`
    CREATE TRIGGER fail_project_delete BEFORE DELETE ON project
    FOR EACH ROW EXECUTE FUNCTION fail_project_delete()`);
  return async () => {
    await db.query(`DROP TRIGGER IF EXISTS fail_project_delete ON project`);
    await db.query(`DROP FUNCTION IF EXISTS fail_project_delete()`);
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
