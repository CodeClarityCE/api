import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  ActionType,
  getSeverityOfAction,
  getTypeClassOfAction,
} from "src/base_modules/organizations/log/orgAuditLog.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  LogsRepository,
  MembershipsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import { AUDIT_LOG_SORT_FIELDS } from "src/base_modules/shared/repositories/logs.repository";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
  TypedPaginatedData,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";

import type { OrganizationTokenPrincipal } from "../tokens/organization-token.types";

import { Log } from "./log.entity";

/** How an audit log description names the actor. */
export function actorLabel(actor: AuthenticatedUser): string {
  const token = actor.organizationToken;
  return token ? `The Organization token ${token.name}` : "The User";
}

/**
 * This service provides methods for working with organization audit logs
 */
@Injectable()
export class OrganizationLoggerService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly logsRepository: LogsRepository,
  ) {}

  /**
   * Adds an audit log to the organization
   * @param action The action that caused the audit log (ex: ProjectCreate)
   * @param description A description of the action performed (ex: User <id> added a new project (<id>) to the organization)
   * @param organizationId The id of the organization on which the action was performed
   * @param causedBy The user that caused the audit log to be written
   */
  async addAuditLog(
    action: ActionType,
    description: string,
    organizationId: string,
    causedBy: string,
  ): Promise<string> {
    const user = await this.usersRepository.getUserById(causedBy);

    const log = new Log();
    log.action = action;
    log.description = description;
    log.blame_on = causedBy;
    log.blame_on_email = user.email;
    log.created_on = new Date();
    log.organization_id = organizationId;
    log.action_class = getTypeClassOfAction(action);
    log.action_severity = getSeverityOfAction(action);

    const log_created = await this.logsRepository.saveLog(log);

    return log_created.id;
  }

  /** Adds an audit log entry naming whoever acted: a user or an Organization token. */
  async addActorAuditLog(
    action: ActionType,
    description: string,
    organizationId: string,
    actor: AuthenticatedUser,
  ): Promise<string> {
    if (actor.organizationToken) {
      return this.addTokenAuditLog(
        action,
        description,
        actor.organizationToken,
      );
    }
    return this.addAuditLog(action, description, organizationId, actor.userId);
  }

  /** Adds an audit log entry whose actor is an Organization token. */
  async addTokenAuditLog(
    action: ActionType,
    description: string,
    token: OrganizationTokenPrincipal,
  ): Promise<string> {
    const log = new Log();
    log.action = action;
    log.description = description;
    log.blame_on_token_id = token.id;
    log.blame_on_token_name = token.name;
    log.created_on = new Date();
    log.organization_id = token.organizationId;
    log.action_class = getTypeClassOfAction(action);
    log.action_severity = getSeverityOfAction(action);
    return (await this.logsRepository.saveLog(log)).id;
  }

  /**
   * @throws {NotAuthorized}
   *
   * Get a paginated list of audit logs from the given organization
   * @param organizationId The id of the organization
   * @param paginationUserSuppliedConf The pagination config
   * @param user The authenticated user
   * @returns {TypedPaginatedData<OrganizationAuditLog>} return a paginated list of org audit logs
   */
  async getAuditLogs(
    organizationId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
    searchKey?: string,
    sortBy?: string,
    sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<Log>> {
    // Only owners and admins can view audit logs
    await this.membershipsRepository.hasRequiredRole(
      organizationId,
      user.userId,
      MemberRole.ADMIN,
    );

    const paginationConfig: PaginationConfig = {
      maxEntriesPerPage: 100,
      defaultEntriesPerPage: 10,
    };
    const requested = paginationUserSuppliedConf.entriesPerPage;
    const entriesPerPage = requested
      ? Math.min(paginationConfig.maxEntriesPerPage, Math.max(1, requested))
      : paginationConfig.defaultEntriesPerPage;
    const currentPage = Math.max(
      0,
      paginationUserSuppliedConf.currentPage ?? 0,
    );

    // Unknown sort keys fall back to newest first
    const sortField = AUDIT_LOG_SORT_FIELDS.find((field) => field === sortBy);

    return await this.logsRepository.getOrganizationLogs(
      organizationId,
      currentPage,
      entriesPerPage,
      searchKey,
      sortField,
      sortDirection,
    );
  }
}
