import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import {
    AnalysesRepository,
    MembershipsRepository,
    ProjectsRepository
} from 'src/base_modules/shared/repositories';
import { EntityNotFound } from 'src/types/error.types';
import { Result } from './result.entity';
import { AnalysisResultsRepository } from './results.repository';

@Injectable()
export class AnalysisResultsService {
    constructor(
        private readonly projectsRepository: ProjectsRepository,
        private readonly membershipsRepository: MembershipsRepository,
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
    ): Promise<void> {
        // (1) Check if user has access to org
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // (2) Check if the project belongs to the org
        await this.projectsRepository.doesProjectBelongToOrg(projectId, orgId);

        // (3) Check if the analyses belongs to the project
        await this.analysesRepository.doesAnalysesBelongToProject(analysisId, projectId);
    }

    async getResultByType(
        org_id: string,
        project_id: string,
        analysis_id: string,
        type: string,
        user: AuthenticatedUser
    ): Promise<Result> {
        await this.checkAccess(org_id, project_id, analysis_id, user);

        // Special handling for SBOM requests - use fallback logic
        if (type === 'js-sbom' || type === 'php-sbom') {
            const result = await this.resultsRepository.getPreferredSbomResult(analysis_id, type);
            if (!result) {
                throw new EntityNotFound();
            }
            return result;
        }

        // Regular handling for non-SBOM requests
        const result = await this.resultsRepository.getByAnalysisIdAndPluginType(analysis_id, type);
        if (!result) {
            throw new EntityNotFound();
        }
        return result;
    }
}
