import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Result } from "src/codeclarity_modules/results/result.entity";
import { EntityNotFound } from "src/types/error.types";
import { Repository } from "typeorm";

@Injectable()
export class AnalysisResultsRepository {
  constructor(
    @InjectRepository(Result, "codeclarity")
    private resultRepository: Repository<Result>,
  ) {}

  async delete(resultId: string): Promise<void> {
    await this.resultRepository.delete(resultId);
  }

  async remove(result: Result): Promise<void> {
    await this.resultRepository.remove(result);
  }

  async removeResults(result: Result[]): Promise<void> {
    await this.resultRepository.remove(result);
  }

  async getByAnalysisId(
    analysisId: string,
    relations?: object,
  ): Promise<Result> {
    const analysis = await this.resultRepository.findOne({
      where: {
        analysis: { id: analysisId },
      },
      ...(relations ? { relations: relations } : {}),
    });

    if (!analysis) {
      throw new EntityNotFound();
    }

    return analysis;
  }

  async getByAnalysisIdAndPluginType(
    analysisId: string,
    plugin: string,
    relations?: object,
  ): Promise<Result | null> {
    const analysis = await this.resultRepository.findOne({
      where: {
        analysis: { id: analysisId },
        plugin: plugin,
      },
      ...(relations ? { relations: relations } : {}),
    });

    return analysis;
  }

  async resultOfAnalysisReady(analysysId: string): Promise<boolean> {
    return this.resultRepository.exists({
      where: {
        analysis: { id: analysysId },
      },
    });
  }

  async getAllByAnalysisId(analysisId: string): Promise<Result[]> {
    return this.resultRepository.find({
      where: {
        analysis: { id: analysisId },
      },
      order: {
        plugin: "ASC",
      },
    });
  }

  async getAvailableSbomPlugins(analysisId: string): Promise<string[]> {
    const results = await this.resultRepository.find({
      where: [
        { analysis: { id: analysisId }, plugin: "js-sbom" },
        { analysis: { id: analysisId }, plugin: "php-sbom" },
      ],
      select: ["plugin"],
    });
    return results.map((result) => result.plugin);
  }

  async getPreferredSbomResult(
    analysisId: string,
    requestedType?: string,
  ): Promise<Result | null> {
    // If a specific type is requested and exists, return it
    if (requestedType) {
      const specificResult = await this.getByAnalysisIdAndPluginType(
        analysisId,
        requestedType,
      );
      if (specificResult) {
        return specificResult;
      }
    }

    // Fallback logic: prefer js-sbom, then php-sbom
    const preferenceOrder = ["js-sbom", "php-sbom"];

    for (const pluginType of preferenceOrder) {
      const result = await this.getByAnalysisIdAndPluginType(
        analysisId,
        pluginType,
      );
      if (result) {
        return result;
      }
    }

    return null;
  }
}
