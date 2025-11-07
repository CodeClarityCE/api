import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { CombinedAuthGuard } from 'src/base_modules/auth/guards/combined.guard';
import type { PaginatedResponse } from 'src/types/apiResponses.types';
import { EntityNotFound, NotAuthorized } from 'src/types/error.types';
import { FindingsController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import {
    newAnalysisStats,
    type AnalysisStats,
    type VulnerabilityDetails
} from './vulnerabilities2.types';
import { VulnerabilityService } from './vulnerability.service';

describe('FindingsController', () => {
    let controller: FindingsController;
    let vulnerabilitiesService: jest.Mocked<VulnerabilitiesService>;
    let vulnerabilityService: jest.Mocked<VulnerabilityService>;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    const mockCombinedAuthGuard = {
        canActivate: jest.fn().mockReturnValue(true)
    };

    const mockVulnerabilitiesService = {
        getVulnerabilities: jest.fn(),
        getStats: jest.fn()
    };

    const mockVulnerabilityService = {
        getVulnerability: jest.fn()
    };

    const mockPaginatedResponse: PaginatedResponse = {
        data: [
            {
                id: 'vuln-1',
                title: 'Test Vulnerability 1',
                severity: 'HIGH',
                description: 'Test vulnerability description'
            },
            {
                id: 'vuln-2',
                title: 'Test Vulnerability 2',
                severity: 'MEDIUM',
                description: 'Another test vulnerability'
            }
        ],
        page: 1,
        entry_count: 2,
        entries_per_page: 10,
        total_entries: 2,
        total_pages: 1,
        matching_count: 2,
        filter_count: {
            severity: 2
        }
    };

    const mockStatsResponse: AnalysisStats = {
        number_of_issues: 50,
        number_of_vulnerabilities: 50,
        number_of_vulnerable_dependencies: 25,
        number_of_direct_vulnerabilities: 30,
        number_of_transitive_vulnerabilities: 20,
        mean_severity: 5.5,
        max_severity: 9.0,
        number_of_owasp_top_10_2021_a1: 3,
        number_of_owasp_top_10_2021_a2: 2,
        number_of_owasp_top_10_2021_a3: 5,
        number_of_owasp_top_10_2021_a4: 1,
        number_of_owasp_top_10_2021_a5: 4,
        number_of_owasp_top_10_2021_a6: 2,
        number_of_owasp_top_10_2021_a7: 1,
        number_of_owasp_top_10_2021_a8: 3,
        number_of_owasp_top_10_2021_a9: 2,
        number_of_owasp_top_10_2021_a10: 1,
        number_of_critical: 5,
        number_of_high: 15,
        number_of_medium: 20,
        number_of_low: 10,
        number_of_none: 0,
        mean_confidentiality_impact: 4.5,
        mean_integrity_impact: 3.8,
        mean_availability_impact: 4.2,
        number_of_vulnerabilities_diff: 2,
        number_of_vulnerable_dependencies_diff: 1,
        number_of_direct_vulnerabilities_diff: 3,
        number_of_transitive_vulnerabilities_diff: -1,
        mean_severity_diff: 0.3,
        max_severity_diff: 1.0,
        number_of_owasp_top_10_2021_a1_diff: 1,
        number_of_owasp_top_10_2021_a2_diff: 0,
        number_of_owasp_top_10_2021_a3_diff: 2,
        number_of_owasp_top_10_2021_a4_diff: 0,
        number_of_owasp_top_10_2021_a5_diff: 1,
        number_of_owasp_top_10_2021_a6_diff: 0,
        number_of_owasp_top_10_2021_a7_diff: 0,
        number_of_owasp_top_10_2021_a8_diff: 1,
        number_of_owasp_top_10_2021_a9_diff: 0,
        number_of_owasp_top_10_2021_a10_diff: 0,
        number_of_critical_diff: 2,
        number_of_high_diff: 1,
        number_of_medium_diff: -1,
        number_of_low_diff: 0,
        number_of_none_diff: 0,
        mean_confidentiality_impact_diff: 0.2,
        mean_integrity_impact_diff: 0.1,
        mean_availability_impact_diff: 0.3
    };

    const mockVulnerabilityResponse: VulnerabilityDetails = {
        vulnerability_info: {
            vulnerability_id: 'CVE-2023-1234',
            description: 'Detailed vulnerability description',
            version_info: {
                affected_versions_string: '<1.0.1',
                patched_versions_string: '>=1.0.1',
                versions: []
            },
            published: '2023-01-01T00:00:00Z',
            last_modified: '2023-01-15T00:00:00Z',
            sources: [
                {
                    name: 'NVD',
                    vuln_url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-1234'
                }
            ],
            aliases: ['GHSA-xxxx-xxxx-xxxx']
        },
        dependency_info: {
            name: 'test-package',
            published: '2022-01-01T00:00:00Z',
            description: 'Test package description',
            keywords: ['test', 'security'],
            version: '1.0.0',
            package_manager_links: [
                {
                    package_manager: 'npm',
                    url: 'https://www.npmjs.com/package/test-package'
                }
            ],
            homepage: 'https://github.com/test/package'
        },
        severities: {
            cvss_31: {
                base_score: 8.5,
                exploitability_score: 3.9,
                impact_score: 5.9,
                attack_vector: 'N',
                attack_complexity: 'L',
                privileges_required: 'N',
                user_interaction: 'N',
                scope: 'U',
                confidentiality_impact: 'H',
                integrity_impact: 'H',
                availability_impact: 'H'
            }
        },
        owasp_top_10: {
            id: 'A06:2021',
            name: 'A06:2021 – Vulnerable and Outdated Components',
            description: 'Using vulnerable, outdated, or unsupported components'
        },
        weaknesses: [
            {
                id: 'CWE-79',
                name: 'Cross-site Scripting',
                description: 'Improper neutralization of input'
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
                Major: 1,
                Minor: 0,
                Patch: 1,
                PreReleaseTag: '',
                MetaData: ''
            }
        },
        common_consequences: {
            Confidentiality: [
                {
                    scope: ['Confidentiality'],
                    impact: ['Read Application Data'],
                    description: 'Unauthorized access to sensitive data'
                }
            ]
        },
        references: [
            {
                url: 'https://example.com/advisory',
                tags: ['vendor-advisory']
            }
        ],
        location: ['node_modules/test-package/package.json'],
        other: {
            package_manager: 'npm'
        }
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [FindingsController],
            providers: [
                {
                    provide: VulnerabilitiesService,
                    useValue: mockVulnerabilitiesService
                },
                {
                    provide: VulnerabilityService,
                    useValue: mockVulnerabilityService
                },
                {
                    provide: JwtService,
                    useValue: { verifyAsync: jest.fn() }
                },
                {
                    provide: Reflector,
                    useValue: { getAllAndOverride: jest.fn() }
                }
            ]
        })
            .overrideGuard(CombinedAuthGuard)
            .useValue(mockCombinedAuthGuard)
            .compile();

        controller = module.get<FindingsController>(FindingsController);
        vulnerabilitiesService = module.get(VulnerabilitiesService);
        vulnerabilityService = module.get(VulnerabilityService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getVulnerabilities', () => {
        const baseParams = {
            org_id: 'test-org-id',
            project_id: 'test-project-id',
            analysis_id: 'test-analysis-id',
            user: mockAuthenticatedUser,
            workspace: 'test-workspace'
        };

        it('should return paginated vulnerabilities with default parameters', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);

            // Act
            const result = await controller.getVulnerabilities(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace
            );

            // Assert
            expect(vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                -1, // Default page
                -1, // Default entries_per_page
                undefined, // sort_by
                undefined, // sort_direction
                undefined, // active_filters
                undefined, // search_key
                undefined, // ecosystem_filter
                false // show_blacklisted (default: 'false' -> false)
            );
            expect(result).toEqual(mockPaginatedResponse);
        });

        it('should return paginated vulnerabilities with custom parameters', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);
            const customParams = {
                page: 2,
                entries_per_page: 20,
                sort_by: 'severity',
                sort_direction: 'desc',
                active_filters: 'severity:HIGH',
                search_key: 'test search'
            };

            // Act
            const result = await controller.getVulnerabilities(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                customParams.page,
                customParams.entries_per_page,
                customParams.sort_by,
                customParams.sort_direction,
                customParams.active_filters,
                customParams.search_key
            );

            // Assert
            expect(vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                2, // page
                20, // entries_per_page
                'severity', // sort_by
                'desc', // sort_direction
                'severity:HIGH', // active_filters
                'test search', // search_key
                undefined, // ecosystem_filter
                false // show_blacklisted (default: 'false' -> false)
            );
            expect(result).toEqual(mockPaginatedResponse);
        });

        it('should handle zero page and entries_per_page parameters', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);

            // Act
            const result = await controller.getVulnerabilities(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                0, // page
                0 // entries_per_page
            );

            // Assert
            expect(vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                -1, // Converted from 0 to -1
                -1, // Converted from 0 to -1
                undefined, // sort_by
                undefined, // sort_direction
                undefined, // active_filters
                undefined, // search_key
                undefined, // ecosystem_filter
                false // show_blacklisted (default: 'false' -> false)
            );
            expect(result).toEqual(mockPaginatedResponse);
        });

        it('should handle empty string parameters', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);

            // Act
            const result = await controller.getVulnerabilities(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                undefined,
                undefined,
                '', // Empty sort_by
                '', // Empty sort_direction
                '', // Empty active_filters
                '' // Empty search_key
            );

            // Assert
            expect(vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                -1,
                -1,
                '', // Empty strings are passed as is
                '', // sort_direction
                '', // active_filters
                '', // search_key
                undefined, // ecosystem_filter
                false // show_blacklisted (default: 'false' -> false)
            );
            expect(result).toEqual(mockPaginatedResponse);
        });

        it('should throw EntityNotFound when vulnerabilities service throws EntityNotFound', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockRejectedValue(
                new EntityNotFound('Analysis not found')
            );

            // Act & Assert
            await expect(
                controller.getVulnerabilities(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user is not authorized', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockRejectedValue(
                new NotAuthorized('Not authorized')
            );

            // Act & Assert
            await expect(
                controller.getVulnerabilities(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should handle service errors gracefully', async () => {
            // Arrange
            const serviceError = new Error('Service error');
            vulnerabilitiesService.getVulnerabilities.mockRejectedValue(serviceError);

            // Act & Assert
            await expect(
                controller.getVulnerabilities(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow('Service error');
        });
    });

    describe('getStats', () => {
        const baseParams = {
            org_id: 'test-org-id',
            project_id: 'test-project-id',
            analysis_id: 'test-analysis-id',
            user: mockAuthenticatedUser,
            workspace: 'test-workspace'
        };

        it('should return vulnerability statistics', async () => {
            // Arrange
            vulnerabilitiesService.getStats.mockResolvedValue(mockStatsResponse);

            // Act
            const result = await controller.getStats(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace
            );

            // Assert
            expect(vulnerabilitiesService.getStats).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                undefined // ecosystem_filter
            );
            expect(result).toEqual({
                data: mockStatsResponse
            });
        });

        it('should handle empty statistics response', async () => {
            // Arrange
            const emptyStats: AnalysisStats = newAnalysisStats();
            vulnerabilitiesService.getStats.mockResolvedValue(emptyStats);

            // Act
            const result = await controller.getStats(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace
            );

            // Assert
            expect(result).toEqual({
                data: emptyStats
            });
        });

        it('should throw EntityNotFound when analysis does not exist', async () => {
            // Arrange
            vulnerabilitiesService.getStats.mockRejectedValue(
                new EntityNotFound('Analysis not found')
            );

            // Act & Assert
            await expect(
                controller.getStats(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            // Arrange
            vulnerabilitiesService.getStats.mockRejectedValue(new NotAuthorized('Not authorized'));

            // Act & Assert
            await expect(
                controller.getStats(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should handle service errors gracefully', async () => {
            // Arrange
            const serviceError = new Error('Database connection failed');
            vulnerabilitiesService.getStats.mockRejectedValue(serviceError);

            // Act & Assert
            await expect(
                controller.getStats(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow('Database connection failed');
        });
    });

    describe('getVulnerability', () => {
        const baseParams = {
            org_id: 'test-org-id',
            project_id: 'test-project-id',
            analysis_id: 'test-analysis-id',
            vulnerability_id: 'test-vulnerability-id',
            user: mockAuthenticatedUser,
            workspace: 'test-workspace'
        };

        it('should return detailed vulnerability information', async () => {
            // Arrange
            vulnerabilityService.getVulnerability.mockResolvedValue(mockVulnerabilityResponse);

            // Act
            const result = await controller.getVulnerability(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.vulnerability_id,
                baseParams.user,
                baseParams.workspace
            );

            // Assert
            expect(vulnerabilityService.getVulnerability).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.vulnerability_id,
                baseParams.workspace
            );
            expect(result).toEqual({
                data: mockVulnerabilityResponse
            });
        });

        it('should handle vulnerability with minimal fields', async () => {
            // Arrange
            const vulnerabilityWithMinimalFields: VulnerabilityDetails = {
                vulnerability_info: {
                    vulnerability_id: 'vuln-123',
                    description: 'Vulnerability with minimal fields',
                    version_info: {
                        affected_versions_string: '',
                        patched_versions_string: '',
                        versions: []
                    },
                    published: '',
                    last_modified: '',
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
            vulnerabilityService.getVulnerability.mockResolvedValue(vulnerabilityWithMinimalFields);

            // Act
            const result = await controller.getVulnerability(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.vulnerability_id,
                baseParams.user,
                baseParams.workspace
            );

            // Assert
            expect(result).toEqual({
                data: vulnerabilityWithMinimalFields
            });
        });

        it('should throw EntityNotFound when vulnerability does not exist', async () => {
            // Arrange
            vulnerabilityService.getVulnerability.mockRejectedValue(
                new EntityNotFound('Vulnerability not found')
            );

            // Act & Assert
            await expect(
                controller.getVulnerability(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.vulnerability_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow(EntityNotFound);
        });

        it('should throw NotAuthorized when user lacks permission', async () => {
            // Arrange
            vulnerabilityService.getVulnerability.mockRejectedValue(
                new NotAuthorized('Not authorized')
            );

            // Act & Assert
            await expect(
                controller.getVulnerability(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.vulnerability_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow(NotAuthorized);
        });

        it('should handle service errors gracefully', async () => {
            // Arrange
            const serviceError = new Error('Database timeout');
            vulnerabilityService.getVulnerability.mockRejectedValue(serviceError);

            // Act & Assert
            await expect(
                controller.getVulnerability(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.vulnerability_id,
                    baseParams.user,
                    baseParams.workspace
                )
            ).rejects.toThrow('Database timeout');
        });
    });

    describe('Controller Integration', () => {
        it('should be defined', () => {
            expect(controller).toBeDefined();
        });

        it('should have injected dependencies', () => {
            expect(vulnerabilitiesService).toBeDefined();
            expect(vulnerabilityService).toBeDefined();
        });

        it('should handle multiple concurrent requests', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);
            vulnerabilitiesService.getStats.mockResolvedValue(mockStatsResponse);
            vulnerabilityService.getVulnerability.mockResolvedValue(mockVulnerabilityResponse);

            const baseParams = {
                org_id: 'test-org-id',
                project_id: 'test-project-id',
                analysis_id: 'test-analysis-id',
                user: mockAuthenticatedUser,
                workspace: 'test-workspace'
            };

            // Act
            const promises = [
                controller.getVulnerabilities(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                ),
                controller.getStats(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    baseParams.user,
                    baseParams.workspace
                ),
                controller.getVulnerability(
                    baseParams.org_id,
                    baseParams.project_id,
                    baseParams.analysis_id,
                    'vuln-123',
                    baseParams.user,
                    baseParams.workspace
                )
            ];

            const results = await Promise.all(promises);

            // Assert
            expect(results[0]).toEqual(mockPaginatedResponse);
            expect(results[1]).toEqual({ data: mockStatsResponse });
            expect(results[2]).toEqual({ data: mockVulnerabilityResponse });
        });
    });

    describe('Edge Cases', () => {
        const baseParams = {
            org_id: 'test-org-id',
            project_id: 'test-project-id',
            analysis_id: 'test-analysis-id',
            user: mockAuthenticatedUser,
            workspace: 'test-workspace'
        };

        it('should handle very large page numbers', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);

            // Act
            const result = await controller.getVulnerabilities(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                999999, // Very large page number
                50
            );

            // Assert
            expect(vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                999999,
                50,
                undefined, // sort_by
                undefined, // sort_direction
                undefined, // active_filters
                undefined, // search_key
                undefined, // ecosystem_filter
                false // show_blacklisted (default: 'false' -> false)
            );
            expect(result).toEqual(mockPaginatedResponse);
        });

        it('should handle very long filter strings', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);
            const longFilter = 'a'.repeat(1000);

            // Act
            const result = await controller.getVulnerabilities(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                1,
                10,
                'severity',
                'desc',
                longFilter,
                'search'
            );

            // Assert
            expect(vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                1,
                10,
                'severity',
                'desc',
                longFilter,
                'search', // search_key
                undefined, // ecosystem_filter
                false // show_blacklisted (default: 'false' -> false)
            );
            expect(result).toEqual(mockPaginatedResponse);
        });

        it('should handle special characters in parameters', async () => {
            // Arrange
            vulnerabilitiesService.getVulnerabilities.mockResolvedValue(mockPaginatedResponse);
            const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

            // Act
            const result = await controller.getVulnerabilities(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                1,
                10,
                specialChars,
                specialChars,
                specialChars,
                specialChars
            );

            // Assert
            expect(vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
                baseParams.org_id,
                baseParams.project_id,
                baseParams.analysis_id,
                baseParams.user,
                baseParams.workspace,
                1,
                10,
                specialChars, // sort_by
                specialChars, // sort_direction
                specialChars, // active_filters
                specialChars, // search_key
                undefined, // ecosystem_filter
                false // show_blacklisted (default: 'false' -> false)
            );
            expect(result).toEqual(mockPaginatedResponse);
        });
    });
});
