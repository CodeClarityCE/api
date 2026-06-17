import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Organization } from "src/base_modules/organizations/organization.entity";
import { Project } from "src/base_modules/projects/project.entity";
import {
  EntityNotFound,
  NotAuthorized,
  ProjectDoesNotExist,
} from "src/types/error.types";
import { TypedPaginatedData } from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";

export enum AllowedOrderByGetProjects {
  NAME = "name",
  IMPORTED_ON = "imported_on",
}

/**
 * Pure repository for project database operations.
 * Does NOT depend on other repositories - cross-entity logic belongs in services.
 */
@Injectable()
export class ProjectsRepository {
  constructor(
    @InjectRepository(Project, "codeclarity")
    private projectRepository: Repository<Project>,
  ) {}

  /**
   * Get a project by ID.
   * @throws {EntityNotFound} if no project is found.
   */
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

  /**
   * Get a project by ID and organization.
   * @throws {ProjectDoesNotExist} if no project is found.
   */
  async getProjectByIdAndOrganization(
    projectId: string,
    organizationId: string,
    relations?: object,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: {
        id: projectId,
        organizations: { id: organizationId },
      },
      ...(relations ? { relations: relations } : {}),
    });

    if (!project) {
      throw new ProjectDoesNotExist();
    }

    return project;
  }

  /**
   * Check if a project belongs to an organization.
   * @throws {NotAuthorized} if the project does not belong to the org.
   */
  async doesProjectBelongToOrg(
    projectId: string,
    orgId: string,
  ): Promise<void> {
    const belongs = await this.projectRepository.exists({
      relations: { organizations: true },
      where: {
        id: projectId,
        organizations: { id: orgId },
      },
    });
    if (!belongs) {
      throw new NotAuthorized();
    }
  }

  /**
   * Delete a project by ID.
   */
  async deleteProject(projectId: string): Promise<void> {
    await this.projectRepository.delete(projectId);
  }

  /**
   * Load the projects among `ids` that belong to the given organization,
   * optionally with relations. Used to resolve a user-supplied id list to the
   * subset that actually belongs to the org (ids not returned are treated as
   * not-found / not-owned by the caller).
   */
  async getProjectsByIdsAndOrg(
    ids: string[],
    orgId: string,
    relations?: object,
  ): Promise<Project[]> {
    if (ids.length === 0) return [];
    return this.projectRepository.find({
      where: { id: In(ids), organizations: { id: orgId } },
      ...(relations ? { relations: relations } : {}),
    });
  }

  /**
   * Detach multiple projects from an organization (remove the M2M join rows) in
   * a single set-based statement via the owning side. The junction FK has no
   * ON DELETE CASCADE, so these rows must be removed before the project rows.
   */
  async detachFromOrganization(
    orgId: string,
    projectIds: string[],
  ): Promise<void> {
    if (projectIds.length === 0) return;
    await this.projectRepository.manager
      .createQueryBuilder()
      .relation(Organization, "projects")
      .of(orgId)
      .remove(projectIds);
  }

  /**
   * Delete multiple projects by ID in a single set-based statement.
   * @returns The number of project rows removed.
   */
  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.projectRepository.delete({ id: In(ids) });
    return res.affected ?? 0;
  }

  /**
   * Delete all projects added by a user.
   */
  async deleteUserProjects(userId: string): Promise<void> {
    const projects = await this.projectRepository.find({
      where: { added_by: { id: userId } },
    });
    await this.projectRepository.remove(projects);
  }

  /**
   * Save a project entity.
   */
  async saveProject(project: Project): Promise<Project> {
    return this.projectRepository.save(project);
  }

  /**
   * Get paginated projects for an organization.
   */
  async getManyProjects(
    orgId: string,
    currentPage: number,
    entriesPerPage: number,
    searchKey?: string,
    _sortBy?: AllowedOrderByGetProjects,
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<Project>> {
    let queryBuilder = this.projectRepository
      .createQueryBuilder("project")
      .leftJoin("project.organizations", "organizations")
      .where("organizations.id = :orgId", { orgId: orgId })
      .leftJoinAndSelect("project.analyses", "analyses")
      .leftJoinAndSelect("analyses.analyzer", "analyzer")
      .leftJoinAndSelect("project.files", "files")
      .leftJoinAndSelect("project.added_by", "added_by")
      .orderBy("project.added_on", "DESC")
      .addOrderBy("analyses.created_on", "DESC");

    if (searchKey) {
      queryBuilder = queryBuilder.andWhere(
        "(project.name LIKE :searchKey OR project.description LIKE :searchKey)",
        { searchKey: `%${searchKey}%` },
      );
    }

    const fullCount = await queryBuilder.getCount();

    queryBuilder = queryBuilder
      .limit(entriesPerPage)
      .offset(currentPage * entriesPerPage);

    const projects = await queryBuilder.getMany();

    return {
      data: projects,
      page: currentPage,
      entry_count: projects.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: fullCount,
      filter_count: {},
    };
  }
}
