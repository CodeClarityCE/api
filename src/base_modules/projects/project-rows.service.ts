import { Injectable } from "@nestjs/common";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import { EntityManager } from "typeorm";

import { validateAndJoinPath } from "src/utils/path-validator";

import { AnalysesRepository } from "../analyses/analyses.repository";
import { FileRepository } from "../file/file.repository";
import { ProjectsRepository } from "../shared/repositories";

/**
 * Deletes projects with everything stored for them. Project delete, bulk
 * project delete and organization delete all go through it.
 */
@Injectable()
export class ProjectRowsService {
  constructor(
    private readonly analysesRepository: AnalysesRepository,
    private readonly fileRepository: FileRepository,
    private readonly projectsRepository: ProjectsRepository,
  ) {}

  /**
   * Cancel running analyses, then remove projects with their analyses, policy
   * links, results and files, and detach them from the org, all or nothing.
   * @param manager Runs in the caller's transaction when given.
   */
  async deleteRows(
    orgId: string,
    projectIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    if (!manager) {
      return this.projectsRepository.runInTransaction((m) =>
        this.deleteRows(orgId, projectIds, m),
      );
    }
    const analysisIds =
      await this.analysesRepository.getAnalysisIdsByProjectIds(
        projectIds,
        manager,
      );
    await this.deleteAnalyses(analysisIds, manager);
    await this.fileRepository.deleteByProjectIds(projectIds, manager);
    await this.projectsRepository.detachFromOrganization(
      orgId,
      projectIds,
      manager,
    );
    await this.projectsRepository.deleteByIds(projectIds, manager);
  }

  /** Cancel the running analyses among `ids`, then delete all of them. */
  async deleteAnalyses(ids: string[], manager: EntityManager): Promise<void> {
    await this.analysesRepository.cancelByIds(ids, manager);
    await this.analysesRepository.deleteByIds(ids, manager);
  }

  /** Remove the download folder of each project, if any. Call after the commit. */
  async removeFolders(orgId: string, projectIds: string[]): Promise<void> {
    const downloadPath = process.env["DOWNLOAD_PATH"] ?? "/private";
    for (const projectId of projectIds) {
      const filePath = validateAndJoinPath(
        downloadPath,
        orgId,
        "projects",
        projectId,
      );
      // Path is validated using validateAndJoinPath to prevent traversal attacks
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (existsSync(filePath)) {
        await rm(filePath, { recursive: true, force: true });
      }
    }
  }
}
