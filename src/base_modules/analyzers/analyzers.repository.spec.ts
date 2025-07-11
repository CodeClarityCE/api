import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyzersRepository } from './analyzers.repository';
import { Analyzer } from './analyzer.entity';
import { AnalyzerDoesNotExist } from './analyzers.errors';
import { NotAuthorized } from 'src/types/error.types';
import { TypedPaginatedData } from 'src/types/pagination.types';

describe('AnalyzersRepository', () => {
    let analyzersRepository: AnalyzersRepository;
    let mockAnalyzerRepository: jest.Mocked<Repository<Analyzer>>;

    const mockAnalyzer = {
        id: 'analyzer-123',
        name: 'Test Analyzer',
        global: false,
        description: 'A test analyzer',
        created_on: new Date('2024-01-01'),
        steps: [[]],
        organization: { id: 'org-123' } as any,
        created_by: { id: 'user-123' } as any,
        analyses: []
    } as unknown as Analyzer;

    const mockGlobalAnalyzer = {
        ...mockAnalyzer,
        id: 'global-analyzer-123',
        name: 'Global Analyzer',
        global: true,
        organization: null
    } as unknown as Analyzer;

    beforeEach(async () => {
        const mockRepository = {
            findOneBy: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalyzersRepository,
                {
                    provide: getRepositoryToken(Analyzer, 'codeclarity'),
                    useValue: mockRepository
                }
            ]
        }).compile();

        analyzersRepository = module.get<AnalyzersRepository>(AnalyzersRepository);
        mockAnalyzerRepository = module.get(getRepositoryToken(Analyzer, 'codeclarity'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getAnalyzerById', () => {
        it('should return analyzer when found', async () => {
            mockAnalyzerRepository.findOneBy.mockResolvedValue(mockAnalyzer);

            const result = await analyzersRepository.getAnalyzerById('analyzer-123');

            expect(result).toEqual(mockAnalyzer);
            expect(mockAnalyzerRepository.findOneBy).toHaveBeenCalledWith({
                id: 'analyzer-123'
            });
        });

        it('should throw AnalyzerDoesNotExist when analyzer not found', async () => {
            mockAnalyzerRepository.findOneBy.mockResolvedValue(null);

            await expect(analyzersRepository.getAnalyzerById('non-existent')).rejects.toThrow(
                AnalyzerDoesNotExist
            );

            expect(mockAnalyzerRepository.findOneBy).toHaveBeenCalledWith({
                id: 'non-existent'
            });
        });
    });

    describe('saveAnalyzer', () => {
        it('should save and return analyzer', async () => {
            const savedAnalyzer = { ...mockAnalyzer, name: 'Updated Analyzer' };
            mockAnalyzerRepository.save.mockResolvedValue(savedAnalyzer);

            const result = await analyzersRepository.saveAnalyzer(mockAnalyzer);

            expect(result).toEqual(savedAnalyzer);
            expect(mockAnalyzerRepository.save).toHaveBeenCalledWith(mockAnalyzer);
        });

        it('should handle save errors', async () => {
            const error = new Error('Save failed');
            mockAnalyzerRepository.save.mockRejectedValue(error);

            await expect(analyzersRepository.saveAnalyzer(mockAnalyzer)).rejects.toThrow(error);
        });
    });

    describe('deleteAnalyzer', () => {
        it('should delete analyzer successfully', async () => {
            mockAnalyzerRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            await analyzersRepository.deleteAnalyzer('analyzer-123');

            expect(mockAnalyzerRepository.delete).toHaveBeenCalledWith('analyzer-123');
        });

        it('should handle delete errors', async () => {
            const error = new Error('Delete failed');
            mockAnalyzerRepository.delete.mockRejectedValue(error);

            await expect(analyzersRepository.deleteAnalyzer('analyzer-123')).rejects.toThrow(error);
        });
    });

    describe('doesAnalyzerBelongToOrg', () => {
        it('should return without error for global analyzer', async () => {
            mockAnalyzerRepository.findOne.mockResolvedValueOnce(mockGlobalAnalyzer);

            await expect(
                analyzersRepository.doesAnalyzerBelongToOrg('global-analyzer-123', 'org-123')
            ).resolves.toBeUndefined();

            expect(mockAnalyzerRepository.findOne).toHaveBeenCalledWith({
                where: {
                    global: true,
                    id: 'global-analyzer-123'
                }
            });
        });

        it('should return without error when analyzer belongs to organization', async () => {
            mockAnalyzerRepository.findOne
                .mockResolvedValueOnce(null) // First call for global check
                .mockResolvedValueOnce(mockAnalyzer); // Second call for org check

            await expect(
                analyzersRepository.doesAnalyzerBelongToOrg('analyzer-123', 'org-123')
            ).resolves.toBeUndefined();

            expect(mockAnalyzerRepository.findOne).toHaveBeenNthCalledWith(1, {
                where: {
                    global: true,
                    id: 'analyzer-123'
                }
            });
            expect(mockAnalyzerRepository.findOne).toHaveBeenNthCalledWith(2, {
                relations: {
                    organization: true
                },
                where: { id: 'analyzer-123', organization: { id: 'org-123' } }
            });
        });

        it('should throw NotAuthorized when analyzer does not belong to organization and is not global', async () => {
            mockAnalyzerRepository.findOne
                .mockResolvedValueOnce(null) // First call for global check
                .mockResolvedValueOnce(null); // Second call for org check

            await expect(
                analyzersRepository.doesAnalyzerBelongToOrg('analyzer-123', 'wrong-org')
            ).rejects.toThrow(NotAuthorized);
        });
    });

    describe('getByNameAndOrganization', () => {
        const mockQueryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn()
        };

        beforeEach(() => {
            mockAnalyzerRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
        });

        it('should return analyzer when found by name and organization', async () => {
            mockQueryBuilder.getOne.mockResolvedValue(mockAnalyzer);

            const result = await analyzersRepository.getByNameAndOrganization(
                'Test Analyzer',
                'org-123'
            );

            expect(result).toEqual(mockAnalyzer);
            expect(mockAnalyzerRepository.createQueryBuilder).toHaveBeenCalledWith('analyzer');
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'analyzer.organization',
                'organization'
            );
            expect(mockQueryBuilder.where).toHaveBeenCalledWith(
                '(organization.id = :orgId or analyzer.global = true)',
                { orgId: 'org-123' }
            );
            expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('analyzer.name = :name', {
                name: 'Test Analyzer'
            });
        });

        it('should return global analyzer when found by name', async () => {
            mockQueryBuilder.getOne.mockResolvedValue(mockGlobalAnalyzer);

            const result = await analyzersRepository.getByNameAndOrganization(
                'Global Analyzer',
                'org-123'
            );

            expect(result).toEqual(mockGlobalAnalyzer);
        });

        it('should throw error when analyzer not found', async () => {
            mockQueryBuilder.getOne.mockResolvedValue(null);

            await expect(
                analyzersRepository.getByNameAndOrganization('Non-existent', 'org-123')
            ).rejects.toThrow('Analyzer not found');
        });
    });

    describe('getManyAnalyzers', () => {
        const mockQueryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orWhere: jest.fn().mockReturnThis(),
            getCount: jest.fn(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn()
        };

        beforeEach(() => {
            mockAnalyzerRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
        });

        it('should return paginated analyzers for organization', async () => {
            const analyzers = [mockAnalyzer, mockGlobalAnalyzer];
            mockQueryBuilder.getCount.mockResolvedValue(10);
            mockQueryBuilder.getMany.mockResolvedValue(analyzers);

            const result = await analyzersRepository.getManyAnalyzers('org-123', 0, 5);

            expect(result).toEqual({
                data: analyzers,
                page: 0,
                entry_count: 2,
                entries_per_page: 5,
                total_entries: 10,
                total_pages: 2,
                matching_count: 10,
                filter_count: {}
            } as TypedPaginatedData<Analyzer>);

            expect(mockAnalyzerRepository.createQueryBuilder).toHaveBeenCalledWith('analyzer');
            expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
                'analyzer.organization',
                'organization'
            );
            expect(mockQueryBuilder.where).toHaveBeenCalledWith('organization.id = :orgId', {
                orgId: 'org-123'
            });
            expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith('analyzer.global = true');
            expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
            expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
        });

        it('should handle pagination correctly for different pages', async () => {
            const analyzers = [mockAnalyzer];
            mockQueryBuilder.getCount.mockResolvedValue(15);
            mockQueryBuilder.getMany.mockResolvedValue(analyzers);

            const result = await analyzersRepository.getManyAnalyzers('org-123', 2, 5);

            expect(result.page).toBe(2);
            expect(result.total_pages).toBe(3);
            expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10); // page 2 * 5 entries per page
            expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
        });

        it('should return empty data when no analyzers found', async () => {
            mockQueryBuilder.getCount.mockResolvedValue(0);
            mockQueryBuilder.getMany.mockResolvedValue([]);

            const result = await analyzersRepository.getManyAnalyzers('org-123', 0, 5);

            expect(result.data).toEqual([]);
            expect(result.total_entries).toBe(0);
            expect(result.total_pages).toBe(0);
        });

        it('should handle single page correctly when total entries less than entries per page', async () => {
            const analyzers = [mockAnalyzer];
            mockQueryBuilder.getCount.mockResolvedValue(3);
            mockQueryBuilder.getMany.mockResolvedValue(analyzers);

            const result = await analyzersRepository.getManyAnalyzers('org-123', 0, 5);

            expect(result.total_pages).toBe(1);
            expect(result.entry_count).toBe(1);
        });
    });
});
