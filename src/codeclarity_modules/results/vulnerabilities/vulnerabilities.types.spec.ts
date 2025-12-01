import {
    newVulnerabilityAnalysisStats,
    type VulnSourceInfo,
    type VersionInfoReport,
    type VulnerableVersionInfoReport,
    type DependencyInfoReport,
    type PackageManagerLink,
    type SeverityInfo,
    type WeaknessInfoReport,
    type CommonConsequencesInfo,
    type ReferenceInfo,
    type OtherInfo,
    type VulnerabilityDetailsReport
} from './vulnerabilities.types';

describe('vulnerabilities.types (report generation)', () => {
    describe('newVulnerabilityAnalysisStats', () => {
        it('should return a VulnerabilityAnalysisStats object with all fields initialized to 0', () => {
            const stats = newVulnerabilityAnalysisStats();

            expect(stats).toBeDefined();
            expect(stats.number_of_issues).toBe(0);
            expect(stats.number_of_vulnerabilities).toBe(0);
            expect(stats.number_of_vulnerable_dependencies).toBe(0);
            expect(stats.number_of_direct_vulnerabilities).toBe(0);
            expect(stats.number_of_transitive_vulnerabilities).toBe(0);
            expect(stats.mean_severity).toBe(0);
            expect(stats.max_severity).toBe(0);
        });

        it('should initialize all OWASP Top 10 counters to 0', () => {
            const stats = newVulnerabilityAnalysisStats();

            expect(stats.number_of_owasp_top_10_2021_a1).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a2).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a3).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a4).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a5).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a6).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a7).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a8).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a9).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a10).toBe(0);
        });

        it('should initialize all severity level counters to 0', () => {
            const stats = newVulnerabilityAnalysisStats();

            expect(stats.number_of_critical).toBe(0);
            expect(stats.number_of_high).toBe(0);
            expect(stats.number_of_medium).toBe(0);
            expect(stats.number_of_low).toBe(0);
            expect(stats.number_of_none).toBe(0);
        });

        it('should initialize all impact metrics to 0', () => {
            const stats = newVulnerabilityAnalysisStats();

            expect(stats.mean_confidentiality_impact).toBe(0);
            expect(stats.mean_integrity_impact).toBe(0);
            expect(stats.mean_availability_impact).toBe(0);
        });

        it('should initialize all diff counters to 0', () => {
            const stats = newVulnerabilityAnalysisStats();

            expect(stats.number_of_vulnerabilities_diff).toBe(0);
            expect(stats.number_of_vulnerable_dependencies_diff).toBe(0);
            expect(stats.number_of_direct_vulnerabilities_diff).toBe(0);
            expect(stats.number_of_transitive_vulnerabilities_diff).toBe(0);
            expect(stats.mean_severity_diff).toBe(0);
            expect(stats.max_severity_diff).toBe(0);

            expect(stats.number_of_owasp_top_10_2021_a1_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a2_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a3_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a4_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a5_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a6_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a7_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a8_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a9_diff).toBe(0);
            expect(stats.number_of_owasp_top_10_2021_a10_diff).toBe(0);

            expect(stats.number_of_critical_diff).toBe(0);
            expect(stats.number_of_high_diff).toBe(0);
            expect(stats.number_of_medium_diff).toBe(0);
            expect(stats.number_of_low_diff).toBe(0);
            expect(stats.number_of_none_diff).toBe(0);

            expect(stats.mean_confidentiality_impact_diff).toBe(0);
            expect(stats.mean_integrity_impact_diff).toBe(0);
            expect(stats.mean_availability_impact_diff).toBe(0);
        });

        it('should return a new instance on each call', () => {
            const stats1 = newVulnerabilityAnalysisStats();
            const stats2 = newVulnerabilityAnalysisStats();

            expect(stats1).not.toBe(stats2);
            expect(stats1).toEqual(stats2);
        });
    });

    describe('Type validation tests', () => {
        describe('VulnSourceInfo', () => {
            it('should accept valid VulnSourceInfo objects', () => {
                const vulnSource: VulnSourceInfo = {
                    name: 'NVD',
                    vuln_url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-1234'
                };

                expect(vulnSource.name).toBe('NVD');
                expect(vulnSource.vuln_url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2023-1234');
            });
        });

        describe('VulnerableVersionInfoReport', () => {
            it('should accept valid VulnerableVersionInfoReport objects', () => {
                const versionInfo: VulnerableVersionInfoReport = {
                    version: '1.0.0',
                    status: 'vulnerable'
                };

                expect(versionInfo.version).toBe('1.0.0');
                expect(versionInfo.status).toBe('vulnerable');
            });
        });

        describe('VersionInfoReport', () => {
            it('should accept valid VersionInfoReport objects', () => {
                const versionInfo: VersionInfoReport = {
                    affected_versions_string: '>=1.0.0 <2.0.0',
                    patched_versions_string: '>=2.0.0',
                    versions: [
                        { version: '1.0.0', status: 'vulnerable' },
                        { version: '2.0.0', status: 'patched' }
                    ]
                };

                expect(versionInfo.affected_versions_string).toBe('>=1.0.0 <2.0.0');
                expect(versionInfo.patched_versions_string).toBe('>=2.0.0');
                expect(versionInfo.versions).toHaveLength(2);
            });
        });

        describe('PackageManagerLink', () => {
            it('should accept valid PackageManagerLink objects', () => {
                const link: PackageManagerLink = {
                    package_manager: 'npm',
                    url: 'https://www.npmjs.com/package/example'
                };

                expect(link.package_manager).toBe('npm');
                expect(link.url).toBe('https://www.npmjs.com/package/example');
            });
        });

        describe('DependencyInfoReport', () => {
            it('should accept valid DependencyInfoReport objects with all fields', () => {
                const depInfo: DependencyInfoReport = {
                    name: 'example-package',
                    published: '2023-01-01T00:00:00Z',
                    description: 'An example package',
                    keywords: ['example', 'test'],
                    version: '1.0.0',
                    package_manager_links: [
                        { package_manager: 'npm', url: 'https://www.npmjs.com/package/example' }
                    ],
                    github_link: {
                        protocol: 'https',
                        host: 'github.com',
                        repo: 'example-package',
                        user: 'example',
                        project: 'example-package',
                        repo_full_path: '/example/example-package',
                        version: 'main',
                        host_type: 'github'
                    },
                    issues_link: 'https://github.com/example/example-package/issues',
                    homepage: 'https://example.com'
                };

                expect(depInfo.name).toBe('example-package');
                expect(depInfo.keywords).toContain('example');
                expect(depInfo.package_manager_links).toHaveLength(1);
                expect(depInfo.github_link?.user).toBe('example');
            });

            it('should accept valid DependencyInfoReport objects with minimal fields', () => {
                const depInfo: DependencyInfoReport = {
                    name: 'minimal-package',
                    published: '2023-01-01T00:00:00Z',
                    description: 'A minimal package',
                    keywords: [],
                    version: '1.0.0',
                    package_manager_links: []
                };

                expect(depInfo.name).toBe('minimal-package');
                expect(depInfo.github_link).toBeUndefined();
                expect(depInfo.issues_link).toBeUndefined();
                expect(depInfo.homepage).toBeUndefined();
            });
        });

        describe('SeverityInfo', () => {
            it('should accept valid SeverityInfo objects with optional CVSS versions', () => {
                const severityInfo: SeverityInfo = {
                    cvss_31: {
                        base_score: 7.5,
                        impact_score: 5.9,
                        exploitability_score: 3.9,
                        attack_vector: 'NETWORK',
                        attack_complexity: 'LOW',
                        privileges_required: 'NONE',
                        user_interaction: 'NONE',
                        scope: 'UNCHANGED',
                        confidentiality_impact: 'HIGH',
                        integrity_impact: 'HIGH',
                        availability_impact: 'HIGH'
                    }
                };

                expect(severityInfo.cvss_31?.base_score).toBe(7.5);
                expect(severityInfo.cvss_3).toBeUndefined();
                expect(severityInfo.cvss_2).toBeUndefined();
            });
        });

        describe('WeaknessInfoReport', () => {
            it('should accept valid WeaknessInfoReport objects', () => {
                const weakness: WeaknessInfoReport = {
                    id: 'CWE-79',
                    name: 'Cross-site Scripting',
                    description: 'Improper neutralization of input during web page generation'
                };

                expect(weakness.id).toBe('CWE-79');
                expect(weakness.name).toBe('Cross-site Scripting');
            });
        });

        describe('CommonConsequencesInfo', () => {
            it('should accept valid CommonConsequencesInfo objects', () => {
                const consequences: CommonConsequencesInfo = {
                    scope: ['Confidentiality', 'Integrity'],
                    impact: ['Read Application Data', 'Modify Application Data'],
                    description: 'An attacker can access and modify sensitive data'
                };

                expect(consequences.scope).toContain('Confidentiality');
                expect(consequences.impact).toContain('Read Application Data');
            });
        });

        describe('ReferenceInfo', () => {
            it('should accept valid ReferenceInfo objects', () => {
                const reference: ReferenceInfo = {
                    url: 'https://example.com/advisory',
                    tags: ['advisory', 'vendor']
                };

                expect(reference.url).toBe('https://example.com/advisory');
                expect(reference.tags).toContain('advisory');
            });
        });

        describe('OtherInfo', () => {
            it('should accept valid OtherInfo objects', () => {
                const other: OtherInfo = {
                    package_manager: 'npm'
                };

                expect(other.package_manager).toBe('npm');
            });
        });

        describe('VulnerabilityDetailsReport', () => {
            it('should accept valid VulnerabilityDetailsReport objects', () => {
                const vulnDetails: VulnerabilityDetailsReport = {
                    vulnerability_info: {
                        vulnerability_id: 'CVE-2023-1234',
                        description: 'Test vulnerability',
                        version_info: {
                            affected_versions_string: '>=1.0.0',
                            patched_versions_string: '>=2.0.0',
                            versions: []
                        },
                        published: '2023-01-01T00:00:00Z',
                        last_modified: '2023-01-02T00:00:00Z',
                        sources: [
                            {
                                name: 'NVD',
                                vuln_url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-1234'
                            }
                        ],
                        aliases: ['GHSA-xxxx-xxxx-xxxx']
                    },
                    dependency_info: {
                        name: 'vulnerable-package',
                        published: '2023-01-01T00:00:00Z',
                        description: 'A vulnerable package',
                        keywords: [],
                        version: '1.0.0',
                        package_manager_links: []
                    },
                    severities: {
                        cvss_31: {
                            base_score: 7.5,
                            impact_score: 5.9,
                            exploitability_score: 3.9,
                            attack_vector: 'NETWORK',
                            attack_complexity: 'LOW',
                            privileges_required: 'NONE',
                            user_interaction: 'NONE',
                            scope: 'UNCHANGED',
                            confidentiality_impact: 'HIGH',
                            integrity_impact: 'HIGH',
                            availability_impact: 'HIGH'
                        }
                    },
                    owasp_top_10: {
                        id: 'A01:2021',
                        name: 'Broken Access Control',
                        description: 'Restrictions on authenticated users are not properly enforced'
                    },
                    weaknesses: [
                        {
                            id: 'CWE-79',
                            name: 'Cross-site Scripting',
                            description: 'XSS vulnerability'
                        }
                    ],
                    patch: {
                        TopLevelVulnerable: true,
                        IsPatchable: 'true',
                        Unpatchable: [],
                        Patchable: [],
                        Introduced: [],
                        Patches: {},
                        Update: {
                            Major: 2,
                            Minor: 0,
                            Patch: 0,
                            PreReleaseTag: '',
                            MetaData: ''
                        }
                    },
                    common_consequences: {
                        'CWE-79': [
                            {
                                scope: ['Confidentiality'],
                                impact: ['Read Application Data'],
                                description: 'Data exposure'
                            }
                        ]
                    },
                    references: [{ url: 'https://example.com/advisory', tags: ['advisory'] }],
                    location: ['/path/to/vulnerable/file.js'],
                    other: {
                        package_manager: 'npm'
                    }
                };

                expect(vulnDetails.vulnerability_info.vulnerability_id).toBe('CVE-2023-1234');
                expect(vulnDetails.dependency_info?.name).toBe('vulnerable-package');
                expect(vulnDetails.severities.cvss_31?.base_score).toBe(7.5);
                expect(vulnDetails.owasp_top_10?.id).toBe('A01:2021');
                expect(vulnDetails.weaknesses).toHaveLength(1);
                expect(vulnDetails.patch.IsPatchable).toBe('true');
                expect(vulnDetails.references).toHaveLength(1);
                expect(vulnDetails.location).toContain('/path/to/vulnerable/file.js');
            });

            it('should accept VulnerabilityDetailsReport with null owasp_top_10', () => {
                const vulnDetails: VulnerabilityDetailsReport = {
                    vulnerability_info: {
                        vulnerability_id: 'CVE-2023-1234',
                        description: 'Test vulnerability',
                        version_info: {
                            affected_versions_string: '>=1.0.0',
                            patched_versions_string: '>=2.0.0',
                            versions: []
                        },
                        published: '2023-01-01T00:00:00Z',
                        last_modified: '2023-01-02T00:00:00Z',
                        sources: [],
                        aliases: []
                    },
                    severities: {},
                    owasp_top_10: null,
                    weaknesses: [],
                    patch: {
                        TopLevelVulnerable: false,
                        IsPatchable: 'false',
                        Unpatchable: [],
                        Patchable: [],
                        Introduced: [],
                        Patches: {},
                        Update: {
                            Major: 0,
                            Minor: 0,
                            Patch: 0,
                            PreReleaseTag: '',
                            MetaData: ''
                        }
                    },
                    common_consequences: {},
                    references: [],
                    location: [],
                    other: {
                        package_manager: 'npm'
                    }
                };

                expect(vulnDetails.owasp_top_10).toBeNull();
                expect(vulnDetails.vulnerability_info.vulnerability_id).toBe('CVE-2023-1234');
            });
        });
    });
});
