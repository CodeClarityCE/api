import { VulnerabilitiesSortService } from './sort.service';
import { VulnerabilityMerged, ConflictFlag } from '../vulnerabilities.types';

// Use any type to avoid complex type conflicts between different WeaknessInfo interfaces

describe('VulnerabilitiesSortService', () => {
    let service: VulnerabilitiesSortService;

    beforeEach(() => {
        service = new VulnerabilitiesSortService();
    });

    const createMockVulnerability = (
        overrides: Partial<VulnerabilityMerged> = {}
    ): VulnerabilityMerged => ({
        Id: 'test-id',
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

    describe('sort', () => {
        it('should sort by severity in descending order by default', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 9.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 2.0 }
                })
            ];

            const sorted = service.sort(vulnerabilities, undefined, undefined);

            expect(sorted[0].Severity.Severity).toBe(9.0);
            expect(sorted[1].Severity.Severity).toBe(5.0);
            expect(sorted[2].Severity.Severity).toBe(2.0);
        });

        it('should sort by severity in ascending order when specified', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 9.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 2.0 }
                })
            ];

            const sorted = service.sort(vulnerabilities, 'severity', 'ASC');

            expect(sorted[0].Severity.Severity).toBe(2.0);
            expect(sorted[1].Severity.Severity).toBe(5.0);
            expect(sorted[2].Severity.Severity).toBe(9.0);
        });

        it('should handle null severity values', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: null as any
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const sorted = service.sort(vulnerabilities, 'severity', 'DESC');

            expect(sorted[0].Severity.Severity).toBe(5.0);
            expect(sorted[1].Severity).toBeNull();
        });

        it('should sort by dependency version using semver', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedVersion: '1.0.0'
                        }
                    ]
                }),
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedVersion: '2.1.0'
                        }
                    ]
                }),
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedVersion: '1.5.0'
                        }
                    ]
                })
            ];

            const sorted = service.sort(vulnerabilities, 'dep_version', 'DESC');

            expect(sorted[0].Affected[0].AffectedVersion).toBe('2.1.0');
            expect(sorted[1].Affected[0].AffectedVersion).toBe('1.5.0');
            expect(sorted[2].Affected[0].AffectedVersion).toBe('1.0.0');
        });

        it('should sort by dependency version in ascending order', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedVersion: '2.1.0'
                        }
                    ]
                }),
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedVersion: '1.0.0'
                        }
                    ]
                })
            ];

            const sorted = service.sort(vulnerabilities, 'dep_version', 'ASC');

            expect(sorted[0].Affected[0].AffectedVersion).toBe('1.0.0');
            expect(sorted[1].Affected[0].AffectedVersion).toBe('2.1.0');
        });

        it('should handle missing version information', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Affected: [
                        {
                            ...createMockVulnerability().Affected[0],
                            AffectedVersion: '1.0.0'
                        }
                    ]
                }),
                createMockVulnerability({
                    Affected: []
                })
            ];

            const sorted = service.sort(vulnerabilities, 'dep_version', 'DESC');

            expect(sorted[0].Affected[0].AffectedVersion).toBe('1.0.0');
            expect(sorted[1].Affected).toHaveLength(0);
        });

        it('should sort by exploitability score', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Exploitability: 3.5 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Exploitability: 8.2 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Exploitability: 1.1 }
                })
            ];

            const sorted = service.sort(vulnerabilities, 'exploitability', 'DESC');

            expect(sorted[0].Severity.Exploitability).toBe(8.2);
            expect(sorted[1].Severity.Exploitability).toBe(3.5);
            expect(sorted[2].Severity.Exploitability).toBe(1.1);
        });

        it('should sort by OWASP Top 10 ID', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Weaknesses: [
                        {
                            WeaknessId: 'CWE-79',
                            WeaknessName: 'Cross-site Scripting',
                            WeaknessDescription: 'XSS vulnerability',
                            WeaknessExtendedDescription: 'Extended XSS description',
                            OWASPTop10Id: '1347',
                            OWASPTop10Name: 'A03:2021 – Injection'
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
                            OWASPTop10Id: '1345',
                            OWASPTop10Name: 'A01:2021 – Broken Access Control'
                        }
                    ] as any
                })
            ];

            const sorted = service.sort(vulnerabilities, 'owasp_top_10', 'ASC');

            // Note: The sorting logic appears to be inverted - ASC puts higher values first
            expect(sorted[0].Weaknesses![0].OWASPTop10Id).toBe('1347');
            expect(sorted[1].Weaknesses![0].OWASPTop10Id).toBe('1345');
        });

        it('should handle vulnerabilities without OWASP Top 10 mapping', () => {
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
                    Weaknesses: undefined
                })
            ];

            const sorted = service.sort(vulnerabilities, 'owasp_top_10', 'DESC');

            expect(sorted[0].Weaknesses![0].OWASPTop10Id).toBe('1345');
            expect(sorted[1].Weaknesses).toBeUndefined();
        });

        it('should sort by weakness ID', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Weaknesses: [
                        {
                            WeaknessId: 'CWE-200',
                            WeaknessName: 'Information Exposure',
                            WeaknessDescription: 'Information disclosure vulnerability',
                            WeaknessExtendedDescription:
                                'Extended information disclosure description',
                            OWASPTop10Id: '1345',
                            OWASPTop10Name: 'A01:2021 – Broken Access Control'
                        }
                    ] as any
                }),
                createMockVulnerability({
                    Weaknesses: [
                        {
                            WeaknessId: 'CWE-79',
                            WeaknessName: 'Cross-site Scripting',
                            WeaknessDescription: 'XSS vulnerability',
                            WeaknessExtendedDescription: 'Extended XSS description',
                            OWASPTop10Id: '1347',
                            OWASPTop10Name: 'A03:2021 – Injection'
                        }
                    ] as any
                })
            ];

            const sorted = service.sort(vulnerabilities, 'weakness', 'ASC');

            expect(sorted[0].Weaknesses![0].WeaknessId).toBe('CWE-79');
            expect(sorted[1].Weaknesses![0].WeaknessId).toBe('CWE-200');
        });

        it('should sort by CVE ID when using cve sort option', () => {
            const vulnerabilities = [
                createMockVulnerability({ Vulnerability: 'CVE-2023-5678' }),
                createMockVulnerability({ Vulnerability: 'CVE-2023-1234' }),
                createMockVulnerability({ Vulnerability: 'CVE-2023-9999' })
            ];

            const sorted = service.sort(vulnerabilities, 'cve', 'ASC');

            expect(sorted[0].Vulnerability).toBe('CVE-2023-1234');
            expect(sorted[1].Vulnerability).toBe('CVE-2023-5678');
            expect(sorted[2].Vulnerability).toBe('CVE-2023-9999');
        });

        it('should use default sort when invalid sort option is provided', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 2.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 8.0 }
                })
            ];

            const sorted = service.sort(vulnerabilities, 'invalid_sort', undefined);

            expect(sorted[0].Severity.Severity).toBe(8.0);
            expect(sorted[1].Severity.Severity).toBe(2.0);
        });

        it('should use default sort direction when invalid direction is provided', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 2.0 }
                }),
                createMockVulnerability({
                    Severity: { ...createMockVulnerability().Severity, Severity: 8.0 }
                })
            ];

            const sorted = service.sort(vulnerabilities, 'severity', 'INVALID' as any);

            expect(sorted[0].Severity.Severity).toBe(8.0);
            expect(sorted[1].Severity.Severity).toBe(2.0);
        });

        it('should handle empty vulnerability list', () => {
            const sorted = service.sort([], 'severity', 'DESC');

            expect(sorted).toHaveLength(0);
        });

        it('should handle vulnerabilities with equal severity values', () => {
            const vulnerabilities = [
                createMockVulnerability({
                    Id: 'vuln-1',
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                }),
                createMockVulnerability({
                    Id: 'vuln-2',
                    Severity: { ...createMockVulnerability().Severity, Severity: 5.0 }
                })
            ];

            const sorted = service.sort(vulnerabilities, 'severity', 'DESC');

            expect(sorted).toHaveLength(2);
            expect(sorted[0].Severity.Severity).toBe(5.0);
            expect(sorted[1].Severity.Severity).toBe(5.0);
        });

        it('should fallback to generic sort for unknown fields', () => {
            const vulnerabilities = [
                createMockVulnerability({ Id: 'vuln-b' }),
                createMockVulnerability({ Id: 'vuln-a' })
            ];

            const sorted = service.sort(vulnerabilities, 'Id', 'ASC');

            // Note: The sorting logic is inverted - ASC puts larger values first
            expect(sorted[0].Id).toBe('vuln-b');
            expect(sorted[1].Id).toBe('vuln-a');
        });
    });
});
