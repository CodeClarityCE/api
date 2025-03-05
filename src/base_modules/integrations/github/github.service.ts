import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/types/auth/types';
import { GithubIntegrationTokenService } from './githubToken.service';
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
} from 'src/types/errors/types';
import { GithubIntegrationToken } from '../Token';
import {
    GithubTokenType,
    LinkGithubCreateBody,
    LinkGithubPatchBody
} from 'src/types/entities/frontend/GithubIntegration';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { IntegrationProvider, IntegrationType } from 'src/types/entities/frontend/Integration';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersRepository } from 'src/base_modules/users/users.repository';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';

@Injectable()
export class GithubIntegrationService {
    constructor(
        private readonly githubIntegrationTokenService: GithubIntegrationTokenService,
        private readonly usersRepository: UsersRepository,
        private readonly organizationsRepository: OrganizationsRepository,
        @InjectRepository(Integration, 'codeclarity')
        private integrationRepository: Repository<Integration>
    ) { }

    /**
     * Add a github integration to the organization
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {IntegrationWrongTokenType} In case the token appears to be of the incorrect form
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @throws {DuplicateIntegration} In case that a github integration already exists on the organization
     *
     * @param orgId The organization to which to add the integration to
     * @param linkGithubCreate The information on the creation on the integration from the user
     * @param user The authenticated user
     * @returns the id of the created github integration
     */
    async addGithubIntegration(
        orgId: string,
        linkGithubCreate: LinkGithubCreateBody,
        user: AuthenticatedUser
    ): Promise<string> {
        if (linkGithubCreate.token_type != GithubTokenType.CLASSIC_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        if (
            this.getTokenTypeFromTokenString(linkGithubCreate.token) !=
            GithubTokenType.CLASSIC_TOKEN
        ) {
            throw new IntegrationWrongTokenType();
        }

        const organization = await this.organizationsRepository.getOrganizationById(orgId, { integrations: true })
        if (!organization) {
            throw new EntityNotFound();
        }

        // If the organization already has a github integration, throw an error
        if (organization.integrations) {
            if (
                organization.integrations.some(
                    (i) => i.integration_provider === IntegrationProvider.GITHUB
                )
            ) {
                throw new DuplicateIntegration();
            }
        } else {
            organization.integrations = [];
        }

        const [expires, expiresAt] =
            await this.githubIntegrationTokenService.getClassicTokenExpiryRemote(
                linkGithubCreate.token
            );
        await this.githubIntegrationTokenService.validateClassicTokenPermissions(
            linkGithubCreate.token,
            {}
        );

        const owner = await this.usersRepository.getUserById(user.userId)

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

        const added_organization = await this.integrationRepository.save(integration);

        organization.integrations.push(integration);
        await this.organizationsRepository.saveOrganization(organization);

        return added_organization.id;
    }

    /**
     * Modify an existing github integration of the organization
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {IntegrationTokenMissingPermissions} In case any scopes/permissions are not granted
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @param orgId The id of the organization
     * @param integrationId The id of the integration
     * @param linkGithubPatch The update
     * @param user The authenticated user
     * @returns
     */
    async modifyGithubIntegration(
        orgId: string,
        integrationId: string,
        linkGithubPatch: LinkGithubPatchBody,
        user: AuthenticatedUser
    ): Promise<void> {
        if (!(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))) {
            throw new NotAuthorized();
        }
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);

        if (linkGithubPatch.token_type != GithubTokenType.CLASSIC_TOKEN) {
            throw new IntegrationWrongTokenType();
        }

        if (
            this.getTokenTypeFromTokenString(linkGithubPatch.token) != GithubTokenType.CLASSIC_TOKEN
        ) {
            throw new IntegrationWrongTokenType();
        }

        const [expires, expiresAt] =
            await this.githubIntegrationTokenService.getClassicTokenExpiryRemote(
                linkGithubPatch.token
            );

        const integration = await this.integrationRepository.findOne({
            where: {
                id: integrationId
            }
        });
        if (!integration) {
            throw new EntityNotFound();
        }

        integration.access_token = linkGithubPatch.token;
        integration.token_type = GithubTokenType.CLASSIC_TOKEN;
        integration.invalid = false;
        if (expires && expiresAt) {
            integration.expiry_date = expiresAt;
        }

        this.integrationRepository.save(integration);
    }

    /**
     * Get a github integration
     * @throws {EntityNotFound}
     * @throws {NotAuthorized}
     *
     * @param orgId The id of the organization
     * @param integrationId The id of the integration
     * @param user The authenticated user
     * @returns the github integration
     */
    async getGithubIntegration(
        orgId: string,
        integrationId: string,
        user: AuthenticatedUser
    ): Promise<Integration> {
        // (1) Check that the integration belongs to the org
        if (!(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))) {
            throw new NotAuthorized();
        }

        // (2) Check that the user has the right to access the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const integration = await this.integrationRepository.findOne({
            where: {
                id: integrationId
            }
        });

        if (!integration) {
            throw new EntityNotFound();
        }
        return integration;
    }

    /**
     * Remove an existing github integration from the organization
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     *
     * @param orgId The id of the organization
     * @param integrationId The id of the integration
     * @param user The authenticated user
     */
    async removeGithubIntegration(orgId: string, integrationId: string, user: AuthenticatedUser) {
        // (1) Check that the integration belongs to the org
        if (!(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))) {
            throw new NotAuthorized();
        }

        // (2) Check that the user has the right to access the org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.ADMIN);
        // await this.githubRepo.delete(integrationId);
        throw new Error('Not implemented');
    }

    /**
     * Return the github integration's token
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} In case the integration could not be found or the integration is of the wrong type
     * @throws {IntegrationTokenMissingPermissions} In the case a token does not have the required permissions
     * @throws {IntegrationTokenExpired} In case the token is already expired
     * @throws {IntegrationInvalidToken} In case the token is not valid (revoked or non-existant)
     * @throws {IntegrationTokenRetrievalFailed} In case the token could not be fetched from the provider
     * @throws {IntegrationWrongTokenType} In case the token type is not supported
     *
     * @param integrationId The integration id
     * @returns the github token
     */
    async getToken(integrationId: string): Promise<GithubIntegrationToken> {
        try {
            const integration = await this.integrationRepository.findOne({
                where: {
                    id: integrationId
                }
            });
            if (!integration) {
                throw new EntityNotFound();
            }
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
                // this.integrationsService.markIntegrationAsInvalid(integrationId).catch((err) => {
                //     // TODO: log failure
                // });
                throw err;
            }
            if (err instanceof NotAMember) {
                throw new NotAuthorized();
            }
            throw err;
        }
    }

    /**
     * Infer the github token type from the token string
     * @throws {IntegrationWrongTokenType} If the token type is not supported
     * @param token The token string
     * @returns the github token type
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
