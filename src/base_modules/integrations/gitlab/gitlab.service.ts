import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { IntegrationsService } from '../integrations.service';
import { GitlabIntegrationToken } from 'src/base_modules/integrations/Token';
import { IntegrationWrongTokenType, NotAuthorized } from 'src/types/errors/types';
import {
    GitlabIntegration,
    GitlabTokenType,
    LinkGitlabCreateBody,
    LinkGitlabPatchBody
} from 'src/types/entities/frontend/GitlabIntegration';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';

// https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#prefill-personal-access-token-name-and-scopes

@Injectable()
export class GitlabIntegrationService {
    constructor(
        private readonly organizationsRepository: OrganizationsRepository
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
        if (!(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))) {
            throw new NotAuthorized();
        }

        // (2) Check that the user has the right to access the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // return await this.gitlabRepo.get(integrationId);
        throw new Error('Method not implemented.');
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
        orgId: string,
        integrationId: string,
        user: AuthenticatedUser
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
        throw new Error('Method not implemented.');
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
        if (!(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))) {
            throw new NotAuthorized();
        }
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        if (linkGitlabCreate.token_type != GitlabTokenType.PERSONAL_ACCESS_TOKEN) {
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
        throw new Error('Method not implemented.');
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

    // TODO: potential race condition between checking and adding the integration
    /**
     * Checks if the gitlab integration, on the same host (ex: https://gitlab.uni.lu), already exists
     * @param orgId The organization id
     * @param serviceBaseUrl The gitlab server domain
     * @param transaction Transaction
     * @returns a boolean indicating if the gitlab integration, on the same host (ex: https://gitlab.uni.lu), already exists
     */
    private async checkIfIntegrationAlreadyExists(
        orgId: string,
        serviceBaseUrl: string
    ): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
}
