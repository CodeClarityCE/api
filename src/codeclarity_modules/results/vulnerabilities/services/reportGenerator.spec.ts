import { Test, TestingModule } from '@nestjs/testing';
import { OSVReportGenerator, NVDReportGenerator } from './reportGenerator';
import { VersionsRepository } from 'src/codeclarity_modules/knowledge/package/packageVersions.repository';
import { OSVRepository } from 'src/codeclarity_modules/knowledge/osv/osv.repository';
import { NVDRepository } from 'src/codeclarity_modules/knowledge/nvd/nvd.repository';
import { CWERepository } from 'src/codeclarity_modules/knowledge/cwe/cwe.repository';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/package/package.repository';
import { OWASPRepository } from 'src/codeclarity_modules/knowledge/owasp/owasp.repository';
import {
    Vulnerability,
    Source,
    ConflictFlag,
    WeaknessInfo,
    SeverityType
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { Dependency } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { OSV } from 'src/codeclarity_modules/knowledge/osv/osv.entity';
import { NVD } from 'src/codeclarity_modules/knowledge/nvd/nvd.entity';
import { OwaspTop10Info } from 'src/codeclarity_modules/knowledge/owasp/owasp.types';

describe('ReportGenerator Services', () => {
    let osvReportGenerator: OSVReportGenerator;
    let nvdReportGenerator: NVDReportGenerator;
    let _versionsRepository: VersionsRepository;
    let _osvRepository: OSVRepository;
    let _nvdRepository: NVDRepository;
    let _cweRepository: CWERepository;
    let _packageRepository: PackageRepository;
    let _owaspRepository: OWASPRepository;

    const mockVersionsRepository = {
        getVersion: jest.fn(),
        getVersions: jest.fn()
    };

    const mockOsvRepository = {
        getOSV: jest.fn()
    };

    const mockNvdRepository = {
        getNVD: jest.fn()
    };

    const mockCweRepository = {
        getCWE: jest.fn()
    };

    const mockPackageRepository = {
        getPackageInfo: jest.fn()
    };

    const mockOwaspRepository = {
        getOwaspTop10CategoryInfo: jest.fn().mockReturnValue({
            id: 'A01:2021',
            name: 'Broken Access Control',
            description:
                'Access control enforces policy such that users cannot act outside of their intended permissions.'
        } as OwaspTop10Info)
    };

    const mockVulnerability: Vulnerability = {
        Id: 'vuln-123',
        VulnerabilityId: 'CVE-2024-1234',
        AffectedDependency: 'test-package',
        AffectedVersion: '1.0.0',
        Sources: [Source.Osv, Source.Nvd],
        Weaknesses: [
            {
                WeaknessId: 'CWE-79',
                WeaknessName: 'Cross-site Scripting (XSS)',
                WeaknessDescription:
                    'The software does not neutralize or incorrectly neutralizes user-controllable input',
                WeaknessExtendedDescription: 'Extended description of the weakness',
                OWASPTop10Id: 'A01:2021',
                OWASPTop10Name: 'Broken Access Control'
            } as WeaknessInfo
        ],
        OSVMatch: {
            Vulnerability: 'CVE-2024-1234',
            Dependency: 'test-package',
            AffectedInfo: [
                {
                    Ranges: [
                        {
                            IntroducedSemver: {
                                Major: 1,
                                Minor: 0,
                                Patch: 0,
                                PreReleaseTag: '',
                                MetaData: ''
                            },
                            FixedSemver: {
                                Major: 1,
                                Minor: 0,
                                Patch: 1,
                                PreReleaseTag: '',
                                MetaData: ''
                            }
                        }
                    ],
                    Exact: [],
                    Universal: false
                }
            ],
            VulnerableEvidenceRange: null,
            VulnerableEvidenceExact: null,
            VulnerableEvidenceUniversal: null,
            VulnerableEvidenceType: null,
            Vulnerable: true,
            ConflictFlag: ConflictFlag.NO_CONFLICT,
            Severity: 7.5,
            SeverityType: 'CVSS_3'
        },
        NVDMatch: {
            Vulnerability: 'CVE-2024-1234',
            Dependency: 'test-package',
            AffectedInfo: [
                {
                    Ranges: [
                        {
                            IntroducedSemver: {
                                Major: 1,
                                Minor: 0,
                                Patch: 0,
                                PreReleaseTag: '',
                                MetaData: ''
                            },
                            FixedSemver: {
                                Major: 1,
                                Minor: 0,
                                Patch: 1,
                                PreReleaseTag: '',
                                MetaData: ''
                            }
                        }
                    ],
                    Exact: [],
                    Universal: false
                }
            ],
            VulnerableEvidenceRange: null,
            VulnerableEvidenceExact: null,
            VulnerableEvidenceUniversal: null,
            VulnerableEvidenceType: null,
            Vulnerable: true,
            ConflictFlag: ConflictFlag.NO_CONFLICT,
            Severity: 7.5,
            SeverityType: 'CVSS_3'
        },
        Severity: {
            Severity: 7.5,
            SeverityClass: 'HIGH',
            SeverityType: SeverityType.CvssV3,
            Vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
            Impact: 5.9,
            Exploitability: 3.9,
            ConfidentialityImpact: 'HIGH',
            IntegrityImpact: 'HIGH',
            AvailabilityImpact: 'HIGH',
            ConfidentialityImpactNumerical: 0.56,
            IntegrityImpactNumerical: 0.56,
            AvailabilityImpactNumerical: 0.56
        },
        Conflict: {
            ConflictWinner: 'OSV',
            ConflictFlag: ConflictFlag.NO_CONFLICT
        }
    };

    const mockDependency: Dependency = {
        Key: 'test-package@1.0.0',
        Requires: {},
        Dependencies: {},
        Optional: false,
        Bundled: false,
        Dev: false,
        Prod: true,
        Direct: true,
        Transitive: false,
        Licenses: ['MIT']
    };

    const mockOSV: OSV = {
        osv_id: 'GHSA-1234-5678-9012',
        cve: 'CVE-2024-1234',
        details:
            '# Security Advisory\n\nThis is a test vulnerability description.\n\n## Impact\n\nHigh impact vulnerability.\n\n```javascript\n// Vulnerable code example\nconst vulnerable = true;\n```\n\n## Patches\n\nUpgrade to version 1.0.1 or later.\n\n',
        published: '2024-01-01T00:00:00Z',
        modified: '2024-01-02T00:00:00Z',
        severity: [
            {
                type: 'CVSS_V3',
                score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
            }
        ],
        references: [
            {
                type: 'ADVISORY',
                url: 'https://github.com/advisories/GHSA-1234-5678-9012'
            }
        ]
    } as OSV;

    const mockNVD: NVD = {
        nvd_id: 'CVE-2024-1234',
        published: '2024-01-01T00:00:00Z',
        lastModified: '2024-01-02T00:00:00Z',
        descriptions: [
            {
                lang: 'en',
                value: 'A vulnerability was found in test-package version 1.0.0.'
            }
        ],
        references: [
            {
                url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234'
            }
        ],
        metrics: {
            cvssMetricV2: [
                {
                    source: 'nvd@nist.gov',
                    cvssData: {
                        vectorString: 'AV:N/AC:L/Au:N/C:P/I:P/A:P'
                    },
                    userInteractionRequired: false
                }
            ],
            cvssMetricV30: [
                {
                    source: 'nvd@nist.gov',
                    cvssData: {
                        vectorString: 'CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
                    }
                }
            ],
            cvssMetricV31: [
                {
                    source: 'nvd@nist.gov',
                    cvssData: {
                        vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
                    }
                }
            ]
        }
    } as NVD;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OSVReportGenerator,
                NVDReportGenerator,
                { provide: VersionsRepository, useValue: mockVersionsRepository },
                { provide: OSVRepository, useValue: mockOsvRepository },
                { provide: NVDRepository, useValue: mockNvdRepository },
                { provide: CWERepository, useValue: mockCweRepository },
                { provide: PackageRepository, useValue: mockPackageRepository },
                { provide: OWASPRepository, useValue: mockOwaspRepository }
            ]
        }).compile();

        osvReportGenerator = module.get<OSVReportGenerator>(OSVReportGenerator);
        nvdReportGenerator = module.get<NVDReportGenerator>(NVDReportGenerator);
        _versionsRepository = module.get<VersionsRepository>(VersionsRepository);
        _osvRepository = module.get<OSVRepository>(OSVRepository);
        _nvdRepository = module.get<NVDRepository>(NVDRepository);
        _cweRepository = module.get<CWERepository>(CWERepository);
        _packageRepository = module.get<PackageRepository>(PackageRepository);
        _owaspRepository = module.get<OWASPRepository>(OWASPRepository);

        jest.clearAllMocks();
    });

    describe('OSVReportGenerator', () => {
        describe('genReport', () => {
            it('should generate a report from OSV data', async () => {
                const result = await osvReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    mockOSV,
                    mockNVD
                );

                expect(result).toBeDefined();
                expect(result.vulnerability_info.vulnerability_id).toBe('CVE-2024-1234');
                expect(result.vulnerability_info.description).toContain('Security Advisory');
                expect(result.vulnerability_info.description).toContain(
                    'This is a test vulnerability description'
                );
                expect(result.vulnerability_info.description).toContain('```javascript');
                expect(result.vulnerability_info.sources).toHaveLength(2);
                expect(result.vulnerability_info.sources[0].name).toBe('OSV');
                expect(result.vulnerability_info.sources[1].name).toBe('NVD');
                expect(result.vulnerability_info.version_info.affected_versions_string).toBe(
                    '>= 1.0.0 < 1.0.1'
                );
                expect(result.owasp_top_10?.id).toBe('A01:2021');
            });

            it('should handle OSV without CVE', async () => {
                const osvWithoutCVE: OSV = { ...mockOSV, cve: null } as unknown as OSV;
                const result = await osvReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    osvWithoutCVE,
                    undefined
                );

                expect(result.vulnerability_info.vulnerability_id).toBe('GHSA-1234-5678-9012');
                expect(result.vulnerability_info.aliases).toContain('GHSA-1234-5678-9012');
                expect(result.vulnerability_info.aliases).not.toContain('CVE-2024-1234');
            });

            it('should throw error when OSV item is undefined', async () => {
                await expect(
                    osvReportGenerator.genReport(
                        mockVulnerability,
                        'NPM',
                        mockDependency,
                        undefined,
                        mockNVD
                    )
                ).rejects.toThrow('Failed to generate report from undefined nvd entry');
            });

            it('should handle vulnerabilities with exact versions', async () => {
                const vulnWithExact = {
                    ...mockVulnerability,
                    OSVMatch: {
                        ...mockVulnerability.OSVMatch,
                        AffectedInfo: [
                            {
                                Ranges: [],
                                Exact: [
                                    {
                                        VersionString: '1.0.0',
                                        VersionSemver: {
                                            Major: 1,
                                            Minor: 0,
                                            Patch: 0,
                                            PreReleaseTag: '',
                                            MetaData: ''
                                        },
                                        CPEInfo: null
                                    },
                                    {
                                        VersionString: '1.0.1',
                                        VersionSemver: {
                                            Major: 1,
                                            Minor: 0,
                                            Patch: 1,
                                            PreReleaseTag: '',
                                            MetaData: ''
                                        },
                                        CPEInfo: null
                                    },
                                    {
                                        VersionString: '1.0.2',
                                        VersionSemver: {
                                            Major: 1,
                                            Minor: 0,
                                            Patch: 2,
                                            PreReleaseTag: '',
                                            MetaData: ''
                                        },
                                        CPEInfo: null
                                    }
                                ],
                                Universal: false
                            }
                        ]
                    }
                };

                const result = await osvReportGenerator.genReport(
                    vulnWithExact,
                    'NPM',
                    mockDependency,
                    mockOSV,
                    mockNVD
                );

                expect(result.vulnerability_info.version_info.affected_versions_string).toBe(
                    '1.0.0 || 1.0.1 || 1.0.2'
                );
            });

            it('should handle universal vulnerability', async () => {
                const vulnUniversal = {
                    ...mockVulnerability,
                    OSVMatch: {
                        ...mockVulnerability.OSVMatch,
                        AffectedInfo: [
                            {
                                Ranges: [],
                                Exact: [],
                                Universal: true
                            }
                        ]
                    }
                };

                const result = await osvReportGenerator.genReport(
                    vulnUniversal,
                    'NPM',
                    mockDependency,
                    mockOSV,
                    mockNVD
                );

                expect(result.vulnerability_info.version_info.affected_versions_string).toBe('*');
            });

            it('should parse CVSS from OSV and fallback to NVD', async () => {
                const osvWithoutCvss = { ...mockOSV, severity: [] };
                const result = await osvReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    osvWithoutCvss,
                    mockNVD
                );

                expect(result.severities.cvss_2).toBeDefined();
                expect(result.severities.cvss_3).toBeDefined();
                expect(result.severities.cvss_31).toBeDefined();
            });
        });

        describe('cleanOsvDescription', () => {
            it('should clean OSV description properly', async () => {
                const result = await osvReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    mockOSV,
                    mockNVD
                );

                expect(result.vulnerability_info.description).toContain('Security Advisory');
                expect(result.vulnerability_info.description).toContain(
                    'This is a test vulnerability description'
                );
                expect(result.vulnerability_info.description).toContain('```javascript');
                expect(result.vulnerability_info.description).toContain('const vulnerable = true;');
            });

            it('should handle description with trailing newlines', async () => {
                const osvWithTrailingNewlines = {
                    ...mockOSV,
                    details: '# Header\n\nContent\n\n\n\n'
                };
                const result = await osvReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    osvWithTrailingNewlines,
                    mockNVD
                );

                expect(result.vulnerability_info.description).toBe(' Header\n\nContent');
            });
        });
    });

    describe('NVDReportGenerator', () => {
        describe('genReport', () => {
            it('should generate a report from NVD data', async () => {
                const result = await nvdReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    mockOSV,
                    mockNVD
                );

                expect(result).toBeDefined();
                expect(result.vulnerability_info.vulnerability_id).toBe('CVE-2024-1234');
                expect(result.vulnerability_info.description).toBe(
                    'A vulnerability was found in test-package version 1.0.0.'
                );
                expect(result.vulnerability_info.sources).toHaveLength(2);
                expect(result.vulnerability_info.sources[0].name).toBe('NVD');
                expect(result.vulnerability_info.sources[1].name).toBe('OSV');
                expect(result.vulnerability_info.version_info.affected_versions_string).toBe(
                    '>= 1.0.0 < 1.0.1'
                );
            });

            it('should throw error when NVD item is undefined', async () => {
                await expect(
                    nvdReportGenerator.genReport(
                        mockVulnerability,
                        'NPM',
                        mockDependency,
                        mockOSV,
                        undefined
                    )
                ).rejects.toThrow('Failed to generate report from undefined nvd entry');
            });

            it('should handle NVD without OSV', async () => {
                const result = await nvdReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    undefined,
                    mockNVD
                );

                expect(result.vulnerability_info.sources).toHaveLength(1);
                expect(result.vulnerability_info.sources[0].name).toBe('NVD');
                expect(result.vulnerability_info.aliases).toHaveLength(0);
            });

            it('should parse CVSS from NVD and fallback to OSV', async () => {
                const nvdWithoutCvss = { ...mockNVD, metrics: {} };
                const result = await nvdReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    mockOSV,
                    nvdWithoutCvss
                );

                expect(result.severities.cvss_3).toBeDefined();
                expect(result.severities.cvss_3?.base_score).toBeGreaterThan(0);
            });

            it('should handle multiple language descriptions', async () => {
                const nvdWithMultiLang = {
                    ...mockNVD,
                    descriptions: [
                        { lang: 'es', value: 'Descripción en español' },
                        { lang: 'en', value: 'English description' },
                        { lang: 'fr', value: 'Description en français' }
                    ]
                };

                const result = await nvdReportGenerator.genReport(
                    mockVulnerability,
                    'NPM',
                    mockDependency,
                    mockOSV,
                    nvdWithMultiLang
                );

                expect(result.vulnerability_info.description).toBe('English description');
            });
        });
    });

    describe('BaseReportGenerator methods', () => {
        describe('getVulnerableVersionsString', () => {
            it('should format version ranges correctly', async () => {
                osvReportGenerator.vulnsData = mockVulnerability;
                const versionsString = await osvReportGenerator.getVulnerableVersionsString('OSV');
                expect(versionsString).toBe('>= 1.0.0 < 1.0.1');
            });

            it('should handle pre-release tags', async () => {
                const vulnWithPreRelease = {
                    ...mockVulnerability,
                    OSVMatch: {
                        ...mockVulnerability.OSVMatch,
                        AffectedInfo: [
                            {
                                Ranges: [
                                    {
                                        IntroducedSemver: {
                                            Major: 1,
                                            Minor: 0,
                                            Patch: 0,
                                            PreReleaseTag: 'alpha',
                                            MetaData: ''
                                        },
                                        FixedSemver: {
                                            Major: 1,
                                            Minor: 0,
                                            Patch: 1,
                                            PreReleaseTag: 'beta',
                                            MetaData: ''
                                        }
                                    }
                                ],
                                Exact: [],
                                Universal: false
                            }
                        ]
                    }
                };

                osvReportGenerator.vulnsData = vulnWithPreRelease;
                const versionsString = await osvReportGenerator.getVulnerableVersionsString('OSV');
                expect(versionsString).toBe('>= 1.0.0-alpha < 1.0.1-beta');
            });

            it('should handle multiple ranges', async () => {
                const vulnWithMultipleRanges = {
                    ...mockVulnerability,
                    OSVMatch: {
                        ...mockVulnerability.OSVMatch,
                        AffectedInfo: [
                            {
                                Ranges: [
                                    {
                                        IntroducedSemver: {
                                            Major: 1,
                                            Minor: 0,
                                            Patch: 0,
                                            PreReleaseTag: '',
                                            MetaData: ''
                                        },
                                        FixedSemver: {
                                            Major: 1,
                                            Minor: 0,
                                            Patch: 1,
                                            PreReleaseTag: '',
                                            MetaData: ''
                                        }
                                    },
                                    {
                                        IntroducedSemver: {
                                            Major: 2,
                                            Minor: 0,
                                            Patch: 0,
                                            PreReleaseTag: '',
                                            MetaData: ''
                                        },
                                        FixedSemver: {
                                            Major: 2,
                                            Minor: 0,
                                            Patch: 5,
                                            PreReleaseTag: '',
                                            MetaData: ''
                                        }
                                    }
                                ],
                                Exact: [],
                                Universal: false
                            }
                        ]
                    }
                };

                osvReportGenerator.vulnsData = vulnWithMultipleRanges;
                const versionsString = await osvReportGenerator.getVulnerableVersionsString('OSV');
                expect(versionsString).toBe('>= 1.0.0 < 1.0.1 || >= 2.0.0 < 2.0.5');
            });
        });

        describe('getOwaspTop10Info', () => {
            it('should return OWASP Top 10 info when available', () => {
                osvReportGenerator.vulnsData = mockVulnerability;
                const owaspInfo = osvReportGenerator.getOwaspTop10Info();
                expect(owaspInfo).toBeDefined();
                expect(owaspInfo?.id).toBe('A01:2021');
                expect(owaspInfo?.name).toBe('Broken Access Control');
            });

            it('should return null when no weaknesses', () => {
                osvReportGenerator.vulnsData = { ...mockVulnerability, Weaknesses: undefined };
                const owaspInfo = osvReportGenerator.getOwaspTop10Info();
                expect(owaspInfo).toBeNull();
            });

            it('should return null when no OWASP ID', () => {
                osvReportGenerator.vulnsData = {
                    ...mockVulnerability,
                    Weaknesses: [
                        {
                            WeaknessId: 'CWE-79',
                            WeaknessName: 'Cross-site Scripting (XSS)',
                            WeaknessDescription:
                                'The software does not neutralize or incorrectly neutralizes user-controllable input',
                            WeaknessExtendedDescription: 'Extended description of the weakness',
                            OWASPTop10Id: '',
                            OWASPTop10Name: ''
                        } as WeaknessInfo
                    ]
                };
                const owaspInfo = osvReportGenerator.getOwaspTop10Info();
                expect(owaspInfo).toBeNull();
            });
        });

        describe('getWeaknessData', () => {
            it('should return empty arrays when no weaknesses', async () => {
                osvReportGenerator.vulnsData = { ...mockVulnerability, Weaknesses: undefined };
                const [weaknesses, consequences] = await osvReportGenerator.getWeaknessData();
                expect(weaknesses).toEqual([]);
                expect(consequences).toEqual({});
            });

            it('should handle CWE repository errors gracefully', async () => {
                osvReportGenerator.vulnsData = mockVulnerability;
                const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
                const [weaknesses, consequences] = await osvReportGenerator.getWeaknessData();
                expect(weaknesses).toEqual([]);
                expect(consequences).toEqual({});
                expect(consoleErrorSpy).toHaveBeenCalled();
                consoleErrorSpy.mockRestore();
            });
        });

        describe('getDependencyData', () => {
            it('should return empty dependency data when dependency data is missing', async () => {
                osvReportGenerator.dependencyData = undefined;
                const result = await osvReportGenerator.getDependencyData();
                expect(result).toEqual({
                    description: '',
                    keywords: [],
                    name: '',
                    package_manager_links: [],
                    published: '',
                    version: ''
                });
            });

            it('should return dependency info structure', async () => {
                osvReportGenerator.dependencyData = mockDependency;
                const dependencyInfo = await osvReportGenerator.getDependencyData();
                expect(dependencyInfo).toHaveProperty('name');
                expect(dependencyInfo).toHaveProperty('version');
                expect(dependencyInfo).toHaveProperty('description');
                expect(dependencyInfo).toHaveProperty('keywords');
                expect(dependencyInfo).toHaveProperty('package_manager_links');
            });
        });

        describe('getOtherInfo', () => {
            it('should return package manager info', () => {
                osvReportGenerator.packageManager = 'NPM';
                const otherInfo = osvReportGenerator.getOtherInfo();
                expect(otherInfo.package_manager).toBe('NPM');
            });
        });

        describe('getPatchesData', () => {
            it('should return patches data', () => {
                const mockPatchInfo = {
                    TopLevelVulnerable: true,
                    IsPatchable: 'true',
                    Unpatchable: [],
                    Patchable: [],
                    Introduced: [],
                    Patches: {},
                    Update: { Major: 1, Minor: 0, Patch: 1, PreReleaseTag: '', MetaData: '' }
                };
                osvReportGenerator.patchesData = mockPatchInfo;
                const patchInfo = osvReportGenerator.getPatchesData();
                expect(patchInfo).toEqual(mockPatchInfo);
            });
        });

        describe('getVersionsStatusArray', () => {
            it('should return empty array when no versions', async () => {
                const result = await osvReportGenerator.getVersionsStatusArray(
                    '>= 1.0.0 < 1.0.1',
                    'test-package'
                );
                expect(result).toEqual([]);
            });
        });
    });

    describe('CVSS Parsing Methods', () => {
        describe('parseCVSS31Vector', () => {
            it('should parse CVSS 3.1 vector', async () => {
                const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
                const result = await osvReportGenerator.parseCVSS31Vector(vector);

                expect(result).toBeDefined();
                expect(result.base_score).toBeGreaterThan(0);
                expect(result.attack_vector).toBe('NETWORK');
                expect(result.attack_complexity).toBe('LOW');
                expect(result.privileges_required).toBe('NONE');
                expect(result.user_interaction).toBe('NONE');
                expect(result.scope).toBe('UNCHANGED');
                expect(result.confidentiality_impact).toBe('HIGH');
                expect(result.integrity_impact).toBe('HIGH');
                expect(result.availability_impact).toBe('HIGH');
            });
        });

        describe('parseCVSS3Vector', () => {
            it('should parse CVSS 3.0 vector', async () => {
                const vector = 'CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
                const result = await osvReportGenerator.parseCVSS3Vector(vector);

                expect(result).toBeDefined();
                expect(result.base_score).toBeGreaterThan(0);
                expect(result.attack_vector).toBe('NETWORK');
                expect(result.attack_complexity).toBe('LOW');
                expect(result.privileges_required).toBe('NONE');
                expect(result.user_interaction).toBe('NONE');
                expect(result.scope).toBe('UNCHANGED');
                expect(result.confidentiality_impact).toBe('HIGH');
                expect(result.integrity_impact).toBe('HIGH');
                expect(result.availability_impact).toBe('HIGH');
            });
        });

        describe('parseCVSS2Vector', () => {
            it('should parse CVSS 2.0 vector', async () => {
                const vector = 'AV:N/AC:L/Au:N/C:P/I:P/A:P';
                const result = await osvReportGenerator.parseCVSS2Vector(vector);

                expect(result).toBeDefined();
                expect(result.base_score).toBeGreaterThan(0);
                expect(result.access_vector).toBe('NETWORK');
                expect(result.access_complexity).toBe('LOW');
                expect(result.authentication).toBe('NONE');
                expect(result.confidentiality_impact).toBe('PARTIAL');
                expect(result.integrity_impact).toBe('PARTIAL');
                expect(result.availability_impact).toBe('PARTIAL');
            });
        });

        describe('getCVSSNVDInfo', () => {
            it('should extract CVSS info from NVD with all versions', async () => {
                const result = await osvReportGenerator.getCVSSNVDInfo(mockNVD);

                expect(result.cvss_2).toBeDefined();
                expect(result.cvss_3).toBeDefined();
                expect(result.cvss_31).toBeDefined();
                expect(result.cvss_2?.user_interaction_required).toBe(false);
            });

            it('should prefer nvd@nist.gov source when multiple sources', async () => {
                const nvdWithMultipleSources = {
                    ...mockNVD,
                    metrics: {
                        cvssMetricV2: [
                            {
                                source: 'other@source.com',
                                cvssData: { vectorString: 'AV:L/AC:H/Au:S/C:N/I:N/A:N' }
                            },
                            {
                                source: 'nvd@nist.gov',
                                cvssData: { vectorString: 'AV:N/AC:L/Au:N/C:P/I:P/A:P' },
                                userInteractionRequired: false
                            }
                        ]
                    }
                };

                const result = await osvReportGenerator.getCVSSNVDInfo(nvdWithMultipleSources);
                expect(result.cvss_2?.access_vector).toBe('NETWORK');
            });

            it('should handle missing metrics', async () => {
                const nvdWithoutMetrics = { ...mockNVD, metrics: undefined };
                const result = await osvReportGenerator.getCVSSNVDInfo(nvdWithoutMetrics);
                expect(result).toEqual({});
            });
        });

        describe('getCVSSOSVInfo', () => {
            it('should extract CVSS info from OSV', async () => {
                const result = await osvReportGenerator.getCVSSOSVInfo(mockOSV);
                expect(result.cvss_3).toBeDefined();
                expect(result.cvss_3?.base_score).toBeGreaterThan(0);
            });

            it('should handle OSV with CVSS2', async () => {
                const osvWithCVSS2 = {
                    ...mockOSV,
                    severity: [
                        {
                            type: 'CVSS_V2',
                            score: 'AV:N/AC:L/Au:N/C:P/I:P/A:P'
                        }
                    ]
                };

                const result = await osvReportGenerator.getCVSSOSVInfo(osvWithCVSS2);
                expect(result.cvss_2).toBeDefined();
                expect(result.cvss_3).toBeUndefined();
            });

            it('should handle OSV without severity', async () => {
                const osvWithoutSeverity = { ...mockOSV, severity: undefined };
                const result = await osvReportGenerator.getCVSSOSVInfo(osvWithoutSeverity);
                expect(result).toEqual({});
            });
        });
    });
});
