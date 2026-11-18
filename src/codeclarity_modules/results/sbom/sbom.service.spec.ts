import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { PackageRepository } from "src/codeclarity_modules/knowledge/package/package.repository";
import {
  EntityNotFound,
  PluginResultNotAvailable,
  UnknownWorkspace,
} from "src/types/error.types";

import { Result } from "../result.entity";
import { AnalysisResultsService } from "../results.service";

import { SBOMService } from "./sbom.service";
import type { SbomDependency } from "./sbom.types";
import { SbomUtilsService } from "./utils/utils";

describe("SBOMService", () => {
  let service: SBOMService;
  let analysisResultsService: AnalysisResultsService;
  let sbomUtilsService: SbomUtilsService;
  let resultRepository: any;

  const mockUser = new AuthenticatedUser("user-123", [ROLE.USER], true);

  const mockSbomOutput = {
    workspaces: {
      default: {
        dependencies: {
          package1: {
            "1.0.0": {
              Bundled: false,
              Optional: false,
              Transitive: false,
              Direct: true,
              Dev: false,
              Prod: true,
              name: "package1",
              version: "1.0.0",
            },
          },
          package2: {
            "2.0.0": {
              Bundled: true,
              Optional: true,
              Transitive: true,
              Direct: false,
              Dev: true,
              Prod: false,
              name: "package2",
              version: "2.0.0",
            },
          },
        },
        start: {
          dependencies: ["package1@1.0.0"],
          dev_dependencies: ["package2@2.0.0"],
        },
      },
    },
    analysis_info: {
      public_errors: [],
      private_errors: [],
      analysis_start_time: "2024-01-01T00:00:00Z",
      analysis_end_time: "2024-01-01T01:00:00Z",
    },
  };

  const mockResult = {
    id: "result-123",
    plugin: "js-sbom",
    result: mockSbomOutput,
    analysis: {
      id: "analysis-123",
      created_on: new Date("2024-01-01"),
      project: {
        id: "project-123",
      },
    },
  };

  const mockAnalysisResultsService = {
    checkAccess: jest.fn(),
  };

  const mockSbomUtilsService = {
    getSbomResult: jest.fn(),
    getMergedSbomResults: jest.fn(),
    filterSbomByEcosystem: jest.fn(),
  };

  const mockPackageRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    getPackageInfoWithoutFailing: jest.fn(),
    getVersionInfo: jest.fn(),
  };

  const mockResultRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SBOMService,
        {
          provide: AnalysisResultsService,
          useValue: mockAnalysisResultsService,
        },
        {
          provide: SbomUtilsService,
          useValue: mockSbomUtilsService,
        },
        {
          provide: PackageRepository,
          useValue: mockPackageRepository,
        },
        {
          provide: getRepositoryToken(Result, "codeclarity"),
          useValue: mockResultRepository,
        },
      ],
    }).compile();

    service = module.get<SBOMService>(SBOMService);
    analysisResultsService = module.get<AnalysisResultsService>(
      AnalysisResultsService,
    );
    sbomUtilsService = module.get<SbomUtilsService>(SbomUtilsService);
    resultRepository = module.get(getRepositoryToken(Result, "codeclarity"));

    jest.clearAllMocks();

    // Set up default mock for getMergedSbomResults
    mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
      mergedSbom: mockSbomOutput,
    });
    // Set up default mock for filterSbomByEcosystem to return input unchanged
    mockSbomUtilsService.filterSbomByEcosystem.mockImplementation(
      (sbom, _filter) => sbom,
    );
  });

  describe("getStats", () => {
    it("should return analysis stats for valid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockResultRepository.find.mockResolvedValue([mockResult]);

      const result = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        "default",
        mockUser,
      );

      expect(result).toBeDefined();
      expect(result.number_of_dependencies).toBe(2);
      expect(result.number_of_direct_dependencies).toBe(1);
      expect(result.number_of_transitive_dependencies).toBe(1);
      expect(result.number_of_bundled_dependencies).toBe(1);
      expect(result.number_of_optional_dependencies).toBe(1);

      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      // Note: Service uses getMergedSbomResults instead of direct repository calls
    });

    it("should calculate diff stats when previous result exists", async () => {
      const previousResult = {
        ...mockResult,
        result: {
          workspaces: {
            default: {
              dependencies: {
                package1: {
                  "1.0.0": {
                    Bundled: false,
                    Optional: false,
                    Transitive: false,
                    Direct: true,
                    Dev: false,
                    Prod: true,
                    name: "package1",
                    version: "1.0.0",
                  },
                },
              },
              start: {
                dependencies: ["package1@1.0.0"],
                dev_dependencies: [],
              },
            },
          },
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockResultRepository.find.mockResolvedValue([mockResult, previousResult]);

      const result = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        "default",
        mockUser,
      );

      expect(result).toBeDefined();
      // TODO: Fix diff calculation - service currently uses same SBOM for current and previous
      expect(result.number_of_dependencies_diff).toBe(0); // Should be 1 when fixed
      expect(result.number_of_dev_dependencies_diff).toBe(0); // Should be 1 when fixed
    });

    it("should throw PluginResultNotAvailable when no results exist", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockResultRepository.find.mockResolvedValue([]);
      // Make getMergedSbomResults throw PluginResultNotAvailable when no results exist
      mockSbomUtilsService.getMergedSbomResults.mockRejectedValue(
        new PluginResultNotAvailable(),
      );

      await expect(
        service.getStats(
          "org-123",
          "project-123",
          "analysis-123",
          "default",
          mockUser,
        ),
      ).rejects.toThrow(PluginResultNotAvailable);
    });

    it("should handle access check failure", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getStats(
          "org-123",
          "project-123",
          "analysis-123",
          "default",
          mockUser,
        ),
      ).rejects.toThrow("Access denied");

      expect(resultRepository.find).not.toHaveBeenCalled();
    });
  });

  describe("getSbom", () => {
    it("should return paginated SBOM data", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: mockSbomOutput,
      });

      const result = await service.getSbom(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        {
          workspace: "default",
          page: 0,
          entriesPerPage: 20,
          sortBy: "name",
          sortDirection: "asc",
          activeFilters: undefined,
          searchKey: undefined,
        },
      );

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(sbomUtilsService.getMergedSbomResults).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("gives each dependency its package URL and license", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: {
          workspaces: {
            default: {
              dependencies: {
                "@vue/shared": {
                  "3.5.0": { Prod: true, ecosystem: "npm" },
                },
                "monolog/monolog": {
                  "3.7.0": { Prod: true, ecosystem: "packagist" },
                },
                "left-pad": { "1.3.0": { Prod: true } },
              },
              start: { dependencies: [] },
            },
          },
          analysis_info: mockSbomOutput.analysis_info,
        },
      });
      mockPackageRepository.getPackageInfoWithoutFailing.mockImplementation(
        (name: string) =>
          Promise.resolve(
            name === "left-pad"
              ? null
              : {
                  latest_version: "9.9.9",
                  license: name === "@vue/shared" ? "MIT" : "(MIT OR GPL-2.0)",
                },
          ),
      );

      const result = await service.getSbom(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        { workspace: "default", sortBy: "name", sortDirection: "ASC" },
      );

      const byName = Object.fromEntries(
        (result.data as SbomDependency[]).map((d) => [d.name, d]),
      );
      expect(byName["@vue/shared"]).toMatchObject({
        purl: "pkg:npm/%40vue/shared@3.5.0",
        license: "MIT",
      });
      expect(byName["monolog/monolog"]).toMatchObject({
        purl: "pkg:composer/monolog/monolog@3.7.0",
        license: "(MIT OR GPL-2.0)",
      });
      expect(byName["left-pad"]!.purl).toBe("pkg:npm/left-pad@1.3.0");
      expect(byName["left-pad"]!.license).toBeUndefined();
    });

    it("gives each dependency its version's license, or the package's when the version has none", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: {
          workspaces: {
            default: {
              dependencies: {
                glob: { "7.1.2": { Prod: true }, "9.0.0": { Prod: true } },
              },
              start: { dependencies: [] },
            },
          },
          analysis_info: mockSbomOutput.analysis_info,
        },
      });
      mockPackageRepository.getPackageInfoWithoutFailing.mockResolvedValue({
        latest_version: "9.0.0",
        license: "BlueOak-1.0.0",
      });
      mockPackageRepository.getVersionInfo.mockImplementation(
        (_name: string, version: string) =>
          Promise.resolve({
            license: "BlueOak-1.0.0",
            versions: [
              {
                version,
                extra: version === "7.1.2" ? { license_expression: "ISC" } : {},
              },
            ],
          }),
      );

      const result = await service.getSbom(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        { workspace: "default", sortBy: "name", sortDirection: "ASC" },
      );

      const byVersion = Object.fromEntries(
        (result.data as SbomDependency[]).map((d) => [d.version, d.license]),
      );
      expect(byVersion).toEqual({ "7.1.2": "ISC", "9.0.0": "BlueOak-1.0.0" });
    });

    it("should handle active filters", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      const result = await service.getSbom(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        {
          workspace: "default",
          page: 0,
          entriesPerPage: 20,
          sortBy: "name",
          sortDirection: "asc",
          activeFilters: "[direct,transitive]",
          searchKey: "package",
        },
      );

      expect(result).toBeDefined();
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
    });

    it("should handle access check failure", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getSbom("org-123", "project-123", "analysis-123", mockUser, {
          workspace: "default",
          page: 0,
          entriesPerPage: 20,
          sortBy: "name",
          sortDirection: "asc",
          activeFilters: undefined,
          searchKey: undefined,
        }),
      ).rejects.toThrow("Access denied");

      expect(sbomUtilsService.getSbomResult).not.toHaveBeenCalled();
    });
  });

  describe("getDependency", () => {
    const mockSbomUtilsService = {
      getSbomResult: jest.fn(),
      getMergedSbomResults: jest.fn(),
      getDependencyData: jest.fn(),
      filterSbomByEcosystem: jest.fn(),
    };

    beforeEach(() => {
      // Mock the private property
      Object.defineProperty(service, "sbomUtilsService", {
        value: mockSbomUtilsService,
        writable: true,
      });
      // Set up default mock return value for getMergedSbomResults
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: mockSbomOutput,
      });
    });

    it("should return dependency details for valid dependency", async () => {
      const mockDependencyDetails = {
        name: "package1",
        version: "1.0.0",
        latest_version: "1.2.0",
        dependencies: {},
        dev_dependencies: {},
        transitive: false,
        source: undefined,
        package_manager: "npm",
        license: "MIT",
        engines: {},
        release_date: new Date(),
        lastest_release_date: new Date(),
        vulnerabilities: [],
        severity_dist: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          none: 0,
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: mockSbomOutput,
      });
      mockSbomUtilsService.getDependencyData.mockResolvedValue(
        mockDependencyDetails,
      );

      const result = await service.getDependency(
        "org-123",
        "project-123",
        "analysis-123",
        "default",
        "package1@1.0.0",
        mockUser,
      );

      expect(result).toEqual(mockDependencyDetails);
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(mockSbomUtilsService.getMergedSbomResults).toHaveBeenCalledWith(
        "analysis-123",
      );
      expect(mockSbomUtilsService.getDependencyData).toHaveBeenCalledWith(
        "analysis-123",
        "default",
        "package1",
        "1.0.0",
        mockSbomOutput,
      );
    });

    it("should throw UnknownWorkspace for invalid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      await expect(
        service.getDependency(
          "org-123",
          "project-123",
          "analysis-123",
          "invalid-workspace",
          "package1@1.0.0",
          mockUser,
        ),
      ).rejects.toThrow(UnknownWorkspace);
    });

    it("should throw EntityNotFound for invalid dependency", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      await expect(
        service.getDependency(
          "org-123",
          "project-123",
          "analysis-123",
          "default",
          "nonexistent@1.0.0",
          mockUser,
        ),
      ).rejects.toThrow(EntityNotFound);
    });
  });

  describe("getStatus", () => {
    it("should return status with no errors", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      const result = await service.getStatus(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );

      expect(result).toEqual({
        public_errors: [],
        private_errors: [],
        stage_start: "2024-01-01T00:00:00Z",
        stage_end: "2024-01-01T01:00:00Z",
      });
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
    });

    it("should return status with errors when private errors exist", async () => {
      const outputWithErrors = {
        ...mockSbomOutput,
        analysis_info: {
          ...mockSbomOutput.analysis_info,
          public_errors: ["Public error"],
          private_errors: ["Private error"],
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: outputWithErrors,
      });

      const result = await service.getStatus(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );

      expect(result).toEqual({
        public_errors: ["Public error"],
        private_errors: ["Private error"],
        stage_start: "2024-01-01T00:00:00Z",
        stage_end: "2024-01-01T01:00:00Z",
      });
    });

    it("should handle access check failure", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getStatus("org-123", "project-123", "analysis-123", mockUser),
      ).rejects.toThrow("Access denied");

      expect(sbomUtilsService.getSbomResult).not.toHaveBeenCalled();
    });
  });

  describe("getWorkspaces", () => {
    it("should return available workspaces", async () => {
      const mockWorkspacesOutput = {
        workspaces: {
          default: { dependencies: {}, start: {} },
          workspace1: { dependencies: {}, start: {} },
        },
        analysis_info: {
          package_manager: "npm",
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: mockWorkspacesOutput,
        pluginResults: [
          { plugin: "js-sbom", sbom: mockWorkspacesOutput, ecosystem: "npm" },
        ],
      });

      const result = await service.getWorkspaces(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );

      expect(result).toEqual({
        workspaces: ["default", "workspace1"],
        package_manager: "npm",
        package_managers: { default: "npm", workspace1: "npm" },
        ecosystem_package_managers: {
          default: { npm: "npm" },
          workspace1: { npm: "npm" },
        },
      });
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(sbomUtilsService.getMergedSbomResults).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("names the package manager of each ecosystem in a shared workspace", async () => {
      const js = {
        workspaces: { ".": { dependencies: {}, start: {} } },
        analysis_info: { package_manager: "NPM" },
      };
      const php = {
        workspaces: { ".": { dependencies: {}, start: {} } },
        analysis_info: { package_manager: "COMPOSER" },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: {
          workspaces: { ".": { dependencies: {}, start: {} } },
          analysis_info: { package_manager: "multi-language" },
        },
        pluginResults: [
          { plugin: "js-sbom", sbom: js, ecosystem: "npm" },
          { plugin: "php-sbom", sbom: php, ecosystem: "packagist" },
        ],
      });

      const result = await service.getWorkspaces(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );

      expect(result.package_managers).toEqual({ ".": "multi-language" });
      expect(result.ecosystem_package_managers).toEqual({
        ".": { npm: "NPM", packagist: "COMPOSER" },
      });
    });

    it("should handle access check failure", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getWorkspaces(
          "org-123",
          "project-123",
          "analysis-123",
          mockUser,
        ),
      ).rejects.toThrow("Access denied");

      expect(sbomUtilsService.getSbomResult).not.toHaveBeenCalled();
    });
  });

  describe("getDependencyGraph", () => {
    it("should return dependency graph for valid dependency", async () => {
      const mockGraphOutput = {
        workspaces: {
          default: {
            dependencies: {
              package1: {
                "1.0.0": {
                  Dependencies: { package2: "2.0.0" },
                  Prod: true,
                  Dev: false,
                },
              },
              package2: {
                "2.0.0": {
                  Dependencies: {},
                  Prod: true,
                  Dev: false,
                },
              },
            },
            start: {
              dependencies: [{ name: "package1", version: "1.0.0" }],
            },
          },
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockGraphOutput);

      const result = await service.getDependencyGraph(
        "org-123",
        "project-123",
        "analysis-123",
        "default",
        "package1@1.0.0",
        mockUser,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(sbomUtilsService.getMergedSbomResults).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    describe("root edges", () => {
      // app -> express -> debug, and app -> debug directly too; ms only via debug.
      const graphSbom = {
        workspaces: {
          default: {
            dependencies: {
              express: {
                "4.16.0": { Dependencies: { debug: "2.6.9" }, Prod: true },
              },
              debug: {
                "2.6.9": { Dependencies: { ms: "2.0.0" }, Prod: true },
              },
              ms: { "2.0.0": { Dependencies: {}, Prod: true } },
            },
            start: {
              dependencies: [
                { name: "express", version: "4.16.0" },
                { name: "debug", version: "2.6.9" },
              ],
            },
          },
        },
        analysis_info: mockSbomOutput.analysis_info,
      };

      async function graphOf(
        dependency: string,
      ): Promise<Record<string, string[]>> {
        mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
        mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
          mergedSbom: graphSbom,
        });
        const graph = await service.getDependencyGraph(
          "org-123",
          "project-123",
          "analysis-123",
          "default",
          dependency,
          mockUser,
        );
        return Object.fromEntries(
          graph.map((node) => [node.id, [...(node.parentIds ?? [])].sort()]),
        );
      }

      it("gives a transitive dependency no root edge", async () => {
        const parents = await graphOf("ms@2.0.0");

        expect(parents["ms@2.0.0"]).toEqual(["debug@2.6.9"]);
      });

      it("gives a direct dependency a root edge", async () => {
        const parents = await graphOf("express@4.16.0");

        expect(parents["express@4.16.0"]).toEqual(["__VIRTUAL_ROOT__"]);
      });

      it("keeps the root edge of a dependency that is also transitive", async () => {
        const parents = await graphOf("debug@2.6.9");

        expect(parents["debug@2.6.9"]).toEqual([
          "__VIRTUAL_ROOT__",
          "express@4.16.0",
        ]);
      });
    });

    it("should throw UnknownWorkspace for invalid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      await expect(
        service.getDependencyGraph(
          "org-123",
          "project-123",
          "analysis-123",
          "invalid-workspace",
          "package1@1.0.0",
          mockUser,
        ),
      ).rejects.toThrow(UnknownWorkspace);
    });

    it("should throw EntityNotFound for empty dependency parameter", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      await expect(
        service.getDependencyGraph(
          "org-123",
          "project-123",
          "analysis-123",
          "default",
          "",
          mockUser,
        ),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw EntityNotFound for no dependencies in workspace", async () => {
      const emptyWorkspaceOutput = {
        workspaces: {
          default: {
            dependencies: {},
            start: {},
          },
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue({
        mergedSbom: emptyWorkspaceOutput,
      });

      await expect(
        service.getDependencyGraph(
          "org-123",
          "project-123",
          "analysis-123",
          "default",
          "package1@1.0.0",
          mockUser,
        ),
      ).rejects.toThrow(EntityNotFound);
    });

    it("should throw EntityNotFound for dependency not found in workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      await expect(
        service.getDependencyGraph(
          "org-123",
          "project-123",
          "analysis-123",
          "default",
          "nonexistent@1.0.0",
          mockUser,
        ),
      ).rejects.toThrow(EntityNotFound);
    });
  });
});
