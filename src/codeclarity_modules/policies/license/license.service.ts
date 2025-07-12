import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { PaginationConfig, TypedPaginatedData } from 'src/types/pagination.types';
import {
    LicensePolicyCreateBody,
    LicensePolicyPatchBody
} from 'src/codeclarity_modules/policies/license/licensePolicy.types';
import { PaginationUserSuppliedConf } from 'src/types/pagination.types';
import { SortDirection } from 'src/types/sort.types';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { PolicyType } from 'src/codeclarity_modules/policies/policy.types';
import { Policy, PolicyFrontend } from 'src/codeclarity_modules/policies/policy.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';
import { UsersRepository } from 'src/base_modules/users/users.repository';

@Injectable()
export class LicensePolicyService {
    constructor(
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly usersRepository: UsersRepository,
        @InjectRepository(Policy, 'codeclarity')
        private policyRepository: Repository<Policy>
    ) {}

    /**
     * Create a license policy
     * @param orgId The id of the organization
     * @param create The license policy data
     * @param user The authenticated user
     * @returns the id of the created license policy
     */
    async create(
        orgId: string,
        create: LicensePolicyCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        // Only owners and admins can add an policy to the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        const organization = await this.organizationsRepository.getOrganizationById(orgId);
        if (!organization) {
            throw new Error('EntityNotFound');
        }

        const creator = await this.usersRepository.getUserById(user.userId);
        if (!creator) {
            throw new Error('EntityNotFound');
        }

        const policy = await this.policyRepository.save({
            policy_type: PolicyType.LICENSE_POLICY,
            default: create.default,
            created_on: new Date(),
            created_by: creator,
            name: create.name,
            description: create.description,
            content: create.licenses,
            organizations: [organization],
            analyses: []
        } as Partial<Policy>);

        return policy.id;
    }

    /**
     * Get a license policy
     * @param orgId The id of the org
     * @param licensePolicyId The id of the license policy
     * @param user The authenticated user
     * @returns the license policy
     */
    async get(orgId: string, licensePolicyId: string, user: AuthenticatedUser): Promise<Policy> {
        // (1) Check if user has access to org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const policy = await this.policyRepository.findOne({
            where: {
                id: licensePolicyId
            }
        });

        if (!policy) {
            throw new Error('EntityNotFound');
        }

        return policy;
    }

    /**
     * Get the license policies belonging to the org
     * @param orgId The id of the org
     * @param paginationUserSuppliedConf Paginiation configuration
     * @param user The authenticatéd user
     * @param searchKey A search key to filter the records by
     * @param sortBy A sort field to sort the records by
     * @param sortDirection A sort direction
     * @returns the license policies belonging to the org
     */
    async getMany(
        orgId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser,
        _searchKey?: string,
        _sortBy?: string,
        _sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<PolicyFrontend>> {
        // Check if user has access to org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

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

        const queryBuilder = this.policyRepository
            .createQueryBuilder('policy')
            .leftJoin('policy.organizations', 'organization')
            .where('organization.id = :orgId', { orgId });

        const fullCount = await queryBuilder.getCount();

        const policies = await queryBuilder
            .skip(currentPage * entriesPerPage)
            .take(entriesPerPage)
            .getMany();

        const res: Array<PolicyFrontend> = [];
        res.push(
            ...policies.map((policy) => ({
                id: policy.id,
                name: policy.name,
                description: policy.description,
                default: policy.default,
                content: policy.content,
                created_on: policy.created_on,
                created_by: '',
                policy_type: policy.policy_type
            }))
        );
        return {
            data: res,
            page: currentPage,
            entry_count: policies.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: fullCount, // once you apply filters this needs to change
            filter_count: {}
        };
    }

    /**
     * Update an existing license policy
     * @throws {EntityNotFound} if the license policy does not exist
     *
     * @param orgId The id of the organization to which the license policy belongs
     * @param licensePolicyId The id of the license policy
     * @param update The update
     * @param user The authenticated user
     */
    async update(
        orgId: string,
        _licensePolicyId: string,
        _update: LicensePolicyPatchBody,
        user: AuthenticatedUser
    ): Promise<void> {
        // Only owners and admins can update an policy to the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);
        throw new Error('Method not implemented.');
    }

    /**
     * Remove an existing license policy
     * @throws {EntityNotFound} if the dependency patch policy does not exist
     *
     * @param orgId The id of the organization to which the policy belongs
     * @param licensePolicyId The id of the dependency patch policy
     * @param user The authenticated user
     */
    async remove(orgId: string, _licensePolicyId: string, user: AuthenticatedUser): Promise<void> {
        // Only owners and admins can remove an policy to the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);
        throw new Error('Method not implemented.');
    }
}
