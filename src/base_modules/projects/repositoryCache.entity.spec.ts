import { plainToClass } from 'class-transformer';

import { RepositoryCache, RepositoryType } from './repositoryCache.entity';

describe('RepositoryCache Entity', () => {
    let repositoryCache: RepositoryCache;

    beforeEach(() => {
        repositoryCache = new RepositoryCache();
        repositoryCache.id = 'test-cache-id';
        repositoryCache.repository_type = RepositoryType.GITHUB;
        repositoryCache.url = 'https://github.com/test/repo';
        repositoryCache.default_branch = 'main';
        repositoryCache.visibility = 'public';
        repositoryCache.fully_qualified_name = 'test/repo';
        repositoryCache.service_domain = 'github.com';
        repositoryCache.description = 'A test repository';
        repositoryCache.created_at = new Date();
    });

    describe('Entity Structure', () => {
        it('should create a valid repository cache entity', () => {
            expect(repositoryCache).toBeDefined();
            expect(repositoryCache.id).toBe('test-cache-id');
            expect(repositoryCache.repository_type).toBe(RepositoryType.GITHUB);
            expect(repositoryCache.url).toBe('https://github.com/test/repo');
            expect(repositoryCache.default_branch).toBe('main');
            expect(repositoryCache.visibility).toBe('public');
            expect(repositoryCache.fully_qualified_name).toBe('test/repo');
            expect(repositoryCache.service_domain).toBe('github.com');
            expect(repositoryCache.description).toBe('A test repository');
            expect(repositoryCache.created_at).toBeInstanceOf(Date);
        });

        it('should have correct property types', () => {
            expect(typeof repositoryCache.id).toBe('string');
            expect(typeof repositoryCache.repository_type).toBe('string');
            expect(typeof repositoryCache.url).toBe('string');
            expect(typeof repositoryCache.default_branch).toBe('string');
            expect(typeof repositoryCache.visibility).toBe('string');
            expect(typeof repositoryCache.fully_qualified_name).toBe('string');
            expect(typeof repositoryCache.service_domain).toBe('string');
            expect(typeof repositoryCache.description).toBe('string');
            expect(repositoryCache.created_at).toBeInstanceOf(Date);
        });

        it('should allow nullable service_domain', () => {
            repositoryCache.service_domain = null as any;
            expect(repositoryCache.service_domain).toBeNull();
        });
    });

    describe('Enum Values', () => {
        it('should have correct RepositoryType enum values', () => {
            expect(RepositoryType.GITHUB).toBe('GITHUB');
            expect(RepositoryType.GITLAB).toBe('GITLAB');
        });

        it('should accept all valid repository types', () => {
            repositoryCache.repository_type = RepositoryType.GITHUB;
            expect(repositoryCache.repository_type).toBe(RepositoryType.GITHUB);

            repositoryCache.repository_type = RepositoryType.GITLAB;
            expect(repositoryCache.repository_type).toBe(RepositoryType.GITLAB);
        });
    });

    describe('GitHub Repository Cache', () => {
        it('should create a valid GitHub repository cache', () => {
            const githubRepo = new RepositoryCache();
            githubRepo.id = 'github-repo-id';
            githubRepo.repository_type = RepositoryType.GITHUB;
            githubRepo.url = 'https://github.com/owner/repo';
            githubRepo.default_branch = 'main';
            githubRepo.visibility = 'public';
            githubRepo.fully_qualified_name = 'owner/repo';
            githubRepo.service_domain = 'github.com';
            githubRepo.description = 'A GitHub repository';
            githubRepo.created_at = new Date();

            expect(githubRepo.repository_type).toBe(RepositoryType.GITHUB);
            expect(githubRepo.url).toBe('https://github.com/owner/repo');
            expect(githubRepo.service_domain).toBe('github.com');
            expect(githubRepo.fully_qualified_name).toBe('owner/repo');
        });

        it('should handle private GitHub repositories', () => {
            repositoryCache.repository_type = RepositoryType.GITHUB;
            repositoryCache.visibility = 'private';
            repositoryCache.url = 'https://github.com/private/repo';
            repositoryCache.fully_qualified_name = 'private/repo';

            expect(repositoryCache.visibility).toBe('private');
            expect(repositoryCache.repository_type).toBe(RepositoryType.GITHUB);
        });
    });

    describe('GitLab Repository Cache', () => {
        it('should create a valid GitLab repository cache', () => {
            const gitlabRepo = new RepositoryCache();
            gitlabRepo.id = 'gitlab-repo-id';
            gitlabRepo.repository_type = RepositoryType.GITLAB;
            gitlabRepo.url = 'https://gitlab.com/owner/repo';
            gitlabRepo.default_branch = 'main';
            gitlabRepo.visibility = 'public';
            gitlabRepo.fully_qualified_name = 'owner/repo';
            gitlabRepo.service_domain = 'gitlab.com';
            gitlabRepo.description = 'A GitLab repository';
            gitlabRepo.created_at = new Date();

            expect(gitlabRepo.repository_type).toBe(RepositoryType.GITLAB);
            expect(gitlabRepo.url).toBe('https://gitlab.com/owner/repo');
            expect(gitlabRepo.service_domain).toBe('gitlab.com');
            expect(gitlabRepo.fully_qualified_name).toBe('owner/repo');
        });

        it('should handle GitLab groups and subgroups', () => {
            repositoryCache.repository_type = RepositoryType.GITLAB;
            repositoryCache.url = 'https://gitlab.com/group/subgroup/repo';
            repositoryCache.fully_qualified_name = 'group/subgroup/repo';
            repositoryCache.service_domain = 'gitlab.com';

            expect(repositoryCache.fully_qualified_name).toBe('group/subgroup/repo');
            expect(repositoryCache.repository_type).toBe(RepositoryType.GITLAB);
        });
    });

    describe('Class Transformation', () => {
        it('should transform plain object to RepositoryCache entity', () => {
            const plainObject = {
                id: 'test-id',
                repository_type: RepositoryType.GITHUB,
                url: 'https://github.com/test/repo',
                default_branch: 'main',
                visibility: 'public',
                fully_qualified_name: 'test/repo',
                service_domain: 'github.com',
                description: 'Test repository',
                created_at: new Date().toISOString()
            };

            const transformedCache = plainToClass(RepositoryCache, plainObject);
            expect(transformedCache).toBeInstanceOf(RepositoryCache);
            expect(transformedCache.id).toBe('test-id');
            expect(transformedCache.repository_type).toBe(RepositoryType.GITHUB);
            expect(transformedCache.url).toBe('https://github.com/test/repo');
            expect(transformedCache.fully_qualified_name).toBe('test/repo');
            expect(transformedCache.service_domain).toBe('github.com');
        });

        it('should handle transformation with missing optional fields', () => {
            const plainObject = {
                id: 'test-id',
                repository_type: RepositoryType.GITLAB,
                url: 'https://gitlab.com/test/repo',
                default_branch: 'develop',
                visibility: 'private',
                fully_qualified_name: 'test/repo',
                description: 'Test repository',
                created_at: new Date().toISOString()
            };

            const transformedCache = plainToClass(RepositoryCache, plainObject);
            expect(transformedCache).toBeInstanceOf(RepositoryCache);
            expect(transformedCache.service_domain).toBeUndefined();
            expect(transformedCache.repository_type).toBe(RepositoryType.GITLAB);
        });
    });

    describe('Field Constraints', () => {
        it('should handle different visibility types', () => {
            const visibilityTypes = ['public', 'private', 'internal'];

            visibilityTypes.forEach((visibility) => {
                repositoryCache.visibility = visibility;
                expect(repositoryCache.visibility).toBe(visibility);
            });
        });

        it('should handle different default branches', () => {
            const branches = ['main', 'master', 'develop', 'feature/test'];

            branches.forEach((branch) => {
                repositoryCache.default_branch = branch;
                expect(repositoryCache.default_branch).toBe(branch);
            });
        });

        it('should handle empty strings for required fields', () => {
            repositoryCache.url = '';
            repositoryCache.default_branch = '';
            repositoryCache.visibility = '';
            repositoryCache.fully_qualified_name = '';
            repositoryCache.description = '';

            expect(repositoryCache.url).toBe('');
            expect(repositoryCache.default_branch).toBe('');
            expect(repositoryCache.visibility).toBe('');
            expect(repositoryCache.fully_qualified_name).toBe('');
            expect(repositoryCache.description).toBe('');
        });
    });

    describe('Relationship Fields', () => {
        it('should handle integration relationship', () => {
            const mockIntegration = { id: 'integration-1', name: 'Test Integration' };
            repositoryCache.integration = mockIntegration as any;

            expect(repositoryCache.integration).toBe(mockIntegration);
        });

        it('should handle null integration', () => {
            repositoryCache.integration = null as any;
            expect(repositoryCache.integration).toBeNull();
        });
    });

    describe('Date Handling', () => {
        it('should handle Date objects correctly', () => {
            const testDate = new Date('2023-01-01T00:00:00.000Z');
            repositoryCache.created_at = testDate;

            expect(repositoryCache.created_at).toBe(testDate);
            expect(repositoryCache.created_at.toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });

        it('should handle current date', () => {
            const now = new Date();
            repositoryCache.created_at = now;

            expect(repositoryCache.created_at).toBe(now);
        });
    });

    describe('Entity Serialization', () => {
        it('should serialize to JSON correctly', () => {
            const serialized = JSON.stringify(repositoryCache);
            const parsed = JSON.parse(serialized);

            expect(parsed.id).toBe(repositoryCache.id);
            expect(parsed.repository_type).toBe(repositoryCache.repository_type);
            expect(parsed.url).toBe(repositoryCache.url);
            expect(parsed.default_branch).toBe(repositoryCache.default_branch);
            expect(parsed.visibility).toBe(repositoryCache.visibility);
            expect(parsed.fully_qualified_name).toBe(repositoryCache.fully_qualified_name);
            expect(parsed.service_domain).toBe(repositoryCache.service_domain);
            expect(parsed.description).toBe(repositoryCache.description);
        });

        it('should handle null values in serialization', () => {
            repositoryCache.service_domain = null as any;
            repositoryCache.integration = null as any;

            const serialized = JSON.stringify(repositoryCache);
            const parsed = JSON.parse(serialized);

            expect(parsed.service_domain).toBe(null);
            expect(parsed.integration).toBe(null);
        });
    });

    describe('Edge Cases', () => {
        it('should handle special characters in repository names', () => {
            repositoryCache.fully_qualified_name = 'test-org/repo-with-special-chars_123';
            repositoryCache.url = 'https://github.com/test-org/repo-with-special-chars_123';
            repositoryCache.description = 'A repository with special characters: @#$%^&*()';

            expect(repositoryCache.fully_qualified_name).toBe(
                'test-org/repo-with-special-chars_123'
            );
            expect(repositoryCache.url).toBe(
                'https://github.com/test-org/repo-with-special-chars_123'
            );
            expect(repositoryCache.description).toBe(
                'A repository with special characters: @#$%^&*()'
            );
        });

        it('should handle Unicode characters', () => {
            repositoryCache.fully_qualified_name = 'test-org/repo-with-unicode-🚀';
            repositoryCache.description = 'A repository with Unicode characters: 你好世界';

            expect(repositoryCache.fully_qualified_name).toBe('test-org/repo-with-unicode-🚀');
            expect(repositoryCache.description).toBe(
                'A repository with Unicode characters: 你好世界'
            );
        });

        it('should handle very long descriptions', () => {
            const longDescription = 'a'.repeat(1000);
            repositoryCache.description = longDescription;

            expect(repositoryCache.description).toBe(longDescription);
            expect(repositoryCache.description.length).toBe(1000);
        });

        it('should handle different URL formats', () => {
            const urls = [
                'https://github.com/owner/repo',
                'https://github.com/owner/repo.git',
                'https://gitlab.com/group/subgroup/repo',
                'https://gitlab.example.com/owner/repo',
                'https://github.enterprise.com/owner/repo'
            ];

            urls.forEach((url) => {
                repositoryCache.url = url;
                expect(repositoryCache.url).toBe(url);
            });
        });

        it('should handle different service domains', () => {
            const domains = [
                'github.com',
                'gitlab.com',
                'github.enterprise.com',
                'gitlab.example.com',
                'bitbucket.org'
            ];

            domains.forEach((domain) => {
                repositoryCache.service_domain = domain;
                expect(repositoryCache.service_domain).toBe(domain);
            });
        });
    });
});
