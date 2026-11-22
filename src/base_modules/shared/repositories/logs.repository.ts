import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";

import { Log } from "src/base_modules/organizations/log/log.entity";
import { TypedPaginatedData } from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";

/**
 * Pure repository for log database operations.
 */
@Injectable()
export class LogsRepository {
  constructor(
    @InjectRepository(Log, "codeclarity")
    private logRepository: Repository<Log>,
  ) {}

  /**
   * Save a log entry.
   */
  async saveLog(log: Log): Promise<Log> {
    return this.logRepository.save(log);
  }

  /**
   * Get one page of an organization's audit log, newest first unless sorted.
   */
  async getOrganizationLogs(
    organizationId: string,
    currentPage: number,
    entriesPerPage: number,
    searchKey?: string,
    sortBy?: AuditLogSortField,
    sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<Log>> {
    const query = this.logRepository
      .createQueryBuilder("log")
      .where("log.organization_id = :organizationId", { organizationId })
      .orderBy(
        `log.${sortBy ?? "created_on"}`,
        sortDirection === SortDirection.ASC ? "ASC" : "DESC",
      );

    if (searchKey) {
      query.andWhere(
        new Brackets((qb) => {
          for (const field of AUDIT_LOG_SEARCH_FIELDS) {
            qb.orWhere(`log.${field} ILIKE :searchKey`, {
              searchKey: `%${searchKey}%`,
            });
          }
        }),
      );
    }

    const [logs, fullCount] = await query
      .skip(currentPage * entriesPerPage)
      .take(entriesPerPage)
      .getManyAndCount();

    return {
      data: logs,
      page: currentPage,
      entry_count: logs.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: fullCount,
      filter_count: {},
    };
  }
}

/** Columns the audit log can be sorted by. */
export const AUDIT_LOG_SORT_FIELDS = [
  "action_severity",
  "action_class",
  "action",
  "blame_on_email",
  "created_on",
] as const;

/** Columns the audit log search key is matched against. */
const AUDIT_LOG_SEARCH_FIELDS = [
  "blame_on_email",
  "blame_on_token_name",
  "description",
  "action",
  "action_class",
] as const;

export type AuditLogSortField = (typeof AUDIT_LOG_SORT_FIELDS)[number];
