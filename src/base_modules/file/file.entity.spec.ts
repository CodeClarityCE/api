import { File } from './file.entity';
import { User } from '../users/users.entity';
import { Project } from '../projects/project.entity';

describe('File Entity', () => {
    let file: File;
    let user: User;
    let project: Project;

    beforeEach(() => {
        file = new File();
        user = new User();
        project = new Project();
    });

    describe('Entity Properties', () => {
        it('should accept id property', () => {
            file.id = 'test-id';
            expect(file).toHaveProperty('id');
            expect(file.id).toBe('test-id');
        });

        it('should accept added_on property', () => {
            const date = new Date();
            file.added_on = date;
            expect(file).toHaveProperty('added_on');
            expect(file.added_on).toBe(date);
        });

        it('should accept type property', () => {
            file.type = 'test-type';
            expect(file).toHaveProperty('type');
            expect(file.type).toBe('test-type');
        });

        it('should accept name property', () => {
            file.name = 'test-name';
            expect(file).toHaveProperty('name');
            expect(file.name).toBe('test-name');
        });

        it('should accept project relation property', () => {
            file.project = project;
            expect(file).toHaveProperty('project');
            expect(file.project).toBe(project);
        });

        it('should accept added_by relation property', () => {
            file.added_by = user;
            expect(file).toHaveProperty('added_by');
            expect(file.added_by).toBe(user);
        });
    });

    describe('Property Assignment', () => {
        it('should allow setting id', () => {
            const testId = 'test-uuid-123';
            file.id = testId;
            expect(file.id).toBe(testId);
        });

        it('should allow setting added_on date', () => {
            const testDate = new Date();
            file.added_on = testDate;
            expect(file.added_on).toBe(testDate);
        });

        it('should allow setting type', () => {
            const testType = 'application/json';
            file.type = testType;
            expect(file.type).toBe(testType);
        });

        it('should allow setting name', () => {
            const testName = 'test-file.json';
            file.name = testName;
            expect(file.name).toBe(testName);
        });

        it('should allow setting project relation', () => {
            file.project = project;
            expect(file.project).toBe(project);
        });

        it('should allow setting added_by relation', () => {
            file.added_by = user;
            expect(file.added_by).toBe(user);
        });
    });

    describe('Entity Creation', () => {
        it('should create a new File instance', () => {
            expect(file).toBeInstanceOf(File);
        });

        it('should create a File with all properties undefined initially', () => {
            expect(file.id).toBeUndefined();
            expect(file.added_on).toBeUndefined();
            expect(file.type).toBeUndefined();
            expect(file.name).toBeUndefined();
            expect(file.project).toBeUndefined();
            expect(file.added_by).toBeUndefined();
        });
    });

    describe('Entity with Complete Data', () => {
        it('should handle a fully populated File entity', () => {
            const completeFile = new File();
            completeFile.id = 'uuid-123';
            completeFile.added_on = new Date('2024-01-01');
            completeFile.type = 'text/plain';
            completeFile.name = 'document.txt';
            completeFile.project = project;
            completeFile.added_by = user;

            expect(completeFile.id).toBe('uuid-123');
            expect(completeFile.added_on).toEqual(new Date('2024-01-01'));
            expect(completeFile.type).toBe('text/plain');
            expect(completeFile.name).toBe('document.txt');
            expect(completeFile.project).toBe(project);
            expect(completeFile.added_by).toBe(user);
        });
    });
});
