import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { EntityNotFound, NotAuthorized } from "src/types/error.types";

import { AnalysesRepository } from "./analyses.repository";
import { Analysis, AnalysisStatus } from "./analysis.entity";

describe("AnalysesRepository", () => {
  let analysesRepository: AnalysesRepository;
  let mockAnalysisRepository: jest.Mocked<Repository<Analysis>>;

  const mockAnalysis: Analysis = {
    id: "analysis-123",
    created_on: new Date("2024-01-01"),
    config: { test: { option: "value" } },
    stage: 1,
    status: AnalysisStatus.COMPLETED,
    steps: [
      [
        {
          name: "test",
          version: "1.0",
          config: {},
          status: AnalysisStatus.COMPLETED,
          result: {},
        },
      ],
    ],
    started_on: new Date("2024-01-01T10:00:00Z"),
    ended_on: new Date("2024-01-01T11:00:00Z"),
    branch: "main",
    tag: "v1.0.0",
    commit_hash: "abc123",
    policies: [],
    project: { id: "project-123" } as any,
    analyzer: { id: "analyzer-123" } as any,
    results: [],
    organization: { id: "org-123" } as any,
    integration: { id: "integration-123" } as any,
    created_by: { id: "user-123" } as any,
    is_active: true,
    schedule_type: "once",
    next_scheduled_run: undefined,
    last_scheduled_run: undefined,
  };

  const mockQueryBuilder = {
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    const mockRepo = {
      save: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysesRepository,
        {
          provide: getRepositoryToken(Analysis, "codeclarity"),
          useValue: mockRepo,
        },
      ],
    }).compile();

    analysesRepository = module.get<AnalysesRepository>(AnalysesRepository);
    mockAnalysisRepository = module.get(
      getRepositoryToken(Analysis, "codeclarity"),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("saveAnalysis", () => {
    it("should save and return the analysis", async () => {
      mockAnalysisRepository.save.mockResolvedValue(mockAnalysis);

      const result = await analysesRepository.saveAnalysis(mockAnalysis);

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalysisRepository.save).toHaveBeenCalledWith(mockAnalysis);
    });

    it("should handle save errors", async () => {
      const saveError = new Error("Database constraint violation");
      mockAnalysisRepository.save.mockRejectedValue(saveError);

      await expect(
        analysesRepository.saveAnalysis(mockAnalysis),
      ).rejects.toThrow(saveError);
      expect(mockAnalysisRepository.save).toHaveBeenCalledWith(mockAnalysis);
    });

    it("should save analysis with minimal required fields", async () => {
      const minimalAnalysis = {
        id: "analysis-456",
        status: AnalysisStatus.REQUESTED,
        branch: "dev",
      } as Analysis;
      mockAnalysisRepository.save.mockResolvedValue(minimalAnalysis);

      const result = await analysesRepository.saveAnalysis(minimalAnalysis);

      expect(result).toEqual(minimalAnalysis);
      expect(mockAnalysisRepository.save).toHaveBeenCalledWith(minimalAnalysis);
    });
  });

  describe("deleteAnalysis", () => {
    it("should delete analysis by id", async () => {
      mockAnalysisRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await analysesRepository.deleteAnalysis("analysis-123");

      expect(mockAnalysisRepository.delete).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("should handle delete errors", async () => {
      const deleteError = new Error("Foreign key constraint violation");
      mockAnalysisRepository.delete.mockRejectedValue(deleteError);

      await expect(
        analysesRepository.deleteAnalysis("analysis-123"),
      ).rejects.toThrow(deleteError);
      expect(mockAnalysisRepository.delete).toHaveBeenCalledWith(
        "analysis-123",
      );
    });

    it("should handle deleting non-existent analysis", async () => {
      mockAnalysisRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await analysesRepository.deleteAnalysis("non-existent-id");

      expect(mockAnalysisRepository.delete).toHaveBeenCalledWith(
        "non-existent-id",
      );
    });
  });

  describe("removeAnalyses", () => {
    it("should remove multiple analyses", async () => {
      const analyses = [mockAnalysis, { ...mockAnalysis, id: "analysis-456" }];
      mockAnalysisRepository.remove.mockResolvedValue(analyses as any);

      await analysesRepository.removeAnalyses(analyses);

      expect(mockAnalysisRepository.remove).toHaveBeenCalledWith(analyses);
    });

    it("should handle remove errors", async () => {
      const removeError = new Error("Failed to remove analyses");
      const analyses = [mockAnalysis];
      mockAnalysisRepository.remove.mockRejectedValue(removeError);

      await expect(analysesRepository.removeAnalyses(analyses)).rejects.toThrow(
        removeError,
      );
      expect(mockAnalysisRepository.remove).toHaveBeenCalledWith(analyses);
    });

    it("should handle empty array", async () => {
      const analyses: Analysis[] = [];
      mockAnalysisRepository.remove.mockResolvedValue(analyses as any);

      await analysesRepository.removeAnalyses(analyses);

      expect(mockAnalysisRepository.remove).toHaveBeenCalledWith(analyses);
    });
  });

  describe("getAnalysisById", () => {
    it("should return analysis when found", async () => {
      mockAnalysisRepository.findOne.mockResolvedValue(mockAnalysis);

      const result = await analysesRepository.getAnalysisById("analysis-123");

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        where: { id: "analysis-123" },
        relations: undefined,
      });
    });

    it("should return analysis with relations when specified", async () => {
      const relations = { project: true, analyzer: true };
      mockAnalysisRepository.findOne.mockResolvedValue(mockAnalysis);

      const result = await analysesRepository.getAnalysisById(
        "analysis-123",
        relations,
      );

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        where: { id: "analysis-123" },
        relations: relations,
      });
    });

    it("should throw EntityNotFound when analysis does not exist", async () => {
      mockAnalysisRepository.findOne.mockResolvedValue(null);

      await expect(
        analysesRepository.getAnalysisById("non-existent-id"),
      ).rejects.toThrow(EntityNotFound);
      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        where: { id: "non-existent-id" },
        relations: undefined,
      });
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database connection failed");
      mockAnalysisRepository.findOne.mockRejectedValue(dbError);

      await expect(
        analysesRepository.getAnalysisById("analysis-123"),
      ).rejects.toThrow(dbError);
    });

    it("should handle null relations parameter", async () => {
      mockAnalysisRepository.findOne.mockResolvedValue(mockAnalysis);

      const result = await analysesRepository.getAnalysisById(
        "analysis-123",
        null as any,
      );

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        where: { id: "analysis-123" },
        // relations is omitted when null due to exactOptionalPropertyTypes
      });
    });
  });

  describe("getAnalysisByProjectId", () => {
    it("should return paginated analyses for a project", async () => {
      const mockAnalyses = [
        mockAnalysis,
        { ...mockAnalysis, id: "analysis-456" },
      ];
      mockQueryBuilder.getCount.mockResolvedValue(5);
      mockQueryBuilder.getMany.mockResolvedValue(mockAnalyses);

      const result = await analysesRepository.getAnalysisByProjectId(
        "project-123",
        0,
        10,
      );

      expect(result).toEqual({
        data: mockAnalyses,
        page: 0,
        entry_count: 2,
        entries_per_page: 10,
        total_entries: 5,
        total_pages: 1,
        matching_count: 2,
        filter_count: {},
      });

      expect(mockAnalysisRepository.createQueryBuilder).toHaveBeenCalledWith(
        "analysis",
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        "analysis.created_on",
        "DESC",
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        "analysis.projectId = :projectId",
        {
          projectId: "project-123",
        },
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it("should handle pagination correctly for second page", async () => {
      const mockAnalyses = [mockAnalysis];
      mockQueryBuilder.getCount.mockResolvedValue(25);
      mockQueryBuilder.getMany.mockResolvedValue(mockAnalyses);

      const result = await analysesRepository.getAnalysisByProjectId(
        "project-123",
        2,
        10,
      );

      expect(result.page).toBe(2);
      expect(result.total_pages).toBe(3);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it("should handle empty results", async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await analysesRepository.getAnalysisByProjectId(
        "project-123",
        0,
        10,
      );

      expect(result.data).toEqual([]);
      expect(result.total_entries).toBe(0);
      expect(result.total_pages).toBe(0);
      expect(result.entry_count).toBe(0);
    });

    it("should handle query builder errors", async () => {
      const queryError = new Error("Query execution failed");
      mockQueryBuilder.getCount.mockRejectedValue(queryError);

      await expect(
        analysesRepository.getAnalysisByProjectId("project-123", 0, 10),
      ).rejects.toThrow(queryError);
    });

    it("should calculate total pages correctly when not evenly divisible", async () => {
      mockQueryBuilder.getCount.mockResolvedValue(23);
      mockQueryBuilder.getMany.mockResolvedValue([mockAnalysis]);

      const result = await analysesRepository.getAnalysisByProjectId(
        "project-123",
        0,
        10,
      );

      expect(result.total_pages).toBe(3);
    });
  });

  describe("getAnalysesByProjectId", () => {
    it("should return all analyses for a project", async () => {
      const mockAnalyses = [
        mockAnalysis,
        { ...mockAnalysis, id: "analysis-456" },
      ];
      mockAnalysisRepository.find.mockResolvedValue(mockAnalyses);

      const result =
        await analysesRepository.getAnalysesByProjectId("project-123");

      expect(result).toEqual(mockAnalyses);
      expect(mockAnalysisRepository.find).toHaveBeenCalledWith({
        where: { project: { id: "project-123" } },
        relations: undefined,
      });
    });

    it("should return analyses with relations when specified", async () => {
      const relations = { project: true, results: true };
      const mockAnalyses = [mockAnalysis];
      mockAnalysisRepository.find.mockResolvedValue(mockAnalyses);

      const result = await analysesRepository.getAnalysesByProjectId(
        "project-123",
        relations,
      );

      expect(result).toEqual(mockAnalyses);
      expect(mockAnalysisRepository.find).toHaveBeenCalledWith({
        where: { project: { id: "project-123" } },
        relations: relations,
      });
    });

    it("should return empty array when no analyses found", async () => {
      mockAnalysisRepository.find.mockResolvedValue([]);

      const result =
        await analysesRepository.getAnalysesByProjectId("project-123");

      expect(result).toEqual([]);
      expect(mockAnalysisRepository.find).toHaveBeenCalledWith({
        where: { project: { id: "project-123" } },
        relations: undefined,
      });
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database query failed");
      mockAnalysisRepository.find.mockRejectedValue(dbError);

      await expect(
        analysesRepository.getAnalysesByProjectId("project-123"),
      ).rejects.toThrow(dbError);
    });
  });

  describe("doesAnalysesBelongToProject", () => {
    it("should not throw when analysis belongs to project", async () => {
      mockAnalysisRepository.findOne.mockResolvedValue(mockAnalysis);

      await expect(
        analysesRepository.doesAnalysesBelongToProject(
          "analysis-123",
          "project-123",
        ),
      ).resolves.not.toThrow();

      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        relations: ["project"],
        where: {
          id: "analysis-123",
          project: { id: "project-123" },
        },
      });
    });

    it("should throw NotAuthorized when analysis does not belong to project", async () => {
      mockAnalysisRepository.findOne.mockResolvedValue(null);

      await expect(
        analysesRepository.doesAnalysesBelongToProject(
          "analysis-123",
          "wrong-project-id",
        ),
      ).rejects.toThrow(NotAuthorized);

      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        relations: ["project"],
        where: {
          id: "analysis-123",
          project: { id: "wrong-project-id" },
        },
      });
    });

    it("should throw NotAuthorized when analysis does not exist", async () => {
      mockAnalysisRepository.findOne.mockResolvedValue(null);

      await expect(
        analysesRepository.doesAnalysesBelongToProject(
          "non-existent-id",
          "project-123",
        ),
      ).rejects.toThrow(NotAuthorized);
    });

    it("should handle database errors", async () => {
      const dbError = new Error("Database connection failed");
      mockAnalysisRepository.findOne.mockRejectedValue(dbError);

      await expect(
        analysesRepository.doesAnalysesBelongToProject(
          "analysis-123",
          "project-123",
        ),
      ).rejects.toThrow(dbError);
    });

    it("should handle empty string IDs", async () => {
      mockAnalysisRepository.findOne.mockResolvedValue(null);

      await expect(
        analysesRepository.doesAnalysesBelongToProject("", ""),
      ).rejects.toThrow(NotAuthorized);

      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        relations: ["project"],
        where: {
          id: "",
          project: { id: "" },
        },
      });
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle special characters in analysis ID", async () => {
      const specialId = "analysis-123-special@#$%";
      mockAnalysisRepository.findOne.mockResolvedValue(mockAnalysis);

      const result = await analysesRepository.getAnalysisById(specialId);

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        where: { id: specialId },
        relations: undefined,
      });
    });

    it("should handle negative pagination values", async () => {
      mockQueryBuilder.getCount.mockResolvedValue(10);
      mockQueryBuilder.getMany.mockResolvedValue([mockAnalysis]);

      await analysesRepository.getAnalysisByProjectId("project-123", -1, -5);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(-5);
    });

    it("should handle large pagination values", async () => {
      mockQueryBuilder.getCount.mockResolvedValue(1000000);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await analysesRepository.getAnalysisByProjectId(
        "project-123",
        999999,
        1000,
      );

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(999999000);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(1000);
    });

    it("should handle complex relations object", async () => {
      const complexRelations = {
        project: {
          organization: true,
          integrations: true,
        },
        analyzer: true,
        results: {
          vulnerabilities: true,
        },
      };
      mockAnalysisRepository.findOne.mockResolvedValue(mockAnalysis);

      const result = await analysesRepository.getAnalysisById(
        "analysis-123",
        complexRelations,
      );

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalysisRepository.findOne).toHaveBeenCalledWith({
        where: { id: "analysis-123" },
        relations: complexRelations,
      });
    });
  });
});
