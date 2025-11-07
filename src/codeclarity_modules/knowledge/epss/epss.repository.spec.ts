import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { EPSS } from './epss.entity';
import { EPSSRepository } from './epss.repository';

describe('EPSSRepository', () => {
    let epssRepository: EPSSRepository;
    let mockRepository: jest.Mocked<Repository<EPSS>>;

    const mockEPSS: EPSS = {
        id: 'uuid-123',
        cve: 'CVE-2021-44228',
        score: 0.97584,
        percentile: 0.99986
    };

    beforeEach(async () => {
        const mockRepo = {
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EPSSRepository,
                {
                    provide: getRepositoryToken(EPSS, 'knowledge'),
                    useValue: mockRepo
                }
            ]
        }).compile();

        epssRepository = module.get<EPSSRepository>(EPSSRepository);
        mockRepository = module.get(getRepositoryToken(EPSS, 'knowledge'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getByCVE', () => {
        it('should return EPSS data when CVE is found', async () => {
            mockRepository.findOne.mockResolvedValue(mockEPSS);

            const result = await epssRepository.getByCVE('CVE-2021-44228');

            expect(result).toEqual(mockEPSS);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2021-44228' }
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        });

        it('should return new EPSS instance when CVE is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await epssRepository.getByCVE('CVE-2023-NONEXISTENT');

            expect(result).toBeInstanceOf(EPSS);
            expect(result.id).toBeUndefined();
            expect(result.cve).toBeUndefined();
            expect(result.score).toBeUndefined();
            expect(result.percentile).toBeUndefined();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2023-NONEXISTENT' }
            });
        });

        it('should handle repository errors gracefully', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(epssRepository.getByCVE('CVE-2021-44228')).rejects.toThrow(
                'Database connection failed'
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2021-44228' }
            });
        });

        it('should handle different CVE formats', async () => {
            const testCases = [
                'CVE-2021-44228',
                'CVE-2023-1234',
                'CVE-1999-0001',
                'CVE-2020-999999',
                'cve-2023-1234',
                'CVE-2023-1234-MODIFIED'
            ];

            for (const cveId of testCases) {
                mockRepository.findOne.mockResolvedValue({ ...mockEPSS, cve: cveId });

                const result = await epssRepository.getByCVE(cveId);

                expect(result.cve).toBe(cveId);
                expect(mockRepository.findOne).toHaveBeenCalledWith({
                    where: { cve: cveId }
                });
            }
        });

        it('should handle empty string CVE ID', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await epssRepository.getByCVE('');

            expect(result).toBeInstanceOf(EPSS);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: '' }
            });
        });

        it('should handle special characters in CVE ID', async () => {
            const specialCveId = 'CVE-2023-1234\'";DROP TABLE epss;--';
            mockRepository.findOne.mockResolvedValue(null);

            const result = await epssRepository.getByCVE(specialCveId);

            expect(result).toBeInstanceOf(EPSS);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: specialCveId }
            });
        });

        it('should handle very long CVE IDs', async () => {
            const longCveId = `CVE-2023-${'1'.repeat(1000)}`;
            mockRepository.findOne.mockResolvedValue(null);

            const result = await epssRepository.getByCVE(longCveId);

            expect(result).toBeInstanceOf(EPSS);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: longCveId }
            });
        });
    });

    describe('EPSS score scenarios', () => {
        it('should handle high-risk vulnerability (Log4Shell)', async () => {
            const log4shell: EPSS = {
                id: 'uuid-log4shell',
                cve: 'CVE-2021-44228',
                score: 0.97584,
                percentile: 0.99986
            };

            mockRepository.findOne.mockResolvedValue(log4shell);

            const result = await epssRepository.getByCVE('CVE-2021-44228');

            expect(result.score).toBeGreaterThan(0.9);
            expect(result.percentile).toBeGreaterThan(0.99);
            expect(result.cve).toBe('CVE-2021-44228');
        });

        it('should handle medium-risk vulnerability', async () => {
            const mediumRisk: EPSS = {
                id: 'uuid-medium',
                cve: 'CVE-2023-5678',
                score: 0.45231,
                percentile: 0.75432
            };

            mockRepository.findOne.mockResolvedValue(mediumRisk);

            const result = await epssRepository.getByCVE('CVE-2023-5678');

            expect(result.score).toBeGreaterThan(0.3);
            expect(result.score).toBeLessThan(0.7);
            expect(result.percentile).toBeGreaterThan(0.5);
            expect(result.percentile).toBeLessThan(0.9);
        });

        it('should handle low-risk vulnerability', async () => {
            const lowRisk: EPSS = {
                id: 'uuid-low',
                cve: 'CVE-2023-9999',
                score: 0.00123,
                percentile: 0.05234
            };

            mockRepository.findOne.mockResolvedValue(lowRisk);

            const result = await epssRepository.getByCVE('CVE-2023-9999');

            expect(result.score).toBeLessThan(0.1);
            expect(result.percentile).toBeLessThan(0.2);
        });

        it('should handle zero score vulnerability', async () => {
            const zeroScore: EPSS = {
                id: 'uuid-zero',
                cve: 'CVE-2023-0000',
                score: 0.0,
                percentile: 0.0
            };

            mockRepository.findOne.mockResolvedValue(zeroScore);

            const result = await epssRepository.getByCVE('CVE-2023-0000');

            expect(result.score).toBe(0.0);
            expect(result.percentile).toBe(0.0);
        });

        it('should handle maximum score vulnerability', async () => {
            const maxScore: EPSS = {
                id: 'uuid-max',
                cve: 'CVE-2023-MAX',
                score: 1.0,
                percentile: 1.0
            };

            mockRepository.findOne.mockResolvedValue(maxScore);

            const result = await epssRepository.getByCVE('CVE-2023-MAX');

            expect(result.score).toBe(1.0);
            expect(result.percentile).toBe(1.0);
        });
    });

    describe('Edge cases and null handling', () => {
        it('should handle EPSS with null score and percentile', async () => {
            const nullValues: EPSS = {
                id: 'uuid-null',
                cve: 'CVE-2023-NULL',
                score: null as any,
                percentile: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullValues);

            const result = await epssRepository.getByCVE('CVE-2023-NULL');

            expect(result.cve).toBe('CVE-2023-NULL');
            expect(result.score).toBeNull();
            expect(result.percentile).toBeNull();
        });

        it('should handle undefined CVE parameter', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await epssRepository.getByCVE(undefined as any);

            expect(result).toBeInstanceOf(EPSS);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: undefined }
            });
        });

        it('should handle null CVE parameter', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await epssRepository.getByCVE(null as any);

            expect(result).toBeInstanceOf(EPSS);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: null }
            });
        });
    });

    describe('Concurrent operations', () => {
        it('should handle concurrent requests for the same CVE', async () => {
            mockRepository.findOne.mockResolvedValue(mockEPSS);

            const promises = Array.from({ length: 5 }, () =>
                epssRepository.getByCVE('CVE-2021-44228')
            );

            const results = await Promise.all(promises);

            results.forEach((result) => {
                expect(result).toEqual(mockEPSS);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
        });

        it('should handle concurrent requests for different CVEs', async () => {
            const cveIds = [
                'CVE-2021-44228',
                'CVE-2023-1234',
                'CVE-2020-5678',
                'CVE-2022-9999',
                'CVE-2019-1111'
            ];

            mockRepository.findOne.mockImplementation((options: any) => {
                const cveId = options.where?.cve;
                return Promise.resolve({
                    ...mockEPSS,
                    cve: cveId,
                    score: Math.random()
                });
            });

            const promises = cveIds.map((cveId) => epssRepository.getByCVE(cveId));

            const results = await Promise.all(promises);

            results.forEach((result, index) => {
                expect(result.cve).toBe(cveIds[index]);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
        });

        it('should handle mixed found and not found scenarios', async () => {
            const existingCVEs = ['CVE-2021-44228', 'CVE-2023-1234'];
            const nonExistentCVEs = ['CVE-2999-9999', 'CVE-3000-1111'];

            mockRepository.findOne.mockImplementation((options: any) => {
                const cveId = options.where?.cve;
                if (existingCVEs.includes(cveId)) {
                    return Promise.resolve({ ...mockEPSS, cve: cveId });
                }
                return Promise.resolve(null);
            });

            const existingResults = await Promise.all(
                existingCVEs.map((cveId) => epssRepository.getByCVE(cveId))
            );

            const nonExistentResults = await Promise.all(
                nonExistentCVEs.map((cveId) => epssRepository.getByCVE(cveId))
            );

            existingResults.forEach((result, index) => {
                expect(result.cve).toBe(existingCVEs[index]);
                expect(result.id).toBeDefined();
            });

            nonExistentResults.forEach((result) => {
                expect(result).toBeInstanceOf(EPSS);
                expect(result.id).toBeUndefined();
            });
        });
    });

    describe('Performance and caching considerations', () => {
        it('should make single database call per request', async () => {
            mockRepository.findOne.mockResolvedValue(mockEPSS);

            await epssRepository.getByCVE('CVE-2021-44228');

            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        });

        it('should handle rapid sequential requests', async () => {
            mockRepository.findOne.mockResolvedValue(mockEPSS);

            for (let i = 0; i < 10; i++) {
                const result = await epssRepository.getByCVE(`CVE-2023-${i}`);
                expect(result).toBeDefined();
            }

            expect(mockRepository.findOne).toHaveBeenCalledTimes(10);
        });
    });

    describe('Service initialization', () => {
        it('should be defined', () => {
            expect(epssRepository).toBeDefined();
        });

        it('should inject repository correctly', () => {
            expect(mockRepository).toBeDefined();
        });

        it('should have all required methods', () => {
            expect(typeof epssRepository.getByCVE).toBe('function');
        });
    });

    describe('Error handling edge cases', () => {
        it('should handle database timeout errors', async () => {
            const timeoutError = new Error('Query timeout');
            mockRepository.findOne.mockRejectedValue(timeoutError);

            await expect(epssRepository.getByCVE('CVE-2021-44228')).rejects.toThrow(
                'Query timeout'
            );
        });

        it('should handle database constraint violations', async () => {
            const constraintError = new Error('Unique constraint violation');
            mockRepository.findOne.mockRejectedValue(constraintError);

            await expect(epssRepository.getByCVE('CVE-2021-44228')).rejects.toThrow(
                'Unique constraint violation'
            );
        });

        it('should handle unexpected database responses', async () => {
            mockRepository.findOne.mockResolvedValue(undefined as any);

            const result = await epssRepository.getByCVE('CVE-2023-UNDEFINED');

            expect(result).toBeInstanceOf(EPSS);
        });
    });
});
