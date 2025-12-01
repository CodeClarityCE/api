import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityNotFound } from 'src/types/error.types';
import type { Repository } from 'typeorm';
import { OSV } from './osv.entity';
import { OSVRepository } from './osv.repository';

describe('OSVRepository', () => {
    let osvRepository: OSVRepository;
    let mockRepository: jest.Mocked<Repository<OSV>>;

    const mockOSV: OSV = {
        id: 'uuid-123',
        osv_id: 'GHSA-jfh8-c2jp-5v3q',
        schema_version: '1.4.0',
        vlai_score: 'HIGH',
        vlai_confidence: 0.95,
        modified: '2023-12-20T17:26:10.362Z',
        published: '2021-12-14T20:54:52Z',
        withdrawn: null as any,
        summary: 'Remote code execution in Apache Log4j',
        details:
            'Apache Log4j2 2.0-beta9 through 2.15.0 (excluding security releases 2.12.2, 2.12.3, and 2.3.1) JNDI features used in configuration, log messages, and parameters do not protect against attacker controlled LDAP and other JNDI related endpoints.',
        cve: 'CVE-2021-44228',
        aliases: ['CVE-2021-44228', 'GHSA-jfh8-c2jp-5v3q'],
        related: ['CVE-2021-44832', 'CVE-2021-45046'],
        severity: [
            {
                type: 'CVSS_V3',
                score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H'
            }
        ],
        affected: [
            {
                package: {
                    ecosystem: 'Maven',
                    name: 'org.apache.logging.log4j:log4j-core'
                },
                ranges: [
                    {
                        type: 'ECOSYSTEM',
                        events: [{ introduced: '2.0-beta9' }, { fixed: '2.3.1' }]
                    }
                ],
                versions: ['2.0-beta9', '2.15.0'],
                database_specific: {
                    source: 'https://github.com/github/advisory-database/blob/main/advisories/github-reviewed/2021/12/GHSA-jfh8-c2jp-5v3q/GHSA-jfh8-c2jp-5v3q.json'
                }
            }
        ],
        references: [
            {
                type: 'ADVISORY',
                url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228'
            },
            {
                type: 'WEB',
                url: 'https://logging.apache.org/log4j/2.x/security.html'
            }
        ],
        credits: [
            {
                name: 'Chen Zhaojun',
                contact: ['https://twitter.com/p0rz9']
            }
        ],
        database_specific: {
            cwe_ids: ['CWE-502', 'CWE-400', 'CWE-20'],
            severity: 'CRITICAL',
            github_reviewed: true
        },
        cwes: [
            { id: 'CWE-502', name: 'Deserialization of Untrusted Data' },
            { id: 'CWE-400', name: 'Uncontrolled Resource Consumption' },
            { id: 'CWE-20', name: 'Improper Input Validation' }
        ]
    };

    beforeEach(async () => {
        const mockRepo = {
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OSVRepository,
                {
                    provide: getRepositoryToken(OSV, 'knowledge'),
                    useValue: mockRepo
                }
            ]
        }).compile();

        osvRepository = module.get<OSVRepository>(OSVRepository);
        mockRepository = module.get(getRepositoryToken(OSV, 'knowledge'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getVulnGHSA', () => {
        it('should return OSV vulnerability when found by GHSA ID', async () => {
            mockRepository.findOne.mockResolvedValue(mockOSV);

            const result = await osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q');

            expect(result).toEqual(mockOSV);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { osv_id: 'GHSA-jfh8-c2jp-5v3q' }
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        });

        it('should throw EntityNotFound when GHSA is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(osvRepository.getVulnGHSA('GHSA-nonexistent')).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { osv_id: 'GHSA-nonexistent' }
            });
        });

        it('should handle repository errors gracefully', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q')).rejects.toThrow(
                'Database connection failed'
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { osv_id: 'GHSA-jfh8-c2jp-5v3q' }
            });
        });

        it('should handle different GHSA ID formats', async () => {
            const testCases = [
                'GHSA-jfh8-c2jp-5v3q',
                'GHSA-xxxx-yyyy-zzzz',
                'GHSA-1234-5678-9abc',
                'GHSA-abcd-efgh-ijkl'
            ];

            for (const ghsaId of testCases) {
                mockRepository.findOne.mockResolvedValue({ ...mockOSV, osv_id: ghsaId });

                const result = await osvRepository.getVulnGHSA(ghsaId);

                expect(result.osv_id).toBe(ghsaId);
                expect(mockRepository.findOne).toHaveBeenCalledWith({
                    where: { osv_id: ghsaId }
                });
            }
        });
    });

    describe('getVulnCVE', () => {
        it('should return OSV vulnerability when found by CVE ID', async () => {
            mockRepository.findOne.mockResolvedValue(mockOSV);

            const result = await osvRepository.getVulnCVE('CVE-2021-44228');

            expect(result).toEqual(mockOSV);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2021-44228' }
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        });

        it('should throw EntityNotFound when CVE is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(osvRepository.getVulnCVE('CVE-2023-NONEXISTENT')).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2023-NONEXISTENT' }
            });
        });

        it('should handle repository errors gracefully', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(osvRepository.getVulnCVE('CVE-2021-44228')).rejects.toThrow(
                'Database connection failed'
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2021-44228' }
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
                mockRepository.findOne.mockResolvedValue({ ...mockOSV, cve: cveId });

                const result = await osvRepository.getVulnCVE(cveId);

                expect(result.cve).toBe(cveId);
                expect(mockRepository.findOne).toHaveBeenCalledWith({
                    where: { cve: cveId }
                });
            }
        });
    });

    describe('getVulnByCVEIDWithoutFailing', () => {
        it('should return OSV vulnerability when found', async () => {
            mockRepository.findOne.mockResolvedValue(mockOSV);

            const result = await osvRepository.getVulnByCVEIDWithoutFailing('CVE-2021-44228');

            expect(result).toEqual(mockOSV);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2021-44228' }
            });
        });

        it('should return null when CVE is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await osvRepository.getVulnByCVEIDWithoutFailing('CVE-2023-NONEXISTENT');

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: 'CVE-2023-NONEXISTENT' }
            });
        });

        it('should handle repository errors', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(
                osvRepository.getVulnByCVEIDWithoutFailing('CVE-2021-44228')
            ).rejects.toThrow('Database connection failed');
        });

        it('should handle empty string CVE ID', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await osvRepository.getVulnByCVEIDWithoutFailing('');

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: '' }
            });
        });

        it('should handle special characters in CVE ID', async () => {
            const specialCveId = 'CVE-2021-44228\'";DROP TABLE osv;--';
            mockRepository.findOne.mockResolvedValue(null);

            const result = await osvRepository.getVulnByCVEIDWithoutFailing(specialCveId);

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { cve: specialCveId }
            });
        });
    });

    describe('getVulnByOSVIDWithoutFailing', () => {
        it('should return OSV vulnerability when found', async () => {
            mockRepository.findOne.mockResolvedValue(mockOSV);

            const result = await osvRepository.getVulnByOSVIDWithoutFailing('GHSA-jfh8-c2jp-5v3q');

            expect(result).toEqual(mockOSV);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { osv_id: 'GHSA-jfh8-c2jp-5v3q' }
            });
        });

        it('should return null when OSV ID is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await osvRepository.getVulnByOSVIDWithoutFailing('GHSA-nonexistent');

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { osv_id: 'GHSA-nonexistent' }
            });
        });

        it('should handle repository errors', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(
                osvRepository.getVulnByOSVIDWithoutFailing('GHSA-jfh8-c2jp-5v3q')
            ).rejects.toThrow('Database connection failed');
        });

        it('should handle different OSV ID formats', async () => {
            const testCases = [
                'GHSA-jfh8-c2jp-5v3q',
                'PYSEC-2021-852',
                'RUSTSEC-2021-0145',
                'GO-2021-0265'
            ];

            for (const osvId of testCases) {
                mockRepository.findOne.mockResolvedValue({ ...mockOSV, osv_id: osvId });

                const result = await osvRepository.getVulnByOSVIDWithoutFailing(osvId);

                expect(result?.osv_id).toBe(osvId);
                expect(mockRepository.findOne).toHaveBeenCalledWith({
                    where: { osv_id: osvId }
                });
            }
        });
    });

    describe('Real-world OSV data scenarios', () => {
        it('should handle Log4Shell (GHSA-jfh8-c2jp-5v3q) complete data', async () => {
            mockRepository.findOne.mockResolvedValue(mockOSV);

            const result = await osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q');

            expect(result.osv_id).toBe('GHSA-jfh8-c2jp-5v3q');
            expect(result.cve).toBe('CVE-2021-44228');
            expect(result.vlai_score).toBe('HIGH');
            expect(result.vlai_confidence).toBe(0.95);
            expect(result.summary).toContain('Remote code execution');
            expect((result.affected as { package: { name: string } }[])[0]!.package.name).toBe(
                'org.apache.logging.log4j:log4j-core'
            );
        });

        it('should handle Python vulnerability (PYSEC)', async () => {
            const pysecVuln = {
                ...mockOSV,
                osv_id: 'PYSEC-2021-852',
                cve: 'CVE-2021-44228',
                affected: [
                    {
                        package: {
                            ecosystem: 'PyPI',
                            name: 'apache-log4j'
                        },
                        ranges: [
                            {
                                type: 'ECOSYSTEM',
                                events: [{ introduced: '2.0.0' }, { fixed: '2.16.0' }]
                            }
                        ]
                    }
                ]
            };

            mockRepository.findOne.mockResolvedValue(pysecVuln);

            const result = await osvRepository.getVulnByOSVIDWithoutFailing('PYSEC-2021-852');

            expect(result?.osv_id).toBe('PYSEC-2021-852');
            expect(
                (result?.affected as { package: { ecosystem: string } }[])[0]!.package.ecosystem
            ).toBe('PyPI');
        });

        it('should handle Rust vulnerability (RUSTSEC)', async () => {
            const rustsecVuln = {
                ...mockOSV,
                osv_id: 'RUSTSEC-2021-0145',
                cve: null as any,
                affected: [
                    {
                        package: {
                            ecosystem: 'crates.io',
                            name: 'vulnerable-crate'
                        },
                        ranges: [
                            {
                                type: 'SEMVER',
                                events: [{ introduced: '0.1.0' }, { fixed: '0.2.0' }]
                            }
                        ]
                    }
                ]
            };

            mockRepository.findOne.mockResolvedValue(rustsecVuln);

            const result = await osvRepository.getVulnByOSVIDWithoutFailing('RUSTSEC-2021-0145');

            expect(result?.osv_id).toBe('RUSTSEC-2021-0145');
            expect(
                (result?.affected as { package: { ecosystem: string } }[])[0]!.package.ecosystem
            ).toBe('crates.io');
            expect(result?.cve).toBeNull();
        });

        it('should handle vulnerability with multiple affected packages', async () => {
            const multiAffected = {
                ...mockOSV,
                affected: [
                    {
                        package: {
                            ecosystem: 'Maven',
                            name: 'org.apache.logging.log4j:log4j-core'
                        },
                        ranges: [
                            {
                                type: 'ECOSYSTEM',
                                events: [{ introduced: '2.0-beta9' }, { fixed: '2.3.1' }]
                            }
                        ]
                    },
                    {
                        package: {
                            ecosystem: 'Maven',
                            name: 'org.apache.logging.log4j:log4j-api'
                        },
                        ranges: [
                            {
                                type: 'ECOSYSTEM',
                                events: [{ introduced: '2.0-beta9' }, { fixed: '2.3.1' }]
                            }
                        ]
                    }
                ]
            };

            mockRepository.findOne.mockResolvedValue(multiAffected);

            const result = await osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q');

            const affected = result.affected as { package: { name: string } }[];
            expect(affected).toHaveLength(2);
            expect(affected[0]!.package.name).toBe('org.apache.logging.log4j:log4j-core');
            expect(affected[1]!.package.name).toBe('org.apache.logging.log4j:log4j-api');
        });

        it('should handle withdrawn vulnerability', async () => {
            const withdrawnVuln = {
                ...mockOSV,
                withdrawn: '2023-01-15T10:30:00Z',
                summary: 'This advisory has been withdrawn'
            };

            mockRepository.findOne.mockResolvedValue(withdrawnVuln);

            const result = await osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q');

            expect(result.withdrawn).toBe('2023-01-15T10:30:00Z');
            expect(result.summary).toContain('withdrawn');
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle undefined parameters gracefully', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(osvRepository.getVulnGHSA(undefined as any)).rejects.toThrow(
                EntityNotFound
            );
            await expect(osvRepository.getVulnCVE(undefined as any)).rejects.toThrow(
                EntityNotFound
            );

            const result1 = await osvRepository.getVulnByCVEIDWithoutFailing(undefined as any);
            const result2 = await osvRepository.getVulnByOSVIDWithoutFailing(undefined as any);

            expect(result1).toBeNull();
            expect(result2).toBeNull();
        });

        it('should handle null parameters gracefully', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(osvRepository.getVulnGHSA(null as any)).rejects.toThrow(EntityNotFound);
            await expect(osvRepository.getVulnCVE(null as any)).rejects.toThrow(EntityNotFound);

            const result1 = await osvRepository.getVulnByCVEIDWithoutFailing(null as any);
            const result2 = await osvRepository.getVulnByOSVIDWithoutFailing(null as any);

            expect(result1).toBeNull();
            expect(result2).toBeNull();
        });

        it('should handle OSV with null JSONB fields', async () => {
            const nullFields = {
                ...mockOSV,
                aliases: null as any,
                related: null as any,
                severity: null as any,
                affected: null as any,
                references: null as any,
                credits: null as any,
                database_specific: null as any,
                cwes: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullFields);

            const result = await osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q');

            expect(result.aliases).toBeNull();
            expect(result.related).toBeNull();
            expect(result.severity).toBeNull();
            expect(result.affected).toBeNull();
            expect(result.references).toBeNull();
            expect(result.credits).toBeNull();
            expect(result.database_specific).toBeNull();
            expect(result.cwes).toBeNull();
        });

        it('should handle OSV with empty JSONB arrays', async () => {
            const emptyArrays = {
                ...mockOSV,
                aliases: [],
                related: [],
                severity: [],
                affected: [],
                references: [],
                credits: [],
                cwes: []
            };

            mockRepository.findOne.mockResolvedValue(emptyArrays);

            const result = await osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q');

            expect(result.aliases).toEqual([]);
            expect(result.related).toEqual([]);
            expect(result.severity).toEqual([]);
            expect(result.affected).toEqual([]);
            expect(result.references).toEqual([]);
            expect(result.credits).toEqual([]);
            expect(result.cwes).toEqual([]);
        });

        it('should handle very long IDs', async () => {
            const longId = `GHSA-${'x'.repeat(1000)}`;
            mockRepository.findOne.mockResolvedValue(null);

            const result = await osvRepository.getVulnByOSVIDWithoutFailing(longId);

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { osv_id: longId }
            });
        });
    });

    describe('Concurrent operations', () => {
        it('should handle concurrent requests for the same vulnerability', async () => {
            mockRepository.findOne.mockResolvedValue(mockOSV);

            const promises = Array.from({ length: 5 }, () =>
                osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q')
            );

            const results = await Promise.all(promises);

            results.forEach((result) => {
                expect(result).toEqual(mockOSV);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
        });

        it('should handle concurrent requests for different vulnerabilities', async () => {
            const osvIds = ['GHSA-jfh8-c2jp-5v3q', 'PYSEC-2021-852', 'RUSTSEC-2021-0145'];

            mockRepository.findOne.mockImplementation((options: any) => {
                const osvId = options.where?.osv_id;
                return Promise.resolve({
                    ...mockOSV,
                    osv_id: osvId
                });
            });

            const promises = osvIds.map((osvId) => osvRepository.getVulnGHSA(osvId));

            const results = await Promise.all(promises);

            results.forEach((result, index) => {
                expect(result.osv_id).toBe(osvIds[index]);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(3);
        });

        it('should handle mixed CVE and OSV ID requests', async () => {
            mockRepository.findOne.mockImplementation((options: any) => {
                if (options.where?.cve) {
                    return Promise.resolve({ ...mockOSV, cve: options.where.cve });
                } else if (options.where?.osv_id) {
                    return Promise.resolve({ ...mockOSV, osv_id: options.where.osv_id });
                }
                return Promise.resolve(null);
            });

            const [cveResult, osvResult] = await Promise.all([
                osvRepository.getVulnCVE('CVE-2021-44228'),
                osvRepository.getVulnGHSA('GHSA-jfh8-c2jp-5v3q')
            ]);

            expect(cveResult.cve).toBe('CVE-2021-44228');
            expect(osvResult.osv_id).toBe('GHSA-jfh8-c2jp-5v3q');
        });
    });

    describe('Service initialization', () => {
        it('should be defined', () => {
            expect(osvRepository).toBeDefined();
        });

        it('should inject repository correctly', () => {
            expect(mockRepository).toBeDefined();
        });

        it('should have all required methods', () => {
            expect(typeof osvRepository.getVulnGHSA).toBe('function');
            expect(typeof osvRepository.getVulnCVE).toBe('function');
            expect(typeof osvRepository.getVulnByCVEIDWithoutFailing).toBe('function');
            expect(typeof osvRepository.getVulnByOSVIDWithoutFailing).toBe('function');
        });
    });
});
