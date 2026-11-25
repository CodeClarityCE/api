import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { AnalyzerLanguagesService } from "src/base_modules/analyzers/analyzer-languages.service";
import { Policy } from "src/codeclarity_modules/policies/policy.entity";
import { LicensesRepository } from "src/codeclarity_modules/results/licenses/licenses.repository";
import { AnalysisResultsRepository } from "src/codeclarity_modules/results/results.repository";
import { SBOMRepository } from "src/codeclarity_modules/results/sbom/sbom.repository";
import { VulnerabilitiesRepository } from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.repository";
import { NotAuthorized } from "src/types/error.types";

import { AnaylzerMissingConfigAttribute } from "../analyzers/analyzers.errors";
import { AnalyzersRepository } from "../analyzers/analyzers.repository";
import { AuthenticatedUser, ROLE } from "../auth/auth.types";
import { OrganizationLoggerService } from "../organizations/log/organizationLogger.service";
import { MemberRole } from "../organizations/memberships/orgMembership.types";
import { PluginAvailabilityService } from "../plugin-availability/plugin-availability.service";
import { InMemoryConsumerProbe } from "../plugin-availability/testing/in-memory-consumer-probe";
import { ProjectMemberService } from "../projects/projectMember.service";
import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "../shared/repositories";

import { AnalysesRepository } from "./analyses.repository";
import { AnalysesService } from "./analyses.service";
import { AnalysisStatus } from "./analysis.entity";
import type { AnalysisCreateBody } from "./analysis.types";
import {
  AnalysisPublisher,
  InMemoryAnalysisPublisher,
} from "./analysis-publisher";
import { LanguageDetectionService } from "./language-detection.service";

