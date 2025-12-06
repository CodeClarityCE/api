import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import {
    GithubTokenType,
    LinkGithubCreateBody,
    LinkGithubPatchBody
} from 'src/base_modules/integrations/github/githubIntegration.types';
import { IntegrationType } from 'src/base_modules/integrations/integration.types';
import {
    Integration,
    IntegrationProvider
} from 'src/base_modules/integrations/integrations.entity';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import {
    IntegrationsRepository,
    MembershipsRepository,
    OrganizationsRepository,
    UsersRepository
} from 'src/base_modules/shared/repositories';
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
import { GithubIntegrationToken } from '../Token';
import { GithubIntegrationTokenService } from './githubToken.service';

@Injectable()
export class GithubIntegrationService {
    constructor(
        private readonly githubIntegrationTokenService: GithubIntegrationTokenService,
        private readonly membershipsRepository: MembershipsRepository,
        private readonly usersRepository: UsersRepository,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly integrationsRepository: IntegrationsRepository
    ) {}

    /**
     * Add a GitHub integration to the organization.
     *
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action.
     * @throws {IntegrationWrongTokenType} In case the token appears to be of the incorrect form.
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted.
     * @throws {IntegrationTokenExpired} In case the token is already expired.
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existent).
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider.
     * @throws {DuplicateIntegration} In case a GitHub integration already exists on the organization.
     *
     * @param orgId The ID of the organization to which to add the integration.
     * @param linkGithubCreate Information on the creation of the integration provided by the user.
     * @param user The authenticated user.
     * @returns The ID of the created GitHub integration.
     */
    async addGithubIntegration(
        orgId: string,
        linkGithubCreate: LinkGithubCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        if (linkGithubCreate.token_type !== GithubTokenType.CLASSIC_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        const tokenType = this.getTokenTypeFromTokenString(linkGithubCreate.token);
        if (tokenType !== GithubTokenType.CLASSIC_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        const organization = await this.organizationsRepository.getOrganizationById(orgId, {
            integrations: true
        });
        if (!organization) {
            throw new EntityNotFound();
        }

        // Check if the organization already has a GitHub integration
        if (
            organization.integrations?.some(
                (i) => i.integration_provider === IntegrationProvider.GITHUB
            )
        ) {
            throw new DuplicateIntegration();
        }

        const [expires, expiresAt] =
            await this.githubIntegrationTokenService.getClassicTokenExpiryRemote(
                linkGithubCreate.token
            );
        await this.githubIntegrationTokenService.validateClassicTokenPermissions(
            linkGithubCreate.token,
            {}
        );

        const owner = await this.usersRepository.getUserById(user.userId);

        const integration: Integration = new Integration();
        integration.integration_type = IntegrationType.VCS;
        integration.integration_provider = IntegrationProvider.GITHUB;
        integration.access_token = linkGithubCreate.token;
        integration.token_type = GithubTokenType.CLASSIC_TOKEN;
        integration.invalid = false;
        integration.added_on = new Date();
        integration.owner = owner;
        integration.service_domain = 'github.com';
        if (expires && expiresAt) {
            integration.expiry_date = expiresAt;
        }

        integration.users = [owner];

        const addedIntegration = await this.integrationsRepository.saveIntegration(integration);

        organization.integrations?.push(addedIntegration);
        await this.organizationsRepository.saveOrganization(organization);

        return addedIntegration.id;
    }

    /**
     * Modify an existing GitHub integration of the organization.
     *
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action.
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted.
     * @throws {IntegrationTokenExpired} In case the token is already expired.
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existent).
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider.
     *
     * @param orgId The ID of the organization.
     * @param integrationId The ID of the integration to modify.
     * @param linkGithubPatch Update information provided by the user.
     * @param user The authenticated user.
     */
    async modifyGithubIntegration(
        orgId: string,
        integrationId: string,
        linkGithubPatch: LinkGithubPatchBody,
        user: AuthenticatedUser
    ): Promise<void> {
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }

        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        if (linkGithubPatch.token_type !== GithubTokenType.CLASSIC_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        const tokenType = this.getTokenTypeFromTokenString(linkGithubPatch.token);
        if (tokenType !== GithubTokenType.CLASSIC_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        const [expires, expiresAt] =
            await this.githubIntegrationTokenService.getClassicTokenExpiryRemote(
                linkGithubPatch.token
            );

        const integration = await this.integrationsRepository.getIntegrationById(integrationId);
        integration.access_token = linkGithubPatch.token;
        integration.token_type = GithubTokenType.CLASSIC_TOKEN as string;
        integration.invalid = false;

        if (expires && expiresAt) {
            integration.expiry_date = expiresAt;
        }

        await this.integrationsRepository.saveIntegration(integration);
    }

    /**
     * Get a GitHub integration.
     *
     * @throws {EntityNotFound} If the integration is not found.
     * @throws {NotAuthorized} If the user does not have permission to access the integration.
     *
     * @param orgId The ID of the organization.
     * @param integrationId The ID of the integration.
     * @param user The authenticated user.
     * @returns The GitHub integration entity.
     */
    async getGithubIntegration(
        orgId: string,
        integrationId: string,
        user: AuthenticatedUser
    ): Promise<Integration> {
        // Check if the integration belongs to the organization
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }

        // Check if the user has permission to access the organization
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        return await this.integrationsRepository.getIntegrationById(integrationId);
    }

    /**
     * Remove an existing GitHub integration from the organization.
     *
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action.
     *
     * @param orgId The ID of the organization.
     * @param integrationId The ID of the integration to remove.
     * @param user The authenticated user.
     */
    async removeGithubIntegration(
        orgId: string,
        integrationId: string,
        user: AuthenticatedUser
    ): Promise<void> {
        // Check if the integration belongs to the organization
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }

        // Check if the user has permission to remove the integration
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        // TODO: Implement the removal of the GitHub integration from the organization
        throw new Error('Not implemented');
    }

    /**
     * Return the GitHub integration's token.
     *
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action.
     * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type.
     * @throws {IntegrationTokenMissingPermissions} In case a token does not have the required permissions.
     * @throws {IntegrationTokenExpired} In case the token is already expired.
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existent).
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider.
     * @throws {IntegrationWrongTokenType} If the token type is not supported.
     *
     * @param integrationId The ID of the integration.
     * @returns The GitHub integration token.
     */
    async getToken(integrationId: string): Promise<GithubIntegrationToken> {
        try {
            const integration = await this.integrationsRepository.getIntegrationById(integrationId);
            const token = new GithubIntegrationToken(
                this.githubIntegrationTokenService,
                integrationId,
                integration.access_token,
                integration.token_type as GithubTokenType,
                integration.refresh_token,
                integration.expiry_date
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
     * Infer the GitHub token type from the token string.
     *
     * @throws {IntegrationWrongTokenType} If the token type is not supported.
     *
     * @param token The token string.
     * @returns The inferred GitHub token type.
     */
    private getTokenTypeFromTokenString(token: string): GithubTokenType {
        if (token.startsWith('ghp')) {
            return GithubTokenType.CLASSIC_TOKEN;
        } else if (token.startsWith('gho')) {
            return GithubTokenType.OAUTH_TOKEN;
        }

        throw new IntegrationWrongTokenType();
    }
}
