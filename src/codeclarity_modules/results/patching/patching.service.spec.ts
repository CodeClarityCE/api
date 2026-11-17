import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { UnknownWorkspace } from "src/types/error.types";

import { Result } from "../result.entity";
import { AnalysisResultsService } from "../results.service";
import { SbomUtilsService } from "../sbom/utils/utils";
import {
  computeVulnerabilityStats,
  type StatsFinding,
} from "../vulnerabilities/utils/stats";
import { VulnerabilitiesUtilsService } from "../vulnerabilities/utils/utils.service";

import { PatchingService } from "./patching.service";
import { PatchingUtilsService } from "./utils/utils";

describe("PatchingService", () => {
  let service: PatchingService;
  let analysisResultsService: AnalysisResultsService;
  let patchingUtilsService: PatchingUtilsService;
  let sbomUtilsService: SbomUtilsService;

  const mockUser = new AuthenticatedUser("user-123", [ROLE.USER], true);

  const mockPatchesOutput = {
    workspaces: {
      default: {
        vulnerability_patch_info: {},
        patches: {},
      },
    },
    analysis_info: {
      public_errors: [],
      private_errors: [],
      analysis_start_time: "2024-01-01T00:00:00Z",
      analysis_end_time: "2024-01-01T01:00:00Z",
    },
  };

  const mockSbomOutput = {
    analysis_info: {
      package_manager: "NPM",
    },
  };

  const mockAnalysisResultsService = {
    checkAccess: jest.fn(),
  };

  const mockPatchingUtilsService = {
    getPatchingResult: jest.fn(),
  };

  const mockSbomUtilsService = {
    getSbomResult: jest.fn(),
    getMergedSbomResults: jest.fn(),
  };

  const mockVulnerabilitiesUtilsService = {
    getVulnsResult: jest.fn(),
    getFindingsData: jest.fn(),
  };

  const mockResultRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatchingService,
        {
          provide: AnalysisResultsService,
          useValue: mockAnalysisResultsService,
        },
        {
          provide: PatchingUtilsService,
          useValue: mockPatchingUtilsService,
        },
        {
          provide: SbomUtilsService,
          useValue: mockSbomUtilsService,
        },
        {
          provide: VulnerabilitiesUtilsService,
          useValue: mockVulnerabilitiesUtilsService,
        },
        {
          provide: getRepositoryToken(Result, "codeclarity"),
          useValue: mockResultRepository,
        },
      ],
    }).compile();

    service = module.get<PatchingService>(PatchingService);
    analysisResultsService = module.get<AnalysisResultsService>(
      AnalysisResultsService,
    );
    patchingUtilsService =
      module.get<PatchingUtilsService>(PatchingUtilsService);
    sbomUtilsService = module.get<SbomUtilsService>(SbomUtilsService);

    jest.clearAllMocks();
  });

  describe("getPatches", () => {
    it("should return patches for valid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );

      const result = await service.getPatches(
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

      expect(result).toEqual(mockPatchesOutput.workspaces.default);
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(patchingUtilsService.getPatchingResult).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("should throw UnknownWorkspace for invalid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );

      await expect(
        service.getPatches("org-123", "project-123", "analysis-123", mockUser, {
          workspace: "invalid-workspace",
          page: 0,
          entriesPerPage: 20,
          sortBy: "name",
          sortDirection: "asc",
          activeFilters: undefined,
          searchKey: undefined,
        }),
      ).rejects.toThrow(UnknownWorkspace);
    });

    it("should handle access check failure", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getPatches("org-123", "project-123", "analysis-123", mockUser, {
          workspace: "default",
          page: 0,
          entriesPerPage: 20,
          sortBy: "name",
          sortDirection: "asc",
          activeFilters: undefined,
          searchKey: undefined,
        }),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("getPatchedManifest", () => {
    it("should return analysis info for npm package manager", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      const result = await service.getPatchedManifest(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(result).toEqual(mockSbomOutput.analysis_info);
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(patchingUtilsService.getPatchingResult).toHaveBeenCalledWith(
        "analysis-123",
      );
      expect(sbomUtilsService.getSbomResult).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("should return analysis info for yarn package manager", async () => {
      const yarnSbomOutput = {
        analysis_info: {
          package_manager: "YARN",
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );
      mockSbomUtilsService.getSbomResult.mockResolvedValue(yarnSbomOutput);

      const result = await service.getPatchedManifest(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(result).toEqual(yarnSbomOutput.analysis_info);
    });

    it("should return empty object for unsupported package manager", async () => {
      const unsupportedSbomOutput = {
        analysis_info: {
          package_manager: "MAVEN",
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );
      mockSbomUtilsService.getSbomResult.mockResolvedValue(
        unsupportedSbomOutput,
      );

      const result = await service.getPatchedManifest(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(result).toEqual({});
    });

    it("should throw UnknownWorkspace for invalid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );

      await expect(
        service.getPatchedManifest(
          "org-123",
          "project-123",
          "analysis-123",
          mockUser,
          "invalid-workspace",
        ),
      ).rejects.toThrow(UnknownWorkspace);
    });
  });

  describe("getStats", () => {
    const severity = (score: number): Record<string, unknown> => ({
      Severity: score,
      SeverityType: "CVSS_V31",
      Vector: "CVSS:3.1/AV:N",
      ConfidentialityImpact: "HIGH",
      IntegrityImpact: "LOW",
      AvailabilityImpact: "NONE",
    });
    const finding = (
      id: string,
      dep: string,
      version: string,
      score: number,
    ): Record<string, unknown> => ({
      VulnerabilityId: id,
      AffectedDependency: dep,
      AffectedVersion: version,
      Severity: severity(score),
      Weaknesses: [],
    });
    const entry = (vuln: Record<string, unknown>): Record<string, unknown> => ({
      DependencyName: vuln["AffectedDependency"],
      DependencyVersion: vuln["AffectedVersion"],
      Path: [],
      Vulnerability: vuln,
    });
    const lodash = finding("CVE-2021-23337", "lodash", "4.17.4", 7.2);
    const minimist = finding("CVE-2021-44906", "minimist", "0.0.8", 9.8);
    const qs = finding("CVE-2022-24999", "qs", "6.5.1", 7.5);
    const sbom = {
      mergedSbom: {
        workspaces: {
          default: {
            dependencies: {
              lodash: { "4.17.4": { Direct: true, Transitive: false } },
              minimist: { "0.0.8": { Direct: false, Transitive: true } },
              qs: { "6.5.1": { Direct: false, Transitive: true } },
            },
          },
        },
      },
      pluginResults: [],
    };
    const patchInfo = (
      fields: Record<string, unknown>,
    ): Record<string, unknown> => ({
      TopLevelVulnerable: false,
      IsPatchable: "PARTIAL",
      Patchable: [],
      Unpatchable: [],
      Introduced: [],
      Patches: {},
      Update: {},
      ...fields,
    });
    const withPatches = (
      patches: Record<string, unknown>,
    ): Record<string, unknown> => ({
      ...mockPatchesOutput,
      workspaces: { default: { patches, dev_patches: {} } },
    });

    beforeEach(() => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockSbomUtilsService.getMergedSbomResults.mockResolvedValue(sbom);
      mockVulnerabilitiesUtilsService.getFindingsData.mockResolvedValue([
        lodash,
        minimist,
        qs,
      ]);
    });

    it("describes today's instances the way the vulnerabilities tab does", async () => {
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        withPatches({}),
      );

      const stats = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      const tab = computeVulnerabilityStats(
        [lodash, minimist, qs] as unknown as StatsFinding[],
        sbom.mergedSbom.workspaces.default.dependencies as never,
      );
      expect(stats.before_patch_number_of_issues).toBe(3);
      expect(stats.before_patch_number_of_direct_vulnerabilities).toBe(1);
      expect(stats.before_patch_number_of_transitive_vulnerabilities).toBe(2);
      expect(stats.before_patch_number_of_critical).toBe(1);
      expect(stats.before_patch_number_of_high).toBe(2);
      expect(stats.before_patch_max_severity).toBe(tab.max_severity);
      expect(stats.before_patch_mean_severity).toBe(tab.mean_severity);
      expect(stats.before_patch_overall_confidentiality_impact).toBe(
        tab.mean_confidentiality_impact,
      );
      expect(stats.before_patch_overall_integrity_impact).toBe(
        tab.mean_integrity_impact,
      );
      expect(stats.before_patch_overall_availability_impact).toBe(
        tab.mean_availability_impact,
      );
      // Nothing patched: after equals before.
      expect(stats.after_patch_number_of_issues).toBe(3);
      expect(stats.after_patch_mean_severity).toBe(tab.mean_severity);
    });

    it("drops an instance a FULL patch fixes and keeps an unpatchable one", async () => {
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        withPatches({
          "lodash@4.17.4": patchInfo({
            IsPatchable: "FULL",
            Patchable: [entry(lodash)],
          }),
          "body-parser@1.18.2": patchInfo({
            IsPatchable: "NONE",
            Unpatchable: [entry(qs)],
          }),
        }),
      );

      const stats = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(stats.before_patch_number_of_issues).toBe(3);
      expect(stats.after_patch_number_of_issues).toBe(2);
      expect(stats.after_patch_number_of_direct_vulnerabilities).toBe(0);
      expect(stats.after_patch_number_of_transitive_vulnerabilities).toBe(2);
      expect(stats.after_patch_mean_severity).toBeCloseTo((9.8 + 7.5) / 2);
    });

    it("keeps an instance that one patch fixes and another cannot", async () => {
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        withPatches({
          "a@1.0.0": patchInfo({ Patchable: [entry(qs)] }),
          "b@1.0.0": patchInfo({ Unpatchable: [entry(qs)] }),
        }),
      );

      const stats = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(stats.after_patch_number_of_issues).toBe(3);
    });

    it("adds introduced instances, without severity when they have none", async () => {
      const scored = finding("CVE-2024-0001", "debug", "4.0.0", 5.0);
      const unscored = {
        VulnerabilityId: "GHSA-aaaa-bbbb-cccc",
        AffectedDependency: "ms",
        AffectedVersion: "2.0.0",
        Severity: {
          Severity: 0,
          SeverityType: "",
          Vector: "",
          ConfidentialityImpact: "",
          IntegrityImpact: "",
          AvailabilityImpact: "",
        },
      };
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        withPatches({
          "lodash@4.17.4": patchInfo({
            Patchable: [entry(lodash)],
            Introduced: [entry(scored), entry(unscored)],
          }),
        }),
      );

      const stats = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(stats.after_patch_number_of_issues).toBe(4);
      expect(stats.after_patch_number_of_vulnerabilities).toBe(4);
      expect(stats.after_patch_number_of_medium).toBe(1);
      expect(stats.after_patch_number_of_none).toBe(1);
      // The unscored instance does not pull the mean down.
      expect(stats.after_patch_mean_severity).toBeCloseTo((9.8 + 7.5 + 5) / 3);
      expect(stats.after_patch_max_severity).toBe(9.8);
    });

    it("returns zeros for a workspace without vulnerabilities", async () => {
      mockVulnerabilitiesUtilsService.getFindingsData.mockResolvedValue([]);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );

      const stats = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(Object.values(stats).every((value) => value === 0)).toBe(true);
      expect(Object.keys(stats)).toHaveLength(30);
    });

    it("should return analysis stats for valid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );

      const result = await service.getStats(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
      );

      expect(result).toBeDefined();
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(patchingUtilsService.getPatchingResult).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("should throw UnknownWorkspace for invalid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );

      await expect(
        service.getStats(
          "org-123",
          "project-123",
          "analysis-123",
          mockUser,
          "invalid-workspace",
        ),
      ).rejects.toThrow(UnknownWorkspace);
    });

    it.each(["constructor", "__proto__", "toString"])(
      "treats the inherited key %s as an unknown workspace",
      async (workspace) => {
        mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
        mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
          mockPatchesOutput,
        );

        await expect(
          service.getStats(
            "org-123",
            "project-123",
            "analysis-123",
            mockUser,
            workspace,
          ),
        ).rejects.toThrow(UnknownWorkspace);
      },
    );

    it("should handle access check failure", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getStats(
          "org-123",
          "project-123",
          "analysis-123",
          mockUser,
          "default",
        ),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("getStatus", () => {
    it("should return status with no errors", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        mockPatchesOutput,
      );

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
        ...mockPatchesOutput,
        analysis_info: {
          ...mockPatchesOutput.analysis_info,
          public_errors: ["Public error"],
          private_errors: ["Private error"],
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        outputWithErrors,
      );

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
    });
  });
});
