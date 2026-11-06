import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
} from "src/base_modules/shared/repositories";
import { TypedPaginatedResponse } from "src/types/apiResponses.types";
import {
  AlreadyExists,
  EntityInUse,
  EntityNotFound,
  NotAuthorized,
} from "src/types/error.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";

import { Experiment } from "../experiments/experiment.entity";

import { Dataset, DatasetStatus } from "./dataset.entity";
import { DatasetBuildService } from "./dataset-build.service";
import { DEFAULT_LOCKFILES } from "./dataset-builder";
import { DatasetEntry } from "./dataset-entry.entity";
import {
  CreateDatasetBody,
  DATASET_DEFAULTS,
  DatasetEntrySummary,
  DatasetSummary,
} from "./datasets.types";

const DATASET_PAGINATION: PaginationConfig = {
  maxEntriesPerPage: 100,
  defaultEntriesPerPage: 20,
};

const ENTRY_PAGINATION: PaginationConfig = {
  maxEntriesPerPage: 500,
  defaultEntriesPerPage: 100,
};

export function resolvePagination(
  requested: PaginationUserSuppliedConf,
  config: PaginationConfig,
): { currentPage: number; entriesPerPage: number } {
  const requestedSize = requested.entriesPerPage ?? 0;
  const entriesPerPage =
    requestedSize > 0
      ? Math.min(config.maxEntriesPerPage, requestedSize)
      : config.defaultEntriesPerPage;
  const currentPage = Math.max(0, requested.currentPage ?? 0);
  return { currentPage, entriesPerPage };
}

export function paginated<T>(
  data: T[],
  fullCount: number,
  currentPage: number,
  entriesPerPage: number,
): TypedPaginatedResponse<T> {
  return {
    data,
    page: currentPage,
    entry_count: data.length,
    entries_per_page: entriesPerPage,
    total_entries: fullCount,
    total_pages: Math.ceil(fullCount / entriesPerPage),
    matching_count: fullCount,
    filter_count: {},
  };
}

