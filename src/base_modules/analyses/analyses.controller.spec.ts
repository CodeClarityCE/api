import { Test, type TestingModule } from '@nestjs/testing';
import { EntityNotFound, NotAuthorized } from '../../types/error.types';
import {
    AnalyzerDoesNotExist,
    AnaylzerMissingConfigAttribute
} from '../analyzers/analyzers.errors';
import { AuthenticatedUser, ROLE } from '../auth/auth.types';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import type { Analysis } from './analysis.entity';
import type { AnalysisCreateBody } from './analysis.types';

describe('AnalysesController', () => {
    let controller: AnalysesController;
    let analysesService: jest.Mocked<AnalysesService>;

    const mockAnalysis = {
        id: 'test-analysis-id',
        status: 'completed',
        created_on: new Date(),
        updated_on: new Date()
    } as unknown as Analysis;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    beforeEach(async () => {
        const mockAnalysesService = {
            create: jest.fn(),
            getMany: jest.fn(),
            get: jest.fn(),
            getChart: jest.fn(),
            delete: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AnalysesController],
            providers: [{ provide: AnalysesService, useValue: mockAnalysesService }]
        }).compile();

        controller = module.get<AnalysesController>(AnalysesController);
        analysesService = module.get(AnalysesService);
    });

    describe('create', () => {
        it('should create analysis successfully', async () => {
            const createBody: AnalysisCreateBody = {
                analyzer_id: 'test-analyzer-id',
                config: {},
                branch: 'main'
            };

            analysesService.create.mockResolvedValue('new-analysis-id');

            const result = await controller.create(
                mockAuthenticatedUser,
                createBody,
                'test-org-id',
                'test-project-id'
            );

            expect(analysesService.create).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                createBody,
                mockAuthenticatedUser
            );
            expect(result).toEqual({ id: 'new-analysis-id' });
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            const createBody: AnalysisCreateBody = {
                analyzer_id: 'test-analyzer-id',
                config: {},
                branch: 'main'
            };

            analysesService.create.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.create(
                    mockAuthenticatedUser,
                    createBody,
                    'test-org-id',
                    'test-project-id'
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should throw AnalyzerDoesNotExist for invalid analyzer', async () => {
            const createBody: AnalysisCreateBody = {
                analyzer_id: 'invalid-analyzer',
                config: {},
                branch: 'main'
            };

            analysesService.create.mockRejectedValue(new AnalyzerDoesNotExist());

            await expect(
                controller.create(
                    mockAuthenticatedUser,
                    createBody,
                    'test-org-id',
                    'test-project-id'
                )
            ).rejects.toThrow(AnalyzerDoesNotExist);
        });

        it('should throw AnaylzerMissingConfigAttribute for missing config', async () => {
            const createBody: AnalysisCreateBody = {
                analyzer_id: 'test-analyzer-id',
                config: {},
                branch: 'main'
            };

            analysesService.create.mockRejectedValue(new AnaylzerMissingConfigAttribute());

            await expect(
                controller.create(
                    mockAuthenticatedUser,
                    createBody,
                    'test-org-id',
                    'test-project-id'
                )
            ).rejects.toThrow(AnaylzerMissingConfigAttribute);
        });
    });

    describe('getMany', () => {
        it('should return paginated analyses', async () => {
            const paginatedResponse = {
                data: [mockAnalysis],
                page: 0,
                entry_count: 1,
                entries_per_page: 10,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            analysesService.getMany.mockResolvedValue(paginatedResponse);

            const result = await controller.getMany(
                mockAuthenticatedUser,
                'test-org-id',
                'test-project-id',
                0,
                10
            );

            expect(analysesService.getMany).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                { currentPage: 0, entriesPerPage: 10 },
                mockAuthenticatedUser
            );
            expect(result).toEqual(paginatedResponse);
        });

        it('should use default pagination values when not provided', async () => {
            const paginatedResponse = {
                data: [mockAnalysis],
                page: 0,
                entry_count: 1,
                entries_per_page: 0,
                total_entries: 1,
                total_pages: 1,
                matching_count: 1,
                filter_count: {}
            };

            analysesService.getMany.mockResolvedValue(paginatedResponse);

            const result = await controller.getMany(
                mockAuthenticatedUser,
                'test-org-id',
                'test-project-id'
            );

            expect(analysesService.getMany).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                { currentPage: 0, entriesPerPage: 0 },
                mockAuthenticatedUser
            );
            expect(result).toEqual(paginatedResponse);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            analysesService.getMany.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.getMany(mockAuthenticatedUser, 'unauthorized-org', 'test-project-id')
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('get', () => {
        it('should return analysis data', async () => {
            analysesService.get.mockResolvedValue(mockAnalysis);

            const result = await controller.get(
                mockAuthenticatedUser,
                'test-analysis-id',
                'test-org-id',
                'test-project-id'
            );

            expect(analysesService.get).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                'test-analysis-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({ data: mockAnalysis });
        });

        it('should throw EntityNotFound when analysis does not exist', async () => {
            analysesService.get.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.get(
                    mockAuthenticatedUser,
                    'nonexistent-analysis',
                    'test-org-id',
                    'test-project-id'
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            analysesService.get.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.get(
                    mockAuthenticatedUser,
                    'test-analysis-id',
                    'unauthorized-org',
                    'test-project-id'
                )
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('getChart', () => {
        it('should return chart data', async () => {
            const chartData = [
                { category: 'vulnerabilities', count: 5 },
                { category: 'licenses', count: 10 }
            ];

            analysesService.getChart.mockResolvedValue(chartData);

            const result = await controller.getChart(
                mockAuthenticatedUser,
                'test-analysis-id',
                'test-org-id',
                'test-project-id'
            );

            expect(analysesService.getChart).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                'test-analysis-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({ data: chartData });
        });

        it('should throw EntityNotFound when analysis does not exist', async () => {
            analysesService.getChart.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.getChart(
                    mockAuthenticatedUser,
                    'nonexistent-analysis',
                    'test-org-id',
                    'test-project-id'
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            analysesService.getChart.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.getChart(
                    mockAuthenticatedUser,
                    'test-analysis-id',
                    'unauthorized-org',
                    'test-project-id'
                )
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('delete', () => {
        it('should delete analysis successfully', async () => {
            analysesService.delete.mockResolvedValue(undefined);

            const result = await controller.delete(
                mockAuthenticatedUser,
                'test-analysis-id',
                'test-org-id',
                'test-project-id'
            );

            expect(analysesService.delete).toHaveBeenCalledWith(
                'test-org-id',
                'test-project-id',
                'test-analysis-id',
                mockAuthenticatedUser
            );
            expect(result).toEqual({});
        });

        it('should throw EntityNotFound when analysis does not exist', async () => {
            analysesService.delete.mockRejectedValue(new EntityNotFound());

            await expect(
                controller.delete(
                    mockAuthenticatedUser,
                    'nonexistent-analysis',
                    'test-org-id',
                    'test-project-id'
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            analysesService.delete.mockRejectedValue(new NotAuthorized());

            await expect(
                controller.delete(
                    mockAuthenticatedUser,
                    'test-analysis-id',
                    'unauthorized-org',
                    'test-project-id'
                )
            ).rejects.toThrow(NotAuthorized);
        });
    });
});
