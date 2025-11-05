import { VulnerabilitiesFilterService } from './filter.service';
import { VulnerabilityMerged, ConflictFlag } from '../vulnerabilities.types';

// Use any type to avoid complex type conflicts between different WeaknessInfo interfaces

describe('VulnerabilitiesFilterService', () => {
    let service: VulnerabilitiesFilterService;

    beforeEach(() => {
        service = new VulnerabilitiesFilterService();
    });

    const createMockVulnerability = (
        overrides: Partial<VulnerabilityMerged> = {}
    ): VulnerabilityMerged => ({
        Id: overrides.Id || `test-id-${Math.random()}`,
        Sources: [],
        Affected: [
            {
                Sources: [],
                AffectedDependency: 'test-dependency',
                AffectedVersion: '1.0.0',
                VulnerabilityId: 'CVE-2023-1234',
                Severity: {
                    Severity: 5.0,
                    SeverityClass: 'MEDIUM',
                    SeverityType: 'CVSS_V3' as any,
                    Vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N',
                    Impact: 3.6,
                    Exploitability: 3.9,
                    ConfidentialityImpact: 'LOW',
                    IntegrityImpact: 'LOW',
                    AvailabilityImpact: 'NONE',
                    ConfidentialityImpactNumerical: 0.22,
                    IntegrityImpactNumerical: 0.22,
                    AvailabilityImpactNumerical: 0.0
                },
                Weaknesses: [] as any,
                OSVMatch: {} as any,
                NVDMatch: {} as any,
                Conflict: {
                    ConflictWinner: 'NVD',
                    ConflictFlag: ConflictFlag.NO_CONFLICT
                }
            }
        ],
        Vulnerability: 'CVE-2023-1234',
        Severity: {
            Severity: 5.0,
            SeverityClass: 'MEDIUM',
            SeverityType: 'CVSS_V3' as any,
            Vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N',
            Impact: 3.6,
            Exploitability: 3.9,
            ConfidentialityImpact: 'LOW',
            IntegrityImpact: 'LOW',
            AvailabilityImpact: 'NONE',
            ConfidentialityImpactNumerical: 0.22,
            IntegrityImpactNumerical: 0.22,
            AvailabilityImpactNumerical: 0.0
        },
        Weaknesses: [] as any,
        Description: 'Test vulnerability',
        Conflict: {
            ConflictWinner: 'NVD',
            ConflictFlag: ConflictFlag.NO_CONFLICT
        },
        VLAI: [],
        EPSS: {
            Score: 0.1,
            Percentile: 0.5
        },
        ...overrides
    });

    describe('filter', () => {
        it('should return all vulnerabilities when no filters are applied', () => {
            const vulnerabilities = [
                createMockVulnerability({ Id: 'vuln-1' }),
                createMockVulnerability({ Id: 'vuln-2', Vulnerability: 'CVE-2023-5678' })
            ];

            const [filtered, counts] = service.filter(vulnerabilities, '', undefined);

            expect(filtered).toHaveLength(2);
            expect(filtered).toEqual(vulnerabilities);
            expect(counts).toBeDefined();
        });

        it('should filter by search key in vulnerability ID', () => {
            const vulnerabilities = [
                createMockVulnerability({ Vulnerability: 'CVE-2023-1234' }),
                createMockVulnerability({ Vulnerability: 'CVE-2023-5678' })
            ];

            const [filtered] = service.filter(vulnerabilities, '1234', undefined);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Vulnerability).toBe('CVE-2023-1234');
        });

        it('should filter by search key in affected dependency', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedDependency: 'lodash'
                        } as any
                    ]
                }),
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedDependency: 'express'
                        } as any
                    ]
                })
            ];

            const [filtered] = service.filter(vulnerabilities, 'lodash', undefined);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Affected[0]!.AffectedDependency).toBe('lodash');
        });

        it('should be case insensitive when searching', () => {
            const vulnerabilities = [createMockVulnerability({ Vulnerability: 'CVE-2023-1234' })];

            const [filtered] = service.filter(vulnerabilities, 'cve-2023', undefined);

            expect(filtered).toHaveLength(1);
        });

        it('should filter by severity_critical', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 9.5 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['severity_critical']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.Severity).toBe(9.5);
        });

        it('should filter by severity_high', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 8.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['severity_high']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.Severity).toBe(8.0);
        });

        it('should filter by severity_medium', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 2.0 }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['severity_medium']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.Severity).toBe(5.0);
        });

        it('should filter by severity_low', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 2.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['severity_low']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.Severity).toBe(2.0);
        });

        it('should filter by severity_none', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 0.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['severity_none']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.Severity).toBe(0.0);
        });

        it('should filter by OWASP Top 10 categories', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Weaknesses: [
                        {
                            WeaknessId: 'CWE-79',
                            WeaknessName: 'Cross-site Scripting',
                            WeaknessDescription: 'XSS vulnerability',
                            WeaknessExtendedDescription: 'Extended XSS description',
                            OWASPTop10Id: '1345',
                            OWASPTop10Name: 'A01:2021 – Broken Access Control'
                        }
                    ] as any
                }),
                createMockVulnerability({
                    Weaknesses: [
                        {
                            WeaknessId: 'CWE-89',
                            WeaknessName: 'SQL Injection',
                            WeaknessDescription: 'SQL injection vulnerability',
                            WeaknessExtendedDescription: 'Extended SQL injection description',
                            OWASPTop10Id: '1346',
                            OWASPTop10Name: 'A02:2021 – Cryptographic Failures'
                        }
                    ] as any
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['owasp_top_10_2021_a1']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Weaknesses![0]!.OWASPTop10Id).toBe('1345');
        });

        it('should filter by availability impact', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, AvailabilityImpact: 'HIGH' }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, AvailabilityImpact: 'NONE' }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['availability_impact']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.AvailabilityImpact).toBe('HIGH');
        });

        it('should filter by confidentiality impact', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: {
                        ...createMockVulnerability().Severity,
                        ConfidentialityImpact: 'HIGH'
                    }
                }),
                createMockVulnerability({
                    Severity: {
                        ...createMockVulnerability().Severity,
                        ConfidentialityImpact: 'NONE'
                    }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['confidentiality_impact']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.ConfidentialityImpact).toBe('HIGH');
        });

        it('should filter by integrity impact', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, IntegrityImpact: 'HIGH' }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, IntegrityImpact: 'NONE' }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['integrity_impact']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.IntegrityImpact).toBe('HIGH');
        });

        it('should filter by conflict flags', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Conflict: {
                        ConflictWinner: 'NVD',
                        ConflictFlag: ConflictFlag.MATCH_CORRECT
                    }
                }),
                createMockVulnerability({
                    Conflict: {
                        ConflictWinner: 'OSV',
                        ConflictFlag: ConflictFlag.MATCH_INCORRECT
                    }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', ['hide_correct_matching']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Conflict.ConflictFlag).toBe(ConflictFlag.MATCH_INCORRECT);
        });

        it('should apply multiple filters simultaneously', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 9.5 },
                    Weaknesses: [
                        {
                            WeaknessId: 'CWE-79',
                            WeaknessName: 'Cross-site Scripting',
                            WeaknessDescription: 'XSS vulnerability',
                            WeaknessExtendedDescription: 'Extended XSS description',
                            OWASPTop10Id: '1345',
                            OWASPTop10Name: 'A01:2021 – Broken Access Control'
                        }
                    ] as any
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const [filtered] = service.filter(vulnerabilities, '', [
                'severity_critical',
                'owasp_top_10_2021_a1'
            ]);

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.Severity.Severity).toBe(9.5);
            expect(filtered[0]!.Weaknesses![0]!.OWASPTop10Id).toBe('1345');
        });

        it('should return counts for each filter option', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 9.5 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const [, counts] = service.filter(vulnerabilities, '', undefined);

            expect(counts).toBeDefined();
            expect(typeof counts).toBe('object');
            expect(counts['severity_critical']).toBeDefined();
            expect(counts['severity_medium']).toBeDefined();
        });

        it('should handle empty vulnerability list', () => {
            const [filtered, counts] = service.filter([], '', undefined);

            expect(filtered).toHaveLength(0);
            expect(counts).toBeDefined();
        });

        it('should handle null weakness values', () => {
            const { Weaknesses, ...vulnWithoutWeaknesses } = createMockVulnerability();
            const vulnerabilities = [vulnWithoutWeaknesses as any];

            const [filtered] = service.filter(vulnerabilities, '', ['owasp_top_10_2021_a1']);

            // When Weaknesses is null/undefined, the weakness filter is skipped, so vulnerability passes through
            expect(filtered).toHaveLength(1);
        });
    });
});
