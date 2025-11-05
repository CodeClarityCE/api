import { AnalysesRepository } from 'src/base_modules/analyses/analyses.repository';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { OrganizationsRepository } from 'src/base_modules/organizations/organizations.repository';
import { EntityNotFound } from 'src/types/error.types';

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ProjectMemberService } from '../../base_modules/projects/projectMember.service';

import { AnalysisResultsRepository } from './results.repository';
import { AnalysisResultsService } from './results.service';

describe('AnalysisResultsService', () => {
    let service: AnalysisResultsService;
    let projectMemberService: ProjectMemberService;
    let organizationsRepository: OrganizationsRepository;
    let analysesRepository: AnalysesRepository;
    let resultsRepository: AnalysisResultsRepository;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);
    const mockResult = {
        id: 'result-123',
        analysisId: 'analysis-123',
        pluginType: 'vulnerability',
        data: { findings: [] }
    };

    const mockProjectMemberService = {
        doesProjectBelongToOrg: jest.fn()
    };

    const mockOrganizationsRepository = {
        hasRequiredRole: jest.fn()
    };

    const mockAnalysesRepository = {
        doesAnalysesBelongToProject: jest.fn()
    };

    const mockResultsRepository = {
        getByAnalysisIdAndPluginType: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalysisResultsService,
                {
                    provide: ProjectMemberService,
                    useValue: mockProjectMemberService
                },
                {
                    provide: OrganizationsRepository,
                    useValue: mockOrganizationsRepository
                },
                {
                    provide: AnalysesRepository,
                    useValue: mockAnalysesRepository
                },
                {
                    provide: AnalysisResultsRepository,
                    useValue: mockResultsRepository
                }
            ]
        }).compile();

        service = module.get<AnalysisResultsService>(AnalysisResultsService);
        projectMemberService = module.get<ProjectMemberService>(ProjectMemberService);
        organizationsRepository = module.get<OrganizationsRepository>(OrganizationsRepository);
        analysesRepository = module.get<AnalysesRepository>(AnalysesRepository);
        resultsRepository = module.get<AnalysisResultsRepository>(AnalysisResultsRepository);

        jest.clearAllMocks();
    });

    describe('checkAccess', () => {
        it('should pass when user has all required access', async () => {
            mockOrganizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            mockProjectMemberService.doesProjectBelongToOrg.mockResolvedValue(undefined);
            mockAnalysesRepository.doesAnalysesBelongToProject.mockResolvedValue(undefined);

            await expect(
                service.checkAccess('org-123', 'project-123', 'analysis-123', mockUser)
            ).resolves.toBeUndefined();

            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(projectMemberService.doesProjectBelongToOrg).toHaveBeenCalledWith(
                'project-123',
                'org-123'
            );
            expect(analysesRepository.doesAnalysesBelongToProject).toHaveBeenCalledWith(
                'analysis-123',
                'project-123'
            );
        });

        it('should throw error when user lacks organization access', async () => {
            const accessError = new Error('Insufficient organization role');
            mockOrganizationsRepository.hasRequiredRole.mockRejectedValue(accessError);

            await expect(
                service.checkAccess('org-123', 'project-123', 'analysis-123', mockUser)
            ).rejects.toThrow('Insufficient organization role');

            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(projectMemberService.doesProjectBelongToOrg).not.toHaveBeenCalled();
            expect(analysesRepository.doesAnalysesBelongToProject).not.toHaveBeenCalled();
        });

        it('should throw error when project does not belong to organization', async () => {
            const projectError = new Error('Project not in organization');
            mockOrganizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            mockProjectMemberService.doesProjectBelongToOrg.mockRejectedValue(projectError);

            await expect(
                service.checkAccess('org-123', 'project-123', 'analysis-123', mockUser)
            ).rejects.toThrow('Project not in organization');

            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(projectMemberService.doesProjectBelongToOrg).toHaveBeenCalledWith(
                'project-123',
                'org-123'
            );
            expect(analysesRepository.doesAnalysesBelongToProject).not.toHaveBeenCalled();
        });

        it('should throw error when analysis does not belong to project', async () => {
            const analysisError = new Error('Analysis not in project');
            mockOrganizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            mockProjectMemberService.doesProjectBelongToOrg.mockResolvedValue(undefined);
            mockAnalysesRepository.doesAnalysesBelongToProject.mockRejectedValue(analysisError);

            await expect(
                service.checkAccess('org-123', 'project-123', 'analysis-123', mockUser)
            ).rejects.toThrow('Analysis not in project');

            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(projectMemberService.doesProjectBelongToOrg).toHaveBeenCalledWith(
                'project-123',
                'org-123'
            );
            expect(analysesRepository.doesAnalysesBelongToProject).toHaveBeenCalledWith(
                'analysis-123',
                'project-123'
            );
        });
    });

    describe('getResultByType', () => {
        it('should return result when access is granted and result exists', async () => {
            mockOrganizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            mockProjectMemberService.doesProjectBelongToOrg.mockResolvedValue(undefined);
            mockAnalysesRepository.doesAnalysesBelongToProject.mockResolvedValue(undefined);
            mockResultsRepository.getByAnalysisIdAndPluginType.mockResolvedValue(mockResult);

            const result = await service.getResultByType(
                'org-123',
                'project-123',
                'analysis-123',
                'vulnerability',
                mockUser
            );

            expect(result).toEqual(mockResult);
            expect(resultsRepository.getByAnalysisIdAndPluginType).toHaveBeenCalledWith(
                'analysis-123',
                'vulnerability'
            );
        });

        it('should throw EntityNotFound when result does not exist', async () => {
            mockOrganizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            mockProjectMemberService.doesProjectBelongToOrg.mockResolvedValue(undefined);
            mockAnalysesRepository.doesAnalysesBelongToProject.mockResolvedValue(undefined);
            mockResultsRepository.getByAnalysisIdAndPluginType.mockResolvedValue(null);

            await expect(
                service.getResultByType(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    'vulnerability',
                    mockUser
                )
            ).rejects.toThrow(EntityNotFound);

            expect(resultsRepository.getByAnalysisIdAndPluginType).toHaveBeenCalledWith(
                'analysis-123',
                'vulnerability'
            );
        });

        it('should throw access error before checking result existence', async () => {
            const accessError = new Error('Access denied');
            mockOrganizationsRepository.hasRequiredRole.mockRejectedValue(accessError);

            await expect(
                service.getResultByType(
                    'org-123',
                    'project-123',
                    'analysis-123',
                    'vulnerability',
                    mockUser
                )
            ).rejects.toThrow('Access denied');

            expect(resultsRepository.getByAnalysisIdAndPluginType).not.toHaveBeenCalled();
        });

        it('should handle different plugin types', async () => {
            mockOrganizationsRepository.hasRequiredRole.mockResolvedValue(undefined);
            mockProjectMemberService.doesProjectBelongToOrg.mockResolvedValue(undefined);
            mockAnalysesRepository.doesAnalysesBelongToProject.mockResolvedValue(undefined);

            const sbomResult = { ...mockResult, pluginType: 'sbom' };
            mockResultsRepository.getByAnalysisIdAndPluginType.mockResolvedValue(sbomResult);

            const result = await service.getResultByType(
                'org-123',
                'project-123',
                'analysis-123',
                'sbom',
                mockUser
            );

            expect(result).toEqual(sbomResult);
            expect(resultsRepository.getByAnalysisIdAndPluginType).toHaveBeenCalledWith(
                'analysis-123',
                'sbom'
            );
        });
    });
});
