import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalysisResultsRepository } from './results.repository';
import { Result } from './result.entity';
import { EntityNotFound } from 'src/types/error.types';

describe('AnalysisResultsRepository', () => {
    let repository: AnalysisResultsRepository;
    let resultRepository: any;

    const mockResult: Result = {
        id: 'result-123',
        plugin: 'js-sbom',
        result: {
            workspaces: { default: { dependencies: {} } },
            analysis_info: { status: 'SUCCESS' }
        },
        analysis: {
            id: 'analysis-123',
            created_on: new Date('2024-01-01')
        } as any,
        created_on: new Date('2024-01-01')
    };

    const mockResultRepository = {
        delete: jest.fn(),
        remove: jest.fn(),
        findOne: jest.fn(),
        exists: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalysisResultsRepository,
                {
                    provide: getRepositoryToken(Result, 'codeclarity'),
                    useValue: mockResultRepository
                }
            ]
        }).compile();

        repository = module.get<AnalysisResultsRepository>(AnalysisResultsRepository);
        resultRepository = module.get(getRepositoryToken(Result, 'codeclarity'));

        jest.clearAllMocks();
    });

    describe('delete', () => {
        it('should delete result by id', async () => {
            mockResultRepository.delete.mockResolvedValue({ affected: 1 });

            await repository.delete('result-123');

            expect(resultRepository.delete).toHaveBeenCalledWith('result-123');
        });

        it('should handle deletion of non-existent result', async () => {
            mockResultRepository.delete.mockResolvedValue({ affected: 0 });

            await repository.delete('non-existent-result');

            expect(resultRepository.delete).toHaveBeenCalledWith('non-existent-result');
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.delete.mockRejectedValue(dbError);

            await expect(repository.delete('result-123')).rejects.toThrow(
                'Database connection failed'
            );
        });
    });

    describe('remove', () => {
        it('should remove result entity', async () => {
            mockResultRepository.remove.mockResolvedValue(mockResult);

            await repository.remove(mockResult);

            expect(resultRepository.remove).toHaveBeenCalledWith(mockResult);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.remove.mockRejectedValue(dbError);

            await expect(repository.remove(mockResult)).rejects.toThrow(
                'Database connection failed'
            );
        });
    });

    describe('removeResults', () => {
        it('should remove multiple result entities', async () => {
            const results = [mockResult, { ...mockResult, id: 'result-456' }] as Result[];
            mockResultRepository.remove.mockResolvedValue(results);

            await repository.removeResults(results);

            expect(resultRepository.remove).toHaveBeenCalledWith(results);
        });

        it('should handle empty array', async () => {
            mockResultRepository.remove.mockResolvedValue([]);

            await repository.removeResults([]);

            expect(resultRepository.remove).toHaveBeenCalledWith([]);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            const results = [mockResult] as Result[];
            mockResultRepository.remove.mockRejectedValue(dbError);

            await expect(repository.removeResults(results)).rejects.toThrow(
                'Database connection failed'
            );
        });
    });

    describe('getByAnalysisId', () => {
        it('should return result for existing analysis', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            const result = await repository.getByAnalysisId('analysis-123');

            expect(result).toEqual(mockResult);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' }
                },
                relations: undefined
            });
        });

        it('should return result with relations when provided', async () => {
            const relations = { analysis: true };
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            const result = await repository.getByAnalysisId('analysis-123', relations);

            expect(result).toEqual(mockResult);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' }
                },
                relations: relations
            });
        });

        it('should throw EntityNotFound when analysis does not exist', async () => {
            mockResultRepository.findOne.mockResolvedValue(null);

            await expect(repository.getByAnalysisId('non-existent-analysis')).rejects.toThrow(
                EntityNotFound
            );

            expect(resultRepository.findOne).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'non-existent-analysis' }
                },
                relations: undefined
            });
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.findOne.mockRejectedValue(dbError);

            await expect(repository.getByAnalysisId('analysis-123')).rejects.toThrow(
                'Database connection failed'
            );
        });
    });

    describe('getByAnalysisIdAndPluginType', () => {
        it('should return result for existing analysis and plugin', async () => {
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            const result = await repository.getByAnalysisIdAndPluginType('analysis-123', 'js-sbom');

            expect(result).toEqual(mockResult);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' },
                    plugin: 'js-sbom'
                },
                relations: undefined
            });
        });

        it('should return result with relations when provided', async () => {
            const relations = { analysis: { project: true } };
            mockResultRepository.findOne.mockResolvedValue(mockResult);

            const result = await repository.getByAnalysisIdAndPluginType(
                'analysis-123',
                'js-sbom',
                relations
            );

            expect(result).toEqual(mockResult);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' },
                    plugin: 'js-sbom'
                },
                relations: relations
            });
        });

        it('should return null when no result exists', async () => {
            mockResultRepository.findOne.mockResolvedValue(null);

            const result = await repository.getByAnalysisIdAndPluginType(
                'analysis-123',
                'non-existent-plugin'
            );

            expect(result).toBeNull();
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' },
                    plugin: 'non-existent-plugin'
                },
                relations: undefined
            });
        });

        it('should handle different plugin types', async () => {
            const vulnerabilityResult = { ...mockResult, plugin: 'js-vuln-finder' };
            mockResultRepository.findOne.mockResolvedValue(vulnerabilityResult);

            const result = await repository.getByAnalysisIdAndPluginType(
                'analysis-123',
                'js-vuln-finder'
            );

            expect(result).toEqual(vulnerabilityResult);
            expect(resultRepository.findOne).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' },
                    plugin: 'js-vuln-finder'
                },
                relations: undefined
            });
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.findOne.mockRejectedValue(dbError);

            await expect(
                repository.getByAnalysisIdAndPluginType('analysis-123', 'js-sbom')
            ).rejects.toThrow('Database connection failed');
        });
    });

    describe('resultOfAnalysisReady', () => {
        it('should return true when result exists for analysis', async () => {
            mockResultRepository.exists.mockResolvedValue(true);

            const result = await repository.resultOfAnalysisReady('analysis-123');

            expect(result).toBe(true);
            expect(resultRepository.exists).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' }
                }
            });
        });

        it('should return false when no result exists for analysis', async () => {
            mockResultRepository.exists.mockResolvedValue(false);

            const result = await repository.resultOfAnalysisReady('non-existent-analysis');

            expect(result).toBe(false);
            expect(resultRepository.exists).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'non-existent-analysis' }
                }
            });
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockResultRepository.exists.mockRejectedValue(dbError);

            await expect(repository.resultOfAnalysisReady('analysis-123')).rejects.toThrow(
                'Database connection failed'
            );
        });

        it('should use correct method name despite typo in parameter', async () => {
            // Note: The method parameter has a typo: "analysysId" instead of "analysisId"
            // But we test the current implementation
            mockResultRepository.exists.mockResolvedValue(true);

            const result = await repository.resultOfAnalysisReady('analysis-123');

            expect(result).toBe(true);
            expect(resultRepository.exists).toHaveBeenCalledWith({
                where: {
                    analysis: { id: 'analysis-123' }
                }
            });
        });
    });
});
