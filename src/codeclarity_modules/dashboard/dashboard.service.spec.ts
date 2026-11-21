import { Test, type TestingModule } from "@nestjs/testing";
import { getDataSourceToken, getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { Organization } from "src/base_modules/organizations/organization.entity";
import {
  MembershipsRepository,
  OrganizationsRepository,
} from "src/base_modules/shared/repositories";
import { VulnerabilitiesUtilsService } from "src/codeclarity_modules/results/vulnerabilities/utils/utils.service";
import { NotAuthorized } from "src/types/error.types";

import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  let service: DashboardService;
  let membershipsRepository: jest.Mocked<MembershipsRepository>;
  let organizationRepository: jest.Mocked<Repository<Organization>>;

  const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  const mockOrgId = "test-org-id";

  const mockLicenseOrganization = {
    id: mockOrgId,
    name: "Test Organization",
    projects: [
      {
        id: "project1",
        name: "Test Project 1",
        analyses: [
          {
            id: "analysis1",
            created_on: new Date("2023-10-01"),
            results: [
              {
                id: "result1",
                plugin: "js-license",
                result: {
                  analysis_info: {
                    stats: {
                      license_dist: {
                        MIT: 50,
                        "Apache-2.0": 25,
                        "GPL-3.0": 15,
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    const mockOrganizationsRepository = {};

    const mockMembershipsRepository = {
      hasRequiredRole: jest.fn(),
    };

    const mockOrganizationRepository = {
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: OrganizationsRepository,
          useValue: mockOrganizationsRepository,
        },
        { provide: MembershipsRepository, useValue: mockMembershipsRepository },
        {
          provide: getRepositoryToken(Organization, "codeclarity"),
          useValue: mockOrganizationRepository,
        },
        { provide: getDataSourceToken("codeclarity"), useValue: {} },
        { provide: VulnerabilitiesUtilsService, useValue: {} },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    membershipsRepository = module.get(MembershipsRepository);
    organizationRepository = module.get(
      getRepositoryToken(Organization, "codeclarity"),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getOverallLicenseDist", () => {
    it("should return license distribution successfully", async () => {
      membershipsRepository.hasRequiredRole.mockResolvedValue(undefined);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockLicenseOrganization),
      };

      organizationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getOverallLicenseDist(
        mockOrgId,
        mockAuthenticatedUser,
        new Date("2023-01-01"),
        new Date("2023-12-31"),
        ["integration1"],
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("MIT");
      expect(result["Apache-2.0"]).toBeDefined();
      expect(result["GPL-3.0"]).toBeDefined();
    });

    it("adds nothing for a result stored with no license distribution", async () => {
      membershipsRepository.hasRequiredRole.mockResolvedValue(undefined);
      organizationRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          projects: [
            {
              id: "project1",
              analyses: [
                {
                  results: [
                    {
                      plugin: "license-finder",
                      result: {
                        analysis_info: { stats: { license_dist: null } },
                      },
                    },
                  ],
                },
              ],
            },
            {
              id: "project2",
              analyses: [
                {
                  results: [
                    {
                      plugin: "license-finder",
                      result: {
                        analysis_info: { stats: { license_dist: { MIT: 2 } } },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      } as any);

      const result = await service.getOverallLicenseDist(
        mockOrgId,
        mockAuthenticatedUser,
      );

      expect(result).toEqual({ MIT: 2 });
    });

    it("should return empty object when no licenses found", async () => {
      const emptyOrg = {
        ...mockLicenseOrganization,
        projects: [],
      };

      membershipsRepository.hasRequiredRole.mockResolvedValue(undefined);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(emptyOrg),
      };

      organizationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getOverallLicenseDist(
        mockOrgId,
        mockAuthenticatedUser,
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("error scenarios", () => {
    it("should handle database errors gracefully", async () => {
      membershipsRepository.hasRequiredRole.mockResolvedValue(undefined);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockRejectedValue(new Error("Database error")),
      };

      organizationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await expect(
        service.getOverallLicenseDist(mockOrgId, mockAuthenticatedUser),
      ).rejects.toThrow("Database error");
    });

    it("should handle authorization errors", async () => {
      membershipsRepository.hasRequiredRole.mockRejectedValue(
        new NotAuthorized(),
      );

      await expect(
        service.getOverallLicenseDist(mockOrgId, mockAuthenticatedUser),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should handle malformed data gracefully", async () => {
      const malformedOrg = {
        id: mockOrgId,
        projects: [
          {
            id: "project1",
            analyses: [
              {
                created_on: new Date(),
                results: [
                  {
                    plugin: "js-license",
                    result: {
                      workspaces: {}, // Empty workspaces instead of completely empty
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      membershipsRepository.hasRequiredRole.mockResolvedValue(undefined);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(malformedOrg),
      };

      organizationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getOverallLicenseDist(
        mockOrgId,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });
  });
});
