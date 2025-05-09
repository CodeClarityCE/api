import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { ProjectMemberService } from '../../base_modules/projects/projectMember.service';
import { Injectable } from '@nestjs/common';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';
import { AnalysesRepository } from 'src/base_modules/analyses/analyses.repository';
import { AnalysisResultsRepository } from './results.repository';
import { EntityNotFound } from 'src/types/error.types';

@Injectable()
export class AnalysisResultsService {
    constructor(
        private readonly projectMemberService: ProjectMemberService,
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly analysesRepository: AnalysesRepository,
        private readonly resultsRepository: AnalysisResultsRepository
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
        await this.analysesRepository.doesAnalysesBelongToProject(analysisId, projectId);
    }

    async getResultByType(
        org_id: string,
        project_id: string,
        analysis_id: string,
        type: string,
        user: AuthenticatedUser
    ) {
        await this.checkAccess(org_id, project_id, analysis_id, user);
        const result = await this.resultsRepository.getByAnalysisIdAndPluginType(analysis_id, type);
        if (!result) {
            throw new EntityNotFound();
        }
        return result;
    }
}
