import { Injectable } from '@nestjs/common';
import { TypedPaginatedResponse } from 'src/types/apiResponses.types';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { PaginationUserSuppliedConf } from 'src/types/pagination.types';
import { SortDirection } from 'src/types/sort.types';
import { Repository } from 'src/base_modules/integrations/integration.types';
import { RepositoryCache } from 'src/base_modules/projects/repositoryCache.entity';

@Injectable()
export class GitlabRepositoriesService {
    /**
     * Sync updated and new repos from the integration
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
     * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
     * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
     * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
     * @throws {IntegrationWrongTokenType} In case the token type is not supported
     * @param integrationId The id of the integration
     * @returns
     */
    async syncGitlabRepos(integrationId: string): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Get gitlab repositories from the integration id
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
     * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
     * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
     * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param orgId The id of the organization
     * @param integrationId The id of the integration
     * @param paginationUserSuppliedConf Pagination config
     * @param user The authenticated user
     * @param searchKey An optional search key
     * @param forceRefresh Optional, if set forces a re-sync with gitlab
     * @param filters Optional, an array of filters
     * @returns
     */
    async getGitlabRepositories(
        orgId: string,
        integrationId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser,
        searchKey?: string,
        forceRefresh?: boolean,
        filters?: string[],
        sortBy?: string,
        sortDirection?: SortDirection
    ): Promise<TypedPaginatedResponse<Repository>> {
        throw new Error('Method not implemented.');
    }

    /**
     * Get a specific gitlab repository from the integration id
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} In case the repo could not be found or the integration could not be found or the integration is of the wrong type
     * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
     * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
     * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @throws {FailedToRetrieveReposFromProvider} If authentication to gitlab succeeded, but a different error with the request was encountered
     * @param orgId The id of the organization
     * @param integrationId The id of the integration
     * @param url The url of the repository (https://gitlab.com/user/repo)
     * @param user The authenticated user
     * @param forceRefresh Optional, if set forces a re-sync with gitlab
     * @returns
     */
    async getGitlabRepository(
        orgId: string,
        integrationId: string,
        url: string,
        user: AuthenticatedUser,
        forceRefresh?: boolean
    ): Promise<RepositoryCache> {
        throw new Error('Method not implemented.');
    }
}
