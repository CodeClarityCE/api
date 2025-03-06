import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { TypedPaginatedData } from 'src/types/paginated/types';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/paginated/types';
import { SortDirection } from 'src/types/sort/types';
import {
    ActionType,
    getSeverityOfAction,
    getTypeClassOfAction
} from 'src/base_modules/organizations/orgAuditLog.types';
import { MemberRole } from 'src/base_modules/organizations/orgMembership.types';
import { Log } from 'src/base_modules/organizations/log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from './organizations.repository';
import { LogsRepository } from './logs.repository';

/**
 * This service provides methods for working with organization audit logs
 */
@Injectable()
export class OrganizationLoggerService {
    constructor(
        private readonly usersRepository: UsersRepository,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly logsRepository: LogsRepository
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
        causedBy: string
    ): Promise<string> {
        const user = await this.usersRepository.getUserById(causedBy)

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
        sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<Log>> {
        enum AllowedOrderBy {
            SEVERITY = 'action_severity',
            CLASS = 'action_class',
            TYPE = 'action',
            BLAME = 'blame_on_email',
            CREATED_ON = 'created_on'
        }

        // Only owners and admins can view audit logs
        await this.organizationsRepository.hasRequiredRole(
            organizationId,
            user.userId,
            MemberRole.ADMIN
        );

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        let currentPage = 0;

        if (paginationUserSuppliedConf.entriesPerPage)
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                paginationUserSuppliedConf.entriesPerPage
            );

        if (paginationUserSuppliedConf.currentPage)
            currentPage = Math.max(0, paginationUserSuppliedConf.currentPage);

        // let sortByKey: SortField<OrganizationAuditLog> | undefined = undefined;
        // let searchCriteria: ComplexSearchCriteria<OrganizationAuditLog> | undefined = undefined;

        // if (sortBy) {
        //     if (sortBy == AllowedOrderBy.SEVERITY) sortByKey = 'action_severity';
        //     else if (sortBy == AllowedOrderBy.CLASS) sortByKey = 'action_class';
        //     else if (sortBy == AllowedOrderBy.TYPE) sortByKey = 'action';
        //     else if (sortBy == AllowedOrderBy.BLAME) sortByKey = 'blame_on_email';
        //     else if (sortBy == AllowedOrderBy.CREATED_ON) sortByKey = 'created_on';
        // }

        // if (searchKey) {
        //     searchCriteria = {
        //         junction: 'OR',
        //         criteria: [
        //             { field: 'blame_on_email', value: searchKey, operator: 'like' },
        //             { field: 'description', value: searchKey, operator: 'like' },
        //             { field: 'action', value: searchKey, operator: 'like' },
        //             { field: 'action_class', value: searchKey, operator: 'like' }
        //         ]
        //     };
        // }

        // const logRepository = CodeclarityDB.getRepository(Log);
        // const logsQueryBuilder = await logRepository
        //     .createQueryBuilder('log')
        //     .where('log.organization_id = :organizationId', { organizationId })
        //     .orderBy(sortByKey ? `log.${sortByKey}` : 'log.created_on', sortDirection || 'DESC');

        // const fullCount = await logsQueryBuilder.getCount();

        // const logs = await logsQueryBuilder
        //     .skip(currentPage * entriesPerPage)
        //     .take(entriesPerPage)
        //     .getMany();

        // return {
        //     data: logs,
        //     page: currentPage,
        //     entry_count: logs.length,
        //     entries_per_page: entriesPerPage,
        //     total_entries: fullCount,
        //     total_pages: Math.ceil(fullCount / entriesPerPage),
        //     matching_count: fullCount, // once you apply filters this needs to change
        //     filter_count: {}
        // };
        return {
            data: [],
            page: 0,
            entry_count: 0,
            entries_per_page: 0,
            total_entries: 0,
            total_pages: 0,
            matching_count: 0,
            filter_count: {}
        };
    }
}
