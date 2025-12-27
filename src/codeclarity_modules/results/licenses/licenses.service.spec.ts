import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { LicenseRepository } from "src/codeclarity_modules/knowledge/license/license.repository";
import { UnknownWorkspace } from "src/types/error.types";
import { Result } from "../result.entity";
import { AnalysisResultsService } from "../results.service";
import { SbomUtilsService } from "../sbom/utils/utils";
import { LicensesService } from "./licenses.service";
import { LicensesUtilsService } from "./utils/utils";

describe("LicensesService", () => {
  let service: LicensesService;
  let analysisResultsService: AnalysisResultsService;
  let licensesUtilsService: LicensesUtilsService;
  let sbomUtilsService: SbomUtilsService;

  const mockUser = new AuthenticatedUser("user-123", [ROLE.USER], true);

  const mockLicensesOutput = {
    workspaces: {
      default: {
        LicensesDepMap: {
          MIT: ["package1@1.0.0", "package2@2.0.0"],
          "Apache-2.0": ["package3@3.0.0"],
        },
        NonSpdxLicensesDepMap: {
          Custom: ["package4@4.0.0"],
        },
        LicenseComplianceViolations: ["GPL-3.0"],
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

  const mockLicenseData = {
    details: {
      name: "MIT License",
      description: "MIT License Description",
      classification: "Permissive",
      licenseProperties: ["commercial-use", "modifications"],
      seeAlso: ["https://opensource.org/licenses/MIT"],
    },
  };

  const mockAnalysisResultsService = {
    checkAccess: jest.fn(),
  };

  const mockLicenseRepository = {
    getLicenseData: jest.fn(),
  };

  const mockLicensesUtilsService = {
    getLicensesResult: jest.fn(),
  };

  const mockSbomUtilsService = {
    getSbomResult: jest.fn(),
  };

  const mockResultRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensesService,
        {
          provide: AnalysisResultsService,
          useValue: mockAnalysisResultsService,
        },
        {
          provide: LicenseRepository,
          useValue: mockLicenseRepository,
        },
        {
          provide: LicensesUtilsService,
          useValue: mockLicensesUtilsService,
        },
        {
          provide: SbomUtilsService,
          useValue: mockSbomUtilsService,
        },
        {
          provide: getRepositoryToken(Result, "codeclarity"),
          useValue: mockResultRepository,
        },
      ],
    }).compile();

    service = module.get<LicensesService>(LicensesService);
    analysisResultsService = module.get<AnalysisResultsService>(
      AnalysisResultsService,
    );
    licensesUtilsService =
      module.get<LicensesUtilsService>(LicensesUtilsService);
    sbomUtilsService = module.get<SbomUtilsService>(SbomUtilsService);

    jest.clearAllMocks();
  });

  describe("getLicensesUsed", () => {
    it("should return paginated licenses data", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockLicensesUtilsService.getLicensesResult.mockResolvedValue(
        mockLicensesOutput,
      );
      mockLicenseRepository.getLicenseData.mockResolvedValue(mockLicenseData);

      const result = await service.getLicensesUsed(
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
      expect(licensesUtilsService.getLicensesResult).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("should handle active filters", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockLicensesUtilsService.getLicensesResult.mockResolvedValue(
        mockLicensesOutput,
      );
      mockLicenseRepository.getLicenseData.mockResolvedValue(mockLicenseData);

      const result = await service.getLicensesUsed(
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
          activeFilters: "[MIT,Apache-2.0]",
          searchKey: "test",
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

    it("should throw error when checkAccess fails", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getLicensesUsed(
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
        ),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("getDependenciesUsingLicense", () => {
    it("should return dependencies using specific license", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockLicensesUtilsService.getLicensesResult.mockResolvedValue(
        mockLicensesOutput,
      );
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      // Mock the getDependencyVersions method to avoid "Not implemented" error
      jest.spyOn(service as any, "getDependencyVersions").mockResolvedValue({});

      const result = await service.getDependenciesUsingLicense(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
        "default",
        "MIT",
      );

      expect(result).toBeDefined();
      expect(analysisResultsService.checkAccess).toHaveBeenCalledWith(
        "org-123",
        "project-123",
        "analysis-123",
        mockUser,
      );
      expect(licensesUtilsService.getLicensesResult).toHaveBeenCalledWith(
        "analysis-123",
      );
      expect(sbomUtilsService.getSbomResult).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("should throw UnknownWorkspace error for invalid workspace", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockLicensesUtilsService.getLicensesResult.mockResolvedValue(
        mockLicensesOutput,
      );
      mockSbomUtilsService.getSbomResult.mockResolvedValue(mockSbomOutput);

      await expect(
        service.getDependenciesUsingLicense(
          "org-123",
          "project-123",
          "analysis-123",
          mockUser,
          "invalid-workspace",
          "MIT",
        ),
      ).rejects.toThrow(UnknownWorkspace);
    });

    it("should handle access check failure", async () => {
      const accessError = new Error("Access denied");
      mockAnalysisResultsService.checkAccess.mockRejectedValue(accessError);

      await expect(
        service.getDependenciesUsingLicense(
          "org-123",
          "project-123",
          "analysis-123",
          mockUser,
          "default",
          "MIT",
        ),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("getStatus", () => {
    it("should return status with no errors", async () => {
      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockLicensesUtilsService.getLicensesResult.mockResolvedValue(
        mockLicensesOutput,
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

    it("should return status with errors", async () => {
      const outputWithErrors = {
        ...mockLicensesOutput,
        analysis_info: {
          ...mockLicensesOutput.analysis_info,
          public_errors: ["Public error"],
          private_errors: ["Private error"],
        },
      };

      mockAnalysisResultsService.checkAccess.mockResolvedValue(undefined);
      mockLicensesUtilsService.getLicensesResult.mockResolvedValue(
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

  describe("getDependencyVersions (private method)", () => {
    it("should return dependency versions data", async () => {
      // Access private method through reflection for testing
      const getDependencyVersions = (service as any).getDependencyVersions;

      const result = await getDependencyVersions.call(service, [
        "package:1.0.0",
      ]);
      expect(result).toEqual(
        expect.objectContaining({
          "package:1.0.0": expect.objectContaining({
            version: "1.0.0",
            dependencies: expect.any(Object),
            dev_dependencies: expect.any(Object),
          }),
        }),
      );
    });
  });
});
