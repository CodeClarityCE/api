import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { Integration } from 'src/base_modules/integrations/integrations.entity';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { TypedPaginatedResponse } from 'src/types/apiResponses.types';
import { NotAMember, NotAuthorized } from 'src/types/error.types';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/pagination.types';


import { OrganizationsRepository } from '../organizations/organizations.repository';

import { IntegrationsRepository } from './integrations.repository';

@Injectable()
export class IntegrationsService {
    constructor(
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly integrationRepository: IntegrationsRepository
    ) {}

    /**
     * Get the VCS integrations for a specific organization.
     * @throws {NotAuthorized} If the authenticated user does not have the required role in the organization.
     * @param orgId The ID of the organization to which the integrations belong.
     * @param paginationUserSuppliedConf User-supplied pagination configuration.
     * @param user The authenticated user making the request.
     * @returns A paginated response containing the VCS integrations.
     */
    async getVCSIntegrations(
        orgId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser
    ): Promise<TypedPaginatedResponse<Integration>> {
        // Check if the authenticated user has at least USER role in the specified organization.
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // Define the default and maximum number of entries per page for pagination.
        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        // Determine the number of entries per page based on user input or use the default value if not specified.
        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        const currentPage = 0;

        if (paginationUserSuppliedConf.entriesPerPage) {
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                paginationUserSuppliedConf.entriesPerPage
            );
        }

        // Fetch and return the VCS integrations using the specified organization ID, current page, and entries per page.
        return this.integrationRepository.getVCSIntegrations(orgId, currentPage, entriesPerPage);
    }

    /**
     * Get a specific integration by its ID within an organization.
     * @throws {NotAuthorized} If the authenticated user does not have access to the specified organization or integration.
     * @param integrationId The ID of the integration to retrieve.
     * @param orgId The ID of the organization to which the integration belongs.
     * @param user The authenticated user making the request.
     * @returns The requested integration.
     */
    async getIntegration(
        integrationId: string,
        orgId: string,
        user: AuthenticatedUser
    ): Promise<Integration> {
        // Check if the specified integration belongs to the given organization.
        if (
            !(await this.organizationsRepository.doesIntegrationBelongToOrg(integrationId, orgId))
        ) {
            throw new NotAuthorized();
        }

        // Verify that the authenticated user has at least USER role in the organization.
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // Fetch and return the integration by its ID.
        return await this.integrationRepository.getIntegrationById(integrationId);
    }

    /**
     * Remove an existing integration from a specific organization on behalf of an authenticated user.
     * @throws {NotAuthorized} If the authenticated user does not have ADMIN role in the organization or if the integration
     *                          does not belong to the specified organization.
     * @param orgId The ID of the organization from which to remove the integration.
     * @param user The authenticated user making the request.
     * @param integrationId The ID of the existing integration to be removed.
     * @returns No data response upon successful removal of the integration.
     */
    async removeIntegration(
        orgId: string,
        user: AuthenticatedUser,
        integrationId: string
    ): Promise<void> {
        try {
            // Only organization owners and admins can remove an integration.
            await this.organizationsRepository.hasRequiredRole(
                orgId,
                user.userId,
                MemberRole.ADMIN
            );

            // Verify that the specified integration belongs to the given organization.
            if (
                !(await this.organizationsRepository.doesIntegrationBelongToOrg(
                    integrationId,
                    orgId
                ))
            ) {
                throw new NotAuthorized();
            }

            throw new Error('Method not implemented.');
            // Delete integration
            // await this.integrationsRepo.delete(integrationId);
        } catch (err) {
            // Handle specific errors appropriately.
            if (err instanceof NotAMember) {
                throw new NotAuthorized();
            }
            throw err;
        }
    }

    /**
     * Mark an existing integration as invalid, indicating that the associated access token no longer works.
     * @throws {EntityNotFound} If the specified integration does not exist.
     * @param integrationId The ID of the integration to mark as invalid.
     * @returns No data response upon successful marking of the integration as invalid.
     */
    async markIntegrationAsInvalid(_integrationId: string): Promise<void> {
        throw new Error('Method not implemented.');
        // return await this.integrationsRepo.update(integrationId, { invalid: true });
    }
}
