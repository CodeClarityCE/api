import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    EntityNotFound,
    FailedToRetrieveReposFromProvider,
    IntegrationInvalidToken,
    NotAuthorized
} from 'src/types/error.types';
import { TypedPaginatedResponse } from 'src/types/apiResponses.types';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/pagination.types';
import { CONST_VCS_INTEGRATION_CACHE_INVALIDATION_MINUTES } from './constants';
import { GithubRepositorySchema } from 'src/base_modules/integrations/github/github.types';
import { SortDirection } from 'src/types/sort.types';
import * as ms from 'ms';
import { GithubIntegrationService } from './github.service';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { RepositoryCache, RepositoryType } from 'src/base_modules/projects/repositoryCache.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';
import { IntegrationsRepository } from '../integrations.repository';

@Injectable()
export class GithubRepositoriesService {
    constructor(
        private readonly githubIntegrationService: GithubIntegrationService,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly integrationsRepository: IntegrationsRepository,
        @InjectRepository(RepositoryCache, 'codeclarity')
        private repositoryCacheRepository: Repository<RepositoryCache>
    ) {}

    /**
     * Check if github repos have been synced
     *
     * @param integrationId The id of the integration
     * @returns a boolean indicating whether the repos of the integration are synced
     */
    async areGithubReposSynced(integrationId: string): Promise<boolean> {
        const integration = await this.integrationsRepository.getIntegrationById(integrationId);

        const lastUpdated: Date | undefined = integration.last_repository_sync;

        if (!lastUpdated) return false;

        const invalidatedDate = new Date(
            ms(`-${CONST_VCS_INTEGRATION_CACHE_INVALIDATION_MINUTES}m`)
        );
        if (lastUpdated <= invalidatedDate) {
            return false;
        }

        return true;
    }

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
    async syncGithubRepos(integrationId: string): Promise<void> {
        const synced = await this.areGithubReposSynced(integrationId);
        if (!synced) {
            await this.forceSyncGithubRepos(integrationId);
        }
    }

    /**
     * Get github repositories from the integration id
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
     * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to github
     * @throws {FailedToRetrieveReposFromProvider} If authentication to github succeeded, but a different error with the request was encountered
     * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param orgId The id of the organization
     * @param integrationId The id of the integration
     * @param paginationUserSuppliedConf Pagination config
     * @param user The authenticated user
     * @param searchKey An optional search key
     * @param forceRefresh Optional, if set forces a re-sync with github
     * @param filters Optional, an array of filters
     * @returns
     */
    async getGithubRepositories(
        orgId: string,
        integrationId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser,
        searchKey?: string,
        forceRefresh?: boolean,
        filters?: string[],
        sortBy?: string,
        sortDirection?: SortDirection
    ): Promise<TypedPaginatedResponse<RepositoryCache>> {
        enum AllowedOrderBy {
            FULLY_QUALIFIED_NAME = 'fully_qualified_name',
            DESCRIPTION = 'description',
            CREATED = 'created_at',
            IMPORTED = 'imported'
        }

        // (1) Check that the user has the right to access the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check that the integration belongs to the org
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 20
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

        // If the user specifically request to re-sync the repos (for example in case a newly create repo does not show up)
        if (forceRefresh != undefined && forceRefresh == true) {
            await this.forceSyncGithubRepos(integrationId);
        } else {
            // Check if the github repo cache is synced
            const isSynced = await this.areGithubReposSynced(integrationId);

            // In case the cache is older than 10 minutes, since we last re-synced
            // or it was never synced, then re-sync
            if (!isSynced) {
                await this.forceSyncGithubRepos(integrationId);
            }
        }

        let repositoryQB = this.repositoryCacheRepository
            .createQueryBuilder('repo')
            .where('repo.integration = :integrationId', { integrationId });

        if (sortBy) {
            if (sortBy == AllowedOrderBy.FULLY_QUALIFIED_NAME)
                repositoryQB = repositoryQB.orderBy('fully_qualified_name', sortDirection ?? 'ASC');
            else if (sortBy == AllowedOrderBy.DESCRIPTION)
                repositoryQB = repositoryQB.orderBy('description', sortDirection ?? 'ASC');
            else if (sortBy == AllowedOrderBy.CREATED)
                repositoryQB = repositoryQB.orderBy('created_at', sortDirection ?? 'ASC');
            else if (sortBy == AllowedOrderBy.IMPORTED)
                repositoryQB = repositoryQB.orderBy('imported_already', sortDirection ?? 'ASC');
        }

        if (searchKey) {
            repositoryQB = repositoryQB.andWhere('repo.fully_qualified_name LIKE :searchValue', {
                searchValue: `%${searchKey}%`
            });
        }

        if (filters) {
            // if (filters.includes('only_non_imported')) {
            //     repositoryQB = repositoryQB.andWhere('repo.imported_already = :imported', {
            //         imported: false
            //     });
            // }
        }

        const fullCount = await repositoryQB.getCount();

        repositoryQB = repositoryQB.skip(currentPage * entriesPerPage).take(entriesPerPage);

        const repositories = await repositoryQB.getMany();

        // Return the paginated list of github repos for the integration
        return {
            data: repositories,
            page: currentPage,
            entry_count: repositories.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: fullCount, // once you apply filters this needs to change
            filter_count: {}
        };
    }

