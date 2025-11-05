import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    DependencyPatchPolicy,
    DependencyPatchPolicyCreateBody,
    DependencyPatchPolicyPatchBody
} from 'src/codeclarity_modules/policies/dependencyPatch/dependencyPatchPolicy.types';
import { TypedPaginatedData } from 'src/types/pagination.types';
import { SortDirection } from 'src/types/sort.types';


@Injectable()
export class DependencyPatchPolicyService {
    /**
     * Create a dependency patch policy
     * @param orgId The id of the organization
     * @param create The dependency patch policy data
     * @param user The authenticated user
     * @returns the id of the created dependency patch policy
     */
    async create(
        _orgId: string,
        _create: DependencyPatchPolicyCreateBody,
        _user: AuthenticatedUser
    ): Promise<string> {
        throw new Error('Method not implemented.');
    }

    /**
     * Get a dependency patch policy
     * @throws {EntityNotFound} if the dependency patch policy does not exist
     *
     * @param orgId The id of the org
     * @param dependencyPolicyId The id of the dependenchy patch policy
     * @param user The authenticated user
     * @returns the dependency patch policy
     */
    async get(
        _orgId: string,
        _dependencyPolicyId: string,
        _user: AuthenticatedUser
    ): Promise<DependencyPatchPolicy> {
        throw new Error('Method not implemented.');
    }

    /**
     * Get the dependency patch policies belonging to the org
     * @param orgId The id of the org
     * @param paginationUserSuppliedConf Paginiation configuration
     * @param user The authenticatéd user
     * @param searchKey A search key to filter the records by
     * @param sortBy A sort field to sort the records by
     * @param sortDirection A sort direction
     * @returns the dependency patch policies belonging to the org
     */
    async getMany(
        _orgId: string,
        _user: AuthenticatedUser,
        _searchKey?: string,
        _sortBy?: string,
        _sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<DependencyPatchPolicy>> {
        throw new Error('Method not implemented.');
    }

    /**
     * Update an existing dependency patch policy
     * @throws {EntityNotFound} if the dependency patch policy does not exist
     *
     * @param orgId The id of the organization to which the policy belongs
     * @param dependencyUpgradePolicyId The id of the dependency patch policy
     * @param update The update
     * @param user The authenticated user
     */
    async update(
        _orgId: string,
        _dependencyUpgradePolicyId: string,
        _update: DependencyPatchPolicyPatchBody,
        _user: AuthenticatedUser
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Remove an existing dependecy patch policy
     * @throws {EntityNotFound} if the dependency patch policy does not exist
     *
     * @param orgId The id of the organization to which the policy belongs
     * @param dependencyUpgradePolicyId The id of the dependency patch policy
     * @param user The authenticated user
     */
    async remove(
        _orgId: string,
        _dependencyUpgradePolicyId: string,
        _user: AuthenticatedUser
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
