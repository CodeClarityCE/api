import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { UnknownWorkspace, Unsupported } from "src/types/error.types";

import { Result } from "../result.entity";
import { AnalysisResultsService } from "../results.service";
import { SbomUtilsService } from "../sbom/utils/utils";
import { VulnerabilitiesUtilsService } from "../vulnerabilities/utils/utils.service";

import { PatchingService } from "./patching.service";
import { PatchingUtilsService } from "./utils/utils";

describe("PatchingService", () => {
  let service: PatchingService;
  let analysisResultsService: AnalysisResultsService;
  let patchingUtilsService: PatchingUtilsService;

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

  const mockAnalysisResultsService = {
    checkAccess: jest.fn(),
  };

  const mockPatchingUtilsService = {
    getPatchingResult: jest.fn(),
  };

  const mockSbomUtilsService = {
    getSbomResult: jest.fn(),
  };

  const mockVulnerabilitiesUtilsService = {
    getVulnsResult: jest.fn(),
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
    const semver = (version: string): Record<string, unknown> => {
      const [Major, Minor, Patch] = version.split(".").map(Number);
      return { Major, Minor, Patch, PreReleaseTag: "", MetaData: "" };
    };
    const patch = (
      IsPatchable: string,
      update: string,
      PotentiallyBreaking = false,
    ): Record<string, unknown> => ({
      TopLevelVulnerable: true,
      IsPatchable,
      Patchable: [],
      Unpatchable: [],
      Introduced: [],
      Patches: {},
      Update: semver(update),
      PotentiallyBreaking,
    });
    const patchesOutput = {
      ...mockPatchesOutput,
      workspaces: {
        ".": {
          patches: {
            "lodash@4.17.4": patch("FULL", "4.17.21"),
            "axios@0.18.0": patch("NONE", "0.0.0"),
          },
          dev_patches: {
            "mocha@5.2.0": patch("PARTIAL", "10.2.0", true),
          },
        },
      },
    };
    const sbom = (packageManager: string): Record<string, unknown> => ({
      workspaces: {
        ".": {
          dependencies: {},
          start: {
            dependencies: [
              { name: "lodash", version: "4.17.4", constraint: "^4.17.4" },
              { name: "axios", version: "0.18.0", constraint: "0.18.0" },
              { name: "express", version: "4.18.2", constraint: "~4.18.0" },
            ],
            dev_dependencies: [
              { name: "mocha", version: "5.2.0", constraint: "5.2.0" },
            ],
          },
        },
      },
      analysis_info: {
        package_manager: packageManager,
        working_directory: "/private/org/projects/p/main",
        lock_file_path: "/private/org/projects/p/main/package-lock.json",
      },
    });
    const manifest = (): ReturnType<PatchingService["getPatchedManifest"]> =>
      service.getPatchedManifest(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        ".",
      );

    beforeEach(() => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockPatchingUtilsService.getPatchingResult.mockResolvedValue(
        patchesOutput,
      );
    });

    it("lists each npm direct dependency with its upgrade", async () => {
      mockSbomUtilsService.getSbomResult.mockResolvedValue(sbom("NPM"));

      const result = await manifest();

      expect(result.patched_manifest.dependencies).toEqual({
        lodash: {
          original_constraint: "^4.17.4",
          vulnerable: true,
          patch_type: "FULL",
          upgrade_to: "4.17.21",
          potential_breaking_changes: false,
        },
        axios: {
          original_constraint: "0.18.0",
          vulnerable: true,
          patch_type: "NONE",
          upgrade_to: null,
          potential_breaking_changes: false,
        },
        express: {
          original_constraint: "~4.18.0",
          vulnerable: false,
          patch_type: null,
          upgrade_to: null,
          potential_breaking_changes: false,
        },
      });
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
    });

    it("lists dev dependencies with their own patches", async () => {
      mockSbomUtilsService.getSbomResult.mockResolvedValue(sbom("YARN"));

      const result = await manifest();

      expect(result.patched_manifest.devDependencies).toEqual({
        mocha: {
          original_constraint: "5.2.0",
          vulnerable: true,
          patch_type: "PARTIAL",
          upgrade_to: "10.2.0",
          potential_breaking_changes: true,
        },
      });
    });

    it("writes the upgraded dependency blocks as JSON text", async () => {
      mockSbomUtilsService.getSbomResult.mockResolvedValue(sbom("PNPM"));

      const result = await manifest();

      expect(JSON.parse(result.patched_manifest_raw)).toEqual({
        dependencies: {
          lodash: "^4.17.21",
          axios: "0.18.0",
          express: "~4.18.0",
        },
        devDependencies: { mocha: "10.2.0" },
      });
    });

    it("names the manifest relative to the project and no server path", async () => {
      mockSbomUtilsService.getSbomResult.mockResolvedValue(sbom("NPM"));

      const result = await manifest();

      expect(result.other_info).toEqual({
        package_manager: "NPM",
        relative_package_file: "package.json",
      });
      expect(JSON.stringify(result)).not.toContain("/private/");
    });

    it("refuses an unsupported package manager", async () => {
      mockSbomUtilsService.getSbomResult.mockResolvedValue(sbom("MAVEN"));

      await expect(manifest()).rejects.toThrow(Unsupported);
    });

    it("should throw UnknownWorkspace for invalid workspace", async () => {
      mockSbomUtilsService.getSbomResult.mockResolvedValue(sbom("NPM"));

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
