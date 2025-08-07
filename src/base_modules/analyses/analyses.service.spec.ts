import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AnalysesService } from './analyses.service';
import { ProjectMemberService } from '../projects/projectMember.service';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { AnalyzersRepository } from '../analyzers/analyzers.repository';
import { AnalysisResultsRepository } from 'src/codeclarity_modules/results/results.repository';
import { SBOMRepository } from 'src/codeclarity_modules/results/sbom/sbom.repository';
import { VulnerabilitiesRepository } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.repository';
import { LicensesRepository } from 'src/codeclarity_modules/results/licenses/licenses.repository';
import { AnalysesRepository } from './analyses.repository';
import { AnalysisStatus } from './analysis.entity';
import { AnalysisCreateBody } from './analysis.types';
import { AuthenticatedUser, ROLE } from '../auth/auth.types';
import { MemberRole } from '../organizations/memberships/orgMembership.types';
import { AnaylzerMissingConfigAttribute } from '../analyzers/analyzers.errors';
import { RabbitMQError } from 'src/types/error.types';
import * as amqp from 'amqplib';

// Mock amqplib
jest.mock('amqplib', () => ({
    connect: jest.fn()
}));

describe('AnalysesService', () => {
    let service: AnalysesService;
    let projectMemberService: ProjectMemberService;
    let usersRepository: UsersRepository;
    let organizationsRepository: OrganizationsRepository;
    let projectsRepository: ProjectsRepository;
    let analyzersRepository: AnalyzersRepository;
    let resultsRepository: AnalysisResultsRepository;
    let sbomRepository: SBOMRepository;
    let vulnerabilitiesRepository: VulnerabilitiesRepository;
    let licensesRepository: LicensesRepository;
    let analysesRepository: AnalysesRepository;

    // Mock data
    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockAnalyzer = {
        id: 'analyzer-123',
        name: 'Test Analyzer',
        steps: [
            [
                {
                    name: 'step1',
                    version: '1.0.0',
                    config: {
                        option1: { required: true, default: 'value1' }
                    }
                }
            ],
            [
                {
                    name: 'step2',
                    version: '1.0.0',
                    config: null
                }
            ]
        ]
    };

    const mockProject = {
        id: 'project-123',
        name: 'Test Project',
        integration: { id: 'integration-123' }
    };

    const mockOrganization = {
        id: 'org-123',
        name: 'Test Organization'
    };

    const mockCreator = {
        id: 'user-123',
        email: 'test@example.com'
    };

    const mockAnalysis = {
        id: 'analysis-123',
        status: AnalysisStatus.REQUESTED,
        stage: 0,
        project: mockProject,
        results: []
    } as any;

    const mockAnalysisCreateBody: AnalysisCreateBody = {
        analyzer_id: 'analyzer-123',
        tag: 'v1.0.0',
        branch: 'main',
        commit_hash: 'abc123',
        config: {
            step1: {
                option1: 'custom-value'
            }
        }
    };

    // Mock RabbitMQ connection
    const mockChannel = {
        assertQueue: jest.fn(),
        sendToQueue: jest.fn(),
        close: jest.fn()
    };

    const mockConnection = {
        createChannel: jest.fn().mockResolvedValue(mockChannel)
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalysesService,
                {
                    provide: ProjectMemberService,
                    useValue: {
                        doesProjectBelongToOrg: jest.fn()
                    }
                },
                {
                    provide: ConfigService,
                    useValue: {
                        getOrThrow: jest.fn((key: string) => {
                            const config: { [key: string]: string } = {
                                AMQP_ANALYSES_QUEUE: 'analyses',
                                AMQP_PROTOCOL: 'amqp',
                                AMQP_USER: 'user',
                                AMQP_HOST: 'localhost',
                                AMQP_PORT: '5672'
                            };
                            return config[key];
                        })
                    }
                },
                {
                    provide: UsersRepository,
                    useValue: {
                        getUserById: jest.fn()
                    }
                },
                {
                    provide: OrganizationsRepository,
                    useValue: {
                        hasRequiredRole: jest.fn(),
                        getOrganizationById: jest.fn()
                    }
                },
                {
                    provide: ProjectsRepository,
                    useValue: {
                        getProjectById: jest.fn(),
                        doesProjectBelongToOrg: jest.fn()
                    }
                },
                {
                    provide: AnalyzersRepository,
                    useValue: {
                        getAnalyzerById: jest.fn()
                    }
                },
                {
                    provide: AnalysisResultsRepository,
                    useValue: {
                        delete: jest.fn(),
                        getAllByAnalysisId: jest.fn()
                    }
                },
                {
                    provide: SBOMRepository,
                    useValue: {
                        getSbomResult: jest.fn()
                    }
                },
                {
                    provide: VulnerabilitiesRepository,
                    useValue: {
                        getVulnsResult: jest.fn()
                    }
                },
                {
                    provide: LicensesRepository,
                    useValue: {
                        getLicensesResult: jest.fn()
                    }
                },
                {
                    provide: AnalysesRepository,
                    useValue: {
                        saveAnalysis: jest.fn(),
                        getAnalysisById: jest.fn(),
                        doesAnalysesBelongToProject: jest.fn(),
                        getAnalysisByProjectId: jest.fn(),
                        deleteAnalysis: jest.fn(),
                        getScheduledAnalysesByProjectId: jest.fn(),
                        getAllByAnalysisId: jest.fn()
                    }
                }
            ]
        }).compile();

        service = module.get<AnalysesService>(AnalysesService);
        projectMemberService = module.get<ProjectMemberService>(ProjectMemberService);
        usersRepository = module.get<UsersRepository>(UsersRepository);
        organizationsRepository = module.get<OrganizationsRepository>(OrganizationsRepository);
        projectsRepository = module.get<ProjectsRepository>(ProjectsRepository);
        analyzersRepository = module.get<AnalyzersRepository>(AnalyzersRepository);
        resultsRepository = module.get<AnalysisResultsRepository>(AnalysisResultsRepository);
        sbomRepository = module.get<SBOMRepository>(SBOMRepository);
        vulnerabilitiesRepository =
            module.get<VulnerabilitiesRepository>(VulnerabilitiesRepository);
        licensesRepository = module.get<LicensesRepository>(LicensesRepository);
        analysesRepository = module.get<AnalysesRepository>(AnalysesRepository);

        // Reset mocks
        jest.clearAllMocks();
        (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);
        process.env.AMQP_PASSWORD = 'password';
    });

    describe('create', () => {
        it('should create an analysis successfully', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getAnalyzerById').mockResolvedValue(
                mockAnalyzer as any
            );
            jest.spyOn(projectsRepository, 'getProjectById').mockResolvedValue(mockProject as any);
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(
                mockOrganization as any
            );
            jest.spyOn(analysesRepository, 'saveAnalysis').mockResolvedValue(mockAnalysis);

            // Act
            const result = await service.create(
                'org-123',
                'project-123',
                mockAnalysisCreateBody,
                mockUser
            );

            // Assert
            expect(result).toBe('analysis-123');
            expect(organizationsRepository.hasRequiredRole).toHaveBeenCalledWith(
                'org-123',
                'user-123',
                MemberRole.USER
            );
            expect(projectMemberService.doesProjectBelongToOrg).toHaveBeenCalledWith(
                'project-123',
                'org-123'
            );
            expect(analysesRepository.saveAnalysis).toHaveBeenCalled();
            expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
                'analyses',
                Buffer.from(
                    JSON.stringify({
                        analysis_id: 'analysis-123',
                        integration_id: 'integration-123',
                        organization_id: 'org-123',
                        project_id: 'project-123'
                    })
                )
            );
        });

        it('should throw AnaylzerMissingConfigAttribute when required config is missing', async () => {
            // Arrange
            const analyzerWithRequiredConfig = {
                ...mockAnalyzer,
                steps: [
                    [
                        {
                            name: 'step1',
                            version: '1.0.0',
                            config: {
                                requiredOption: { required: true }
                            }
                        }
                    ]
                ]
            };
            const bodyWithoutRequiredConfig = {
                ...mockAnalysisCreateBody,
                config: {} // Empty config, missing step1 entirely
            };

            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getAnalyzerById').mockResolvedValue(
                analyzerWithRequiredConfig as any
            );
            jest.spyOn(projectsRepository, 'getProjectById').mockResolvedValue(mockProject as any);
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(
                mockOrganization as any
            );

            // Act & Assert
            await expect(
                service.create('org-123', 'project-123', bodyWithoutRequiredConfig, mockUser)
            ).rejects.toThrow(AnaylzerMissingConfigAttribute);
        });

        it('should handle RabbitMQ connection error', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getAnalyzerById').mockResolvedValue(
                mockAnalyzer as any
            );
            jest.spyOn(projectsRepository, 'getProjectById').mockResolvedValue(mockProject as any);
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(
                mockOrganization as any
            );
            jest.spyOn(analysesRepository, 'saveAnalysis').mockResolvedValue(mockAnalysis);
            (amqp.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

            // Act & Assert
            await expect(
                service.create('org-123', 'project-123', mockAnalysisCreateBody, mockUser)
            ).rejects.toThrow(RabbitMQError);
        });

        it('should handle project without integration', async () => {
            // Arrange
            const projectWithoutIntegration = { ...mockProject, integration: null };
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analyzersRepository, 'getAnalyzerById').mockResolvedValue(
                mockAnalyzer as any
            );
            jest.spyOn(projectsRepository, 'getProjectById').mockResolvedValue(
                projectWithoutIntegration as any
            );
            jest.spyOn(usersRepository, 'getUserById').mockResolvedValue(mockCreator as any);
            jest.spyOn(organizationsRepository, 'getOrganizationById').mockResolvedValue(
                mockOrganization as any
            );
            jest.spyOn(analysesRepository, 'saveAnalysis').mockResolvedValue(mockAnalysis);

            // Act
            const result = await service.create(
                'org-123',
                'project-123',
                mockAnalysisCreateBody,
                mockUser
            );

            // Assert
            expect(result).toBe('analysis-123');
            expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
                'analyses',
                Buffer.from(
                    JSON.stringify({
                        analysis_id: 'analysis-123',
                        integration_id: null,
                        organization_id: 'org-123',
                        project_id: 'project-123'
                    })
                )
            );
        });
    });

    describe('get', () => {
        it('should retrieve an analysis successfully', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analysesRepository, 'doesAnalysesBelongToProject').mockResolvedValue();
            jest.spyOn(analysesRepository, 'getAnalysisById').mockResolvedValue(mockAnalysis);

            // Act
            const result = await service.get('org-123', 'project-123', 'analysis-123', mockUser);

            // Assert
            expect(result).toEqual(mockAnalysis);
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
            expect(analysesRepository.getAnalysisById).toHaveBeenCalledWith('analysis-123');
        });
    });

    describe('getChart', () => {
        it('should retrieve chart data successfully', async () => {
            // Arrange
            const mockSbomOutput = {
                workspaces: {
                    default: {
                        dependencies: {
                            dep1: {},
                            dep2: {},
                            dep3: {}
                        }
                    }
                },
                analysis_info: {
                    default_workspace_name: 'default'
                }
            };

            const mockVulnsOutput = {
                workspaces: {
                    default: {
                        Vulnerabilities: [{ id: 'vuln1' }, { id: 'vuln2' }]
                    }
                },
                analysis_info: {
                    default_workspace_name: 'default'
                }
            };

            const mockLicensesOutput = {
                analysis_info: {
                    stats: {
                        number_of_spdx_licenses: 5,
                        number_of_non_spdx_licenses: 2,
                        number_of_permissive_licenses: 4,
                        number_of_copy_left_licenses: 3
                    }
                }
            };

            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analysesRepository, 'doesAnalysesBelongToProject').mockResolvedValue();
            jest.spyOn(sbomRepository, 'getSbomResult').mockResolvedValue(mockSbomOutput as any);
            jest.spyOn(vulnerabilitiesRepository, 'getVulnsResult').mockResolvedValue(
                mockVulnsOutput as any
            );
            jest.spyOn(licensesRepository, 'getLicensesResult').mockResolvedValue(
                mockLicensesOutput as any
            );

            // Act
            const result = await service.getChart(
                'org-123',
                'project-123',
                'analysis-123',
                mockUser
            );

            // Assert
            expect(result).toEqual([
                { x: 'Latest', y: 'Vulnerabilities', v: 2 },
                { x: 'Latest', y: 'Dependencies', v: 3 },
                { x: 'Latest', y: 'SPDX Licenses', v: 5 },
                { x: 'Latest', y: 'Non-SPDX Licenses', v: 2 },
                { x: 'Latest', y: 'Permissive Licenses', v: 4 },
                { x: 'Latest', y: 'Copy Left Licenses', v: 3 }
            ]);
        });
    });

    describe('getMany', () => {
        it('should retrieve paginated analyses', async () => {
            // Arrange
            const mockPaginatedData = {
                data: [mockAnalysis],
                page: 0,
                entry_count: 1,
                entries_per_page: 10,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analysesRepository, 'getAnalysisByProjectId').mockResolvedValue(
                mockPaginatedData
            );

            // Act
            const result = await service.getMany(
                'org-123',
                'project-123',
                { entriesPerPage: 10, currentPage: 0 },
                mockUser
            );

            // Assert
            expect(result).toEqual(mockPaginatedData);
            expect(analysesRepository.getAnalysisByProjectId).toHaveBeenCalledWith(
                'project-123',
                0,
                10
            );
        });

        it('should apply pagination limits', async () => {
            // Arrange
            const mockPaginatedData = {
                data: [],
                page: 0,
                entry_count: 0,
                entries_per_page: 100,
                total_entries: 0,
                total_pages: 0,
                matching_count: 0,
                filter_count: {}
            };

            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analysesRepository, 'getAnalysisByProjectId').mockResolvedValue(
                mockPaginatedData
            );

            // Act
            const result = await service.getMany(
                'org-123',
                'project-123',
                { entriesPerPage: 200, currentPage: -1 },
                mockUser
            );

            // Assert
            expect(result).toEqual(mockPaginatedData);
            expect(analysesRepository.getAnalysisByProjectId).toHaveBeenCalledWith(
                'project-123',
                0,
                100
            ); // max 100, min page 0
        });

        it('should use default pagination when not provided', async () => {
            // Arrange
            const mockPaginatedData = {
                data: [],
                page: 0,
                entry_count: 0,
                entries_per_page: 10,
                total_entries: 0,
                total_pages: 0,
                matching_count: 0,
                filter_count: {}
            };

            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analysesRepository, 'getAnalysisByProjectId').mockResolvedValue(
                mockPaginatedData
            );

            // Act
            const result = await service.getMany('org-123', 'project-123', {}, mockUser);

            // Assert
            expect(result).toEqual(mockPaginatedData);
            expect(analysesRepository.getAnalysisByProjectId).toHaveBeenCalledWith(
                'project-123',
                0,
                10
            ); // defaults
        });
    });

    describe('delete', () => {
        it('should delete an analysis and its results', async () => {
            // Arrange
            const analysisWithResults = {
                ...mockAnalysis,
                results: [{ id: 'result-1' }, { id: 'result-2' }]
            };

            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analysesRepository, 'doesAnalysesBelongToProject').mockResolvedValue();
            jest.spyOn(analysesRepository, 'getAnalysisById').mockResolvedValue(
                analysisWithResults
            );
            jest.spyOn(resultsRepository, 'delete').mockResolvedValue();
            jest.spyOn(analysesRepository, 'deleteAnalysis').mockResolvedValue();

            // Act
            await service.delete('org-123', 'project-123', 'analysis-123', mockUser);

            // Assert
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
            expect(analysesRepository.getAnalysisById).toHaveBeenCalledWith('analysis-123', {
                results: true
            });
            expect(resultsRepository.delete).toHaveBeenCalledTimes(2);
            expect(resultsRepository.delete).toHaveBeenCalledWith('result-1');
            expect(resultsRepository.delete).toHaveBeenCalledWith('result-2');
            expect(analysesRepository.deleteAnalysis).toHaveBeenCalledWith('analysis-123');
        });

        it('should handle analysis with no results', async () => {
            // Arrange
            jest.spyOn(organizationsRepository, 'hasRequiredRole').mockResolvedValue();
            jest.spyOn(projectMemberService, 'doesProjectBelongToOrg').mockResolvedValue();
            jest.spyOn(analysesRepository, 'doesAnalysesBelongToProject').mockResolvedValue();
            jest.spyOn(analysesRepository, 'getAnalysisById').mockResolvedValue(mockAnalysis);
            jest.spyOn(analysesRepository, 'deleteAnalysis').mockResolvedValue();

            // Act
            await service.delete('org-123', 'project-123', 'analysis-123', mockUser);

            // Assert
            expect(resultsRepository.delete).not.toHaveBeenCalled();
            expect(analysesRepository.deleteAnalysis).toHaveBeenCalledWith('analysis-123');
        });
    });

    describe('createScheduledExecution', () => {
        it('should create a new analysis execution successfully', async () => {
            // Arrange
            const originalAnalysis = {
                ...mockAnalysis,
                schedule_type: 'daily',
                next_scheduled_run: new Date('2024-01-15T10:00:00Z')
            };
            const newAnalysis = {
                ...originalAnalysis,
                id: 'new-analysis-123',
                schedule_type: 'once',
                next_scheduled_run: undefined,
                last_scheduled_run: undefined
            };

            jest.spyOn(analysesRepository, 'getAnalysisById').mockResolvedValue(originalAnalysis);
            jest.spyOn(analysesRepository, 'saveAnalysis').mockResolvedValue(newAnalysis);

            // Act
            const result = await service.createScheduledExecution('analysis-123');

            // Assert
            expect(result).toBe('new-analysis-123');
            expect(analysesRepository.getAnalysisById).toHaveBeenCalledWith('analysis-123', {
                analyzer: true,
                project: { integration: true },
                organization: true,
                created_by: true
            });
            expect(analysesRepository.saveAnalysis).toHaveBeenCalled();
            const savedAnalysis = (analysesRepository.saveAnalysis as jest.Mock).mock.calls[0][0];
            expect(savedAnalysis.schedule_type).toBe('once');
            expect(savedAnalysis.is_active).toBe(true);
            expect(savedAnalysis.next_scheduled_run).toBeUndefined();
            expect(savedAnalysis.last_scheduled_run).toBeUndefined();
        });

        it('should handle database error during fetch', async () => {
            // Arrange
            jest.spyOn(analysesRepository, 'getAnalysisById').mockRejectedValue(
                new Error('Database error')
            );

            // Act & Assert
            await expect(service.createScheduledExecution('analysis-123')).rejects.toThrow(
                'Database error'
            );
        });

        it('should handle database error during save', async () => {
            // Arrange
            jest.spyOn(analysesRepository, 'getAnalysisById').mockResolvedValue(mockAnalysis);
            jest.spyOn(analysesRepository, 'saveAnalysis').mockRejectedValue(
                new Error('Save error')
            );

            // Act & Assert
            await expect(service.createScheduledExecution('analysis-123')).rejects.toThrow(
                'Save error'
            );
        });
    });
});