describe("AnalysesService", () => {
  let service: AnalysesService;
  let usersRepository: UsersRepository;
  let organizationsRepository: OrganizationsRepository;
  let membershipsRepository: MembershipsRepository;
  let projectsRepository: ProjectsRepository;
  let analyzersRepository: AnalyzersRepository;
  let sbomRepository: SBOMRepository;
  let vulnerabilitiesRepository: VulnerabilitiesRepository;
  let licensesRepository: LicensesRepository;
  let analysesRepository: AnalysesRepository;
  let policyRepository: Repository<Policy>;

  // Mock data
  const mockUser = new AuthenticatedUser("user-123", [ROLE.USER], true);

  const mockAnalyzer = {
    id: "analyzer-123",
    name: "Test Analyzer",
    supported_languages: ["javascript", "typescript"],
    steps: [
      [
        {
          name: "step1",
          version: "1.0.0",
          config: {
            option1: { required: true, default: "value1" },
          },
        },
      ],
      [
        {
          name: "step2",
          version: "1.0.0",
          config: null,
        },
      ],
    ],
  };

  const mockProject = {
    id: "project-123",
    name: "Test Project",
    integration: { id: "integration-123" },
  };

  const mockOrganization = {
    id: "org-123",
    name: "Test Organization",
  };

  const mockCreator = {
    id: "user-123",
    email: "test@example.com",
  };

  const mockAnalysis = {
    id: "analysis-123",
    status: AnalysisStatus.REQUESTED,
    stage: 0,
    project: mockProject,
    results: [],
  } as any;

  const mockAnalysisCreateBody: AnalysisCreateBody = {
    analyzer_id: "analyzer-123",
    tag: "v1.0.0",
    branch: "main",
    commit_hash: "abc123",
    config: {
      step1: {
        option1: "custom-value",
      },
    },
  };

  let publisher: InMemoryAnalysisPublisher;
  let consumers: InMemoryConsumerProbe;

  beforeEach(async () => {
    publisher = new InMemoryAnalysisPublisher();
    consumers = new InMemoryConsumerProbe();
    consumers.consumers.set("step1", 1);
    consumers.consumers.set("step2", 1);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysesService,
        { provide: AnalysisPublisher, useValue: publisher },
        {
          provide: PluginAvailabilityService,
          useValue: Object.assign(new PluginAvailabilityService(consumers), {
            cacheMs: 0,
          }),
        },
        {
          provide: ProjectMemberService,
          useValue: {
            doesProjectBelongToOrg: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const config: Record<string, string> = {
                AMQP_ANALYSES_QUEUE: "analyses",
                AMQP_PROTOCOL: "amqp",
                AMQP_USER: "user",
                AMQP_HOST: "localhost",
                AMQP_PORT: "5672",
              };
              return config[key];
            }),
          },
        },
        {
          provide: MembershipsRepository,
          useValue: {
            hasRequiredRole: jest.fn(),
            // A member's check, as the real method does for users.
            hasRequiredRoleFor: jest.fn(function (
              this: { hasRequiredRole: (...args: unknown[]) => unknown },
              orgId: string,
              actor: { userId: string },
              role: unknown,
            ) {
              return this.hasRequiredRole(orgId, actor.userId, role);
            }),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            getUserById: jest.fn(),
          },
        },
        {
          provide: OrganizationsRepository,
          useValue: {
            getOrganizationById: jest.fn(),
          },
        },
        {
          provide: ProjectsRepository,
          useValue: {
            getProjectById: jest.fn(),
            doesProjectBelongToOrg: jest.fn(),
          },
        },
        {
          provide: AnalyzersRepository,
          useValue: {
            getAnalyzerById: jest.fn(),
          },
        },
        {
          provide: AnalysisResultsRepository,
          useValue: {
            delete: jest.fn(),
            getAllByAnalysisId: jest.fn(),
          },
        },
        {
          provide: SBOMRepository,
          useValue: {
            getSbomResult: jest.fn(),
          },
        },
        {
          provide: VulnerabilitiesRepository,
          useValue: {
            getVulnsResult: jest.fn(),
          },
        },
        {
          provide: LicensesRepository,
          useValue: {
            getLicensesResult: jest.fn(),
          },
        },
        {
          provide: AnalysesRepository,
          useValue: {
            saveAnalysis: jest.fn(),
            getAnalysisById: jest.fn(),
            doesAnalysesBelongToProject: jest.fn(),
            getAnalysisByProjectId: jest.fn(),
            deleteByIds: jest.fn(),
            cancelByIds: jest.fn(),
            runInTransaction: jest.fn(),
            getScheduledAnalysesByProjectId: jest.fn(),
            getAllByAnalysisId: jest.fn(),
          },
        },
        {
          provide: OrganizationLoggerService,
          useValue: { addAuditLog: jest.fn(), addActorAuditLog: jest.fn() },
        },
        {
          provide: AnalyzerLanguagesService,
          useValue: { refresh: jest.fn() },
        },
        {
          provide: LanguageDetectionService,
          useValue: {
            detectLanguagesFromRepository: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Policy, "codeclarity"),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalysesService>(AnalysesService);
    usersRepository = module.get<UsersRepository>(UsersRepository);
    organizationsRepository = module.get<OrganizationsRepository>(
      OrganizationsRepository,
    );
    membershipsRepository = module.get<MembershipsRepository>(
      MembershipsRepository,
    );
    projectsRepository = module.get<ProjectsRepository>(ProjectsRepository);
    analyzersRepository = module.get<AnalyzersRepository>(AnalyzersRepository);
    sbomRepository = module.get<SBOMRepository>(SBOMRepository);
    vulnerabilitiesRepository = module.get<VulnerabilitiesRepository>(
      VulnerabilitiesRepository,
    );
    licensesRepository = module.get<LicensesRepository>(LicensesRepository);
    analysesRepository = module.get<AnalysesRepository>(AnalysesRepository);
    policyRepository = module.get(getRepositoryToken(Policy, "codeclarity"));

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create an analysis successfully", async () => {
      // Arrange
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(mockAnalyzer as any);
      jest
        .spyOn(projectsRepository, "getProjectById")
        .mockResolvedValue(mockProject as any);
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(mockCreator as any);
      jest
        .spyOn(organizationsRepository, "getOrganizationById")
        .mockResolvedValue(mockOrganization as any);
      jest
        .spyOn(analysesRepository, "saveAnalysis")
        .mockResolvedValue(mockAnalysis);

      // Act
      const result = await service.create(
        "org-123",
        "project-123",
        mockAnalysisCreateBody,
        mockUser,
      );

      // Assert
      expect(result).toBe("analysis-123");
      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        "org-123",
        "user-123",
        MemberRole.USER,
      );
      expect(projectsRepository.doesProjectBelongToOrg).toHaveBeenCalledWith(
        "project-123",
        "org-123",
      );
      expect(analysesRepository.saveAnalysis).toHaveBeenCalled();
      expect(publisher.published).toEqual([
        {
          analysis_id: "analysis-123",
          integration_id: "integration-123",
          organization_id: "org-123",
          project_id: "project-123",
        },
      ]);
    });

    it("logs a policy id with format directives verbatim when linking it fails", async () => {
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(mockAnalyzer as any);
      jest
        .spyOn(projectsRepository, "getProjectById")
        .mockResolvedValue(mockProject as any);
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(mockCreator as any);
      jest
        .spyOn(organizationsRepository, "getOrganizationById")
        .mockResolvedValue(mockOrganization as any);
      jest
        .spyOn(analysesRepository, "saveAnalysis")
        .mockResolvedValue(mockAnalysis);
      jest
        .spyOn(policyRepository, "findOne")
        .mockRejectedValue(new Error("db down"));
      const lines: string[] = [];
      const log = jest
        .spyOn(console, "log")
        .mockImplementation((line: string) => lines.push(line));

      await service.create(
        "org-123",
        "project-123",
        {
          ...mockAnalysisCreateBody,
          config: {
            ...mockAnalysisCreateBody.config,
            "vuln-finder": { vulnerabilityPolicy: ["%s%o policy"] },
          },
        },
        mockUser,
      );
      log.mockRestore();

      const entry = lines
        .map((line) => JSON.parse(line) as Record<string, any>)
        .find((e) => e["level"] === "warn");
      expect(entry).toMatchObject({
        msg: "Failed to link policy to analysis",
        fields: {
          policyId: "%s%o policy",
          analysisId: "analysis-123",
          error: "db down",
        },
      });
    });

    it("refuses an analyzer whose CodeQL is off, saving and queuing nothing", async () => {
      const codeqlAnalyzer = {
        ...mockAnalyzer,
        steps: [[{ name: "codeql", version: "1.0.0", config: null }]],
      };
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(codeqlAnalyzer as any);

      await expect(
        service.create(
          "org-123",
          "project-123",
          { ...mockAnalysisCreateBody, config: {} },
          mockUser,
        ),
      ).rejects.toMatchObject({
        error_code: "AnalyzerUnavailable",
        error_message: "Needs CodeQL, which is off on this instance.",
      });
      expect(analysesRepository.saveAnalysis).not.toHaveBeenCalled();
      expect(publisher.published).toEqual([]);
    });

    it("refuses an analyzer whose plugin is down, saving and queuing nothing", async () => {
      consumers.consumers.set("step2", 0);
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(mockAnalyzer as any);

      await expect(
        service.create(
          "org-123",
          "project-123",
          mockAnalysisCreateBody,
          mockUser,
        ),
      ).rejects.toMatchObject({
        error_code: "AnalyzerUnavailable",
        error_message: "step2 is temporarily down. Try again shortly.",
      });
      expect(analysesRepository.saveAnalysis).not.toHaveBeenCalled();
      expect(publisher.published).toEqual([]);
    });

    it("should throw AnaylzerMissingConfigAttribute when required config is missing", async () => {
      // Arrange
      const analyzerWithRequiredConfig = {
        ...mockAnalyzer,
        steps: [
          [
            {
              name: "step1",
              version: "1.0.0",
              config: {
                requiredOption: { required: true },
              },
            },
          ],
        ],
      };
      const bodyWithoutRequiredConfig = {
        ...mockAnalysisCreateBody,
        config: {}, // Empty config, missing step1 entirely
      };

      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(analyzerWithRequiredConfig as any);
      jest
        .spyOn(projectsRepository, "getProjectById")
        .mockResolvedValue(mockProject as any);
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(mockCreator as any);
      jest
        .spyOn(organizationsRepository, "getOrganizationById")
        .mockResolvedValue(mockOrganization as any);

      // Act & Assert
      await expect(
        service.create(
          "org-123",
          "project-123",
          bodyWithoutRequiredConfig,
          mockUser,
        ),
      ).rejects.toThrow(AnaylzerMissingConfigAttribute);
    });

    it("names the missing plugin option in the error", async () => {
      const analyzerWithRequiredConfig = {
        ...mockAnalyzer,
        steps: [
          [
            {
              name: "step1",
              version: "1.0.0",
              config: { requiredOption: { required: true } },
            },
          ],
        ],
      };
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(analyzerWithRequiredConfig as any);

      await expect(
        service.create(
          "org-123",
          "project-123",
          { ...mockAnalysisCreateBody, config: {} },
          mockUser,
        ),
      ).rejects.toMatchObject({
        error_code: "AnaylzerMissingConfigAttribute",
        error_message:
          'The plugin "step1" needs the option "requiredOption", which is missing.',
      });
    });

    it("still returns the saved analysis when publishing fails", async () => {
      // Arrange
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(mockAnalyzer as any);
      jest
        .spyOn(projectsRepository, "getProjectById")
        .mockResolvedValue(mockProject as any);
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(mockCreator as any);
      jest
        .spyOn(organizationsRepository, "getOrganizationById")
        .mockResolvedValue(mockOrganization as any);
      jest
        .spyOn(analysesRepository, "saveAnalysis")
        .mockResolvedValue(mockAnalysis);
      publisher.failWith = new Error("Connection failed");

      // Act
      const result = await service.create(
        "org-123",
        "project-123",
        mockAnalysisCreateBody,
        mockUser,
      );

      // Assert: the reaper delivers it later
      expect(result).toBe("analysis-123");
      expect(analysesRepository.saveAnalysis).toHaveBeenCalled();
    });

    it("does not publish a scheduled analysis", async () => {
      // Arrange
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(mockAnalyzer as any);
      jest
        .spyOn(projectsRepository, "getProjectById")
        .mockResolvedValue(mockProject as any);
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(mockCreator as any);
      jest
        .spyOn(organizationsRepository, "getOrganizationById")
        .mockResolvedValue(mockOrganization as any);
      jest
        .spyOn(analysesRepository, "saveAnalysis")
        .mockResolvedValue(mockAnalysis);

      // Act
      const result = await service.create(
        "org-123",
        "project-123",
        { ...mockAnalysisCreateBody, schedule_type: "daily" },
        mockUser,
      );

      // Assert: the scheduler triggers its executions
      expect(result).toBe("analysis-123");
      expect(publisher.published).toEqual([]);
    });

    it("should handle project without integration", async () => {
      // Arrange
      const projectWithoutIntegration = { ...mockProject, integration: null };
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analyzersRepository, "getAnalyzerById")
        .mockResolvedValue(mockAnalyzer as any);
      jest
        .spyOn(projectsRepository, "getProjectById")
        .mockResolvedValue(projectWithoutIntegration as any);
      jest
        .spyOn(usersRepository, "getUserById")
        .mockResolvedValue(mockCreator as any);
      jest
        .spyOn(organizationsRepository, "getOrganizationById")
        .mockResolvedValue(mockOrganization as any);
      jest
        .spyOn(analysesRepository, "saveAnalysis")
        .mockResolvedValue(mockAnalysis);

      // Act
      const result = await service.create(
        "org-123",
        "project-123",
        mockAnalysisCreateBody,
        mockUser,
      );

      // Assert
      expect(result).toBe("analysis-123");
      expect(publisher.published).toEqual([
        {
          analysis_id: "analysis-123",
          integration_id: null,
          organization_id: "org-123",
          project_id: "project-123",
        },
      ]);
    });
  });

  describe("get", () => {
    it("should retrieve an analysis successfully", async () => {
      // Arrange
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "doesAnalysesBelongToProject")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "getAnalysisById")
        .mockResolvedValue(mockAnalysis);

      // Act
      const result = await service.get(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockAnalysis);
      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        "org-123",
        "user-123",
        MemberRole.USER,
      );
      expect(projectsRepository.doesProjectBelongToOrg).toHaveBeenCalledWith(
        "project-123",
        "org-123",
      );
      expect(
        analysesRepository.doesAnalysesBelongToProject,
      ).toHaveBeenCalledWith("analysis-123", "project-123");
      expect(analysesRepository.getAnalysisById).toHaveBeenCalledWith(
        "analysis-123",
      );
    });
  });

  describe("getChart", () => {
    it("should retrieve chart data, counting only the vulnerabilities shown by default", async () => {
      // Arrange
      const mockSbomOutput = {
        workspaces: {
          default: {
            dependencies: {
              dep1: {},
              dep2: {},
              dep3: {},
            },
          },
        },
        analysis_info: {
          default_workspace_name: "default",
        },
      };

      const mockVulnsOutput = {
        workspaces: {
          default: {
            Vulnerabilities: [
              { id: "vuln1" },
              { id: "vuln2" },
              // Contradicted by another source, so hidden by default.
              {
                id: "vuln3",
                SourceVerdicts: [
                  { source: "gcve", verdict: "matched" },
                  { source: "osv", verdict: "version_excluded" },
                ],
              },
            ],
          },
        },
        analysis_info: {
          default_workspace_name: "default",
        },
      };

      const mockLicensesOutput = {
        analysis_info: {
          stats: {
            number_of_spdx_licenses: 5,
            number_of_non_spdx_licenses: 2,
            number_of_permissive_licenses: 4,
            number_of_copy_left_licenses: 3,
          },
        },
      };

      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "doesAnalysesBelongToProject")
        .mockResolvedValue();
      jest
        .spyOn(sbomRepository, "getSbomResult")
        .mockResolvedValue(mockSbomOutput as any);
      jest
        .spyOn(vulnerabilitiesRepository, "getVulnsResult")
        .mockResolvedValue(mockVulnsOutput as any);
      jest
        .spyOn(licensesRepository, "getLicensesResult")
        .mockResolvedValue(mockLicensesOutput as any);

      // Act
      const result = await service.getChart(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );

      // Assert
      expect(result).toEqual([
        { x: "Latest", y: "Vulnerabilities", v: 2 },
        { x: "Latest", y: "Dependencies", v: 3 },
        { x: "Latest", y: "SPDX Licenses", v: 5 },
        { x: "Latest", y: "Non-SPDX Licenses", v: 2 },
        { x: "Latest", y: "Permissive Licenses", v: 4 },
        { x: "Latest", y: "Copy Left Licenses", v: 3 },
      ]);
    });
  });

  describe("getMany", () => {
    it("should retrieve paginated analyses", async () => {
      // Arrange
      const mockPaginatedData = {
        data: [mockAnalysis],
        page: 0,
        entry_count: 1,
        entries_per_page: 10,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      };

      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "getAnalysisByProjectId")
        .mockResolvedValue(mockPaginatedData);

      // Act
      const result = await service.getMany(
        "org-123",
        "project-123",
        { entriesPerPage: 10, currentPage: 0 },
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockPaginatedData);
      expect(analysesRepository.getAnalysisByProjectId).toHaveBeenCalledWith(
        "project-123",
        0,
        10,
      );
    });

    it("should apply pagination limits", async () => {
      // Arrange
      const mockPaginatedData = {
        data: [],
        page: 0,
        entry_count: 0,
        entries_per_page: 100,
        total_entries: 0,
        total_pages: 0,
        matching_count: 0,
        filter_count: {},
      };

      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "getAnalysisByProjectId")
        .mockResolvedValue(mockPaginatedData);

      // Act
      const result = await service.getMany(
        "org-123",
        "project-123",
        { entriesPerPage: 200, currentPage: -1 },
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockPaginatedData);
      expect(analysesRepository.getAnalysisByProjectId).toHaveBeenCalledWith(
        "project-123",
        0,
        100,
      ); // max 100, min page 0
    });

    it("should use default pagination when not provided", async () => {
      // Arrange
      const mockPaginatedData = {
        data: [],
        page: 0,
        entry_count: 0,
        entries_per_page: 10,
        total_entries: 0,
        total_pages: 0,
        matching_count: 0,
        filter_count: {},
      };

      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "getAnalysisByProjectId")
        .mockResolvedValue(mockPaginatedData);

      // Act
      const result = await service.getMany(
        "org-123",
        "project-123",
        {},
        mockUser,
      );

      // Assert
      expect(result).toEqual(mockPaginatedData);
      expect(analysesRepository.getAnalysisByProjectId).toHaveBeenCalledWith(
        "project-123",
        0,
        10,
      ); // defaults
    });
  });

  describe("delete", () => {
    const mockManager = { tx: true } as any;
    let calls: string[];

    beforeEach(() => {
      calls = [];
      jest
        .spyOn(analysesRepository, "runInTransaction")
        .mockImplementation((work: any) => work(mockManager));
      jest
        .spyOn(analysesRepository, "cancelByIds")
        .mockImplementation(async () => {
          calls.push("cancel");
          return 1;
        });
      jest
        .spyOn(analysesRepository, "deleteByIds")
        .mockImplementation(async () => {
          calls.push("delete");
          return 1;
        });
    });

    it("should delete the analysis once it belongs to the project", async () => {
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "doesAnalysesBelongToProject")
        .mockResolvedValue();
      jest.spyOn(analysesRepository, "getAnalysisById").mockResolvedValue({
        project: { name: "widget" },
        analyzer: { name: "JS" },
      } as any);

      await service.delete("org-123", "project-123", "analysis-123", mockUser);

      expect(membershipsRepository.hasRequiredRole).toHaveBeenCalledWith(
        "org-123",
        "user-123",
        MemberRole.USER,
      );
      expect(
        analysesRepository.doesAnalysesBelongToProject,
      ).toHaveBeenCalledWith("analysis-123", "project-123");
      expect(analysesRepository.cancelByIds).toHaveBeenCalledWith(
        ["analysis-123"],
        mockManager,
      );
      expect(analysesRepository.deleteByIds).toHaveBeenCalledWith(
        ["analysis-123"],
        mockManager,
      );
      expect(calls).toEqual(["cancel", "delete"]);
    });

    it("should not delete an analysis outside the project", async () => {
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(analysesRepository, "doesAnalysesBelongToProject")
        .mockRejectedValue(new NotAuthorized());

      await expect(
        service.delete("org-123", "project-123", "analysis-123", mockUser),
      ).rejects.toThrow(NotAuthorized);
      expect(analysesRepository.deleteByIds).not.toHaveBeenCalled();
    });

    it("should cancel and delete a bulk delete in one transaction", async () => {
      jest.spyOn(membershipsRepository, "hasRequiredRole").mockResolvedValue();
      jest
        .spyOn(projectsRepository, "doesProjectBelongToOrg")
        .mockResolvedValue();
      jest
        .spyOn(projectsRepository, "getProjectById")
        .mockResolvedValue({ name: "widget" } as any);
      jest.spyOn(service as any, "partitionAnalyses").mockResolvedValue({
        cancellable: ["running-1"],
        skipped: ["done-1"],
        notFound: [],
      });

      const res = await service.batchDelete(
        "org-123",
        "project-123",
        ["running-1", "done-1"],
        mockUser,
      );

      expect(res.succeeded).toBe(2);
      expect(analysesRepository.runInTransaction).toHaveBeenCalledTimes(1);
      expect(analysesRepository.cancelByIds).toHaveBeenCalledWith(
        ["running-1", "done-1"],
        mockManager,
      );
      expect(analysesRepository.deleteByIds).toHaveBeenCalledWith(
        ["running-1", "done-1"],
        mockManager,
      );
      expect(calls).toEqual(["cancel", "delete"]);
    });
  });
});
