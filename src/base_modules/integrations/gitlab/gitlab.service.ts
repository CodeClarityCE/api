import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    GitlabIntegration,
    GitlabTokenType,
    LinkGitlabCreateBody,
    LinkGitlabPatchBody
} from 'src/base_modules/integrations/gitlab/gitlabIntegration.types';
import { GitlabIntegrationToken } from 'src/base_modules/integrations/Token';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';
import { UsersRepository } from 'src/base_modules/users/users.repository';
import {
    DuplicateIntegration,
    EntityNotFound,
    IntegrationInvalidToken,
    IntegrationTokenExpired,
    IntegrationTokenMissingPermissions,
    IntegrationTokenRefreshFailed,
    IntegrationTokenRetrievalFailed,
    IntegrationWrongTokenType,
    NotAMember,
    NotAuthorized
} from 'src/types/error.types';

import { Injectable } from '@nestjs/common';

import { VCSIntegrationMetaData } from '../integration.types';
import { Integration, IntegrationProvider, IntegrationType } from '../integrations.entity';
import { IntegrationsRepository } from '../integrations.repository';

import { GitlabIntegrationTokenService } from './gitlabToken.service';

// https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#prefill-personal-access-token-name-and-scopes

@Injectable()
export class GitlabIntegrationService {
    constructor(
        private readonly gitlabIntegrationTokenService: GitlabIntegrationTokenService,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly integrationsRepository: IntegrationsRepository,
        private readonly usersRepository: UsersRepository
    ) {}

    /**
     *
     * @throws {EntityNotFound}
     * @throws {NotAuthorized}
     * @param orgId
     * @param integrationId
     * @param user
     * @returns
     */
    async getGitlabIntegration(
        orgId: string,
        integrationId: string,
        user: AuthenticatedUser
    ): Promise<GitlabIntegration> {
        // (1) Check that the integration belongs to the org
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }

        // (2) Check that the user has the right to access the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);
        const integration = await this.integrationsRepository.getIntegrationById(integrationId, {
            organizations: true,
            owner: true
        });

        const gitlabIntegration = new GitlabIntegration();
        gitlabIntegration.id = integration.id;
        gitlabIntegration.access_token = integration.access_token;
        gitlabIntegration.meta_data = new VCSIntegrationMetaData();
        gitlabIntegration.added_on = integration.added_on;
        gitlabIntegration.added_by = integration.owner.id;
        gitlabIntegration.service_domain = integration.service_domain;
        gitlabIntegration.integration_type = integration.integration_type;
        gitlabIntegration.integration_provider = integration.integration_provider;
        gitlabIntegration.invalid = integration.invalid;
        if (integration.expiry_date !== undefined) {
            gitlabIntegration.expiry_date = integration.expiry_date;
        }
        gitlabIntegration.organization_id = integration.organizations[0]!.id;
        if (integration.refresh_token !== undefined) {
            gitlabIntegration.refresh_token = integration.refresh_token;
        }
        gitlabIntegration.service_base_url = integration.service_domain;
        gitlabIntegration.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;

