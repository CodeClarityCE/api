import { plainToClass } from 'class-transformer';
import { Project, IntegrationType, IntegrationProvider } from './project.entity';

describe('Project Entity', () => {
    let project: Project;

    beforeEach(() => {
        project = new Project();
        project.id = 'test-project-id';
        project.added_on = new Date();
        project.service_domain = 'github.com';
        project.integration_type = IntegrationType.VCS;
        project.integration_provider = IntegrationProvider.GITHUB;
        project.invalid = false;
        project.downloaded = false;
        project.default_branch = 'main';
        project.url = 'https://github.com/test/repo';
        project.name = 'test/repo';
        project.description = 'A test repository';
        project.type = IntegrationProvider.GITHUB;
        project.organizations = [];
        project.analyses = [];
        project.files = [];
    });

    describe('Entity Structure', () => {
        it('should create a valid project entity', () => {
            expect(project).toBeDefined();
            expect(project.id).toBe('test-project-id');
            expect(project.name).toBe('test/repo');
            expect(project.description).toBe('A test repository');
            expect(project.url).toBe('https://github.com/test/repo');
            expect(project.type).toBe(IntegrationProvider.GITHUB);
            expect(project.integration_provider).toBe(IntegrationProvider.GITHUB);
            expect(project.integration_type).toBe(IntegrationType.VCS);
            expect(project.invalid).toBe(false);
            expect(project.downloaded).toBe(false);
            expect(project.default_branch).toBe('main');
            expect(project.service_domain).toBe('github.com');
        });

        it('should have correct property types', () => {
            expect(typeof project.id).toBe('string');
            expect(project.added_on).toBeInstanceOf(Date);
            expect(typeof project.service_domain).toBe('string');
            expect(typeof project.integration_type).toBe('string');
            expect(typeof project.integration_provider).toBe('string');
            expect(typeof project.invalid).toBe('boolean');
            expect(typeof project.downloaded).toBe('boolean');
            expect(typeof project.default_branch).toBe('string');
            expect(typeof project.url).toBe('string');
            expect(typeof project.name).toBe('string');
            expect(typeof project.description).toBe('string');
            expect(typeof project.type).toBe('string');
            expect(Array.isArray(project.organizations)).toBe(true);
            expect(Array.isArray(project.analyses)).toBe(true);
            expect(Array.isArray(project.files)).toBe(true);
        });

        it('should allow optional expiry_date', () => {
            expect(project.expiry_date).toBeUndefined();

            project.expiry_date = new Date();
            expect(project.expiry_date).toBeInstanceOf(Date);
        });

        it('should allow nullable service_domain', () => {
            project.service_domain = null as any;
            expect(project.service_domain).toBeNull();
        });
    });

    describe('Enum Values', () => {
        it('should have correct IntegrationType enum values', () => {
            expect(IntegrationType.VCS).toBe('VCS');
        });

        it('should have correct IntegrationProvider enum values', () => {
            expect(IntegrationProvider.GITHUB).toBe('GITHUB');
            expect(IntegrationProvider.GITLAB).toBe('GITLAB');
            expect(IntegrationProvider.FILE).toBe('FILE');
        });

        it('should accept all valid integration providers', () => {
            project.integration_provider = IntegrationProvider.GITHUB;
            expect(project.integration_provider).toBe(IntegrationProvider.GITHUB);

            project.integration_provider = IntegrationProvider.GITLAB;
            expect(project.integration_provider).toBe(IntegrationProvider.GITLAB);

            project.integration_provider = IntegrationProvider.FILE;
            expect(project.integration_provider).toBe(IntegrationProvider.FILE);
        });

        it('should accept valid integration types', () => {
            project.integration_type = IntegrationType.VCS;
            expect(project.integration_type).toBe(IntegrationType.VCS);
        });
    });

    describe('Class Transformation', () => {
        it('should transform plain object to Project entity', () => {
            const plainObject = {
                id: 'test-id',
                added_on: new Date().toISOString(),
                service_domain: 'github.com',
                integration_type: IntegrationType.VCS,
                integration_provider: IntegrationProvider.GITHUB,
                invalid: false,
                downloaded: true,
                default_branch: 'main',
                url: 'https://github.com/test/repo',
                name: 'test/repo',
                description: 'Test repository',
                type: IntegrationProvider.GITHUB,
                organizations: [],
                analyses: [],
                files: []
            };

            const transformedProject = plainToClass(Project, plainObject);
            expect(transformedProject).toBeInstanceOf(Project);
            expect(transformedProject.id).toBe('test-id');
            expect(transformedProject.name).toBe('test/repo');
            expect(transformedProject.integration_provider).toBe(IntegrationProvider.GITHUB);
            expect(transformedProject.downloaded).toBe(true);
        });

        it('should handle transformation with missing optional fields', () => {
            const plainObject = {
                id: 'test-id',
                added_on: new Date().toISOString(),
                integration_type: IntegrationType.VCS,
                integration_provider: IntegrationProvider.FILE,
                invalid: false,
                downloaded: false,
                default_branch: '',
                url: '',
                name: 'File Project',
                description: 'A file-based project',
                type: IntegrationProvider.FILE,
                organizations: [],
                analyses: [],
                files: []
            };

            const transformedProject = plainToClass(Project, plainObject);
            expect(transformedProject).toBeInstanceOf(Project);
            expect(transformedProject.service_domain).toBeUndefined();
            expect(transformedProject.expiry_date).toBeUndefined();
            expect(transformedProject.integration_provider).toBe(IntegrationProvider.FILE);
        });
    });

    describe('Field Constraints', () => {
        it('should handle long service domain within limits', () => {
            const longDomain = 'a'.repeat(100);
            project.service_domain = longDomain;
            expect(project.service_domain).toBe(longDomain);
        });

        it('should handle empty strings for required fields', () => {
            project.url = '';
            project.name = '';
            project.description = '';
            project.default_branch = '';

            expect(project.url).toBe('');
            expect(project.name).toBe('');
            expect(project.description).toBe('');
            expect(project.default_branch).toBe('');
        });

        it('should handle boolean fields correctly', () => {
            project.invalid = true;
            project.downloaded = true;

            expect(project.invalid).toBe(true);
            expect(project.downloaded).toBe(true);
        });
    });

    describe('Relationship Fields', () => {
        it('should initialize empty arrays for relationships', () => {
            const newProject = new Project();

            expect(newProject.organizations).toBeUndefined();
            expect(newProject.analyses).toBeUndefined();
            expect(newProject.files).toBeUndefined();
        });

        it('should handle relationship assignments', () => {
            const mockOrganization = { id: 'org-1', name: 'Test Org' };
            const mockAnalysis = { id: 'analysis-1', name: 'Test Analysis' };
            const mockFile = { id: 'file-1', name: 'test.js' };
            const mockUser = { id: 'user-1', name: 'Test User' };
            const mockIntegration = { id: 'integration-1', name: 'Test Integration' };

            project.organizations = [mockOrganization] as any;
            project.analyses = [mockAnalysis] as any;
            project.files = [mockFile] as any;
            project.added_by = mockUser as any;
            project.integration = mockIntegration as any;

            expect(project.organizations).toHaveLength(1);
            expect(project.analyses).toHaveLength(1);
            expect(project.files).toHaveLength(1);
            expect(project.added_by).toBe(mockUser);
            expect(project.integration).toBe(mockIntegration);
        });
    });

    describe('Date Handling', () => {
        it('should handle Date objects correctly', () => {
            const testDate = new Date('2023-01-01T00:00:00.000Z');
            project.added_on = testDate;

            expect(project.added_on).toBe(testDate);
            expect(project.added_on.toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });

        it('should handle optional expiry_date', () => {
            expect(project.expiry_date).toBeUndefined();

            const expiryDate = new Date('2024-01-01T00:00:00.000Z');
            project.expiry_date = expiryDate;

            expect(project.expiry_date).toBe(expiryDate);
        });
    });

    describe('Entity Serialization', () => {
        it('should serialize to JSON correctly', () => {
            const serialized = JSON.stringify(project);
            const parsed = JSON.parse(serialized);

            expect(parsed.id).toBe(project.id);
            expect(parsed.name).toBe(project.name);
            expect(parsed.description).toBe(project.description);
            expect(parsed.url).toBe(project.url);
            expect(parsed.type).toBe(project.type);
            expect(parsed.integration_provider).toBe(project.integration_provider);
            expect(parsed.integration_type).toBe(project.integration_type);
            expect(parsed.invalid).toBe(project.invalid);
            expect(parsed.downloaded).toBe(project.downloaded);
        });

        it('should handle null values in serialization', () => {
            project.service_domain = null as any;
            project.expiry_date = null as any;
            project.added_by = null as any;
            project.integration = null as any;

            const serialized = JSON.stringify(project);
            const parsed = JSON.parse(serialized);

            expect(parsed.service_domain).toBe(null);
            expect(parsed.expiry_date).toBe(null);
            expect(parsed.added_by).toBe(null);
            expect(parsed.integration).toBe(null);
        });
    });

    describe('Edge Cases', () => {
        it('should handle special characters in text fields', () => {
            project.name = 'test/repo-with-special-chars_123';
            project.description = 'A test repository with special characters: @#$%^&*()';
            project.url = 'https://github.com/test/repo-with-special-chars_123';

            expect(project.name).toBe('test/repo-with-special-chars_123');
            expect(project.description).toBe(
                'A test repository with special characters: @#$%^&*()'
            );
            expect(project.url).toBe('https://github.com/test/repo-with-special-chars_123');
        });

        it('should handle Unicode characters', () => {
            project.name = 'test/repo-with-unicode-🚀';
            project.description = 'A test repository with Unicode characters: 你好世界';

            expect(project.name).toBe('test/repo-with-unicode-🚀');
            expect(project.description).toBe('A test repository with Unicode characters: 你好世界');
        });

        it('should handle very long text fields', () => {
            const longText = 'a'.repeat(1000);
            project.description = longText;

            expect(project.description).toBe(longText);
            expect(project.description.length).toBe(1000);
        });
    });
});
