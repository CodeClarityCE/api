import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NVDRepository } from './nvd.repository';
import { NVD } from './nvd.entity';
import { EntityNotFound } from 'src/types/error.types';

describe('NVDRepository', () => {
    let nvdRepository: NVDRepository;
    let mockRepository: jest.Mocked<Repository<NVD>>;

    const mockNVD: NVD = {
        id: 'uuid-123',
        nvd_id: 'CVE-2021-44228',
        sourceIdentifier: 'cve@mitre.org',
        published: '2021-12-09T15:15:00.000Z',
        lastModified: '2023-11-07T04:22:01.673Z',
        vulnStatus: 'Analyzed',
        descriptions: [
            {
                lang: 'en',
                value: 'Apache Log4j2 2.0-beta9 through 2.15.0 (excluding security releases 2.12.2, 2.12.3, and 2.3.1) JNDI features used in configuration, log messages, and parameters do not protect against attacker controlled LDAP and other JNDI related endpoints.'
            }
        ],
        vlai_score: 'HIGH',
        vlai_confidence: 0.95,
        metrics: {
            cvssMetricV31: [
                {
                    source: 'nvd@nist.gov',
                    type: 'Primary',
                    cvssData: {
                        version: '3.1',
                        vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
                        attackVector: 'NETWORK',
                        attackComplexity: 'LOW',
                        privilegesRequired: 'NONE',
                        userInteraction: 'NONE',
                        scope: 'CHANGED',
                        confidentialityImpact: 'HIGH',
                        integrityImpact: 'HIGH',
                        availabilityImpact: 'HIGH',
                        baseScore: 10.0,
                        baseSeverity: 'CRITICAL'
                    },
                    exploitabilityScore: 3.9,
                    impactScore: 6.0
                }
            ]
        },
        weaknesses: [
            {
                source: 'nvd@nist.gov',
                type: 'Primary',
                description: [
                    {
                        lang: 'en',
                        value: 'CWE-502'
                    }
                ]
            }
        ],
        configurations: [
            {
                nodes: [
                    {
                        operator: 'OR',
                        negate: false,
                        cpeMatch: [
                            {
                                vulnerable: true,
                                criteria: 'cpe:2.3:a:apache:log4j:*:*:*:*:*:*:*:*',
                                versionStartIncluding: '2.0-beta9',
                                versionEndExcluding: '2.3.1',
                                matchCriteriaId: 'test-criteria'
                            }
                        ]
                    }
                ]
            }
        ],
        affectedFlattened: {
            'apache:log4j': ['2.0-beta9', '2.15.0']
        },
        affected: [
            {
                vendor: 'apache',
                product: 'log4j',
                versions: ['2.0-beta9', '2.15.0']
            }
        ],
        references: [
            {
                url: 'https://logging.apache.org/log4j/2.x/security.html',
                source: 'cve@mitre.org',
                tags: ['Vendor Advisory']
            }
        ]
    };

    beforeEach(async () => {
        const mockRepo = {
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NVDRepository,
                {
                    provide: getRepositoryToken(NVD, 'knowledge'),
                    useValue: mockRepo
                }
            ]
        }).compile();

        nvdRepository = module.get<NVDRepository>(NVDRepository);
        mockRepository = module.get(getRepositoryToken(NVD, 'knowledge'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getVuln', () => {
        it('should return NVD vulnerability when found', async () => {
            mockRepository.findOne.mockResolvedValue(mockNVD);

            const result = await nvdRepository.getVuln('CVE-2021-44228');

            expect(result).toEqual(mockNVD);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: 'CVE-2021-44228'
                }
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        });

        it('should throw EntityNotFound when vulnerability is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(nvdRepository.getVuln('CVE-2023-NONEXISTENT')).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: 'CVE-2023-NONEXISTENT'
                }
            });
        });

        it('should handle repository errors gracefully', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(nvdRepository.getVuln('CVE-2021-44228')).rejects.toThrow(
                'Database connection failed'
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: 'CVE-2021-44228'
                }
            });
        });

        it('should handle different CVE ID formats', async () => {
            const testCases = [
                'CVE-2021-44228',
                'CVE-2023-1234',
                'CVE-1999-0001',
                'CVE-2020-999999'
            ];

            for (const cveId of testCases) {
                mockRepository.findOne.mockResolvedValue({ ...mockNVD, nvd_id: cveId });

                const result = await nvdRepository.getVuln(cveId);

                expect(result.nvd_id).toBe(cveId);
                expect(mockRepository.findOne).toHaveBeenCalledWith({
                    where: {
                        nvd_id: cveId
                    }
                });
            }
        });
    });

    describe('getVulnWithoutFailing', () => {
        it('should return NVD vulnerability when found', async () => {
            mockRepository.findOne.mockResolvedValue(mockNVD);

            const result = await nvdRepository.getVulnWithoutFailing('CVE-2021-44228');

            expect(result).toEqual(mockNVD);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: 'CVE-2021-44228'
                }
            });
        });

        it('should return null when vulnerability is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await nvdRepository.getVulnWithoutFailing('CVE-2023-NONEXISTENT');

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: 'CVE-2023-NONEXISTENT'
                }
            });
        });

        it('should return null when CVE ID is empty string', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await nvdRepository.getVulnWithoutFailing('');

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: ''
                }
            });
        });

        it('should handle repository errors', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(nvdRepository.getVulnWithoutFailing('CVE-2021-44228')).rejects.toThrow(
                'Database connection failed'
            );
        });

        it('should handle special characters in CVE ID', async () => {
            const specialCveId = 'CVE-2021-44228\'";DROP TABLE nvd;--';
            mockRepository.findOne.mockResolvedValue(null);

            const result = await nvdRepository.getVulnWithoutFailing(specialCveId);

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: specialCveId
                }
            });
        });
    });

    describe('Real-world vulnerability scenarios', () => {
        it('should handle Log4Shell (CVE-2021-44228) complete data', async () => {
            mockRepository.findOne.mockResolvedValue(mockNVD);

            const result = await nvdRepository.getVuln('CVE-2021-44228');

            expect(result.nvd_id).toBe('CVE-2021-44228');
            expect(result.vulnStatus).toBe('Analyzed');
            expect(result.vlai_score).toBe('HIGH');
            expect(result.vlai_confidence).toBe(0.95);
            expect(result.metrics.cvssMetricV31[0].cvssData.baseScore).toBe(10.0);
            expect(result.descriptions[0].value).toContain('Apache Log4j2');
        });

        it('should handle vulnerability with multiple weaknesses', async () => {
            const multiWeakness = {
                ...mockNVD,
                weaknesses: [
                    {
                        source: 'nvd@nist.gov',
                        type: 'Primary',
                        description: [{ lang: 'en', value: 'CWE-502' }]
                    },
                    {
                        source: 'nvd@nist.gov',
                        type: 'Secondary',
                        description: [{ lang: 'en', value: 'CWE-20' }]
                    }
                ]
            };

            mockRepository.findOne.mockResolvedValue(multiWeakness);

            const result = await nvdRepository.getVuln('CVE-2023-MULTI');

            expect(result.weaknesses).toHaveLength(2);
            expect(result.weaknesses[0].description[0].value).toBe('CWE-502');
            expect(result.weaknesses[1].description[0].value).toBe('CWE-20');
        });

        it('should handle vulnerability with multiple CVSS versions', async () => {
            const multiCvss = {
                ...mockNVD,
                metrics: {
                    cvssMetricV2: [
                        {
                            source: 'nvd@nist.gov',
                            type: 'Primary',
                            cvssData: {
                                version: '2.0',
                                vectorString: 'AV:N/AC:L/Au:N/C:C/I:C/A:C',
                                baseScore: 10.0,
                                baseSeverity: 'HIGH'
                            }
                        }
                    ],
                    cvssMetricV31: [
                        {
                            source: 'nvd@nist.gov',
                            type: 'Primary',
                            cvssData: {
                                version: '3.1',
                                vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
                                baseScore: 10.0,
                                baseSeverity: 'CRITICAL'
                            }
                        }
                    ]
                }
            };

            mockRepository.findOne.mockResolvedValue(multiCvss);

            const result = await nvdRepository.getVuln('CVE-2023-MULTI-CVSS');

            expect(result.metrics.cvssMetricV2).toBeDefined();
            expect(result.metrics.cvssMetricV31).toBeDefined();
            expect(result.metrics.cvssMetricV2[0].cvssData.version).toBe('2.0');
            expect(result.metrics.cvssMetricV31[0].cvssData.version).toBe('3.1');
        });

        it('should handle vulnerability with complex affected products', async () => {
            const complexAffected = {
                ...mockNVD,
                affected: [
                    {
                        vendor: 'apache',
                        product: 'log4j',
                        versions: ['2.0-beta9', '2.15.0']
                    },
                    {
                        vendor: 'apache',
                        product: 'log4j-core',
                        versions: ['2.0-beta9', '2.15.0']
                    }
                ],
                affectedFlattened: {
                    'apache:log4j': ['2.0-beta9', '2.15.0'],
                    'apache:log4j-core': ['2.0-beta9', '2.15.0']
                }
            };

            mockRepository.findOne.mockResolvedValue(complexAffected);

            const result = await nvdRepository.getVuln('CVE-2023-COMPLEX');

            expect(result.affected).toHaveLength(2);
            expect(Object.keys(result.affectedFlattened)).toHaveLength(2);
            expect(result.affectedFlattened['apache:log4j']).toEqual(['2.0-beta9', '2.15.0']);
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle undefined CVE ID gracefully', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await nvdRepository.getVulnWithoutFailing(undefined as any);

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: undefined
                }
            });
        });

        it('should handle null CVE ID gracefully', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await nvdRepository.getVulnWithoutFailing(null as any);

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: null
                }
            });
        });

        it('should handle very long CVE ID strings', async () => {
            const longCveId = 'CVE-2023-' + '1'.repeat(1000);
            mockRepository.findOne.mockResolvedValue(null);

            const result = await nvdRepository.getVulnWithoutFailing(longCveId);

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    nvd_id: longCveId
                }
            });
        });

        it('should handle vulnerability with null JSONB fields', async () => {
            const nullFields = {
                ...mockNVD,
                descriptions: null as any,
                metrics: null as any,
                weaknesses: null as any,
                configurations: null as any,
                affected: null as any,
                references: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullFields);

            const result = await nvdRepository.getVuln('CVE-2023-NULL');

            expect(result.descriptions).toBeNull();
            expect(result.metrics).toBeNull();
            expect(result.weaknesses).toBeNull();
            expect(result.configurations).toBeNull();
            expect(result.affected).toBeNull();
            expect(result.references).toBeNull();
        });

        it('should handle vulnerability with empty JSONB arrays', async () => {
            const emptyArrays = {
                ...mockNVD,
                descriptions: [],
                weaknesses: [],
                affected: [],
                references: []
            };

            mockRepository.findOne.mockResolvedValue(emptyArrays);

            const result = await nvdRepository.getVuln('CVE-2023-EMPTY');

            expect(result.descriptions).toEqual([]);
            expect(result.weaknesses).toEqual([]);
            expect(result.affected).toEqual([]);
            expect(result.references).toEqual([]);
        });
    });

    describe('Concurrent operations', () => {
        it('should handle concurrent requests for the same CVE', async () => {
            mockRepository.findOne.mockResolvedValue(mockNVD);

            const promises = Array.from({ length: 5 }, () =>
                nvdRepository.getVuln('CVE-2021-44228')
            );

            const results = await Promise.all(promises);

            results.forEach((result) => {
                expect(result).toEqual(mockNVD);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
        });

        it('should handle concurrent requests for different CVEs', async () => {
            const cveIds = ['CVE-2021-44228', 'CVE-2023-1234', 'CVE-2020-5678'];

            mockRepository.findOne.mockImplementation((options: any) => {
                const cveId = options.where?.nvd_id;
                return Promise.resolve({
                    ...mockNVD,
                    nvd_id: cveId
                });
            });

            const promises = cveIds.map((cveId) => nvdRepository.getVuln(cveId));

            const results = await Promise.all(promises);

            results.forEach((result, index) => {
                expect(result.nvd_id).toBe(cveIds[index]);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(3);
        });

        it('should handle mixed success and failure scenarios', async () => {
            const existingCVEs = ['CVE-2021-44228', 'CVE-2023-1234'];
            const nonExistentCVEs = ['CVE-2999-9999', 'CVE-3000-1111'];

            mockRepository.findOne.mockImplementation((options: any) => {
                const cveId = options.where?.nvd_id;
                if (existingCVEs.includes(cveId)) {
                    return Promise.resolve({ ...mockNVD, nvd_id: cveId });
                }
                return Promise.resolve(null);
            });

            const existingResults = await Promise.all(
                existingCVEs.map((cveId) => nvdRepository.getVulnWithoutFailing(cveId))
            );

            const nonExistentResults = await Promise.all(
                nonExistentCVEs.map((cveId) => nvdRepository.getVulnWithoutFailing(cveId))
            );

            existingResults.forEach((result, index) => {
                expect(result).not.toBeNull();
                expect(result?.nvd_id).toBe(existingCVEs[index]);
            });

            nonExistentResults.forEach((result) => {
                expect(result).toBeNull();
            });
        });
    });

    describe('Service initialization', () => {
        it('should be defined', () => {
            expect(nvdRepository).toBeDefined();
        });

        it('should inject repository correctly', () => {
            expect(mockRepository).toBeDefined();
        });

        it('should have all required methods', () => {
            expect(typeof nvdRepository.getVuln).toBe('function');
            expect(typeof nvdRepository.getVulnWithoutFailing).toBe('function');
        });
    });
});
