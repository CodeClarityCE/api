import { Package, Version, Source, LicenseNpm } from './package.entity';

describe('Package Entity', () => {
    describe('Package entity properties', () => {
        it('should have all required properties', () => {
            const mockPackage: Package = {
                id: 'uuid-123',
                name: 'express',
                description: 'Fast, unopinionated, minimalist web framework for node.',
                homepage: 'https://expressjs.com/',
                latest_version: '4.18.2',
                time: new Date('2023-01-01T00:00:00Z'),
                keywords: ['framework', 'web', 'middleware', 'server'],
                source: {
                    type: 'git',
                    url: 'https://github.com/expressjs/express.git'
                },
                license: 'MIT',
                licenses: [
                    {
                        type: 'MIT',
                        url: 'https://github.com/expressjs/express/blob/master/LICENSE'
                    }
                ],
                extra: {
                    maintainers: ['dougwilson', 'hacksparrow'],
                    repository: {
                        type: 'git',
                        url: 'git+https://github.com/expressjs/express.git'
                    }
                },
                versions: []
            };

            expect(mockPackage).toBeDefined();
            expect(mockPackage.id).toBe('uuid-123');
            expect(mockPackage.name).toBe('express');
            expect(mockPackage.description).toContain('Fast, unopinionated');
            expect(mockPackage.homepage).toBe('https://expressjs.com/');
            expect(mockPackage.latest_version).toBe('4.18.2');
            expect(mockPackage.time).toBeInstanceOf(Date);
            expect(Array.isArray(mockPackage.keywords)).toBe(true);
            expect(mockPackage.source).toHaveProperty('type', 'git');
            expect(mockPackage.license).toBe('MIT');
            expect(Array.isArray(mockPackage.licenses)).toBe(true);
            expect(typeof mockPackage.extra).toBe('object');
            expect(Array.isArray(mockPackage.versions)).toBe(true);
        });

        it('should handle nullable properties', () => {
            const minimalPackage: Package = {
                id: 'uuid-minimal',
                name: 'minimal-package',
                description: null as any,
                homepage: null as any,
                latest_version: '1.0.0',
                time: null as any,
                keywords: null as any,
                source: null as any,
                license: null as any,
                licenses: null as any,
                extra: null as any,
                versions: []
            };

            expect(minimalPackage.description).toBeNull();
            expect(minimalPackage.homepage).toBeNull();
            expect(minimalPackage.time).toBeNull();
            expect(minimalPackage.keywords).toBeNull();
            expect(minimalPackage.source).toBeNull();
            expect(minimalPackage.license).toBeNull();
            expect(minimalPackage.licenses).toBeNull();
            expect(minimalPackage.extra).toBeNull();
        });

        it('should handle scoped package names', () => {
            const scopedPackage: Package = {
                id: 'uuid-scoped',
                name: '@types/node',
                description: 'TypeScript definitions for Node.js',
                homepage: 'https://github.com/DefinitelyTyped/DefinitelyTyped',
                latest_version: '20.10.5',
                time: new Date('2023-12-01T00:00:00Z'),
                keywords: ['node', 'typescript', 'types'],
                source: {
                    type: 'git',
                    url: 'https://github.com/DefinitelyTyped/DefinitelyTyped.git'
                },
                license: 'MIT',
                licenses: null as any,
                extra: null as any,
                versions: []
            };

            expect(scopedPackage.name).toBe('@types/node');
            expect(scopedPackage.name.startsWith('@')).toBe(true);
            expect(scopedPackage.description).toContain('TypeScript definitions');
        });

        it('should handle complex license structures', () => {
            const complexLicensePackage: Package = {
                id: 'uuid-complex',
                name: 'complex-package',
                description: 'Package with complex licensing',
                homepage: null as any,
                latest_version: '2.0.0',
                time: new Date('2023-06-15T12:30:45Z'),
                keywords: ['license', 'complex'],
                source: null as any,
                license: 'SEE LICENSE IN LICENSE.txt',
                licenses: [
                    {
                        type: 'Apache-2.0',
                        url: 'https://github.com/example/package/blob/master/LICENSE-APACHE'
                    },
                    {
                        type: 'MIT',
                        url: 'https://github.com/example/package/blob/master/LICENSE-MIT'
                    }
                ],
                extra: {
                    'dual-license': true
                } as any,
                versions: []
            };

            expect(complexLicensePackage.license).toBe('SEE LICENSE IN LICENSE.txt');
            expect(complexLicensePackage.licenses).toHaveLength(2);
            expect(complexLicensePackage.licenses[0].type).toBe('Apache-2.0');
            expect(complexLicensePackage.licenses[1].type).toBe('MIT');
        });

        it('should handle extensive keywords array', () => {
            const keywordPackage: Package = {
                id: 'uuid-keywords',
                name: 'keyword-rich-package',
                description: 'Package with many keywords',
                homepage: null as any,
                latest_version: '1.5.0',
                time: null as any,
                keywords: [
                    'javascript',
                    'typescript',
                    'react',
                    'vue',
                    'angular',
                    'nodejs',
                    'express',
                    'framework',
                    'library',
                    'utility',
                    'frontend',
                    'backend',
                    'fullstack',
                    'development',
                    'tools'
                ],
                source: null as any,
                license: 'MIT',
                licenses: null as any,
                extra: null as any,
                versions: []
            };

            expect(keywordPackage.keywords).toHaveLength(15);
            expect(keywordPackage.keywords).toContain('javascript');
            expect(keywordPackage.keywords).toContain('typescript');
            expect(keywordPackage.keywords).toContain('development');
        });

        it('should handle complex extra field structure', () => {
            const extraPackage: Package = {
                id: 'uuid-extra',
                name: 'extra-package',
                description: 'Package with complex extra data',
                homepage: 'https://example.com',
                latest_version: '3.1.4',
                time: new Date('2023-09-20T08:15:30Z'),
                keywords: ['extra', 'metadata'],
                source: {
                    type: 'git',
                    url: 'https://github.com/example/extra-package.git'
                },
                license: 'BSD-3-Clause',
                licenses: null as any,
                extra: {
                    maintainers: [
                        {
                            name: 'John Doe',
                            email: 'john@example.com'
                        },
                        {
                            name: 'Jane Smith',
                            email: 'jane@example.com'
                        }
                    ],
                    repository: {
                        type: 'git',
                        url: 'git+https://github.com/example/extra-package.git',
                        directory: 'packages/core'
                    },
                    bugs: {
                        url: 'https://github.com/example/extra-package/issues',
                        email: 'bugs@example.com'
                    },
                    funding: [
                        {
                            type: 'github',
                            url: 'https://github.com/sponsors/example'
                        },
                        {
                            type: 'patreon',
                            url: 'https://patreon.com/example'
                        }
                    ],
                    engines: {
                        node: '>=14.0.0',
                        npm: '>=6.0.0'
                    },
                    os: ['linux', 'darwin', 'win32'],
                    cpu: ['x64', 'arm64']
                },
                versions: []
            };

            expect(extraPackage.extra.maintainers).toHaveLength(2);
            expect(extraPackage.extra.maintainers[0].name).toBe('John Doe');
            expect(extraPackage.extra.repository.directory).toBe('packages/core');
            expect(extraPackage.extra.bugs.email).toBe('bugs@example.com');
            expect(extraPackage.extra.funding).toHaveLength(2);
            expect(extraPackage.extra.engines.node).toBe('>=14.0.0');
            expect(extraPackage.extra.os).toContain('linux');
            expect(extraPackage.extra.cpu).toContain('x64');
        });
    });

    describe('Version entity properties', () => {
        it('should have all required properties', () => {
            const mockVersion: Version = {
                id: 'version-uuid-123',
                version: '4.18.2',
                dependencies: {
                    accepts: '^1.3.8',
                    'array-flatten': '1.1.1',
                    'body-parser': '1.20.1'
                },
                dev_dependencies: {
                    jest: '^29.0.0',
                    typescript: '^4.8.0',
                    eslint: '^8.0.0'
                },
                extra: {
                    engines: {
                        node: '>= 0.10.0'
                    },
                    scripts: {
                        test: 'mocha --require test/support/env --reporter spec --bail --check-leaks test/ test/acceptance/',
                        'test-ci': 'nyc --reporter=lcov --reporter=text npm test'
                    }
                },
                package: null as any
            };

            expect(mockVersion).toBeDefined();
            expect(mockVersion.id).toBe('version-uuid-123');
            expect(mockVersion.version).toBe('4.18.2');
            expect(typeof mockVersion.dependencies).toBe('object');
            expect(typeof mockVersion.dev_dependencies).toBe('object');
            expect(typeof mockVersion.extra).toBe('object');
            expect(mockVersion.dependencies['accepts']).toBe('^1.3.8');
            expect(mockVersion.dev_dependencies['jest']).toBe('^29.0.0');
        });

        it('should handle nullable dependencies', () => {
            const minimalVersion: Version = {
                id: 'version-minimal',
                version: '1.0.0',
                dependencies: null as any,
                dev_dependencies: null as any,
                extra: null as any,
                package: null as any as any
            };

            expect(minimalVersion.dependencies).toBeNull();
            expect(minimalVersion.dev_dependencies).toBeNull();
            expect(minimalVersion.extra).toBeNull();
        });

        it('should handle empty dependencies', () => {
            const emptyVersion: Version = {
                id: 'version-empty',
                version: '0.1.0',
                dependencies: {},
                dev_dependencies: {},
                extra: {},
                package: null as any
            };

            expect(Object.keys(emptyVersion.dependencies)).toHaveLength(0);
            expect(Object.keys(emptyVersion.dev_dependencies)).toHaveLength(0);
            expect(Object.keys(emptyVersion.extra)).toHaveLength(0);
        });

        it('should handle semantic version formats', () => {
            const versionFormats = [
                '1.0.0',
                '2.1.3-alpha.1',
                '3.0.0-beta',
                '4.2.1-rc.2',
                '5.0.0-next.20231201',
                '0.0.1-canary.1234'
            ];

            versionFormats.forEach((versionString) => {
                const version: Version = {
                    id: `version-${versionString}`,
                    version: versionString,
                    dependencies: null as any,
                    dev_dependencies: null as any,
                    extra: null as any,
                    package: null as any
                };

                expect(version.version).toBe(versionString);
            });
        });

        it('should handle complex dependency structures', () => {
            const complexVersion: Version = {
                id: 'version-complex',
                version: '2.5.1',
                dependencies: {
                    lodash: '^4.17.21',
                    express: '~4.18.0',
                    react: '>=16.8.0 <19.0.0',
                    '@types/node': '^20.0.0',
                    'peer-dep': '*'
                },
                dev_dependencies: {
                    '@typescript-eslint/eslint-plugin': '^6.0.0',
                    '@typescript-eslint/parser': '^6.0.0',
                    prettier: '^3.0.0',
                    husky: '^8.0.3'
                },
                extra: {
                    peerDependencies: {
                        react: '>=16.8.0',
                        'react-dom': '>=16.8.0'
                    },
                    optionalDependencies: {
                        fsevents: '^2.3.0'
                    },
                    bundleDependencies: ['internal-lib'],
                    workspaces: ['packages/*']
                },
                package: null as any
            };

            expect(Object.keys(complexVersion.dependencies)).toHaveLength(5);
            expect(Object.keys(complexVersion.dev_dependencies)).toHaveLength(4);
            expect(complexVersion.dependencies['lodash']).toBe('^4.17.21');
            expect(complexVersion.dependencies['express']).toBe('~4.18.0');
            expect(complexVersion.dependencies['react']).toBe('>=16.8.0 <19.0.0');
            expect(complexVersion.extra.peerDependencies['react']).toBe('>=16.8.0');
            expect(complexVersion.extra.bundleDependencies).toContain('internal-lib');
            expect(complexVersion.extra.workspaces).toContain('packages/*');
        });
    });

    describe('Source interface', () => {
        it('should validate git source structure', () => {
            const gitSource: Source = {
                type: 'git',
                url: 'https://github.com/expressjs/express.git'
            };

            expect(gitSource.type).toBe('git');
            expect(gitSource.url).toContain('github.com');
            expect(gitSource.url.endsWith('.git')).toBe(true);
        });

        it('should validate different source types', () => {
            const sourceTypes = [
                { type: 'git', url: 'https://github.com/example/repo.git' },
                { type: 'svn', url: 'https://svn.example.com/repo' },
                { type: 'hg', url: 'https://hg.example.com/repo' },
                { type: 'bzr', url: 'https://bzr.example.com/repo' }
            ];

            sourceTypes.forEach((source) => {
                expect(source).toHaveProperty('type');
                expect(source).toHaveProperty('url');
                expect(typeof source.type).toBe('string');
                expect(typeof source.url).toBe('string');
            });
        });
    });

    describe('LicenseNpm interface', () => {
        it('should validate license structure', () => {
            const mitLicense: LicenseNpm = {
                type: 'MIT',
                url: 'https://github.com/example/repo/blob/master/LICENSE'
            };

            expect(mitLicense.type).toBe('MIT');
            expect(mitLicense.url).toContain('LICENSE');
        });

        it('should handle different license types', () => {
            const licenses: LicenseNpm[] = [
                { type: 'MIT', url: 'https://opensource.org/licenses/MIT' },
                { type: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
                { type: 'GPL-3.0', url: 'https://www.gnu.org/licenses/gpl-3.0.html' },
                { type: 'BSD-3-Clause', url: 'https://opensource.org/licenses/BSD-3-Clause' },
                { type: 'ISC', url: 'https://opensource.org/licenses/ISC' }
            ];

            licenses.forEach((license) => {
                expect(license).toHaveProperty('type');
                expect(license).toHaveProperty('url');
                expect(typeof license.type).toBe('string');
                expect(typeof license.url).toBe('string');
                expect(license.url.startsWith('https://')).toBe(true);
            });
        });
    });

    describe('Entity relationships', () => {
        it('should handle package-version relationship', () => {
            const packageWithVersions: Package = {
                id: 'package-with-versions',
                name: 'multi-version-package',
                description: 'Package with multiple versions',
                homepage: null as any,
                latest_version: '2.0.0',
                time: null as any,
                keywords: null as any,
                source: null as any,
                license: 'MIT',
                licenses: null as any,
                extra: null as any,
                versions: [
                    {
                        id: 'version-1',
                        version: '1.0.0',
                        dependencies: { dep1: '^1.0.0' },
                        dev_dependencies: null as any,
                        extra: null as any,
                        package: null as any
                    },
                    {
                        id: 'version-2',
                        version: '2.0.0',
                        dependencies: { dep1: '^2.0.0', dep2: '^1.5.0' },
                        dev_dependencies: { 'test-dep': '^1.0.0' },
                        extra: null as any,
                        package: null as any
                    }
                ]
            };

            expect(packageWithVersions.versions).toHaveLength(2);
            expect(packageWithVersions.versions[0].version).toBe('1.0.0');
            expect(packageWithVersions.versions[1].version).toBe('2.0.0');
            expect(packageWithVersions.latest_version).toBe('2.0.0');
        });
    });

    describe('Database column type compatibility', () => {
        it('should handle string length constraints', () => {
            const constrainedPackage: Package = {
                id: 'a'.repeat(36), // UUID length
                name: 'a'.repeat(255), // Max name length
                description: 'b'.repeat(255), // Max description length
                homepage: 'c'.repeat(255), // Max homepage length
                latest_version: 'd'.repeat(255), // Max version length
                time: new Date(),
                keywords: ['keyword1', 'keyword2'],
                source: null as any,
                license: 'e'.repeat(50), // Max license length
                licenses: null as any,
                extra: null as any,
                versions: []
            };

            expect(constrainedPackage.name.length).toBe(255);
            expect(constrainedPackage.description.length).toBe(255);
            expect(constrainedPackage.homepage.length).toBe(255);
            expect(constrainedPackage.latest_version.length).toBe(255);
            expect(constrainedPackage.license.length).toBe(50);
        });

        it('should handle timestamptz column type', () => {
            const timestampPackage: Package = {
                id: 'timestamp-test',
                name: 'timestamp-package',
                description: null as any,
                homepage: null as any,
                latest_version: '1.0.0',
                time: new Date('2023-12-25T10:30:45.123Z'),
                keywords: null as any,
                source: null as any,
                license: null as any,
                licenses: null as any,
                extra: null as any,
                versions: []
            };

            expect(timestampPackage.time).toBeInstanceOf(Date);
            expect(timestampPackage.time.toISOString()).toBe('2023-12-25T10:30:45.123Z');
        });

        it('should handle simple-array column type for keywords', () => {
            const keywordArray = [
                'keyword1',
                'keyword2',
                'keyword with spaces',
                'special-chars!@#'
            ];

            const arrayPackage: Package = {
                id: 'array-test',
                name: 'array-package',
                description: null as any,
                homepage: null as any,
                latest_version: '1.0.0',
                time: null as any,
                keywords: keywordArray,
                source: null as any,
                license: null as any,
                licenses: null as any,
                extra: null as any,
                versions: []
            };

            expect(Array.isArray(arrayPackage.keywords)).toBe(true);
            expect(arrayPackage.keywords).toHaveLength(4);
            expect(arrayPackage.keywords).toContain('keyword with spaces');
            expect(arrayPackage.keywords).toContain('special-chars!@#');
        });

        it('should handle JSONB column types', () => {
            const jsonbPackage: Package = {
                id: 'jsonb-test',
                name: 'jsonb-package',
                description: null as any,
                homepage: null as any,
                latest_version: '1.0.0',
                time: null as any,
                keywords: null as any,
                source: {
                    type: 'git',
                    url: 'https://example.com/repo.git'
                },
                license: null as any,
                licenses: [{ type: 'MIT', url: 'https://example.com/license' }],
                extra: {
                    nested: {
                        deeply: {
                            nested: {
                                value: 'deep'
                            }
                        }
                    },
                    array: [1, 2, 3, 'mixed', { object: 'in array' }],
                    boolean: true,
                    number: 42,
                    null_value: null as any
                },
                versions: []
            };

            expect(typeof jsonbPackage.source).toBe('object');
            expect(Array.isArray(jsonbPackage.licenses)).toBe(true);
            expect(typeof jsonbPackage.extra).toBe('object');
            expect(jsonbPackage.extra.nested.deeply.nested.value).toBe('deep');
            expect(jsonbPackage.extra.array).toHaveLength(5);
            expect(jsonbPackage.extra.boolean).toBe(true);
            expect(jsonbPackage.extra.number).toBe(42);
            expect(jsonbPackage.extra.null_value).toBeNull();
        });
    });
});
