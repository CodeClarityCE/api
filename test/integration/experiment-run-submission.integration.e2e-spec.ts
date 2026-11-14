import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DataSource } from "typeorm";

import { AnalysesRepository } from "../../src/base_modules/analyses/analyses.repository";
import { AnalysesService } from "../../src/base_modules/analyses/analyses.service";
import {
  Analysis,
  AnalysisStatus,
} from "../../src/base_modules/analyses/analysis.entity";
import { InMemoryAnalysisPublisher } from "../../src/base_modules/analyses/analysis-publisher";
import { Analyzer } from "../../src/base_modules/analyzers/analyzer.entity";
import { AnalyzersRepository } from "../../src/base_modules/analyzers/analyzers.repository";
import {
  AuthenticatedUser,
  ROLE,
} from "../../src/base_modules/auth/auth.types";
import { Integration } from "../../src/base_modules/integrations/integrations.entity";
import { IntegrationsRepository } from "../../src/base_modules/integrations/integrations.repository";
import { Log } from "../../src/base_modules/organizations/log/log.entity";
import { OrganizationLoggerService } from "../../src/base_modules/organizations/log/organizationLogger.service";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import { Project } from "../../src/base_modules/projects/project.entity";
import { ProjectService } from "../../src/base_modules/projects/projects.service";
import {
  LogsRepository,
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "../../src/base_modules/shared/repositories";
import { User } from "../../src/base_modules/users/users.entity";
import { Dataset } from "../../src/codeclarity_modules/datasets/dataset.entity";
import { DatasetEntry } from "../../src/codeclarity_modules/datasets/dataset-entry.entity";
import { Experiment } from "../../src/codeclarity_modules/experiments/experiment.entity";
import {
  ExperimentRun,
  ExperimentRunStatus,
} from "../../src/codeclarity_modules/experiments/experiment-run.entity";
import { ExperimentRunSubmission } from "../../src/codeclarity_modules/experiments/experiment-run-submission";
import { TypeOrmExperimentStore } from "../../src/codeclarity_modules/experiments/experiment-store";
import { Policy } from "../../src/codeclarity_modules/policies/policy.entity";
import { Result } from "../../src/codeclarity_modules/results/result.entity";
import { openScratchDatabase } from "../utils/scratch-database";

const HEAD = {
  branch: "main",
  commitHash: "0123456789abcdef0123456789abcdef01234567",
  committedAt: new Date("2026-11-01T10:00:00Z"),
  description: "A widget",
};

describe("ExperimentRunSubmission against Postgres", () => {
  let dataSource: DataSource;
  let downloads: string;
  let publisher: InMemoryAnalysisPublisher;
  let submission: ExperimentRunSubmission;
  let experiment: Experiment;
  let entries: DatasetEntry[];
  let runs: ExperimentRun[];
  let integrationId: string;
  let creator: AuthenticatedUser;

  beforeAll(async () => {
    dataSource = await openScratchDatabase("codeclarity_run_submission_it");
    downloads = await mkdtemp(join(tmpdir(), "run-submission-"));
    process.env["DOWNLOAD_PATH"] = downloads;
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await rm(downloads, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    const repo = <T extends object>(e: new () => T) =>
      dataSource.getRepository(e);
    const users = new UsersRepository(repo(User));
    const memberships = new MembershipsRepository(
      repo(OrganizationMemberships),
    );
    const organizations = new OrganizationsRepository(repo(Organization));
    const projects = new ProjectsRepository(repo(Project));
    const analyses = new AnalysesRepository(repo(Analysis));
    const unused = undefined as never;

    publisher = new InMemoryAnalysisPublisher();
    const analysesService = new AnalysesService(
      publisher,
      memberships,
      users,
      organizations,
      projects,
      new AnalyzersRepository(repo(Analyzer)),
      unused,
      unused,
      unused,
      unused,
      analyses,
      repo(Policy),
    );
    const projectService = new ProjectService(
      new OrganizationLoggerService(
        users,
        memberships,
        new LogsRepository(repo(Log)),
      ),
      unused,
      unused,
      users,
      organizations,
      memberships,
      unused,
      new IntegrationsRepository(repo(Integration)),
      unused,
      analyses,
      projects,
    );
    const store = new TypeOrmExperimentStore(
      repo(Experiment),
      repo(ExperimentRun),
      repo(Result),
    );
    submission = new ExperimentRunSubmission(
      projectService,
      analysesService,
      analyses,
      store,
    );

    const user = await repo(User).save({
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
    const org = await repo(Organization).save({
      name: "Org",
      description: "",
      color_scheme: "1",
      personal: false,
      created_on: new Date(),
      created_by: user,
    });
    await repo(OrganizationMemberships).save({
      user,
      organization: org,
      role: MemberRole.ADMIN,
      joined_on: new Date(),
    });
    const integration = await repo(Integration).save({
      integration_type: "VCS",
      integration_provider: "GITHUB",
      access_token: "token",
      invalid: false,
      service_domain: "github.com",
      added_on: new Date(),
      last_repository_sync: new Date(),
      organizations: [org],
      users: [user],
      owner: user,
    } as unknown as Integration);
    const analyzer = await repo(Analyzer).save({
      name: "JS",
      global: true,
      description: "",
      created_on: new Date(),
      steps: [
        [{ name: "js-sbom", version: "v1.0.0", config: {} }],
        [{ name: "vuln-finder", version: "v2.0.0", config: {} }],
      ],
      supported_languages: ["javascript"],
    } as unknown as Analyzer);
    const dataset = await repo(Dataset).save({
      name: "Top",
      params: {},
      created_on: new Date(),
      organization: org,
      integration,
    } as unknown as Dataset);
    entries = await repo(DatasetEntry).save(
      ["acme/widget", "acme/gadget"].map((full_name, rank) => ({
        rank,
        full_name,
        owner: "acme",
        repo: full_name.split("/")[1]!,
        git_url: `https://github.com/${full_name}`,
        default_branch: "main",
        stars: 100 - rank,
        lockfiles: ["package-lock.json"],
        dataset,
      })),
    );
    experiment = await repo(Experiment).save({
      name: "Exp",
      created_on: new Date(),
      organization: org,
      created_by: user,
      dataset,
      analyzer,
    } as unknown as Experiment);
    runs = await repo(ExperimentRun).save(
      entries.map((dataset_entry) => ({
        status: ExperimentRunStatus.PENDING,
        experiment,
        dataset_entry,
      })),
    );

    integrationId = integration.id;
    creator = new AuthenticatedUser(user.id, [ROLE.USER], true);
  });

  function submit(index: number): Promise<string | undefined> {
    return submission.submit({
      experiment,
      runId: runs[index]!.id,
      entry: entries[index]!,
      integrationId,
      head: HEAD,
      creator,
    });
  }

  async function linkedAnalysisId(index: number): Promise<string | undefined> {
    const run = await dataSource.getRepository(ExperimentRun).findOneOrFail({
      where: { id: runs[index]!.id },
      relations: { analysis: true },
    });
    return run.analysis?.id;
  }

  it("links the run to an analysis pinned at the SHA, then publishes it", async () => {
    const analysisId = await submit(0);

    expect(analysisId).toBeDefined();
    expect(await linkedAnalysisId(0)).toBe(analysisId);
    const analysis = await dataSource.getRepository(Analysis).findOneOrFail({
      where: { id: analysisId! },
      relations: { project: true },
    });
    expect(analysis).toMatchObject({
      status: AnalysisStatus.REQUESTED,
      branch: "main",
      commit_hash: HEAD.commitHash,
      config: {
        "js-sbom": {
          project: `${experiment.organization.id}/projects/${analysis.project.id}/${HEAD.commitHash}`,
          branch: "main",
        },
        "vuln-finder": {},
        "license-finder": { licensePolicy: [] },
      },
    });
    expect(analysis.project.url).toBe("https://github.com/acme/widget");
    expect(publisher.published.map((m) => m.analysis_id)).toEqual([analysisId]);
  });

  it("leaves nothing behind when the run ended before it was linked", async () => {
    await dataSource
      .getRepository(ExperimentRun)
      .update(runs[0]!.id, { status: ExperimentRunStatus.SKIPPED });

    expect(await submit(0)).toBeUndefined();

    expect(await dataSource.getRepository(Analysis).count()).toBe(0);
    expect(publisher.published).toEqual([]);
  });

  it("keeps the run linked to its analysis when publishing fails", async () => {
    publisher.failWith = new Error("ECONNREFUSED");

    const analysisId = await submit(0);

    expect(analysisId).toBeDefined();
    expect(await linkedAnalysisId(0)).toBe(analysisId);
  });

  it("reuses the project of an already imported repository", async () => {
    entries[1] = { ...entries[1]!, git_url: entries[0]!.git_url };

    await submit(0);
    await submit(1);

    expect(await dataSource.getRepository(Project).count()).toBe(1);
    expect(await dataSource.getRepository(Analysis).count()).toBe(2);
  });

  it("abandons a running analysis and leaves a finished one alone", async () => {
    const running = (await submit(0))!;
    const finished = (await submit(1))!;
    await dataSource
      .getRepository(Analysis)
      .update(finished, { status: AnalysisStatus.SUCCESS });

    await submission.abandon(running);
    await submission.abandon(finished);

    const statusOf = async (id: string): Promise<string> =>
      (await dataSource.getRepository(Analysis).findOneByOrFail({ id })).status;
    expect(await statusOf(running)).toBe(AnalysisStatus.CANCELLED);
    expect(await statusOf(finished)).toBe(AnalysisStatus.SUCCESS);
  });
});
