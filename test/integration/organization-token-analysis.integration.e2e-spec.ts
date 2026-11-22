import { createHash, randomUUID } from "crypto";
import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { auditEntries } from "../utils/audit-log";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const DAY = 86_400_000;

// What the CLI does with an Organization token: create an upload project,
// upload its archive, start an analysis, wait for it and read the findings.
describe("Analysing an upload with an Organization token (e2e)", () => {
  let admin: TestUser;
  let downloads: string;
  let previousDownloadPath: string | undefined;

  beforeAll(async () => {
    await testHelper.setupTestApp();
    downloads = await mkdtemp(join(tmpdir(), "token-analysis-it-"));
    previousDownloadPath = process.env["DOWNLOAD_PATH"];
    process.env["DOWNLOAD_PATH"] = downloads;
  });

  afterAll(async () => {
    process.env["DOWNLOAD_PATH"] = previousDownloadPath;
    await rm(downloads, { recursive: true, force: true });
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    admin = await testHelper.createTestUser({
      email: "admin@token-analysis.com",
      orgName: "Token Analysis Org",
      role: MemberRole.ADMIN,
    });
  });

  async function issueToken(scope: "read" | "analyze"): Promise<string> {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/tokens`,
      admin.accessToken,
      {
        name: `ci-${scope}`,
        scope,
        expires_on: new Date(Date.now() + DAY).toISOString(),
      },
    );
    return response.json().data.secret;
  }

  function createUploadProject(secret: string, name = "ci-app"): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/projects`,
      secret,
      { name, description: "" },
    );
  }

  // One chunk of an archive, sent as the CLI and the web app send it.
  function uploadArchive(
    secret: string,
    projectId: string,
    content = Buffer.from("PK fake zip"),
  ): Promise<any> {
    const boundary = "----cli-upload";
    const fields: Record<string, string> = {
      type: "source",
      file_name: "project.zip",
      chunk: "true",
      id: "0",
      last: "true",
      hash: createHash("sha256").update(content).digest("hex"),
    };
    const parts = Object.entries(fields).map(
      ([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
    const payload = Buffer.concat([
      Buffer.from(parts.join("")),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return testHelper.getApp().inject({
      method: "PATCH",
      url: `/org/${admin.organization.id}/file/${projectId}/upload`,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
  }

  it("an analyze token uploads the archive where the downloader looks for it", async () => {
    const secret = await issueToken("analyze");
    const projectId = (await createUploadProject(secret)).json().id;

    const uploaded = await uploadArchive(secret, projectId);
    expect(uploaded.statusCode).toBe(200);

    // The downloader reads {DOWNLOAD_PATH}/<uploader>/<project>/<archive>.
    // The paths are built from a temp folder and test ids.
    /* eslint-disable security/detect-non-literal-fs-filename */
    const found: string[] = [];
    for (const uploader of await readdir(downloads)) {
      const names: string[] = await readdir(join(downloads, uploader)).catch(
        () => [],
      );
      if (names.includes(projectId)) {
        found.push(...(await readdir(join(downloads, uploader, projectId))));
      }
    }
    /* eslint-enable security/detect-non-literal-fs-filename */
    expect(found).toEqual(["project.zip"]);
  });

  async function createAnalyzer(): Promise<string> {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/analyzers`,
      admin.accessToken,
      {
        name: "CI Analyzer",
        description: "Analyzer for pipelines",
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
      },
    );
    return response.json().id;
  }

  it("an analyze token picks an analyzer by name, starts an analysis and reads its status", async () => {
    const analyzerId = await createAnalyzer();
    const secret = await issueToken("analyze");
    const projectId = (await createUploadProject(secret)).json().id;
    await uploadArchive(secret, projectId);

    const analyzers = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/analyzers?entries_per_page=100`,
      secret,
    );
    expect(analyzers.statusCode).toBe(200);
    expect(
      analyzers
        .json()
        .data.find((a: { name: string }) => a.name === "CI Analyzer")?.id,
    ).toBe(analyzerId);

    const started = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/projects/${projectId}/analyses`,
      secret,
      { analyzer_id: analyzerId, branch: "main", config: {} },
    );
    expect(started.statusCode).toBe(201);

    const analysis = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/projects/${projectId}/analyses/${started.json().id}`,
      secret,
    );
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().data.status).toBe("requested");
    expect(await auditEntries(admin, "AnalysisStarted")).toEqual([
      expect.objectContaining({ blame_on_token_name: "ci-analyze" }),
    ]);
  });

  it("a read token cannot start an analysis", async () => {
    const analyzerId = await createAnalyzer();
    const projectId = (
      await createUploadProject(await issueToken("analyze"))
    ).json().id;

    const started = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/projects/${projectId}/analyses`,
      await issueToken("read"),
      { analyzer_id: analyzerId, branch: "main", config: {} },
    );
    expect(started.statusCode).toBe(403);
  });

  // A finished analysis with one critical finding; the id is no CVE, so no knowledge lookup runs.
  async function finishedAnalysis(
    projectId: string,
    config: object = {},
  ): Promise<string> {
    const analysisId = randomUUID();
    const data = testHelper.getDataSource();
    await data.query(
      `INSERT INTO analysis (id, created_on, config, status, steps, branch, "projectId", "organizationId")
       VALUES ($1, now(), $4, 'completed', '[]', 'main', $2, $3)`,
      [analysisId, projectId, admin.organization.id, JSON.stringify(config)],
    );
    const vulnerability = {
      Id: "TEST-0001",
      Sources: ["NVD"],
      AffectedDependency: "lodash",
      AffectedVersion: "4.17.20",
      VulnerabilityId: "TEST-0001",
      Severity: { Severity: 9.1, SeverityClass: "CRITICAL" },
      Conflict: { ConflictWinner: "NVD", ConflictFlag: "NO_CONFLICT" },
    };
    await data.query(
      `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, 'vuln-finder', now(), $2)`,
      [
        JSON.stringify({
          workspaces: { ".": { Vulnerabilities: [vulnerability] } },
          analysis_info: { status: "success" },
        }),
        analysisId,
      ],
    );
    return analysisId;
  }

  async function findings(projectId: string, analysisId: string): Promise<any> {
    return testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/projects/${projectId}/analysis/${analysisId}/vulnerabilities?workspace=.&entries_per_page=100`,
      await issueToken("read"),
    );
  }

  it("a read token reads the findings of a finished analysis", async () => {
    const projectId = (
      await createUploadProject(await issueToken("analyze"))
    ).json().id;
    const analysisId = await finishedAnalysis(projectId);

    const response = await findings(projectId, analysisId);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({
        Vulnerability: "TEST-0001",
        Severity: expect.objectContaining({ SeverityClass: "CRITICAL" }),
      }),
    ]);
  });

  it("a token, like a member, does not see findings the analysis's policy accepts", async () => {
    const policy = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/policies/vulnerability_policy`,
      admin.accessToken,
      {
        name: "Accepted risks",
        description: "",
        type: "BLACKLIST",
        vulnerabilities: ["TEST-0001"],
        default: false,
      },
    );
    const projectId = (
      await createUploadProject(await issueToken("analyze"))
    ).json().id;
    const analysisId = await finishedAnalysis(projectId, {
      "vuln-finder": { vulnerabilityPolicy: [policy.json().id] },
    });

    expect((await findings(projectId, analysisId)).json().data).toEqual([]);
  });

  it("an analyze token creates an upload project, and the audit log names the token", async () => {
    const secret = await issueToken("analyze");

    const created = await createUploadProject(secret);
    expect(created.statusCode).toBe(201);

    const listed = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/projects?entries_per_page=100`,
      admin.accessToken,
    );
    expect(listed.json().data.map((p: { name: string }) => p.name)).toEqual([
      "ci-app",
    ]);
    expect(await auditEntries(admin, "ProjectCreate")).toEqual([
      expect.objectContaining({
        blame_on_token_name: "ci-analyze",
        blame_on_email: null,
      }),
    ]);
  });

  it("a read token cannot create a project", async () => {
    const secret = await issueToken("read");

    expect((await createUploadProject(secret)).statusCode).toBe(403);
  });

  // A project linked from GitHub through an integration, as an admin imports it in the web app.
  async function linkedProject(orgId = admin.organization.id): Promise<string> {
    const data = testHelper.getDataSource();
    const [integration] = await data.query(
      `INSERT INTO integration (integration_type, integration_provider, access_token, invalid, service_domain, added_on, "ownerId")
       VALUES ('VCS', 'GITHUB', 'not-a-real-token', false, 'github.com', now(), $1) RETURNING id`,
      [admin.user.id],
    );
    const [project] = await data.query(
      `INSERT INTO project (name, description, integration_type, integration_provider, invalid, downloaded, added_on, type, url, default_branch, service_domain, "integrationId", "addedById")
       VALUES ('acme/shop-front', '', 'VCS', 'GITHUB', false, false, now(), 'GITHUB', 'https://github.com/acme/shop-front', 'develop', 'github.com', $1, $2) RETURNING id`,
      [integration.id, admin.user.id],
    );
    await data.query(
      `INSERT INTO organization_projects_project ("organizationId", "projectId") VALUES ($1, $2)`,
      [orgId, project.id],
    );
    return project.id;
  }

  it("a read token reads a linked project's default branch, without the integration's secrets", async () => {
    const projectId = await linkedProject();

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/projects/${projectId}`,
      await issueToken("read"),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(
      expect.objectContaining({
        id: projectId,
        type: "GITHUB",
        default_branch: "develop",
      }),
    );
    expect(response.body).not.toContain("not-a-real-token");
    expect(response.body).not.toContain("password");
  });

  it("a token cannot read a project of another organization", async () => {
    const other = await testHelper.createTestUser({
      email: "other@token-analysis.com",
      orgName: "Other Org",
      role: MemberRole.ADMIN,
    });
    const projectId = await linkedProject(other.organization.id);

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${admin.organization.id}/projects/${projectId}`,
      await issueToken("read"),
    );
    expect([403, 404]).toContain(response.statusCode);
    const across = await testHelper.makeAuthenticatedRequest(
      "GET",
      `/org/${other.organization.id}/projects/${projectId}`,
      await issueToken("read"),
    );
    expect(across.statusCode).toBe(403);
  });

  it("an analyze token starts an analysis of a linked project on its default branch", async () => {
    const analyzerId = await createAnalyzer();
    const projectId = await linkedProject();
    const secret = await issueToken("analyze");

    const started = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${admin.organization.id}/projects/${projectId}/analyses`,
      secret,
      { analyzer_id: analyzerId, branch: "develop", config: {} },
    );
    expect(started.statusCode).toBe(201);

    const [analysis] = await testHelper
      .getDataSource()
      .query(
        `SELECT branch, "integrationId" IS NOT NULL AS linked, "createdById" FROM analysis WHERE id = $1`,
        [started.json().id],
      );
    expect(analysis).toEqual({
      branch: "develop",
      linked: true,
      createdById: null,
    });
  });
});
