import { Injectable } from '@nestjs/common';
import { TypedPaginatedResponse } from 'src/types/apiResponses';
import { AuthenticatedUser } from 'src/types/auth/types';
import { EntityNotFound, NotAMember, NotAuthorized } from 'src/types/errors/types';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { PaginationConfig, PaginationUserSuppliedConf } from 'src/types/paginated/types';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { Integration } from 'src/entity/codeclarity/Integration';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';

@Injectable()
export class IntegrationsService {
    constructor(
        private readonly organizationMemberService: OrganizationsMemberService,
        @InjectRepository(Integration, 'codeclarity')
        private integrationRepository: Repository<Integration>,
        @InjectRepository(Organization, 'codeclarity')
        private organizationRepository: Repository<Organization>
    ) {}

    /**
     * Get the VCS integrations
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @param orgId The organization's id, to which to add the integration
     * @param paginationUserSuppliedConf Pagination config
     * @param user The authenticated user
     * @returns the vcs integrations
     */
    async getVCSIntegrations(
        orgId: string,
        paginationUserSuppliedConf: PaginationUserSuppliedConf,
        user: AuthenticatedUser
    ): Promise<TypedPaginatedResponse<Integration>> {
        await this.organizationMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        const currentPage = 0;

        if (paginationUserSuppliedConf.entriesPerPage)
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                paginationUserSuppliedConf.entriesPerPage
            );

        const integrations = await this.integrationRepository.find({
            relations: {
                organizations: true
            },
            where: {
                organizations: {
                    id: orgId
                }
            },
            take: entriesPerPage,
            skip: currentPage * entriesPerPage
        });

        const fullCount = await this.integrationRepository.count({
            relations: {
                organizations: true
            },
            where: {
                organizations: {
                    id: orgId
                }
            }
        });

        return {
            data: integrations,
            page: currentPage,
            entry_count: integrations.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: fullCount, // once you apply filters this needs to change
            filter_count: {}
        };
    }

    /**
     * Get an integration
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @param integrationId The integration's id
     * @param orgId The organization's id, to which to add the integration
     * @param user The authenticated user
     * @returns the vcs integrations
     */
    async getIntegration(
        integrationId: string,
        orgId: string,
        user: AuthenticatedUser
    ): Promise<Integration> {
        if (!(await this.doesIntegrationBelongToOrg(integrationId, orgId))) {
            throw new NotAuthorized();
        }

        await this.organizationMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const integration = await this.integrationRepository.findOneBy({
            id: integrationId
        });
        if (!integration) {
            throw new EntityNotFound();
        }

        return integration;
    }

    /**
     * Remove an existing integration from the given org, on behalf of the authenticated user
     * @throws {NotAuthorized} If the authenticated user is not authorized to perform this action
     * @throws {EntityNotFound} If the integration could not be found
     * @param orgId The organization's id, from which to remove the integration
     * @param user The authenticated user
     * @param integrationId The id of the existing integration
     * @returns no data response
     */
    async removeIntegration(
        orgId: string,
        user: AuthenticatedUser,
        integrationId: string
    ): Promise<void> {
        try {
            // Only owners and admins can remove an integration from the org
            await this.organizationMemberService.hasRequiredRole(
                orgId,
                user.userId,
                MemberRole.ADMIN
            );

            if (!(await this.doesIntegrationBelongToOrg(integrationId, orgId))) {
                throw new NotAuthorized();
            }

            throw new Error('Method not implemented.');
            // Delete integration
            // await this.integrationsRepo.delete(integrationId);
        } catch (err) {
            if (err instanceof NotAMember) {
                throw new NotAuthorized();
            }
            throw err;
        }
    }

    /**
     * Checks whether the integration, with the given id, belongs to the organization, with the given id
     * @param integrationId The id of the integration
     * @param orgId The id of the organization
     * @returns whether or not the integration belongs to the org
     */
    async doesIntegrationBelongToOrg(integrationId: string, orgId: string): Promise<boolean> {
        const belongs = await this.organizationRepository.exists({
            relations: {
                integrations: true
            },
            where: {
                id: orgId,
                integrations: {
                    id: integrationId
                }
            }
        });
        return belongs;
    }

    /**
     * Mark an integration as invalid, which indicates the token access not longer works
     * @throws {EntityNotFound} If the integration could not be found
     * @param integrationId The integration id
     */
    async markIntegrationAsInvalid(integrationId: string): Promise<void> {
        throw new Error('Method not implemented.');
        // return await this.integrationsRepo.update(integrationId, { invalid: true });
    }
}
