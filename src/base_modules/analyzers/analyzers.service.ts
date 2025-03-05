import { Injectable } from '@nestjs/common';
import { AnalyzerCreateBody } from 'src/types/entities/frontend/Analyzer';
import { TypedPaginatedData } from 'src/types/paginated/types';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/paginated/types';
import { AuthenticatedUser } from 'src/types/auth/types';
import { OrganizationLoggerService } from '../organizations/organizationLogger.service';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { NotAuthorized } from 'src/types/errors/types';
import { ActionType } from 'src/types/entities/frontend/OrgAuditLog';
import { Analyzer } from 'src/entity/codeclarity/Analyzer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';

@Injectable()
export class AnalyzersService {
    constructor(
        private readonly organizationLoggerService: OrganizationLoggerService,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly usersRepository: UsersRepository,
        @InjectRepository(Analyzer, 'codeclarity')
        private analyzerRepository: Repository<Analyzer>,
    ) {}

    async create(
        orgId: string,
        analyzerData: AnalyzerCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        // Check if the user is allowed to create a analyzer (is atleast admin)
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        const creator = await this.usersRepository.getUserById(user.userId)
        if (!creator) {
            throw new Error('User not found');
        }

        const organization = await this.organizationsRepository.getOrganizationById(orgId)
        if (!organization) {
            throw new Error('Organization not found');
        }

        const analyzer = new Analyzer();
        analyzer.created_on = new Date();
        analyzer.created_by = creator;
        analyzer.name = analyzerData.name;
        analyzer.description = analyzerData.description;
        analyzer.steps = analyzerData.steps;
        analyzer.global = false;
        analyzer.organization = organization;

        const created_analyzer = await this.analyzerRepository.save(analyzer);

        await this.organizationLoggerService.addAuditLog(
            ActionType.AnalyzerCreate,
            `The User added an analyzer ${analyzerData.name} to the organization.`,
            orgId,
            user.userId
        );

        return created_analyzer.id;
    }

    async update(
        orgId: string,
        analyzerId: string,
        analyzerData: AnalyzerCreateBody,
        user: AuthenticatedUser
    ) {
        // Check if the user is allowed to create a analyzer (is atleast admin)
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        const analyzer = await this.analyzerRepository.findOneBy({ id: analyzerId });

        if (!analyzer) {
            throw new Error('Analyzer not found');
        }

        this.analyzerRepository.save(analyzer);

        await this.organizationLoggerService.addAuditLog(
            ActionType.AnalyzerCreate,
            `The User added an analyzer ${analyzerData.name} to the organization.`,
            orgId,
            user.userId
        );

        return;
    }

    async get(orgId: string, id: string, user: AuthenticatedUser): Promise<Analyzer> {
        // (1) Check if the user is allowed to get a analyzer (is atleast USER)
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check that the analyzer belongs to the org
        const belongs = await this.doesAnalyzerBelongToOrg(id, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        const analyzer = await this.analyzerRepository.findOneBy({ id: id });
        if (!analyzer) {
            throw new Error('Analyzer not found');
        }

        return analyzer;
    }

    async getByName(orgId: string, name: string, user: AuthenticatedUser): Promise<Analyzer> {
        // (1) Check if the user is allowed to get a analyzer (is atleast USER)
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const analyzer = await this.analyzerRepository
            .createQueryBuilder('analyzer')
            .leftJoinAndSelect('analyzer.organization', 'organization')
            .where('(organization.id = :orgId or analyzer.global = true)', { orgId })
            // .orWhere('analyzer.global = true')
            .andWhere('analyzer.name = :name', { name })
            .getOne();

        if (!analyzer) {
            throw new Error('Analyzer not found');
        }

        // (2) Check that the analyzer belongs to the org
        const belongs = await this.doesAnalyzerBelongToOrg(analyzer.id, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        return analyzer;
    }

    async getMany(
        orgId: string,
        paginationConfUser: PaginationUserSuppliedConf,
        user: AuthenticatedUser
    ): Promise<TypedPaginatedData<Analyzer>> {
        // Check if the user is allowed to get a analyzer (is atleast USER)
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        let currentPage = 0;

        if (paginationConfUser.entriesPerPage)
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                paginationConfUser.entriesPerPage
            );

        if (paginationConfUser.currentPage)
            currentPage = Math.max(0, paginationConfUser.currentPage);

        const analyzersQueryBuilder = this.analyzerRepository
            .createQueryBuilder('analyzer')
            .leftJoinAndSelect('analyzer.organization', 'organization')
            .where('organization.id = :orgId', { orgId })
            .orWhere('analyzer.global = true');

        const fullCount = await analyzersQueryBuilder.getCount();

        const analyzers = await analyzersQueryBuilder
            .skip(currentPage * entriesPerPage)
            .take(entriesPerPage)
            .getMany();

        return {
            data: analyzers,
            page: currentPage,
            entry_count: analyzers.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: fullCount, // once you apply filters this needs to change
            filter_count: {}
        };
    }

    async delete(orgId: string, id: string, user: AuthenticatedUser): Promise<void> {
        // (1) Check if the user is allowed to get a analyzer (is atleast ADMIN)
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        // (2) Check that the analyzer belongs to the org
        const belongs = await this.doesAnalyzerBelongToOrg(id, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        const analyzer = await this.analyzerRepository.findOneBy({ id });
        if (!analyzer) {
            throw new Error('Analyzer not found');
        }
        await this.analyzerRepository.delete(analyzer.id);
    }

    /**
     * Checks whether the anaylzer, with the given id, belongs to the organization, with the given id
     * @param analyzerId The id of the analyzer
     * @param orgId The id of the organization
     * @returns whether or not the analyzer belongs to the org
     */
    private async doesAnalyzerBelongToOrg(analyzerId: string, orgId: string): Promise<boolean> {
        // Check if analyzer is global
        let analyzer = await this.analyzerRepository.findOne({
            where: {
                global: true,
                id: analyzerId
            }
        });

        if (analyzer) {
            return true;
        }

        // Else check if it belongs to organization
        analyzer = await this.analyzerRepository.findOne({
            relations: {
                organization: true
            },
            where: { id: analyzerId, organization: { id: orgId } }
        });
        if (!analyzer) {
            return false;
        }
        return true;
    }
}
