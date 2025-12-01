import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Project } from '../projects/project.entity';
import type { User } from '../users/users.entity';
import { File } from './file.entity';
import { FileRepository } from './file.repository';

describe('FileRepository', () => {
    let fileRepository: FileRepository;
    let mockRepository: jest.Mocked<Repository<File>>;

    const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'USER',
        is_service_account: false,
        created_on: new Date(),
        updated_on: new Date(),
        verified: true,
        files_imported: []
    } as unknown as User;

    const mockProject = {
        id: 'project-123',
        name: 'Test Project',
        files: []
    } as unknown as Project;

    const mockFile: File = {
        id: 'file-123',
        added_on: new Date(),
        type: 'application/json',
        name: 'test.json',
        project: mockProject,
        added_by: mockUser
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FileRepository,
                {
                    provide: getRepositoryToken(File, 'codeclarity'),
                    useValue: {
                        remove: jest.fn(),
                        delete: jest.fn(),
                        save: jest.fn(),
                        findOne: jest.fn()
                    }
                }
            ]
        }).compile();

        fileRepository = module.get<FileRepository>(FileRepository);
        mockRepository = module.get(getRepositoryToken(File, 'codeclarity'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('remove', () => {
        it('should remove a file successfully', async () => {
            mockRepository.remove.mockResolvedValue(mockFile);

            await fileRepository.remove(mockFile);

            expect(mockRepository.remove).toHaveBeenCalledWith(mockFile);
            expect(mockRepository.remove).toHaveBeenCalledTimes(1);
        });

        it('should handle removal of file with undefined properties', async () => {
            const fileWithUndefined = { ...mockFile, id: undefined } as unknown as File;
            mockRepository.remove.mockResolvedValue(fileWithUndefined);

            await fileRepository.remove(fileWithUndefined);

            expect(mockRepository.remove).toHaveBeenCalledWith(fileWithUndefined);
        });

        it('should throw error if remove fails', async () => {
            const error = new Error('Database error');
            mockRepository.remove.mockRejectedValue(error);

            await expect(fileRepository.remove(mockFile)).rejects.toThrow('Database error');
        });
    });

    describe('deleteFiles', () => {
        it('should delete files by string ID', async () => {
            const fileId = 'file-123';
            mockRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            await fileRepository.deleteFiles(fileId);

            expect(mockRepository.delete).toHaveBeenCalledWith(fileId);
            expect(mockRepository.delete).toHaveBeenCalledTimes(1);
        });

        it('should delete files by array of string IDs', async () => {
            const fileIds = ['file-123', 'file-456'];
            mockRepository.delete.mockResolvedValue({ affected: 2, raw: {} });

            await fileRepository.deleteFiles(fileIds);

            expect(mockRepository.delete).toHaveBeenCalledWith(fileIds);
        });

        it('should delete files by number ID', async () => {
            const fileId = 123;
            mockRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            await fileRepository.deleteFiles(fileId);

            expect(mockRepository.delete).toHaveBeenCalledWith(fileId);
        });

        it('should delete files by array of number IDs', async () => {
            const fileIds = [123, 456];
            mockRepository.delete.mockResolvedValue({ affected: 2, raw: {} });

            await fileRepository.deleteFiles(fileIds);

            expect(mockRepository.delete).toHaveBeenCalledWith(fileIds);
        });

        it('should delete files by Date', async () => {
            const date = new Date();
            mockRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            await fileRepository.deleteFiles(date);

            expect(mockRepository.delete).toHaveBeenCalledWith(date);
        });

        it('should delete files by array of Dates', async () => {
            const dates = [new Date(), new Date()];
            mockRepository.delete.mockResolvedValue({ affected: 2, raw: {} });

            await fileRepository.deleteFiles(dates);

            expect(mockRepository.delete).toHaveBeenCalledWith(dates);
        });

        it('should delete files by FindOptionsWhere', async () => {
            const whereClause = { type: 'application/json' };
            mockRepository.delete.mockResolvedValue({ affected: 3, raw: {} });

            await fileRepository.deleteFiles(whereClause);

            expect(mockRepository.delete).toHaveBeenCalledWith(whereClause);
        });

        it('should handle delete with no affected rows', async () => {
            mockRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

            await fileRepository.deleteFiles('non-existent-id');

            expect(mockRepository.delete).toHaveBeenCalledWith('non-existent-id');
        });

        it('should throw error if delete fails', async () => {
            const error = new Error('Delete failed');
            mockRepository.delete.mockRejectedValue(error);

            await expect(fileRepository.deleteFiles('file-123')).rejects.toThrow('Delete failed');
        });
    });

    describe('saveFile', () => {
        it('should save a file successfully', async () => {
            mockRepository.save.mockResolvedValue(mockFile);

            await fileRepository.saveFile(mockFile);

            expect(mockRepository.save).toHaveBeenCalledWith(mockFile);
            expect(mockRepository.save).toHaveBeenCalledTimes(1);
        });

        it('should save a new file without ID', async () => {
            const newFile = { ...mockFile, id: undefined } as unknown as File;
            const savedFile = { ...mockFile, id: 'generated-id' };
            mockRepository.save.mockResolvedValue(savedFile);

            await fileRepository.saveFile(newFile);

            expect(mockRepository.save).toHaveBeenCalledWith(newFile);
        });

        it('should update an existing file', async () => {
            const updatedFile = { ...mockFile, name: 'updated.json' };
            mockRepository.save.mockResolvedValue(updatedFile);

            await fileRepository.saveFile(updatedFile);

            expect(mockRepository.save).toHaveBeenCalledWith(updatedFile);
        });

        it('should throw error if save fails', async () => {
            const error = new Error('Save failed');
            mockRepository.save.mockRejectedValue(error);

            await expect(fileRepository.saveFile(mockFile)).rejects.toThrow('Save failed');
        });
    });

    describe('getById', () => {
        it('should retrieve a file by ID and user successfully', async () => {
            mockRepository.findOne.mockResolvedValue(mockFile);

            const result = await fileRepository.getById('file-123', mockUser);

            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    id: 'file-123',
                    added_by: mockUser
                }
            });
            expect(result).toEqual(mockFile);
        });

        it('should throw error when file is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(fileRepository.getById('non-existent', mockUser)).rejects.toThrow(
                'File not found'
            );
        });

        it('should throw error when file exists but belongs to different user', async () => {
            const differentUser = { ...mockUser, id: 'different-user' };
            mockRepository.findOne.mockResolvedValue(null);

            await expect(fileRepository.getById('file-123', differentUser)).rejects.toThrow(
                'File not found'
            );
        });

        it('should handle database errors', async () => {
            const error = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(error);

            await expect(fileRepository.getById('file-123', mockUser)).rejects.toThrow(
                'Database connection failed'
            );
        });

        it('should handle empty string ID', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(fileRepository.getById('', mockUser)).rejects.toThrow('File not found');

            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    id: '',
                    added_by: mockUser
                }
            });
        });

        it('should handle null user gracefully', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(fileRepository.getById('file-123', null as any)).rejects.toThrow(
                'File not found'
            );

            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    id: 'file-123',
                    added_by: null
                }
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle concurrent operations', async () => {
            mockRepository.save.mockResolvedValue(mockFile);
            mockRepository.findOne.mockResolvedValue(mockFile);
            mockRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            const promises = [
                fileRepository.saveFile(mockFile),
                fileRepository.getById('file-123', mockUser),
                fileRepository.deleteFiles('file-123')
            ];

            await Promise.all(promises);

            expect(mockRepository.save).toHaveBeenCalledTimes(1);
            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
            expect(mockRepository.delete).toHaveBeenCalledTimes(1);
        });

        it('should handle transaction rollback scenarios', async () => {
            const error = new Error('Constraint violation');
            mockRepository.save.mockRejectedValue(error);

            await expect(fileRepository.saveFile(mockFile)).rejects.toThrow('Constraint violation');
        });
    });
});
