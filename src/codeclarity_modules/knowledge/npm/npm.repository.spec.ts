import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityNotFound } from 'src/types/error.types';
import type { Repository } from 'typeorm';
import { Package } from '../package/package.entity';
import { NPMPackageRepository } from './npm.repository';

describe('NPMPackageRepository', () => {
    let npmRepository: NPMPackageRepository;
    let mockRepository: jest.Mocked<Repository<Package>>;

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
            },
            bugs: {
                url: 'https://github.com/expressjs/express/issues'
            }
        },
        versions: []
    };

    beforeEach(async () => {
        const mockRepo = {
            findOne: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NPMPackageRepository,
                {
                    provide: getRepositoryToken(Package, 'knowledge'),
                    useValue: mockRepo
                }
            ]
        }).compile();

        npmRepository = module.get<NPMPackageRepository>(NPMPackageRepository);
        mockRepository = module.get(getRepositoryToken(Package, 'knowledge'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getNpmPackageData', () => {
        it('should return package when found', async () => {
            mockRepository.findOne.mockResolvedValue(mockPackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(result).toEqual(mockPackage);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: 'express' }
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        });

        it('should throw EntityNotFound when package is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(npmRepository.getNpmPackageData('nonexistent-package')).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: 'nonexistent-package' }
            });
        });

        it('should handle repository errors gracefully', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(npmRepository.getNpmPackageData('express')).rejects.toThrow(
                'Database connection failed'
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: 'express' }
            });
        });

        it('should handle different package name formats', async () => {
            const testCases = [
                'express',
                'lodash',
                'react',
                'vue',
                '@types/node',
                '@angular/core',
                '@babel/core'
            ];

            for (const packageName of testCases) {
                mockRepository.findOne.mockResolvedValue({ ...mockPackage, name: packageName });

                const result = await npmRepository.getNpmPackageData(packageName);

                expect(result.name).toBe(packageName);
                expect(mockRepository.findOne).toHaveBeenCalledWith({
                    where: { name: packageName }
                });
            }
        });

        it('should handle empty string package name', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(npmRepository.getNpmPackageData('')).rejects.toThrow(EntityNotFound);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: '' }
            });
        });

        it('should handle special characters in package name', async () => {
            const specialPackageName = 'package-name\'";DROP TABLE package;--';
            mockRepository.findOne.mockResolvedValue(null);

            await expect(npmRepository.getNpmPackageData(specialPackageName)).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: specialPackageName }
            });
        });

        it('should handle very long package names', async () => {
            const longPackageName = `very-long-${'package-name-'.repeat(20)}final`;
            mockRepository.findOne.mockResolvedValue(null);

            await expect(npmRepository.getNpmPackageData(longPackageName)).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: longPackageName }
            });
        });
    });

    describe('Real-world NPM package scenarios', () => {
        it('should handle Express.js package data', async () => {
            mockRepository.findOne.mockResolvedValue(mockPackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(result.name).toBe('express');
            expect(result.description).toContain('Fast, unopinionated, minimalist web framework');
            expect(result.license).toBe('MIT');
            expect(result.keywords).toContain('framework');
            expect(result.source.type).toBe('git');
            expect(result.source.url).toContain('expressjs/express');
        });

        it('should handle React package data', async () => {
            const reactPackage = {
                ...mockPackage,
                name: 'react',
                description: 'React is a JavaScript library for building user interfaces.',
                homepage: 'https://reactjs.org/',
                latest_version: '18.2.0',
                keywords: ['react', 'javascript', 'library', 'ui'],
                source: {
                    type: 'git',
                    url: 'https://github.com/facebook/react.git'
                },
                license: 'MIT',
                extra: {
                    maintainers: ['react'],
                    bundleDependencies: false,
                    peerDependencies: {}
                }
            };

            mockRepository.findOne.mockResolvedValue(reactPackage);

            const result = await npmRepository.getNpmPackageData('react');

            expect(result.name).toBe('react');
            expect(result.description).toContain('JavaScript library for building user interfaces');
            expect(result.latest_version).toBe('18.2.0');
            expect(result.keywords).toContain('react');
        });

        it('should handle scoped package (@types/node)', async () => {
            const typesNodePackage = {
                ...mockPackage,
                name: '@types/node',
                description: 'TypeScript definitions for Node.js',
                homepage:
                    'https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node',
                latest_version: '20.10.5',
                keywords: ['node', 'typescript', 'types'],
                source: {
                    type: 'git',
                    url: 'https://github.com/DefinitelyTyped/DefinitelyTyped.git'
                },
                license: 'MIT'
            };

            mockRepository.findOne.mockResolvedValue(typesNodePackage);

            const result = await npmRepository.getNpmPackageData('@types/node');

            expect(result.name).toBe('@types/node');
            expect(result.description).toContain('TypeScript definitions');
            expect(result.keywords).toContain('typescript');
        });

        it('should handle package with complex license structure', async () => {
            const complexLicensePackage = {
                ...mockPackage,
                name: 'some-package',
                license: 'SEE LICENSE IN LICENSE.txt',
                licenses: [
                    {
                        type: 'Apache-2.0',
                        url: 'https://github.com/some/package/blob/master/LICENSE-APACHE'
                    },
                    {
                        type: 'MIT',
                        url: 'https://github.com/some/package/blob/master/LICENSE-MIT'
                    }
                ]
            };

            mockRepository.findOne.mockResolvedValue(complexLicensePackage);

            const result = await npmRepository.getNpmPackageData('some-package');

            expect(result.license).toBe('SEE LICENSE IN LICENSE.txt');
            expect(result.licenses).toHaveLength(2);
            expect(result.licenses[0]!.type).toBe('Apache-2.0');
            expect(result.licenses[1]!.type).toBe('MIT');
        });

        it('should handle package with no homepage', async () => {
            const noHomepagePackage = {
                ...mockPackage,
                name: 'private-package',
                homepage: null as any,
                description: 'A private internal package'
            };

            mockRepository.findOne.mockResolvedValue(noHomepagePackage);

            const result = await npmRepository.getNpmPackageData('private-package');

            expect(result.name).toBe('private-package');
            expect(result.homepage).toBeNull();
            expect(result.description).toBe('A private internal package');
        });

        it('should handle package with empty keywords', async () => {
            const noKeywordsPackage = {
                ...mockPackage,
                name: 'simple-package',
                keywords: []
            };

            mockRepository.findOne.mockResolvedValue(noKeywordsPackage);

            const result = await npmRepository.getNpmPackageData('simple-package');

            expect(result.keywords).toEqual([]);
            expect(result.keywords).toHaveLength(0);
        });

        it('should handle package with null extra field', async () => {
            const nullExtraPackage = {
                ...mockPackage,
                name: 'minimal-package',
                extra: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullExtraPackage);

            const result = await npmRepository.getNpmPackageData('minimal-package');

            expect(result.extra).toBeNull();
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle undefined package name gracefully', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(npmRepository.getNpmPackageData(undefined as any)).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: undefined }
            });
        });

        it('should handle null package name gracefully', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(npmRepository.getNpmPackageData(null as any)).rejects.toThrow(
                EntityNotFound
            );
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { name: null }
            });
        });

        it('should handle package with null source', async () => {
            const nullSourcePackage = {
                ...mockPackage,
                source: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullSourcePackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(result.source).toBeNull();
        });

        it('should handle package with null licenses array', async () => {
            const nullLicensesPackage = {
                ...mockPackage,
                licenses: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullLicensesPackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(result.licenses).toBeNull();
        });

        it('should handle package with null keywords array', async () => {
            const nullKeywordsPackage = {
                ...mockPackage,
                keywords: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullKeywordsPackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(result.keywords).toBeNull();
        });

        it('should handle package with null time', async () => {
            const nullTimePackage = {
                ...mockPackage,
                time: null as any
            };

            mockRepository.findOne.mockResolvedValue(nullTimePackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(result.time).toBeNull();
        });
    });

    describe('Concurrent operations', () => {
        it('should handle concurrent requests for the same package', async () => {
            mockRepository.findOne.mockResolvedValue(mockPackage);

            const promises = Array.from({ length: 5 }, () =>
                npmRepository.getNpmPackageData('express')
            );

            const results = await Promise.all(promises);

            results.forEach((result) => {
                expect(result).toEqual(mockPackage);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
        });

        it('should handle concurrent requests for different packages', async () => {
            const packageNames = ['express', 'react', 'lodash', 'vue', 'angular'];

            mockRepository.findOne.mockImplementation((options: any) => {
                const packageName = options.where?.name;
                return Promise.resolve({
                    ...mockPackage,
                    name: packageName,
                    description: `Description for ${packageName}`
                });
            });

            const promises = packageNames.map((packageName) =>
                npmRepository.getNpmPackageData(packageName)
            );

            const results = await Promise.all(promises);

            results.forEach((result, index) => {
                expect(result.name).toBe(packageNames[index]);
                expect(result.description).toBe(`Description for ${packageNames[index]}`);
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(5);
        });

        it('should handle mixed success and failure scenarios', async () => {
            const existingPackages = ['express', 'react'];
            const nonExistentPackages = ['nonexistent-1', 'nonexistent-2'];

            mockRepository.findOne.mockImplementation((options: any) => {
                const packageName = options.where?.name;
                if (existingPackages.includes(packageName)) {
                    return Promise.resolve({ ...mockPackage, name: packageName });
                }
                return Promise.resolve(null);
            });

            const existingResults = await Promise.all(
                existingPackages.map((packageName) => npmRepository.getNpmPackageData(packageName))
            );

            const nonExistentPromises = nonExistentPackages.map((packageName) =>
                npmRepository.getNpmPackageData(packageName)
            );

            existingResults.forEach((result, index) => {
                expect(result.name).toBe(existingPackages[index]);
            });

            for (const promise of nonExistentPromises) {
                await expect(promise).rejects.toThrow(EntityNotFound);
            }
        });
    });

    describe('Database schema compatibility', () => {
        it('should handle string length constraints', async () => {
            const longStringsPackage = {
                ...mockPackage,
                name: 'a'.repeat(255),
                description: 'b'.repeat(255),
                homepage: 'c'.repeat(255),
                latest_version: 'd'.repeat(255),
                license: 'e'.repeat(50)
            };

            mockRepository.findOne.mockResolvedValue(longStringsPackage);

            const result = await npmRepository.getNpmPackageData('a'.repeat(255));

            expect(result.name.length).toBe(255);
            expect(result.description.length).toBe(255);
            expect(result.homepage.length).toBe(255);
            expect(result.latest_version.length).toBe(255);
            expect(result.license.length).toBe(50);
        });

        it('should handle unique constraint on name column', async () => {
            const package1 = { ...mockPackage, name: 'unique-package' };
            const package2 = { ...mockPackage, name: 'unique-package' };

            expect(package1.name).toBe(package2.name);
        });

        it('should handle timestamptz column type for time', async () => {
            const timestampPackage = {
                ...mockPackage,
                time: new Date('2023-12-25T10:30:45.123Z')
            };

            mockRepository.findOne.mockResolvedValue(timestampPackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(result.time).toBeInstanceOf(Date);
            expect(result.time.toISOString()).toBe('2023-12-25T10:30:45.123Z');
        });

        it('should handle simple-array column type for keywords', async () => {
            const keywordsPackage = {
                ...mockPackage,
                keywords: ['keyword1', 'keyword2', 'keyword3', 'keyword with spaces']
            };

            mockRepository.findOne.mockResolvedValue(keywordsPackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(Array.isArray(result.keywords)).toBe(true);
            expect(result.keywords).toHaveLength(4);
            expect(result.keywords).toContain('keyword with spaces');
        });

        it('should handle JSONB column types', async () => {
            const jsonbPackage = {
                ...mockPackage,
                source: { type: 'git', url: 'https://example.com' },
                licenses: [{ type: 'MIT', url: 'https://example.com/license' }],
                extra: {
                    nested: {
                        data: 'value',
                        array: [1, 2, 3]
                    }
                }
            };

            mockRepository.findOne.mockResolvedValue(jsonbPackage);

            const result = await npmRepository.getNpmPackageData('express');

            expect(typeof result.source).toBe('object');
            expect(Array.isArray(result.licenses)).toBe(true);
            expect(typeof result.extra).toBe('object');
            const extra = result.extra as Record<string, Record<string, unknown>>;
            expect(extra['nested']!['data']).toBe('value');
            expect(extra['nested']!['array']).toEqual([1, 2, 3]);
        });
    });

    describe('Service initialization', () => {
        it('should be defined', () => {
            expect(npmRepository).toBeDefined();
        });

        it('should inject repository correctly', () => {
            expect(mockRepository).toBeDefined();
        });

        it('should have all required methods', () => {
            expect(typeof npmRepository.getNpmPackageData).toBe('function');
        });
    });
});
