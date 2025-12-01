import {
    type SeverityDist,
    type Dependency,
    type DependencyDetails,
    type WorkSpaceData,
    type Output,
    type AnalysisInfo,
    type LicenseDist,
    type Stats,
    type StatusError,
    type ParsedGitUrl,
    type GraphOutput,
    type WorkspacesOutput,
    LinkType,
    Status,
    SbomDependency
} from './sbom.types';

describe('SBOM Types', () => {
    describe('SeverityDist', () => {
        it('should define severity distribution structure', () => {
            const severityDist: SeverityDist = {
                critical: 1,
                high: 2,
                medium: 3,
                low: 4,
                none: 5
            };

            expect(severityDist.critical).toBe(1);
            expect(severityDist.high).toBe(2);
            expect(severityDist.medium).toBe(3);
            expect(severityDist.low).toBe(4);
            expect(severityDist.none).toBe(5);
        });

        it('should allow zero values', () => {
            const severityDist: SeverityDist = {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                none: 0
            };

            expect(severityDist.critical).toBe(0);
            expect(severityDist.high).toBe(0);
            expect(severityDist.medium).toBe(0);
            expect(severityDist.low).toBe(0);
            expect(severityDist.none).toBe(0);
        });
    });

    describe('LinkType enum', () => {
        it('should define all link types', () => {
            expect(LinkType.GITHUB).toBe('GITHUB');
            expect(LinkType.GITLAB).toBe('GITLAB');
            expect(LinkType.UNKOWN_GIT_SERVER).toBe('UNKOWN_GIT_SERVER');
            expect(LinkType.REMOTE_TARBALL).toBe('REMOTE_TARBALL');
            expect(LinkType.LOCAL_FILE).toBe('LOCAL_FILE');
            expect(LinkType.PACKAGE_MANAGED).toBe('PACKAGE_MANAGED');
            expect(LinkType.UNKNOWN_LINK_TYPE).toBe('UNKNOWN_LINK_TYPE');
            expect(LinkType.SELF_MANAGED).toBe('SELF_MANAGED');
        });

        it('should have exactly 8 enum values', () => {
            const linkTypes = Object.values(LinkType);
            expect(linkTypes.length).toBe(8);
        });
    });

    describe('Status enum', () => {
        it('should define success and failure statuses', () => {
            expect(Status.Success).toBe('success');
            expect(Status.Failure).toBe('failure');
        });

        it('should have exactly 2 enum values', () => {
            const statuses = Object.values(Status);
            expect(statuses.length).toBe(2);
        });
    });

    describe('Dependency interface', () => {
        it('should define dependency structure', () => {
            const dependency: Dependency = {
                Key: 'package@1.0.0',
                Requires: { 'other-package': '^1.0.0' },
                Dependencies: { 'other-package': '1.0.0' },
                Optional: false,
                Bundled: false,
                Dev: false,
                Prod: true,
                Direct: true,
                Transitive: false,
                Licenses: ['MIT', 'Apache-2.0']
            };

            expect(dependency.Key).toBe('package@1.0.0');
            expect(dependency.Requires).toEqual({ 'other-package': '^1.0.0' });
            expect(dependency.Dependencies).toEqual({ 'other-package': '1.0.0' });
            expect(dependency.Optional).toBe(false);
            expect(dependency.Bundled).toBe(false);
            expect(dependency.Dev).toBe(false);
            expect(dependency.Prod).toBe(true);
            expect(dependency.Direct).toBe(true);
            expect(dependency.Transitive).toBe(false);
            expect(dependency.Licenses).toEqual(['MIT', 'Apache-2.0']);
        });

        it('should allow empty requires and dependencies', () => {
            const dependency: Dependency = {
                Key: 'package@1.0.0',
                Requires: {},
                Dependencies: {},
                Optional: false,
                Bundled: false,
                Dev: false,
                Prod: true,
                Direct: true,
                Transitive: false,
                Licenses: []
            };

            expect(dependency.Requires).toEqual({});
            expect(dependency.Dependencies).toEqual({});
            expect(dependency.Licenses).toEqual([]);
        });
    });

    describe('SbomDependency class', () => {
        it('should define sbom dependency structure', () => {
            const sbomDep = new SbomDependency();
            sbomDep.name = 'test-package';
            sbomDep.version = '1.0.0';
            sbomDep.newest_release = '1.1.0';
            sbomDep.dev = false;
            sbomDep.prod = true;
            sbomDep.is_direct_count = 1;
            sbomDep.is_transitive_count = 0;

            expect(sbomDep.name).toBe('test-package');
            expect(sbomDep.version).toBe('1.0.0');
            expect(sbomDep.newest_release).toBe('1.1.0');
            expect(sbomDep.dev).toBe(false);
            expect(sbomDep.prod).toBe(true);
            expect(sbomDep.is_direct_count).toBe(1);
            expect(sbomDep.is_transitive_count).toBe(0);
        });

        it('should allow instantiation without parameters', () => {
            const sbomDep = new SbomDependency();
            expect(sbomDep).toBeDefined();
        });
    });

    describe('DependencyDetails interface', () => {
        it('should define dependency details structure', () => {
            const details: DependencyDetails = {
                name: 'test-package',
                version: '1.0.0',
                latest_version: '1.1.0',
                dependencies: { dep1: '^1.0.0' },
                dev_dependencies: { 'dev-dep': '^1.0.0' },
                transitive: false,
                source: {
                    type: 'npm',
                    url: 'https://npmjs.com/package/test-package'
                },
                package_manager: 'npm',
                license: 'MIT',
                engines: { node: '>=14.0.0' },
                release_date: new Date('2023-01-01'),
                lastest_release_date: new Date('2023-01-15'),
                vulnerabilities: ['CVE-2023-1234'],
                severity_dist: {
                    critical: 0,
                    high: 1,
                    medium: 0,
                    low: 0,
                    none: 0
                }
            };

            expect(details.name).toBe('test-package');
            expect(details.version).toBe('1.0.0');
            expect(details.latest_version).toBe('1.1.0');
            expect(details.dependencies).toEqual({ dep1: '^1.0.0' });
            expect(details.dev_dependencies).toEqual({ 'dev-dep': '^1.0.0' });
            expect(details.transitive).toBe(false);
            expect(details.source).toEqual({
                type: 'npm',
                url: 'https://npmjs.com/package/test-package'
            });
            expect(details.package_manager).toBe('npm');
            expect(details.license).toBe('MIT');
            expect(details.engines).toEqual({ node: '>=14.0.0' });
            expect(details.release_date).toEqual(new Date('2023-01-01'));
            expect(details.lastest_release_date).toEqual(new Date('2023-01-15'));
            expect(details.vulnerabilities).toEqual(['CVE-2023-1234']);
            expect(details.severity_dist).toEqual({
                critical: 0,
                high: 1,
                medium: 0,
                low: 0,
                none: 0
            });
        });

        it('should allow optional source', () => {
            const details: DependencyDetails = {
                name: 'test-package',
                version: '1.0.0',
                latest_version: '1.1.0',
                dependencies: {},
                dev_dependencies: {},
                transitive: false,
                package_manager: 'npm',
                license: 'MIT',
                engines: {},
                release_date: new Date('2023-01-01'),
                lastest_release_date: new Date('2023-01-15'),
                vulnerabilities: [],
                severity_dist: {
                    critical: 0,
                    high: 0,
                    medium: 0,
                    low: 0,
                    none: 0
                }
            };

            expect(details.source).toBeUndefined();
        });
    });

    describe('WorkSpaceDependency interface (internal)', () => {
        it('should define workspace dependency structure', () => {
            // Since WorkSpaceDependency is internal, test it through WorkSpaceData
            const workspaceData: WorkSpaceData = {
                dependencies: {},
                start: {
                    dependencies: [
                        {
                            name: 'test-package',
                            version: '1.0.0',
                            constraint: '^1.0.0'
                        }
                    ]
                }
            };

            expect(workspaceData.start.dependencies![0]!.name).toBe('test-package');
            expect(workspaceData.start.dependencies![0]!.version).toBe('1.0.0');
            expect(workspaceData.start.dependencies![0]!.constraint).toBe('^1.0.0');
        });
    });

    describe('WorkSpaceData interface', () => {
        it('should define workspace data structure', () => {
            const workspaceData: WorkSpaceData = {
                dependencies: {
                    'test-package': {
                        '1.0.0': {
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
                        }
                    }
                },
                start: {
                    dependencies: [
                        {
                            name: 'test-package',
                            version: '1.0.0',
                            constraint: '^1.0.0'
                        }
                    ],
                    dev_dependencies: [
                        {
                            name: 'dev-package',
                            version: '1.0.0',
                            constraint: '^1.0.0'
                        }
                    ]
                }
            };

            expect(workspaceData.dependencies).toBeDefined();
            expect(workspaceData.dependencies['test-package']).toBeDefined();
            expect(workspaceData.dependencies['test-package']!['1.0.0']).toBeDefined();
            expect(workspaceData.start.dependencies).toHaveLength(1);
            expect(workspaceData.start.dev_dependencies).toHaveLength(1);
        });

        it('should allow optional dependencies and dev_dependencies in start', () => {
            const workspaceData: WorkSpaceData = {
                dependencies: {},
                start: {}
            };

            expect(workspaceData.start.dependencies).toBeUndefined();
            expect(workspaceData.start.dev_dependencies).toBeUndefined();
        });
    });

    describe('Output interface', () => {
        it('should define output structure', () => {
            const output: Output = {
                workspaces: {
                    default: {
                        dependencies: {},
                        start: {}
                    }
                },
                analysis_info: {
                    status: Status.Success,
                    private_errors: [],
                    public_errors: [],
                    project_name: 'test-project',
                    working_directory: '/path/to/project',
                    package_manager: 'npm',
                    lock_file_version: 1,
                    lock_file_path: '/path/to/package-lock.json',
                    package_file_path: '/path/to/package.json',
                    relative_lock_file_path: 'package-lock.json',
                    relative_package_file_path: 'package.json',
                    analysis_start_time: '2023-01-01T00:00:00Z',
                    analysis_end_time: '2023-01-01T00:01:00Z',
                    analysis_delta_time: 60000,
                    version_seperator: '@',
                    import_path_seperator: '/',
                    default_workspace_name: 'default',
                    self_managed_workspace_name: 'self',
                    work_spaces_used: false,
                    work_space_package_file_paths: {},
                    stats: {}
                }
            };

            expect(output.workspaces).toBeDefined();
            expect(output.workspaces['default']).toBeDefined();
            expect(output.analysis_info).toBeDefined();
            expect(output.analysis_info.status).toBe(Status.Success);
            expect(output.analysis_info.project_name).toBe('test-project');
        });
    });

    describe('AnalysisInfo interface', () => {
        it('should define analysis info structure', () => {
            const analysisInfo: AnalysisInfo = {
                status: Status.Success,
                private_errors: [{ type: 'error', description: 'Private error' }],
                public_errors: [{ type: 'warning', description: 'Public warning' }],
                project_name: 'test-project',
                working_directory: '/path/to/project',
                package_manager: 'npm',
                lock_file_version: 1,
                lock_file_path: '/path/to/package-lock.json',
                package_file_path: '/path/to/package.json',
                relative_lock_file_path: 'package-lock.json',
                relative_package_file_path: 'package.json',
                analysis_start_time: '2023-01-01T00:00:00Z',
                analysis_end_time: '2023-01-01T00:01:00Z',
                analysis_delta_time: 60000,
                version_seperator: '@',
                import_path_seperator: '/',
                default_workspace_name: 'default',
                self_managed_workspace_name: 'self',
                work_spaces_used: false,
                work_space_package_file_paths: {
                    frontend: '/path/to/frontend/package.json',
                    backend: '/path/to/backend/package.json'
                },
                stats: {
                    dependencies_count: 100,
                    vulnerabilities_count: 5
                }
            };

            expect(analysisInfo.status).toBe(Status.Success);
            expect(analysisInfo.private_errors).toHaveLength(1);
            expect(analysisInfo.public_errors).toHaveLength(1);
            expect(analysisInfo.project_name).toBe('test-project');
            expect(analysisInfo.working_directory).toBe('/path/to/project');
            expect(analysisInfo.package_manager).toBe('npm');
            expect(analysisInfo.lock_file_version).toBe(1);
            expect(analysisInfo.analysis_delta_time).toBe(60000);
            expect(analysisInfo.version_seperator).toBe('@');
            expect(analysisInfo.import_path_seperator).toBe('/');
            expect(analysisInfo.default_workspace_name).toBe('default');
            expect(analysisInfo.self_managed_workspace_name).toBe('self');
            expect(analysisInfo.work_spaces_used).toBe(false);
            expect(analysisInfo.work_space_package_file_paths).toEqual({
                frontend: '/path/to/frontend/package.json',
                backend: '/path/to/backend/package.json'
            });
            expect(analysisInfo.stats).toEqual({
                dependencies_count: 100,
                vulnerabilities_count: 5
            });
        });
    });

    describe('LicenseDist interface', () => {
        it('should define license distribution structure', () => {
            const licenseDist: LicenseDist = {
                MIT: 10,
                'Apache-2.0': 5,
                'BSD-3-Clause': 3,
                'GPL-3.0': 1
            };

            expect(licenseDist['MIT']).toBe(10);
            expect(licenseDist['Apache-2.0']).toBe(5);
            expect(licenseDist['BSD-3-Clause']).toBe(3);
            expect(licenseDist['GPL-3.0']).toBe(1);
        });

        it('should allow empty license distribution', () => {
            const licenseDist: LicenseDist = {};
            expect(Object.keys(licenseDist)).toHaveLength(0);
        });
    });

    describe('Stats interface', () => {
        it('should define stats structure', () => {
            const stats: Stats = {
                license_dist: {
                    MIT: 10,
                    'Apache-2.0': 5
                },
                number_of_spdx_licenses: 15,
                number_of_non_spdx_licenses: 0,
                number_of_copy_left_licenses: 0,
                number_of_permissive_licenses: 15
            };

            expect(stats.license_dist).toEqual({
                MIT: 10,
                'Apache-2.0': 5
            });
            expect(stats.number_of_spdx_licenses).toBe(15);
            expect(stats.number_of_non_spdx_licenses).toBe(0);
            expect(stats.number_of_copy_left_licenses).toBe(0);
            expect(stats.number_of_permissive_licenses).toBe(15);
        });
    });

    describe('StatusError interface', () => {
        it('should define status error structure', () => {
            const statusError: StatusError = {
                type: 'error',
                description: 'Something went wrong'
            };

            expect(statusError.type).toBe('error');
            expect(statusError.description).toBe('Something went wrong');
        });

        it('should allow different error types', () => {
            const warningError: StatusError = {
                type: 'warning',
                description: 'This is a warning'
            };

            const infoError: StatusError = {
                type: 'info',
                description: 'This is informational'
            };

            expect(warningError.type).toBe('warning');
            expect(warningError.description).toBe('This is a warning');
            expect(infoError.type).toBe('info');
            expect(infoError.description).toBe('This is informational');
        });
    });

    describe('ParsedGitUrl interface', () => {
        it('should define parsed git url structure', () => {
            const parsedGitUrl: ParsedGitUrl = {
                protocol: 'https',
                host: 'github.com',
                repo: 'test-repo',
                user: 'test-user',
                project: 'test-project',
                repo_full_path: 'test-user/test-project',
                version: 'v1.0.0',
                host_type: 'github'
            };

            expect(parsedGitUrl.protocol).toBe('https');
            expect(parsedGitUrl.host).toBe('github.com');
            expect(parsedGitUrl.repo).toBe('test-repo');
            expect(parsedGitUrl.user).toBe('test-user');
            expect(parsedGitUrl.project).toBe('test-project');
            expect(parsedGitUrl.repo_full_path).toBe('test-user/test-project');
            expect(parsedGitUrl.version).toBe('v1.0.0');
            expect(parsedGitUrl.host_type).toBe('github');
        });
    });

    describe('GraphOutput interface', () => {
        it('should define graph output structure', () => {
            const graphOutput: GraphOutput = {
                graph: {
                    dependencies: {
                        'test-package': {
                            '1.0.0': {
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
                            }
                        }
                    },
                    start: {
                        dependencies: [
                            {
                                name: 'test-package',
                                version: '1.0.0',
                                constraint: '^1.0.0'
                            }
                        ]
                    }
                },
                project_name: 'test-project'
            };

            expect(graphOutput.graph).toBeDefined();
            expect(graphOutput.graph.dependencies).toBeDefined();
            expect(graphOutput.project_name).toBe('test-project');
        });
    });

    describe('WorkspacesOutput interface', () => {
        it('should define workspaces output structure', () => {
            const workspacesOutput: WorkspacesOutput = {
                workspaces: ['default', 'frontend', 'backend'],
                package_manager: 'npm'
            };

            expect(workspacesOutput.workspaces).toEqual(['default', 'frontend', 'backend']);
            expect(workspacesOutput.package_manager).toBe('npm');
        });

        it('should allow empty workspaces array', () => {
            const workspacesOutput: WorkspacesOutput = {
                workspaces: [],
                package_manager: 'npm'
            };

            expect(workspacesOutput.workspaces).toEqual([]);
            expect(workspacesOutput.package_manager).toBe('npm');
        });
    });
});
