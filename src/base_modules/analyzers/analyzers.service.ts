import { Injectable } from '@nestjs/common';
import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';
import { AnalyzerCreateBody } from 'src/base_modules/analyzers/analyzer.types';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { ActionType } from 'src/base_modules/organizations/log/orgAuditLog.types';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import {
    TypedPaginatedData,
    PaginationConfig,
    PaginationUserSuppliedConf
} from 'src/types/pagination.types';
import { OrganizationLoggerService } from '../organizations/log/organizationLogger.service';
import {
    MembershipsRepository,
    OrganizationsRepository,
    UsersRepository
} from '../shared/repositories';
import { AnalyzersRepository } from './analyzers.repository';

@Injectable()
export class AnalyzersService {
    constructor(
        private readonly organizationLoggerService: OrganizationLoggerService,
        private readonly membershipsRepository: MembershipsRepository,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly usersRepository: UsersRepository,
        private readonly analyzersRepository: AnalyzersRepository
    ) {}

    /**
     * Create a new analyzer in the specified organization.
     * @param orgId - ID of the organization to create the analyzer for.
     * @param analyzerData - Data to populate the new analyzer with.
     * @param user - Authenticated user creating the analyzer.
     */
    async create(
        orgId: string,
        analyzerData: AnalyzerCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        // Check if the user is allowed to create an analyzer (is at least admin)
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        const creator = await this.usersRepository.getUserById(user.userId);
        const organization = await this.organizationsRepository.getOrganizationById(orgId);

        // Initialize and populate the Analyzer entity with provided data
        const analyzer = new Analyzer();
        analyzer.created_on = new Date();
        analyzer.created_by = creator;
        analyzer.name = analyzerData.name;
        analyzer.description = analyzerData.description;
        analyzer.steps = analyzerData.steps;
        analyzer.supported_languages = analyzerData.supported_languages ?? ['javascript'];
        if (analyzerData.language_config !== undefined) {
            analyzer.language_config = analyzerData.language_config;
        }
        analyzer.logo = analyzerData.logo ?? 'js';
        analyzer.global = false;
        analyzer.organization = organization;

        // Save the newly created analyzer to the database
        const createdAnalyzer = await this.analyzersRepository.saveAnalyzer(analyzer);

        // Log the creation of the analyzer in the organization audit log
        await this.organizationLoggerService.addAuditLog(
            ActionType.AnalyzerCreate,
            `The user added an analyzer ${analyzerData.name} to the organization.`,
            orgId,
            user.userId
        );

        return createdAnalyzer.id;
    }

    /**
     * Update an existing analyzer in the specified organization.
     * @param orgId - ID of the organization containing the analyzer to update.
     * @param analyzerId - ID of the analyzer to be updated.
     * @param analyzerData - Updated data for the analyzer.
     * @param user - Authenticated user updating the analyzer.
     */
    async update(
        orgId: string,
        analyzerId: string,
        analyzerData: AnalyzerCreateBody,
        user: AuthenticatedUser
    ): Promise<void> {
        // Check if the user is allowed to update an analyzer (is at least admin)
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        const analyzer = await this.analyzersRepository.getAnalyzerById(analyzerId);

        // Update the properties of the analyzer with new data
        analyzer.name = analyzerData.name;
        analyzer.description = analyzerData.description;
        analyzer.steps = analyzerData.steps;
        if (analyzerData.supported_languages) {
            analyzer.supported_languages = analyzerData.supported_languages;
        }
        if (analyzerData.language_config) {
            analyzer.language_config = analyzerData.language_config;
        }
        if (analyzerData.logo) {
            analyzer.logo = analyzerData.logo;
        }

        // Save the updated analyzer to the database
        await this.analyzersRepository.saveAnalyzer(analyzer);

        // Log the update of the analyzer in the organization audit log
        await this.organizationLoggerService.addAuditLog(
            ActionType.AnalyzerUpdate,
            `The user updated an analyzer ${analyzerData.name} in the organization.`,
            orgId,
            user.userId
        );
    }

    /**
     * Retrieve a specific analyzer by ID from the specified organization.
     * @param orgId - ID of the organization containing the analyzer to retrieve.
     * @param id - ID of the analyzer to be retrieved.
     * @param user - Authenticated user retrieving the analyzer.
     */
    async get(orgId: string, id: string, user: AuthenticatedUser): Promise<Analyzer> {
        // Check if the user is allowed to get an analyzer (is at least user)
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // Verify that the specified analyzer belongs to the organization
        await this.analyzersRepository.doesAnalyzerBelongToOrg(id, orgId);

        return this.analyzersRepository.getAnalyzerById(id);
    }

    /**
     * Retrieve an analyzer by name from the specified organization.
     * @param orgId - ID of the organization containing the analyzer to retrieve.
     * @param name - Name of the analyzer to be retrieved.
     * @param user - Authenticated user retrieving the analyzer.
     */
    async getByName(orgId: string, name: string, user: AuthenticatedUser): Promise<Analyzer> {
        // Check if the user is allowed to get an analyzer (is at least user)
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const analyzer = await this.analyzersRepository.getByNameAndOrganization(name, orgId);

        // Verify that the specified analyzer belongs to the organization
        await this.analyzersRepository.doesAnalyzerBelongToOrg(analyzer.id, orgId);

        return analyzer;
    }

    /**
     * Retrieve multiple analyzers from the specified organization with pagination.
     * @param orgId - ID of the organization containing the analyzers to retrieve.
     * @param paginationConfUser - User-supplied pagination configuration.
     * @param user - Authenticated user retrieving the analyzers.
     */
    async getMany(
        orgId: string,
        paginationConfUser: PaginationUserSuppliedConf,
        user: AuthenticatedUser
    ): Promise<TypedPaginatedData<Analyzer>> {
        // Check if the user is allowed to get analyzers (is at least user)
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        // Determine the number of entries per page based on user input or default configuration
        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        if (paginationConfUser.entriesPerPage) {
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                paginationConfUser.entriesPerPage
            );
        }

        // Determine the current page number based on user input or default to 0
        let currentPage = 0;
        if (paginationConfUser.currentPage !== undefined) {
            currentPage = Math.max(0, paginationConfUser.currentPage);
        }

        // Retrieve the paginated list of analyzers from the specified organization
        return this.analyzersRepository.getManyAnalyzers(orgId, currentPage, entriesPerPage);
    }

    /**
     * Delete a specific analyzer by ID from the specified organization.
     * @param orgId - ID of the organization containing the analyzer to delete.
     * @param id - ID of the analyzer to be deleted.
     * @param user - Authenticated user deleting the analyzer.
     */
    async delete(orgId: string, id: string, user: AuthenticatedUser): Promise<void> {
        // Check if the user is allowed to delete an analyzer (is at least admin)
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        // Verify that the specified analyzer belongs to the organization
        await this.analyzersRepository.doesAnalyzerBelongToOrg(id, orgId);

        // Delete the analyzer from the database
        await this.analyzersRepository.deleteAnalyzer(id);
    }
}