    /**
     * Get a specific github repository from the integration id
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} In case the repo could not be found or the integration could not be found or the integration is of the wrong type
     * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to github
     * @throws {FailedToRetrieveReposFromProvider} If authentication to github succeeded, but a different error with the request was encountered
     * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @throws {FailedToRetrieveReposFromProvider} If authentication to github succeeded, but a different error with the request was encountered
     * @param orgId The id of the organization
     * @param integrationId The id of the integration
     * @param url The url of the repository (https://github.com/user/repo)
     * @param user The authenticated user
     * @param forceRefresh Optional, if set forces a re-sync with github
     * @returns
     */
    async getGithubRepository(
        orgId: string,
        integrationId: string,
        url: string,
        user: AuthenticatedUser,
        forceRefresh?: boolean
    ): Promise<RepositoryCache> {
        // (1) Check that the user has the right to access the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check that the integration belongs to the org
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }

        const isSynced = await this.areGithubReposSynced(integrationId);

        if (forceRefresh != undefined && forceRefresh == true) {
            await this.forceSyncGithubRepos(integrationId);
        } else {
            if (!isSynced) {
                await this.forceSyncGithubRepos(integrationId);
            }
        }

        const repo = await this.repositoryCacheRepository.findOne({
            relations: ['integration'],
            where: {
                url: url,
                integration: {
                    id: integrationId
                }
            }
        });

        if (!repo) {
            throw new EntityNotFound();
        }

        return repo;
    }

    /**
     * Force Sync updated and new repos from the integration
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
     * @param user The authenticated user
     * @returns
     */
    private async forceSyncGithubRepos(integrationId: string): Promise<void> {
        // Retrieve the access token to access gitlab from the integration
        const githubToken = await this.githubIntegrationService.getToken(integrationId);
        const rawToken = githubToken.getToken();

        const integration = await this.integrationsRepository.getIntegrationById(integrationId);

        const entriesPerPage = 100;

        // Fetch 1st page
        const [_repos, lastPage] = await this.githubApiFetchPage(
            1,
            entriesPerPage,
            integration.last_repository_sync,
            rawToken
        );
        await this.saveRepos(_repos, integration.id);

        // Fetch the remaining pages
        if (lastPage > 1) {
            for (let i = 2; i <= lastPage; i++) {
                const [_repos] = await this.githubApiFetchPage(
                    i,
                    entriesPerPage,
                    integration.last_repository_sync,
                    rawToken
                );
                await this.saveRepos(_repos, integration.id);
            }
        }

        integration.last_repository_sync = new Date();
        await this.integrationsRepository.saveIntegration(integration);
    }

    /**
     * Save or update the repositories
     * @param db A results databse instance
     * @param repos An array of github repositories
     * @param transaction A db transaction instance
     */
    private async saveRepos(repos: GithubRepositorySchema[], integrationId: string): Promise<void> {
        const integration = await this.integrationsRepository.getIntegrationById(integrationId);
        for (const rawRepo of repos) {
            const repository = new RepositoryCache();
            repository.repository_type = RepositoryType.GITHUB;
            repository.url = rawRepo.html_url;
            repository.default_branch = rawRepo.default_branch;
            repository.visibility = rawRepo.visibility ?? 'public';
            repository.fully_qualified_name = rawRepo.full_name;
            repository.description = rawRepo.description ?? '';
            repository.created_at = rawRepo.created_at ?? new Date();
            repository.integration = integration;

            await this.repositoryCacheRepository.save(repository);
        }
    }

    /**
     * Fetches a page of repos from the github api
     * @throws {IntegrationInvalidToken} If the token could not be used to authenticate the request to gitlab
     * @throws {FailedToRetrieveReposFromProvider} If authentication to github succeeded, but a different error with the request was encountered
     * @param page The page to fetch
     * @param entriesPerPage Entries per page (must stay the same in one transaction)
     * @param lastUpdated The date time on which the repos where last update
     * @param token The github api token
     * @returns
     */
    private async githubApiFetchPage(
        page: number,
        entriesPerPage: number,
        lastUpdated: Date | undefined,
        token: string
    ): Promise<[GithubRepositorySchema[], number]> {
        try {
            const { Octokit } = await import('octokit');
            const octokit = new Octokit({
                auth: token
            });
            const response = await octokit.rest.repos.listForAuthenticatedUser({
                per_page: entriesPerPage,
                page: page,
                sort: 'updated',
                since: lastUpdated != undefined ? lastUpdated.toISOString() : undefined
            });

            const linkHeader = response.headers.link;
            const data: any = response.data;

            let lastPage = 1;

            // Just why github, just why...
            if (linkHeader) {
                const links = linkHeader.split(',');
                let lastLink = links.find((link: string) => link.includes('rel="last"'));
                if (lastLink) {
                    lastLink = lastLink
                        .replace('; rel="last"', '')
                        .replace('<', '')
                        .replace('>', '')
                        .trim();
                    const urlParams = new URLSearchParams(lastLink);
                    const lastPageQuery = urlParams.get('page');
                    if (lastPageQuery) {
                        lastPage = parseInt(lastPageQuery);
                    }
                }
            }

            const repos: GithubRepositorySchema[] = data;
            return [repos, lastPage];
        } catch (err) {
            if (err.status) {
                if (err.status == 401) {
                    throw new IntegrationInvalidToken();
                } else {
                    throw new FailedToRetrieveReposFromProvider();
                }
            }
            throw err;
        }
    }
}
