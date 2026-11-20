import { Test, type TestingModule } from "@nestjs/testing";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import type { LicenseDist } from "src/codeclarity_modules/results/sbom/sbom.types";

import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import {
  type CIAImpact,
  type GetOverallCIADistQueryOptions,
  type GetOverallLicenseDistQueryOptions,
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

  beforeEach(async () => {
    const mockDashboardService = {
      getOverallCIAImpact: jest.fn(),
      getOverallLicenseDist: jest.fn(),
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
});
