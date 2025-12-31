import { Test, type TestingModule } from "@nestjs/testing";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";

import type { Analyzer } from "./analyzer.entity";
import type { AnalyzerCreateBody } from "./analyzer.types";
import { AnalyzerTemplatesService } from "./analyzer-templates.service";
import { AnalyzersController } from "./analyzers.controller";
import { AnalyzersService } from "./analyzers.service";

describe("AnalyzersController", () => {
  let controller: AnalyzersController;
  let analyzersService: jest.Mocked<AnalyzersService>;

  const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
    "test-user-id",
    [ROLE.USER],
    true,
  );

  const mockAnalyzer: Analyzer = {
    id: "test-analyzer-id",
    name: "Test Analyzer",
    global: false,
    description: "Test analyzer description",
    created_on: new Date(),
    steps: [
      [
        {
          name: "test-stage",
          version: "1.0.0",
          config: {},
        },
      ],
    ],
    supported_languages: ["javascript"],
    language_config: {
      javascript: { plugins: ["test-plugin"] },
    },
    logo: "js",
    analyses: [] as any,
    organization: {} as any,
    created_by: {} as any,
  };

  const mockAnalyzerCreateBody: AnalyzerCreateBody = {
    name: "Test Analyzer",
    description: "Test analyzer description",
    steps: [
      [
        {
          name: "test-stage",
          version: "1.0.0",
          config: {},
          persistant_config: {},
        },
      ],
    ],
  };

  beforeEach(async () => {
    const mockAnalyzersService = {
      create: jest.fn(),
      getMany: jest.fn(),
      getByName: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockAnalyzerTemplatesService = {
      getTemplates: jest.fn(),
      createTemplate: jest.fn(),
      updateTemplate: jest.fn(),
      deleteTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyzersController],
      providers: [
        { provide: AnalyzersService, useValue: mockAnalyzersService },
        {
          provide: AnalyzerTemplatesService,
          useValue: mockAnalyzerTemplatesService,
        },
      ],
    }).compile();

    controller = module.get<AnalyzersController>(AnalyzersController);
    analyzersService = module.get(AnalyzersService);
  });

  describe("constructor", () => {
    it("should be defined", () => {
      expect(controller).toBeDefined();
    });
  });

  describe("create", () => {
    it("should create an analyzer successfully", async () => {
      const orgId = "test-org-id";
      const analyzerId = "new-analyzer-id";

      analyzersService.create.mockResolvedValue(analyzerId);

      const result = await controller.create(
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
        orgId,
      );

      expect(analyzersService.create).toHaveBeenCalledWith(
        orgId,
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ id: analyzerId });
    });

    it("should propagate service errors", async () => {
      const orgId = "test-org-id";
      const error = new Error("Service error");

      analyzersService.create.mockRejectedValue(error);

      await expect(
        controller.create(mockAnalyzerCreateBody, mockAuthenticatedUser, orgId),
      ).rejects.toThrow("Service error");

      expect(analyzersService.create).toHaveBeenCalledWith(
        orgId,
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
      );
    });

    it("should handle empty org_id", async () => {
      const orgId = "";
      const analyzerId = "new-analyzer-id";

      analyzersService.create.mockResolvedValue(analyzerId);

      const result = await controller.create(
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
        orgId,
      );

      expect(analyzersService.create).toHaveBeenCalledWith(
        orgId,
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ id: analyzerId });
    });
  });

  describe("getMany", () => {
    it("should get multiple analyzers with pagination", async () => {
      const orgId = "test-org-id";
      const page = 1;
      const entriesPerPage = 10;
      const mockResponse = {
        data: [mockAnalyzer],
        page: page,
        entry_count: 1,
        entries_per_page: entriesPerPage,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      };

      analyzersService.getMany.mockResolvedValue(mockResponse);

      const result = await controller.getMany(
        mockAuthenticatedUser,
        orgId,
        page,
        entriesPerPage,
      );

      expect(analyzersService.getMany).toHaveBeenCalledWith(
        orgId,
        { currentPage: page, entriesPerPage: entriesPerPage },
        mockAuthenticatedUser,
      );
      expect(result).toEqual(mockResponse);
    });

    it("should get analyzers with default pagination", async () => {
      const orgId = "test-org-id";
      const mockResponse = {
        data: [mockAnalyzer],
        page: 0,
        entry_count: 1,
        entries_per_page: 0,
        total_entries: 1,
        total_pages: 1,
        matching_count: 1,
        filter_count: {},
      };

      analyzersService.getMany.mockResolvedValue(mockResponse);

      const result = await controller.getMany(mockAuthenticatedUser, orgId);

      expect(analyzersService.getMany).toHaveBeenCalledWith(
        orgId,
        { currentPage: undefined, entriesPerPage: undefined },
        mockAuthenticatedUser,
      );
      expect(result).toEqual(mockResponse);
    });

    it("should propagate service errors", async () => {
      const orgId = "test-org-id";
      const error = new Error("Service error");

      analyzersService.getMany.mockRejectedValue(error);

      await expect(
        controller.getMany(mockAuthenticatedUser, orgId),
      ).rejects.toThrow("Service error");
    });
  });

  describe("getByName", () => {
    it("should get analyzer by name successfully", async () => {
      const orgId = "test-org-id";
      const analyzerName = "Test Analyzer";

      analyzersService.getByName.mockResolvedValue(mockAnalyzer);

      const result = await controller.getByName(
        mockAuthenticatedUser,
        orgId,
        analyzerName,
      );

      expect(analyzersService.getByName).toHaveBeenCalledWith(
        orgId,
        analyzerName,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ data: mockAnalyzer });
    });

    it("should propagate service errors", async () => {
      const orgId = "test-org-id";
      const analyzerName = "Test Analyzer";
      const error = new Error("Service error");

      analyzersService.getByName.mockRejectedValue(error);

      await expect(
        controller.getByName(mockAuthenticatedUser, orgId, analyzerName),
      ).rejects.toThrow("Service error");

      expect(analyzersService.getByName).toHaveBeenCalledWith(
        orgId,
        analyzerName,
        mockAuthenticatedUser,
      );
    });

    it("should handle empty analyzer name", async () => {
      const orgId = "test-org-id";
      const analyzerName = "";

      analyzersService.getByName.mockResolvedValue(mockAnalyzer);

      const result = await controller.getByName(
        mockAuthenticatedUser,
        orgId,
        analyzerName,
      );

      expect(analyzersService.getByName).toHaveBeenCalledWith(
        orgId,
        analyzerName,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ data: mockAnalyzer });
    });
  });

  describe("get", () => {
    it("should get analyzer by id successfully", async () => {
      const orgId = "test-org-id";
      const analyzerId = "test-analyzer-id";

      analyzersService.get.mockResolvedValue(mockAnalyzer);

      const result = await controller.get(
        mockAuthenticatedUser,
        analyzerId,
        orgId,
      );

      expect(analyzersService.get).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ data: mockAnalyzer });
    });

    it("should propagate service errors", async () => {
      const orgId = "test-org-id";
      const analyzerId = "test-analyzer-id";
      const error = new Error("Service error");

      analyzersService.get.mockRejectedValue(error);

      await expect(
        controller.get(mockAuthenticatedUser, analyzerId, orgId),
      ).rejects.toThrow("Service error");

      expect(analyzersService.get).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAuthenticatedUser,
      );
    });

    it("should handle empty analyzer id", async () => {
      const orgId = "test-org-id";
      const analyzerId = "";

      analyzersService.get.mockResolvedValue(mockAnalyzer);

      const result = await controller.get(
        mockAuthenticatedUser,
        analyzerId,
        orgId,
      );

      expect(analyzersService.get).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({ data: mockAnalyzer });
    });
  });

  describe("update", () => {
    it("should update analyzer successfully", async () => {
      const orgId = "test-org-id";
      const analyzerId = "test-analyzer-id";

      analyzersService.update.mockResolvedValue(undefined);

      const result = await controller.update(
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
        analyzerId,
        orgId,
      );

      expect(analyzersService.update).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });

    it("should propagate service errors", async () => {
      const orgId = "test-org-id";
      const analyzerId = "test-analyzer-id";
      const error = new Error("Service error");

      analyzersService.update.mockRejectedValue(error);

      await expect(
        controller.update(
          mockAnalyzerCreateBody,
          mockAuthenticatedUser,
          analyzerId,
          orgId,
        ),
      ).rejects.toThrow("Service error");

      expect(analyzersService.update).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
      );
    });

    it("should handle empty ids", async () => {
      const orgId = "";
      const analyzerId = "";

      analyzersService.update.mockResolvedValue(undefined);

      const result = await controller.update(
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
        analyzerId,
        orgId,
      );

      expect(analyzersService.update).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAnalyzerCreateBody,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });
  });

  describe("delete", () => {
    it("should delete analyzer successfully", async () => {
      const orgId = "test-org-id";
      const analyzerId = "test-analyzer-id";

      analyzersService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(
        mockAuthenticatedUser,
        analyzerId,
        orgId,
      );

      expect(analyzersService.delete).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });

    it("should propagate service errors", async () => {
      const orgId = "test-org-id";
      const analyzerId = "test-analyzer-id";
      const error = new Error("Service error");

      analyzersService.delete.mockRejectedValue(error);

      await expect(
        controller.delete(mockAuthenticatedUser, analyzerId, orgId),
      ).rejects.toThrow("Service error");

      expect(analyzersService.delete).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAuthenticatedUser,
      );
    });

    it("should handle empty ids", async () => {
      const orgId = "";
      const analyzerId = "";

      analyzersService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(
        mockAuthenticatedUser,
        analyzerId,
        orgId,
      );

      expect(analyzersService.delete).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });

    it("should handle UUID format analyzer id", async () => {
      const orgId = "test-org-id";
      const analyzerId = "550e8400-e29b-41d4-a716-446655440000";

      analyzersService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(
        mockAuthenticatedUser,
        analyzerId,
        orgId,
      );

      expect(analyzersService.delete).toHaveBeenCalledWith(
        orgId,
        analyzerId,
        mockAuthenticatedUser,
      );
      expect(result).toEqual({});
    });
  });
});
