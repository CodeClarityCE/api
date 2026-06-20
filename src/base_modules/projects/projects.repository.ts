import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Project } from "src/base_modules/projects/project.entity";
import {
  EntityNotFound,
  NotAuthorized,
  ProjectDoesNotExist,
} from "src/types/error.types";
import { TypedPaginatedData } from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";

import { AllowedOrderByGetProjects } from "./projects.service";

@Injectable()
export class ProjectsRepository {
  constructor(
    @InjectRepository(Project, "codeclarity")
    private projectRepository: Repository<Project>,
  ) {}

  async getProjectById(
    projectId: string,
    relations?: object,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      ...(relations ? { relations: relations } : {}),
    });

    if (!project) {
      throw new EntityNotFound();
    }

    return project;
  }

  async getProjectByIdAndOrganization(
    projectId: string,
    organizationId: string,
    relations?: object,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: {
        id: projectId,
        organizations: {
          id: organizationId,
        },
      },
      ...(relations ? { relations: relations } : {}),
    });

    if (!project) {
      throw new ProjectDoesNotExist();
    }

    return project;
  }

  /**
   * Get the project a user has already imported into an org from a given git URL,
   * or null if none exists. Scoped to (url, org, added_by) — never org-wide — so
   * each user keeps their own project (and their own download folder) when more
   * than one user imports the same repo. Used to make import idempotent.
   */
  async getProjectByUrlOrgAndUser(
    url: string,
    orgId: string,
    userId: string,
  ): Promise<Project | null> {
    return this.projectRepository.findOne({
      where: {
        url,
        organizations: { id: orgId },
        added_by: { id: userId },
      },
      // Deterministic pick if pre-existing duplicates remain in the DB.
      order: { added_on: "ASC" },
    });
  }

  /**
   * Checks whether the integration, with the given id, belongs to the organization, with the given id
   * @param integrationId The id of the integration
   * @param orgId The id of the organization
   * @returns whether or not the integration belongs to the org
   */
  async doesProjectBelongToOrg(
    projectId: string,
    orgId: string,
  ): Promise<void> {
    const belongs = await this.projectRepository.exists({
      relations: {
        organizations: true,
      },
      where: {
        id: projectId,
        organizations: {
          id: orgId,
        },
      },
    });
    if (!belongs) {
      throw new NotAuthorized();
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.projectRepository.delete(projectId);
  }

  async deleteUserProjects(userId: string): Promise<void> {
    const projects = await this.projectRepository.find({
      where: { added_by: { id: userId } },
    });
    await this.projectRepository.remove(projects);
  }

  async saveProject(project: Project): Promise<Project> {
    return this.projectRepository.save(project);
  }

  async getManyProjects(
    orgId: string,
    currentPage: number,
    entriesPerPage: number,
    searchKey?: string,
    _sortBy?: AllowedOrderByGetProjects,
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<Project>> {
    // Paginate over DISTINCT project ids first. Applying LIMIT/OFFSET directly to
    // a query that leftJoinAndSelects the one-to-many analyses/files would bound
    // the inflated raw rows, not distinct projects, so a page would hydrate to
    // fewer than entriesPerPage projects and callers would stop paginating early.
    let idQuery = this.projectRepository
      .createQueryBuilder("project")
      .leftJoin("project.organizations", "organizations")
      .where("organizations.id = :orgId", { orgId: orgId })
      .orderBy("project.added_on", "DESC");

    if (searchKey) {
      idQuery = idQuery.andWhere(
        "(project.name LIKE :searchKey OR project.description LIKE :searchKey)",
        { searchKey: `%${searchKey}%` },
      );
    }

    const fullCount = await idQuery.getCount();

    const pageRows = await idQuery
      .select("project.id", "id")
      .limit(entriesPerPage)
      .offset(currentPage * entriesPerPage)
      .getRawMany<{ id: string }>();
    const pageIds = pageRows.map((r) => r.id);

    const projects = pageIds.length
      ? await this.projectRepository
          .createQueryBuilder("project")
          .where("project.id IN (:...pageIds)", { pageIds })
          .leftJoinAndSelect("project.analyses", "analyses")
          .leftJoinAndSelect("analyses.analyzer", "analyzer")
          .leftJoinAndSelect("project.files", "files")
          .leftJoinAndSelect("project.added_by", "added_by")
          .orderBy("project.added_on", "DESC")
          .addOrderBy("analyses.created_on", "DESC")
          .getMany()
      : [];

    return {
      data: projects,
      page: currentPage,
      entry_count: projects.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: fullCount, // once you apply filters this needs to change
      filter_count: {},
    };
  }
}
