import { Client } from "pg";
import { DataSource, type EntityManager } from "typeorm";

import { AnalysesRepository } from "../../src/base_modules/analyses/analyses.repository";
import { AnalysesService } from "../../src/base_modules/analyses/analyses.service";
import { Analysis } from "../../src/base_modules/analyses/analysis.entity";
import { InMemoryAnalysisPublisher } from "../../src/base_modules/analyses/analysis-publisher";
import { Analyzer } from "../../src/base_modules/analyzers/analyzer.entity";
import { AnalyzersRepository } from "../../src/base_modules/analyzers/analyzers.repository";
import {
  AuthenticatedUser,
  ROLE,
} from "../../src/base_modules/auth/auth.types";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import { Project } from "../../src/base_modules/projects/project.entity";
import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "../../src/base_modules/shared/repositories";
import { User } from "../../src/base_modules/users/users.entity";
import { Policy } from "../../src/codeclarity_modules/policies/policy.entity";

// A scratch database of its own: this suite drops its schema on every run
const DATABASE = "codeclarity_analysis_create_it";

function connection(): {
  host: string;
  port: number;
  user: string;
  password: string;
} {
  return {
    host: process.env["PG_DB_HOST"] ?? "localhost",
    port: Number(process.env["PG_DB_PORT"] ?? 5432),
    user: process.env["PG_DB_USER"] ?? "postgres",
    password: process.env["PG_DB_PASSWORD"] ?? "",
  };
}

async function ensureDatabase(): Promise<void> {
  const admin = new Client({ ...connection(), database: "postgres" });
  await admin.connect();
  try {
    const found = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DATABASE],
    );
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE ${DATABASE}`);
  } finally {
    await admin.end();
  }
}

describe("AnalysesService.create against Postgres", () => {
  let dataSource: DataSource;
  let publisher: InMemoryAnalysisPublisher;
  let service: AnalysesService;
  let orgId: string;
  let projectId: string;
  let analyzerId: string;
  let user: AuthenticatedUser;

  beforeAll(async () => {
    await ensureDatabase();
    const { user: username, ...rest } = connection();
    dataSource = new DataSource({
      type: "postgres",
      ...rest,
      username,
      database: DATABASE,
      entities: [
        "src/base_modules/!(plugins)/**/*.entity.ts",
        "src/codeclarity_modules/!(knowledge)/**/*.entity.ts",
      ],
      dropSchema: true,
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    publisher = new InMemoryAnalysisPublisher();
    const unused = undefined as never;
    service = new AnalysesService(
      publisher,
      new MembershipsRepository(
        dataSource.getRepository(OrganizationMemberships),
      ),
      new UsersRepository(dataSource.getRepository(User)),
      new OrganizationsRepository(dataSource.getRepository(Organization)),
      new ProjectsRepository(dataSource.getRepository(Project)),
      new AnalyzersRepository(dataSource.getRepository(Analyzer)),
      unused,
      unused,
      unused,
      unused,
      new AnalysesRepository(dataSource.getRepository(Analysis)),
      dataSource.getRepository(Policy),
    );

    const creator = await dataSource.getRepository(User).save({
      email: "runner@example.com",
      password: "x",
      first_name: "Run",
      last_name: "Ner",
      handle: "runner",
      registration_verified: true,
      created_on: new Date(),
      activated: true,
      social: false,
      setup_done: true,
    });
    const org = await dataSource.getRepository(Organization).save({
      name: "Org",
      description: "",
      color_scheme: "1",
      personal: false,
      created_on: new Date(),
      created_by: creator,
    });
    await dataSource.getRepository(OrganizationMemberships).save({
      user: creator,
      organization: org,
      role: MemberRole.ADMIN,
      joined_on: new Date(),
    });
    const project = await dataSource.getRepository(Project).save({
      added_on: new Date(),
      integration_type: "VCS",
      integration_provider: "GITHUB",
      invalid: false,
      downloaded: false,
      default_branch: "main",
      url: "https://github.com/acme/widget",
      name: "acme/widget",
      description: "",
      type: "GITHUB",
      organizations: [org],
      added_by: creator,
    } as unknown as Project);
    const analyzer = await dataSource.getRepository(Analyzer).save({
      name: "JS",
      global: true,
      description: "",
      created_on: new Date(),
      steps: [[{ name: "js-sbom", version: "v0.0.1", config: {} }]],
      supported_languages: ["javascript"],
    } as unknown as Analyzer);

    orgId = org.id;
    projectId = project.id;
    analyzerId = analyzer.id;
    user = new AuthenticatedUser(creator.id, [ROLE.USER], true);
  });

  function body(): Parameters<AnalysesService["create"]>[2] {
    return {
      analyzer_id: analyzerId,
      branch: "main",
      config: {},
      schedule_type: "once",
    };
  }

  it("commits the analysis with the caller's writes, then publishes", async () => {
    let publishedDuringWrites: number | undefined;

    const analysisId = await service.create(orgId, projectId, body(), user, {
      inTransaction: async (manager: EntityManager, id: string) => {
        publishedDuringWrites = publisher.published.length;
        await manager.update(Project, projectId, {
          description: `linked to ${id}`,
        });
      },
    });

    expect(publishedDuringWrites).toBe(0);
    expect(
      await dataSource.getRepository(Analysis).countBy({ id: analysisId }),
    ).toBe(1);
    expect(
      (
        await dataSource
          .getRepository(Project)
          .findOneByOrFail({ id: projectId })
      ).description,
    ).toBe(`linked to ${analysisId}`);
    expect(publisher.published.map((m) => m.analysis_id)).toEqual([analysisId]);
  });

  it("leaves no analysis and publishes nothing when the caller's writes fail", async () => {
    await expect(
      service.create(orgId, projectId, body(), user, {
        inTransaction: () => Promise.reject(new Error("run already ended")),
      }),
    ).rejects.toThrow("run already ended");

    expect(await dataSource.getRepository(Analysis).count()).toBe(0);
    expect(publisher.published).toEqual([]);
  });

  it("still returns a committed analysis when publishing fails", async () => {
    publisher.failWith = new Error("ECONNREFUSED");

    const analysisId = await service.create(orgId, projectId, body(), user);

    expect(
      (
        await dataSource
          .getRepository(Analysis)
          .findOneByOrFail({ id: analysisId })
      ).status,
    ).toBe("requested");
  });
});
