import { AuthenticatedUser } from 'src/types/auth/types';
import { AnalysesMemberService } from '../analyses/analysesMembership.service';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { ProjectMemberService } from '../projects/projectMember.service';
import { NotAuthorized } from 'src/types/errors/types';
import { Injectable } from '@nestjs/common';
import { MemberRole } from 'src/types/entities/frontend/OrgMembership';

@Injectable()
export class AnalysisResultsService {
    constructor(
        private readonly organizationMemberService: OrganizationsMemberService,
        private readonly projectMemberService: ProjectMemberService,
        private readonly analysesMemberService: AnalysesMemberService
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
        await this.organizationMemberService.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        let belongs = await this.projectMemberService.doesProjectBelongToOrg(projectId, orgId);
        if (!belongs) {
            throw new NotAuthorized();
        }

        // (3) Check if the analyses belongs to the project
        belongs = await this.analysesMemberService.doesAnalysesBelongToProject(
            analysisId,
            projectId
        );
        if (!belongs) {
            throw new NotAuthorized();
        }
    }
}
