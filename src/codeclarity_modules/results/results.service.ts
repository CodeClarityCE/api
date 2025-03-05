import { AuthenticatedUser } from 'src/types/auth/types';
import { AnalysesMemberService } from '../../base_modules/analyses/analysesMembership.service';
import { ProjectMemberService } from '../../base_modules/projects/projectMember.service';
import { Injectable } from '@nestjs/common';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';

@Injectable()
export class AnalysisResultsService {
    constructor(
        private readonly projectMemberService: ProjectMemberService,
        private readonly analysesMemberService: AnalysesMemberService,
        private readonly organizationsRepository: OrganizationsRepository
    ) {}

    /**
     * Check if the user is allowed to acces the analysis result
     * @param orgId The id of the organization
     * @param projectId The id of the project
     * @param analysisId The id of the analysis
     * @param user The authenticated user
     */
    async checkAccess(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ) {
        // (1) Check if user has access to org
        await this.organizationsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);

        // (3) Check if the analyses belongs to the project
        await this.analysesMemberService.doesAnalysesBelongToProject(
            analysisId,
            projectId
        );
    }
}
