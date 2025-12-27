import { Test, type TestingModule } from "@nestjs/testing";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { PolicyType, type Policy, type PolicyFrontend } from "../policy.entity";
import { LicensePolicyController } from "./license.controller";
import { LicensePolicyService } from "./license.service";
import {
  type LicensePolicyCreateBody,
  type LicensePolicyPatchBody,
  LicensePolicyType,
} from "./licensePolicy.types";

describe("LicensePolicyController", () => {
  let controller: LicensePolicyController;
  let licensePolicyService: LicensePolicyService;

  const mockUser = new AuthenticatedUser("user-123", [ROLE.USER], true);

  const mockCreateBody: LicensePolicyCreateBody = {
    name: "Test License Policy",
    description: "Test policy description",
    type: LicensePolicyType.WHITELIST,
    licenses: ["MIT", "Apache-2.0"],
    default: false,
  };

  const mockPatchBody: LicensePolicyPatchBody = {
    name: "Updated License Policy",
    description: "Updated description",
  };

  const mockPolicy: Policy = {
    id: "policy-123",
    name: "Test License Policy",
    description: "Test policy description",
    policy_type: PolicyType.LICENSE_POLICY,
    default: false,
    content: ["MIT", "Apache-2.0"],
    created_on: new Date("2024-01-01"),
    created_by: {
      id: "user-123",
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
    } as any,
    organizations: [],
    analyses: [],
  } as Policy;

  const mockPolicyFrontend: PolicyFrontend = {
    id: "policy-123",
    name: "Test License Policy",
    description: "Test policy description",
    default: false,
    content: ["MIT", "Apache-2.0"],
    created_on: new Date("2024-01-01"),
    created_by: "user-123",
    policy_type: PolicyType.LICENSE_POLICY,
  };

  const mockPaginatedResponse = {
    data: [mockPolicyFrontend],
    page: 0,
    entry_count: 1,
    entries_per_page: 10,
    total_entries: 1,
    total_pages: 1,
    matching_count: 1,
    filter_count: {},
  };

  const mockLicensePolicyService = {
    create: jest.fn(),
    get: jest.fn(),
    getMany: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LicensePolicyController],
      providers: [
        {
          provide: LicensePolicyService,
          useValue: mockLicensePolicyService,
        },
      ],
    }).compile();

    controller = module.get<LicensePolicyController>(LicensePolicyController);
    licensePolicyService =
      module.get<LicensePolicyService>(LicensePolicyService);

    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create a license policy", async () => {
      mockLicensePolicyService.create.mockResolvedValue("policy-123");

      const result = await controller.create(
        mockUser,
        "org-123",
        mockCreateBody,
      );

      expect(result).toEqual({ id: "policy-123" });
      expect(licensePolicyService.create).toHaveBeenCalledWith(
        "org-123",
        mockCreateBody,
        mockUser,
      );
    });

    it("should handle service errors during creation", async () => {
      const error = new Error("Creation failed");
      mockLicensePolicyService.create.mockRejectedValue(error);

      await expect(
        controller.create(mockUser, "org-123", mockCreateBody),
      ).rejects.toThrow("Creation failed");

      expect(licensePolicyService.create).toHaveBeenCalledWith(
        "org-123",
        mockCreateBody,
        mockUser,
      );
    });

    it("should handle whitelist policy creation", async () => {
      const whitelistCreateBody = {
        ...mockCreateBody,
        type: LicensePolicyType.WHITELIST,
      };
      mockLicensePolicyService.create.mockResolvedValue("policy-456");

      const result = await controller.create(
        mockUser,
        "org-123",
        whitelistCreateBody,
      );

      expect(result).toEqual({ id: "policy-456" });
      expect(licensePolicyService.create).toHaveBeenCalledWith(
        "org-123",
        whitelistCreateBody,
        mockUser,
      );
    });

    it("should handle blacklist policy creation", async () => {
      const blacklistCreateBody = {
        ...mockCreateBody,
        type: LicensePolicyType.BLACKLIST,
        licenses: ["GPL-3.0", "AGPL-3.0"],
      };
      mockLicensePolicyService.create.mockResolvedValue("policy-789");

      const result = await controller.create(
        mockUser,
        "org-123",
        blacklistCreateBody,
      );

      expect(result).toEqual({ id: "policy-789" });
      expect(licensePolicyService.create).toHaveBeenCalledWith(
        "org-123",
        blacklistCreateBody,
        mockUser,
      );
    });
  });

  describe("get", () => {
    it("should return a license policy", async () => {
      mockLicensePolicyService.get.mockResolvedValue(mockPolicy);

      const result = await controller.get(mockUser, "org-123", "policy-123");

      expect(result).toEqual({ data: mockPolicy });
      expect(licensePolicyService.get).toHaveBeenCalledWith(
        "org-123",
        "policy-123",
        mockUser,
      );
    });

    it("should handle service errors during retrieval", async () => {
      const error = new Error("Policy not found");
      mockLicensePolicyService.get.mockRejectedValue(error);

      await expect(
        controller.get(mockUser, "org-123", "policy-123"),
      ).rejects.toThrow("Policy not found");

      expect(licensePolicyService.get).toHaveBeenCalledWith(
        "org-123",
        "policy-123",
        mockUser,
      );
    });

    it("should handle different organization and policy IDs", async () => {
      mockLicensePolicyService.get.mockResolvedValue(mockPolicy);

      await controller.get(mockUser, "org-456", "policy-789");

      expect(licensePolicyService.get).toHaveBeenCalledWith(
        "org-456",
        "policy-789",
        mockUser,
      );
    });
  });

  describe("getMany", () => {
    it("should return paginated license policies", async () => {
      mockLicensePolicyService.getMany.mockResolvedValue(mockPaginatedResponse);

      const result = await controller.getMany(mockUser, "org-123", 0, 10);

      expect(result).toEqual(mockPaginatedResponse);
      expect(licensePolicyService.getMany).toHaveBeenCalledWith(
        "org-123",
        { currentPage: 0, entriesPerPage: 10 },
        mockUser,
      );
    });

    it("should handle default pagination parameters", async () => {
      mockLicensePolicyService.getMany.mockResolvedValue(mockPaginatedResponse);

      const result = await controller.getMany(mockUser, "org-123");

      expect(result).toEqual(mockPaginatedResponse);
      expect(licensePolicyService.getMany).toHaveBeenCalledWith(
        "org-123",
        { currentPage: undefined, entriesPerPage: undefined },
        mockUser,
      );
    });

    it("should handle service errors during getMany", async () => {
      const error = new Error("Database error");
      mockLicensePolicyService.getMany.mockRejectedValue(error);

      await expect(
        controller.getMany(mockUser, "org-123", 0, 10),
      ).rejects.toThrow("Database error");

      expect(licensePolicyService.getMany).toHaveBeenCalledWith(
        "org-123",
        { currentPage: 0, entriesPerPage: 10 },
        mockUser,
      );
    });

    it("should handle different pagination parameters", async () => {
      const paginatedResponse = {
        ...mockPaginatedResponse,
        page: 2,
        entries_per_page: 25,
      };
      mockLicensePolicyService.getMany.mockResolvedValue(paginatedResponse);

      const result = await controller.getMany(mockUser, "org-123", 2, 25);

      expect(result).toEqual(paginatedResponse);
      expect(licensePolicyService.getMany).toHaveBeenCalledWith(
        "org-123",
        { currentPage: 2, entriesPerPage: 25 },
        mockUser,
      );
    });
  });

  describe("update", () => {
    it("should update a license policy", async () => {
      mockLicensePolicyService.update.mockResolvedValue(undefined);

      const result = await controller.update(
        mockUser,
        "org-123",
        "policy-123",
        mockPatchBody,
      );

      expect(result).toEqual({});
      expect(licensePolicyService.update).toHaveBeenCalledWith(
        "org-123",
        "policy-123",
        mockPatchBody,
        mockUser,
      );
    });

    it("should handle service errors during update", async () => {
      const error = new Error("Update failed");
      mockLicensePolicyService.update.mockRejectedValue(error);

      await expect(
        controller.update(mockUser, "org-123", "policy-123", mockPatchBody),
      ).rejects.toThrow("Update failed");

      expect(licensePolicyService.update).toHaveBeenCalledWith(
        "org-123",
        "policy-123",
        mockPatchBody,
        mockUser,
      );
    });

    it("should return empty object on successful update", async () => {
      mockLicensePolicyService.update.mockResolvedValue(undefined);

      const result = await controller.update(
        mockUser,
        "org-123",
        "policy-123",
        mockPatchBody,
      );

      expect(result).toEqual({});
    });

    it("should handle partial patch body", async () => {
      const partialPatchBody = { name: "Only name updated" };
      mockLicensePolicyService.update.mockResolvedValue(undefined);

      await controller.update(
        mockUser,
        "org-123",
        "policy-123",
        partialPatchBody,
      );

      expect(licensePolicyService.update).toHaveBeenCalledWith(
        "org-123",
        "policy-123",
        partialPatchBody,
        mockUser,
      );
    });
  });

  describe("remove", () => {
    it("should remove a license policy", async () => {
      mockLicensePolicyService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(mockUser, "org-123", "policy-123");

      expect(result).toEqual({});
      expect(licensePolicyService.remove).toHaveBeenCalledWith(
        "org-123",
        "policy-123",
        mockUser,
      );
    });

    it("should handle service errors during removal", async () => {
      const error = new Error("Removal failed");
      mockLicensePolicyService.remove.mockRejectedValue(error);

      await expect(
        controller.remove(mockUser, "org-123", "policy-123"),
      ).rejects.toThrow("Removal failed");

      expect(licensePolicyService.remove).toHaveBeenCalledWith(
        "org-123",
        "policy-123",
        mockUser,
      );
    });

    it("should return empty object on successful removal", async () => {
      mockLicensePolicyService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(mockUser, "org-123", "policy-123");

      expect(result).toEqual({});
    });

    it("should handle different organization and policy IDs", async () => {
      mockLicensePolicyService.remove.mockResolvedValue(undefined);

      await controller.remove(mockUser, "org-789", "policy-456");

      expect(licensePolicyService.remove).toHaveBeenCalledWith(
        "org-789",
        "policy-456",
        mockUser,
      );
    });
  });
});
