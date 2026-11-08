import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { In, LessThan } from "typeorm";

import {
  Analysis,
  AnalysisStatus,
} from "src/base_modules/analyses/analysis.entity";
import { EntityNotFound } from "src/types/error.types";

import { AnalysesRepository } from "./analyses.repository";

describe("AnalysesRepository", () => {
  let repository: AnalysesRepository;
  const findOne = jest.fn();
  const current = {
    id: "analysis-123",
    created_on: new Date("2024-01-02"),
    branch: "main",
    analyzer: { id: "analyzer-1" },
  };

  beforeEach(async () => {
    findOne.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysesRepository,
        {
          provide: getRepositoryToken(Analysis, "codeclarity"),
          useValue: { findOne },
        },
      ],
    }).compile();
    repository = module.get(AnalysesRepository);
  });

  describe("getPreviousCompletedAnalysis", () => {
    it("finds the latest completed analysis before the given one", async () => {
      const previous = { id: "analysis-previous" };
      findOne.mockResolvedValueOnce(current).mockResolvedValueOnce(previous);

      const result = await repository.getPreviousCompletedAnalysis(
        "project-123",
        "analysis-123",
      );

      expect(result).toBe(previous);
      expect(findOne).toHaveBeenLastCalledWith({
        where: {
          project: { id: "project-123" },
          branch: "main",
          analyzer: { id: "analyzer-1" },
          status: In([AnalysisStatus.COMPLETED, AnalysisStatus.SUCCESS]),
          created_on: LessThan(current.created_on),
        },
        order: { created_on: "DESC" },
      });
    });

    it("has nothing to compare against when the analyzer was deleted", async () => {
      findOne.mockResolvedValueOnce({ ...current, analyzer: null });

      await expect(
        repository.getPreviousCompletedAnalysis("project-123", "analysis-123"),
      ).resolves.toBeNull();
      expect(findOne).toHaveBeenCalledTimes(1);
    });

    it("returns null when there is no earlier analysis", async () => {
      findOne.mockResolvedValueOnce(current).mockResolvedValueOnce(null);

      await expect(
        repository.getPreviousCompletedAnalysis("project-123", "analysis-123"),
      ).resolves.toBeNull();
    });

    it("rejects when the given analysis does not exist", async () => {
      findOne.mockResolvedValueOnce(null);

      await expect(
        repository.getPreviousCompletedAnalysis("project-123", "missing"),
      ).rejects.toThrow(EntityNotFound);
    });
  });
});
