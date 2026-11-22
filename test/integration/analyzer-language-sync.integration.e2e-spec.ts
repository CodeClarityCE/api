import { type DataSource } from "typeorm";

import { AnalysesRepository } from "../../src/base_modules/analyses/analyses.repository";
import { AnalysesService } from "../../src/base_modules/analyses/analyses.service";
import { Analysis } from "../../src/base_modules/analyses/analysis.entity";
import { InMemoryAnalysisPublisher } from "../../src/base_modules/analyses/analysis-publisher";
import { Analyzer } from "../../src/base_modules/analyzers/analyzer.entity";
import { AnalyzerLanguagesService } from "../../src/base_modules/analyzers/analyzer-languages.service";
import { AnalyzersRepository } from "../../src/base_modules/analyzers/analyzers.repository";
import { AnalyzersService } from "../../src/base_modules/analyzers/analyzers.service";
import {
  AuthenticatedUser,
  ROLE,
} from "../../src/base_modules/auth/auth.types";
import type { OrganizationLoggerService } from "../../src/base_modules/organizations/log/organizationLogger.service";
import { OrganizationMemberships } from "../../src/base_modules/organizations/memberships/organization.memberships.entity";
import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "../../src/base_modules/organizations/organization.entity";
import type { PluginAvailabilityService } from "../../src/base_modules/plugin-availability/plugin-availability.service";
import type { PluginsRepository } from "../../src/base_modules/plugins/plugin.repository";
import { Project } from "../../src/base_modules/projects/project.entity";
import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "../../src/base_modules/shared/repositories";
import { User } from "../../src/base_modules/users/users.entity";
import { Experiment } from "../../src/codeclarity_modules/experiments/experiment.entity";
import { Policy } from "../../src/codeclarity_modules/policies/policy.entity";
import {
  closeScratchDatabase,
  openScratchDatabase,
} from "../utils/scratch-database";

// The plugins as they register, with js-patching reading only the JavaScript SBOM.
const installed = [
  { id: "1", name: "js-sbom", depends_on: [] },
  { id: "2", name: "php-sbom", depends_on: [] },
  { id: "3", name: "vuln-finder", depends_on: ["js-sbom", "php-sbom"] },
  { id: "4", name: "license-finder", depends_on: ["js-sbom", "php-sbom"] },
  { id: "5", name: "js-patching", depends_on: ["js-sbom", "vuln-finder"] },
  { id: "6", name: "codeql", depends_on: [] },
];

const step = (name: string) => ({ name, version: "v1", config: {} });

// The language config audit-js-only-full was saved with, before codeql and js-patching were listed.
const staleConfig = {
  javascript: { plugins: ["js-sbom", "vuln-finder", "license-finder"] },
};

const derivedConfig = {
  javascript: {
    plugins: [
      "js-sbom",
      "codeql",
      "vuln-finder",
      "license-finder",
      "js-patching",
    ],
  },
};