@Injectable()
export class DatasetsService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly datasetBuildService: DatasetBuildService,
    @InjectRepository(Dataset, "codeclarity")
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(DatasetEntry, "codeclarity")
    private readonly entryRepository: Repository<DatasetEntry>,
    @InjectRepository(Experiment, "codeclarity")
    private readonly experimentRepository: Repository<Experiment>,
  ) {}

  /**
   * Register a dataset and start building it in the background.
   * @throws {NotAuthorized} If the user is not an admin of the org or the integration belongs to another org
   * @throws {AlreadyExists} If the org already has a dataset with this name
   */
  async create(
    orgId: string,
    body: CreateDatasetBody,
    user: AuthenticatedUser,
  ): Promise<string> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );

    if (
      !(await this.organizationsRepository.doesIntegrationBelongToOrg(
        body.integration_id,
        orgId,
      ))
    ) {
      throw new NotAuthorized();
    }

    const name = body.name.trim();
    if (
      await this.datasetRepository.exists({
        where: { organization: { id: orgId }, name },
      })
    ) {
      throw new AlreadyExists();
    }

    const dataset = this.datasetRepository.create({
      name,
      status: DatasetStatus.BUILDING,
      params: {
        languages: body.languages ?? DATASET_DEFAULTS.languages,
        pages: body.pages ?? DATASET_DEFAULTS.pages,
        min_stars: body.min_stars ?? DATASET_DEFAULTS.min_stars,
        limit: body.limit ?? DATASET_DEFAULTS.limit,
        lockfiles: DEFAULT_LOCKFILES,
      },
      created_on: new Date(),
      organization: { id: orgId },
      created_by: { id: user.userId },
      integration: { id: body.integration_id },
    });
    const saved = await this.datasetRepository.save(dataset);

    this.datasetBuildService.kick();
    return saved.id;
  }

  /**
   * @throws {NotAuthorized} If the user is not a member of the org
   */
  async getMany(
    orgId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
  ): Promise<TypedPaginatedResponse<DatasetSummary>> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const { currentPage, entriesPerPage } = resolvePagination(
      paginationUserSuppliedConf,
      DATASET_PAGINATION,
    );

    const [datasets, fullCount] = await this.datasetRepository.findAndCount({
      where: { organization: { id: orgId } },
      relations: { created_by: true, integration: true },
      order: { created_on: "DESC" },
      skip: currentPage * entriesPerPage,
      take: entriesPerPage,
    });
    const counts = await this.countEntries(datasets.map((d) => d.id));

    return paginated(
      datasets.map((dataset) =>
        this.toSummary(dataset, counts.get(dataset.id) ?? 0),
      ),
      fullCount,
      currentPage,
      entriesPerPage,
    );
  }

  /**
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such dataset
   */
  async get(
    orgId: string,
    datasetId: string,
    user: AuthenticatedUser,
  ): Promise<DatasetSummary> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const dataset = await this.findInOrg(orgId, datasetId);
    const counts = await this.countEntries([dataset.id]);
    return this.toSummary(dataset, counts.get(dataset.id) ?? 0);
  }

  /**
   * The selected repositories in rank order.
   * @throws {NotAuthorized} If the user is not a member of the org
   * @throws {EntityNotFound} If the org has no such dataset
   */
  async getEntries(
    orgId: string,
    datasetId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
  ): Promise<TypedPaginatedResponse<DatasetEntrySummary>> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const dataset = await this.findInOrg(orgId, datasetId);
    const { currentPage, entriesPerPage } = resolvePagination(
      paginationUserSuppliedConf,
      ENTRY_PAGINATION,
    );

    const [entries, fullCount] = await this.entryRepository.findAndCount({
      where: { dataset: { id: dataset.id } },
      order: { rank: "ASC" },
      skip: currentPage * entriesPerPage,
      take: entriesPerPage,
    });

    return paginated(
      entries.map((entry) => ({
        id: entry.id,
        rank: entry.rank,
        full_name: entry.full_name,
        owner: entry.owner,
        repo: entry.repo,
        git_url: entry.git_url,
        default_branch: entry.default_branch,
        stars: entry.stars,
        language: entry.language ?? null,
        lockfiles: entry.lockfiles,
      })),
      fullCount,
      currentPage,
      entriesPerPage,
    );
  }

  /**
   * Delete a dataset and its entries. Deleting one that is still building
   * cancels the build: the builder loses its lease and discards its result.
   * @throws {NotAuthorized} If the user is not an admin of the org
   * @throws {EntityNotFound} If the org has no such dataset
   * @throws {EntityInUse} If an experiment uses the dataset
   */
  async delete(
    orgId: string,
    datasetId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );
    const dataset = await this.findInOrg(orgId, datasetId);
    if (
      await this.experimentRepository.exists({
        where: { dataset: { id: dataset.id } },
      })
    ) {
      throw new EntityInUse();
    }
    await this.datasetRepository.delete({ id: dataset.id });
  }

  private async findInOrg(orgId: string, datasetId: string): Promise<Dataset> {
    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId, organization: { id: orgId } },
      relations: { created_by: true, integration: true },
    });
    if (!dataset) throw new EntityNotFound();
    return dataset;
  }

  private async countEntries(
    datasetIds: string[],
  ): Promise<Map<string, number>> {
    if (datasetIds.length === 0) return new Map();
    const rows = await this.entryRepository
      .createQueryBuilder("entry")
      .select('entry."datasetId"', "dataset_id")
      .addSelect("COUNT(*)", "count")
      .where('entry."datasetId" IN (:...datasetIds)', { datasetIds })
      .groupBy('entry."datasetId"')
      .getRawMany<{ dataset_id: string; count: string }>();
    return new Map(rows.map((row) => [row.dataset_id, Number(row.count)]));
  }

  private toSummary(dataset: Dataset, entryCount: number): DatasetSummary {
    const creator = dataset.created_by;
    return {
      id: dataset.id,
      name: dataset.name,
      status: dataset.status,
      params: dataset.params,
      stats: dataset.stats ?? null,
      error: dataset.error ?? null,
      entry_count: entryCount,
      integration_id: dataset.integration?.id ?? null,
      created_by_name: creator
        ? `${creator.first_name} ${creator.last_name}`
        : null,
      created_on: dataset.created_on,
      built_on: dataset.built_on ?? null,
    };
  }
}
