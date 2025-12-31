import { Test, type TestingModule } from "@nestjs/testing";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import type { LicenseDist } from "src/codeclarity_modules/results/sbom/sbom.types";

import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import {
  type AttackVectorDist,
  type CIAImpact,
  type GetOverallAttackVectorDistQueryOptions,
  type GetOverallCIADistQueryOptions,
  type GetOverallLicenseDistQueryOptions,
  type GetProjectsQuickStatsQueryOptions,
  type GetQuickStatsQueryOptions,
  type GetRecentVulnsQueryOptions,
  type GetWeeklySeverityInfoQueryOptions,
  type LatestVulns,
  ProjectGradeClass,
  type ProjectQuickStats,
  type QuickStats,
  type SeverityInfoByWeek,
  Trend,
} from "./dashboard.types";

describe("DashboardController", () => {
  let controller: DashboardController;
  let dashboardService: jest.Mocked<DashboardService>;

  const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  const mockOrgId = "test-org-id";

  const mockSeverityInfoByWeek: SeverityInfoByWeek[] = [
    {
      week_number: { week: 45, year: 2023 },
      nmb_critical: 5,
      nmb_high: 10,
      nmb_medium: 15,
      nmb_low: 20,
      nmb_none: 25,
      summed_severity: 75,
      projects: ["project1", "project2"],
    },
  ];

  const mockAttackVectorDist: AttackVectorDist[] = [
    { attack_vector: "NETWORK", count: 15 },
    { attack_vector: "LOCAL", count: 8 },
    { attack_vector: "PHYSICAL", count: 2 },
  ];

  const mockCIAImpact: CIAImpact[] = [
    { cia: "Confidentiality", impact: 3 },
    { cia: "Integrity", impact: 2 },
    { cia: "Availability", impact: 1 },
  ];

  const mockLicenseDist: LicenseDist = {
    MIT: 50,
    "Apache-2.0": 25,
    "GPL-3.0": 15,
    "BSD-3-Clause": 10,
  };

  const mockLatestVulns: LatestVulns = {
    vulns: {
      "CVE-2023-1234": {
        severity: 8.5,
        severity_class: "HIGH",
        cwe: "CWE-79",
        cwe_name: "Cross-site Scripting",
      },
    },
    severity_count: [
      { severity_class: "CRITICAL", count: 2 },
      { severity_class: "HIGH", count: 5 },
      { severity_class: "MEDIUM", count: 8 },
    ],
  };

  const mockQuickStats: QuickStats = {
    max_grade: {
      score: 85,
      class: ProjectGradeClass.B,
    },
    max_grade_trend: {
      trend: Trend.UP,
      diff: 5,
    },
    nmb_deprecated: 12,
    nmb_deprecated_trend: {
      trend: Trend.DOWN,
      diff: 3,
    },
    nmb_projects: 5,
    owasp_top_10: "A01",
    most_affected_cia: "Confidentiality",
  };

  const mockProjectQuickStats = {
    data: [
      {
        project: {
          id: "project1",
          name: "Test Project 1",
          provider: "github" as any,
          url: "https://github.com/test/project1",
        },
        nmb_license_compliance_violations: 2,
        nmb_vulnerabilities: 15,
        nmb_deprecated: 3,
        nmb_outdated: 8,
        sum_severity: 45.5,
        avg_severity: 3.0,
        grade: {
          score: 78,
          class: ProjectGradeClass.C_PLUS,
        },
      },
    ] as ProjectQuickStats[],
    page: 0,
    entry_count: 1,
    entries_per_page: 10,
    total_entries: 1,
    total_pages: 1,
    matching_count: 1,
    filter_count: {},
  };

  beforeEach(async () => {
    const mockDashboardService = {
      getWeeklySeverityInfo: jest.fn(),
      getOverallAttackVectorDist: jest.fn(),
      getOverallCIAImpact: jest.fn(),
      getOverallLicenseDist: jest.fn(),
      getRecentVuls: jest.fn(),
      getQuickStats: jest.fn(),
      getProjectsQuickStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    dashboardService = module.get(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getWeeklySeverityInfo", () => {
    it("should return weekly severity info successfully", async () => {
      const queryParams: GetWeeklySeverityInfoQueryOptions = {
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
        integrationIds: ["integration1"],
      };

      dashboardService.getWeeklySeverityInfo.mockResolvedValue(
        mockSeverityInfoByWeek,
      );

      const result = await controller.getWeeklySeverityInfo(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual({ data: mockSeverityInfoByWeek });
      expect(dashboardService.getWeeklySeverityInfo).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
      );
    });

    it("should handle empty query params", async () => {
      const queryParams: GetWeeklySeverityInfoQueryOptions = {};

      dashboardService.getWeeklySeverityInfo.mockResolvedValue(
        mockSeverityInfoByWeek,
      );

      const result = await controller.getWeeklySeverityInfo(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual({ data: mockSeverityInfoByWeek });
      expect(dashboardService.getWeeklySeverityInfo).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe("getOverallAttackVectorDist", () => {
    it("should return attack vector distribution successfully", async () => {
      const queryParams: GetOverallAttackVectorDistQueryOptions = {
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
        integrationIds: ["integration1"],
      };

      dashboardService.getOverallAttackVectorDist.mockResolvedValue(
        mockAttackVectorDist,
      );

      const result = await controller.getOverallAttackVectorDist(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual({ data: mockAttackVectorDist });
      expect(dashboardService.getOverallAttackVectorDist).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
      );
    });
  });

  describe("getOverallCIAImpact", () => {
    it("should return CIA impact distribution successfully", async () => {
      const queryParams: GetOverallCIADistQueryOptions = {
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
        integrationIds: ["integration1"],
      };

      dashboardService.getOverallCIAImpact.mockResolvedValue(mockCIAImpact);

      const result = await controller.getOverallCIAImpact(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual({ data: mockCIAImpact });
      expect(dashboardService.getOverallCIAImpact).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
      );
    });
  });

  describe("getOverallLicenseDist", () => {
    it("should return license distribution successfully", async () => {
      const queryParams: GetOverallLicenseDistQueryOptions = {
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
        integrationIds: ["integration1"],
      };

      dashboardService.getOverallLicenseDist.mockResolvedValue(mockLicenseDist);

      const result = await controller.getOverallLicenseDist(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual({ data: mockLicenseDist });
      expect(dashboardService.getOverallLicenseDist).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
      );
    });
  });

  describe("getRecentVuls", () => {
    it("should return recent vulnerabilities successfully", async () => {
      const queryParams: GetRecentVulnsQueryOptions = {
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
        integrationIds: ["integration1"],
      };

      dashboardService.getRecentVuls.mockResolvedValue(mockLatestVulns);

      const result = await controller.getRecentVuls(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual({ data: mockLatestVulns });
      expect(dashboardService.getRecentVuls).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
      );
    });
  });

  describe("getQuickStats", () => {
    it("should return quick stats successfully", async () => {
      const queryParams: GetQuickStatsQueryOptions = {
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
        integrationIds: ["integration1"],
      };

      dashboardService.getQuickStats.mockResolvedValue(mockQuickStats);

      const result = await controller.getQuickStats(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual({ data: mockQuickStats });
      expect(dashboardService.getQuickStats).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
      );
    });
  });

  describe("getProjectsQuickStats", () => {
    it("should return project quick stats successfully", async () => {
      const queryParams: GetProjectsQuickStatsQueryOptions = {
        page: 0,
        entries_per_page: 10,
        sort_key: "project_name",
        sort_direction: "ASC" as any,
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-12-31"),
        integrationIds: ["integration1"],
      };

      dashboardService.getProjectsQuickStats.mockResolvedValue(
        mockProjectQuickStats,
      );

      const result = await controller.getProjectsQuickStats(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual(mockProjectQuickStats);
      expect(dashboardService.getProjectsQuickStats).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        {
          currentPage: queryParams.page,
          entriesPerPage: queryParams.entries_per_page,
        },
        queryParams.startDate,
        queryParams.endDate,
        queryParams.integrationIds,
        queryParams.sort_key,
        queryParams.sort_direction,
      );
    });

    it("should handle missing pagination parameters", async () => {
      const queryParams = {
        sort_key: "project_name",
        page: 0,
        entries_per_page: 10,
      } as GetProjectsQuickStatsQueryOptions;

      dashboardService.getProjectsQuickStats.mockResolvedValue(
        mockProjectQuickStats,
      );

      const result = await controller.getProjectsQuickStats(
        mockAuthenticatedUser,
        mockOrgId,
        queryParams,
      );

      expect(result).toEqual(mockProjectQuickStats);
      expect(dashboardService.getProjectsQuickStats).toHaveBeenCalledWith(
        mockOrgId,
        mockAuthenticatedUser,
        { currentPage: 0, entriesPerPage: 10 },
        undefined,
        undefined,
        undefined,
        queryParams.sort_key,
        undefined,
      );
    });
  });

  describe("error handling", () => {
    it("should propagate service errors for getWeeklySeverityInfo", async () => {
      const queryParams: GetWeeklySeverityInfoQueryOptions = {};
      const error = new Error("Service error");

      dashboardService.getWeeklySeverityInfo.mockRejectedValue(error);

      await expect(
        controller.getWeeklySeverityInfo(
          mockAuthenticatedUser,
          mockOrgId,
          queryParams,
        ),
      ).rejects.toThrow("Service error");
    });

    it("should propagate service errors for getOverallAttackVectorDist", async () => {
      const queryParams: GetOverallAttackVectorDistQueryOptions = {};
      const error = new Error("Service error");

      dashboardService.getOverallAttackVectorDist.mockRejectedValue(error);

      await expect(
        controller.getOverallAttackVectorDist(
          mockAuthenticatedUser,
          mockOrgId,
          queryParams,
        ),
      ).rejects.toThrow("Service error");
    });

    it("should propagate service errors for getProjectsQuickStats", async () => {
      const queryParams = {
        sort_key: "test",
        page: 0,
        entries_per_page: 10,
      } as GetProjectsQuickStatsQueryOptions;
      const error = new Error("Service error");

      dashboardService.getProjectsQuickStats.mockRejectedValue(error);

      await expect(
        controller.getProjectsQuickStats(
          mockAuthenticatedUser,
          mockOrgId,
          queryParams,
        ),
      ).rejects.toThrow("Service error");
    });
  });
});