describe("Language config of a template-based analyzer (Postgres)", () => {
  let dataSource: DataSource;
  let analyses: AnalysesService;
  let analyzers: AnalyzersService;
  let orgId: string;
  let projectId: string;
  let user: AuthenticatedUser;
  let saves: number;

  beforeAll(async () => {
    dataSource = await openScratchDatabase("codeclarity_analyzer_languages_it");
  });

  afterAll(async () => {
    await closeScratchDatabase(dataSource);
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    const unused = undefined as never;
    const analyzersRepository = new AnalyzersRepository(
      dataSource.getRepository(Analyzer),
    );
    saves = 0;
    const save = analyzersRepository.saveLanguages.bind(analyzersRepository);
    analyzersRepository.saveLanguages = async (...args) => {
      saves++;
      return save(...args);
    };
    const plugins = {
      getAll: async () => installed,
    } as unknown as PluginsRepository;
    const languages = new AnalyzerLanguagesService(
      analyzersRepository,
      plugins,
    );
    // Every plugin counts as available; audit log entries are discarded.
    const pluginAvailability = {
      assertAvailable: async () => undefined,
      ofAnalyzer: async () => undefined,
    } as unknown as PluginAvailabilityService;
    const auditLog = {
      addAuditLog: async () => undefined,
      addActorAuditLog: async () => undefined,
    } as unknown as OrganizationLoggerService;
    const memberships = new MembershipsRepository(
      dataSource.getRepository(OrganizationMemberships),
    );
    const users = new UsersRepository(dataSource.getRepository(User));
    const organizations = new OrganizationsRepository(
      dataSource.getRepository(Organization),
    );

    analyses = new AnalysesService(
      new InMemoryAnalysisPublisher(),
      pluginAvailability,
      memberships,
      users,
      organizations,
      new ProjectsRepository(dataSource.getRepository(Project)),
      analyzersRepository,
      unused,
      unused,
      unused,
      unused,
      new AnalysesRepository(dataSource.getRepository(Analysis)),
      dataSource.getRepository(Policy),
      auditLog,
      languages,
    );
    analyzers = new AnalyzersService(
      auditLog,
      memberships,
      organizations,
      users,
      analyzersRepository,
      plugins,
      pluginAvailability,
      dataSource.getRepository(Experiment),
      languages,
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

    orgId = org.id;
    projectId = project.id;
    user = new AuthenticatedUser(creator.id, [ROLE.USER], true);
  });

  async function saveAnalyzer(
    language_config: Record<string, unknown> | null,
  ): Promise<string> {
    const analyzer = await dataSource.getRepository(Analyzer).save({
      name: "audit-js-only-full",
      global: false,
      description: "",
      created_on: new Date(),
      steps: [
        [step("js-sbom"), step("codeql")],
        [step("vuln-finder"), step("license-finder")],
        [step("js-patching")],
      ],
      supported_languages: ["javascript"],
      language_config,
      organization: { id: orgId },
    } as unknown as Analyzer);
    return analyzer.id;
  }

  function createAnalysis(analyzerId: string): Promise<string> {
    return analyses.create(
      orgId,
      projectId,
      {
        analyzer_id: analyzerId,
        branch: "main",
        config: {},
        schedule_type: "once",
      },
      user,
    );
  }

  async function stored(id: string) {
    const analyzer = await dataSource
      .getRepository(Analyzer)
      .findOneByOrFail({ id });
    return {
      supported_languages: analyzer.supported_languages,
      language_config: analyzer.language_config,
    };
  }

  it("saves the derived config of a stale analyzer when an analysis is created from it", async () => {
    const id = await saveAnalyzer(staleConfig);

    await createAnalysis(id);

    expect(await stored(id)).toEqual({
      supported_languages: ["javascript"],
      language_config: derivedConfig,
    });
  });

  it("returns and saves the derived config when the analyzer is fetched", async () => {
    const id = await saveAnalyzer(staleConfig);

    const fetched = await analyzers.get(orgId, id, user);

    expect(fetched.language_config).toEqual(derivedConfig);
    expect((await stored(id)).language_config).toEqual(derivedConfig);
  });

  it("returns the derived config in a list of analyzers", async () => {
    const id = await saveAnalyzer(staleConfig);

    const page = await analyzers.getMany(orgId, {}, user);

    expect(page.data.find((a) => a.id === id)?.language_config).toEqual(
      derivedConfig,
    );
    expect((await stored(id)).language_config).toEqual(derivedConfig);
  });

  it.each([
    ["{}", {}],
    ["null", null],
  ])(
    "leaves an analyzer whose config is %s unchanged",
    async (_label, config) => {
      const id = await saveAnalyzer(config);

      await createAnalysis(id);
      await analyzers.get(orgId, id, user);

      expect(await stored(id)).toEqual({
        supported_languages: ["javascript"],
        language_config: config,
      });
      expect(saves).toBe(0);
    },
  );

  it("writes nothing when the saved config already matches", async () => {
    const id = await saveAnalyzer(derivedConfig);

    await createAnalysis(id);
    await analyzers.get(orgId, id, user);

    expect(saves).toBe(0);
  });
});