        return gitlabIntegration;
    }

    /**
     * Remove an existing gitlab integration from the organization
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @param orgId The organization to which the integration belongs
     * @param integrationId The integration id
     * @param user The authenticated user
     * @returns no data response
     */
    async removeGitlabIntegration(
        _orgId: string,
        _integrationId: string,
        _user: AuthenticatedUser
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    /**
     * Add a gitlab integration to the organization
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {IntegrationWrongTokenType} In case the token appears to be of the incorrect form
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @throws {DuplicateIntegration} In case that a gitlab integration already exists on the organization
     *
     * @param orgId The organization to which to add the integration to
     * @param linkGitlabCreate The information on the creation on the integration from the user
     * @param user The authenticated user
     * @returns the id of the created gitlab integration
     */
    async addGitlabIntegration(
        orgId: string,
        linkGitlabCreate: LinkGitlabCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        if (linkGitlabCreate.token_type !== GitlabTokenType.PERSONAL_ACCESS_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        const tokenType = this.getTokenTypeFromTokenString(linkGitlabCreate.token);
        if (tokenType !== GitlabTokenType.PERSONAL_ACCESS_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        const organization = await this.organizationsRepository.getOrganizationById(orgId, {
            integrations: true
        });
        if (!organization) {
            throw new EntityNotFound();
        }

        // Check if the organization already has a GitLab integration
        if (
            organization.integrations?.some(
                (i) => i.integration_provider === IntegrationProvider.GITLAB
            )
        ) {
            throw new DuplicateIntegration();
        }

        // const [expires, expiresAt] =
        //     await this.gitlabIntegrationTokenService.getPersonalAccessTokenExpiryRemote(
        //         linkGitlabCreate.token,
        //         linkGitlabCreate.gitlab_instance_url
        //     );
        // await this.gitlabIntegrationTokenService.validatePersonalAccessTokenPermissions(
        //     linkGitlabCreate.token,
        //     linkGitlabCreate.gitlab_instance_url,
        //     {}
        // );

        const owner = await this.usersRepository.getUserById(user.userId);

        const integration: Integration = new Integration();
        integration.integration_type = IntegrationType.VCS;
        integration.integration_provider = IntegrationProvider.GITLAB;
        integration.access_token = linkGitlabCreate.token;
        integration.token_type = GitlabTokenType.PERSONAL_ACCESS_TOKEN;
        integration.invalid = false;
        integration.added_on = new Date();
        integration.owner = owner;
        integration.service_domain = linkGitlabCreate.gitlab_instance_url;
        // if (expires && expiresAt) {
        //     integration.expiry_date = expiresAt;
        // }

        integration.users = [owner];

        const addedIntegration = await this.integrationsRepository.saveIntegration(integration);

        organization.integrations?.push(addedIntegration);
        await this.organizationsRepository.saveOrganization(organization);

        return addedIntegration.id;
    }

    /**
     * Modify an existing gitlab integration of the organization
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     *
     * @param orgId The organization to which the integration belongs
     * @param integrationId The integration id
     * @param linkGitlabCreate The information on the creation on the integration from the user
     * @param user The authenticated user
     * @returns no data response
     */
    async modifyGitlabIntegration(
        orgId: string,
        integrationId: string,
        linkGitlabCreate: LinkGitlabPatchBody,
        user: AuthenticatedUser
    ): Promise<void> {
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        if (linkGitlabCreate.token_type !== GitlabTokenType.PERSONAL_ACCESS_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        throw new Error('Method not implemented.');
    }

    /**
     * Return the gitlab integration's token
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
     * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @throws {IntegrationWrongTokenType} In case the token type is not supported
     *
     * @param integrationId The integration id
     * @returns the gitlab token
     */
    async getToken(integrationId: string): Promise<GitlabIntegrationToken> {
        try {
            const integration = await this.integrationsRepository.getIntegrationById(integrationId);
            const token = new GitlabIntegrationToken(
                this.gitlabIntegrationTokenService,
                integrationId,
                integration.access_token,
                integration.token_type as GitlabTokenType,
                integration.service_domain
            );

            await token.validate();

            return token;
        } catch (err) {
            if (
                err instanceof IntegrationTokenMissingPermissions ||
                err instanceof IntegrationTokenExpired ||
                err instanceof IntegrationInvalidToken ||
                err instanceof IntegrationTokenRetrievalFailed ||
                err instanceof IntegrationTokenRefreshFailed
            ) {
                // TODO: Implement marking the integration as invalid in the repository
                throw err;
            }

            if (err instanceof NotAMember) {
                throw new NotAuthorized();
            }

            throw err;
        }
    }

    /**
     * Infer the gitlab token type from the token string
     * @throws {IntegrationWrongTokenType} If the token type is not supported
     * @param token The token string
     * @returns the gitlab token type
     */
    private getTokenTypeFromTokenString(token: string): GitlabTokenType {
        if (token.startsWith('glpat')) {
            return GitlabTokenType.PERSONAL_ACCESS_TOKEN;
        }
        throw new IntegrationWrongTokenType();
    }
}
