import { readFile } from 'fs';
import { Test, type TestingModule } from '@nestjs/testing';
import type { MulterFile } from '@webundsoehne/nest-fastify-file-upload';
import { InternalError } from '../../types/error.types';
import { AuthenticatedUser, ROLE } from '../auth/auth.types';
import { FileController, type UploadData } from './file.controller';
import { FileService } from './file.service';

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFile: jest.fn()
}));

describe('FileController', () => {
    let controller: FileController;
    let fileService: jest.Mocked<FileService>;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockFile: MulterFile = {
        fieldname: 'file',
        originalname: 'test.json',
        encoding: '7bit',
        mimetype: 'application/json',
        buffer: Buffer.from('test content'),
        size: 12
    } as MulterFile;

    const mockUploadData: UploadData = {
        type: 'application/json',
        file_name: 'test.json',
        chunk: 'false',
        last: 'true',
        id: '0',
        hash: 'testhash123'
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [FileController],
            providers: [
                {
                    provide: FileService,
                    useValue: {
                        uploadFile: jest.fn(),
                        delete: jest.fn()
                    }
                }
            ]
        }).compile();

        controller = module.get<FileController>(FileController);
        fileService = module.get(FileService);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.resetAllMocks();
    });

    describe('uploadFile', () => {
        it('should upload file successfully', async () => {
            fileService.uploadFile.mockResolvedValue(undefined);

            const result = await controller.uploadFile(
                mockUser,
                'project-123',
                'org-123',
                mockUploadData,
                mockFile
            );

            expect(result).toBeUndefined();
            expect(fileService.uploadFile).toHaveBeenCalledWith(
                mockUser,
                mockFile,
                'project-123',
                'org-123',
                mockUploadData
            );
        });

        it('should throw InternalError when no file is provided', async () => {
            await expect(
                controller.uploadFile(
                    mockUser,
                    'project-123',
                    'org-123',
                    mockUploadData,
                    null as any
                )
            ).rejects.toThrow(InternalError);

            expect(fileService.uploadFile).not.toHaveBeenCalled();
        });

        it('should handle chunked upload', async () => {
            const chunkedData: UploadData = {
                ...mockUploadData,
                chunk: 'true',
                last: 'false',
                id: '1'
            };

            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(mockUser, 'project-123', 'org-123', chunkedData, mockFile);

            expect(fileService.uploadFile).toHaveBeenCalledWith(
                mockUser,
                mockFile,
                'project-123',
                'org-123',
                chunkedData
            );
        });

        it('should call service without awaiting', async () => {
            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(
                mockUser,
                'project-123',
                'org-123',
                mockUploadData,
                mockFile
            );

            expect(fileService.uploadFile).toHaveBeenCalledWith(
                mockUser,
                mockFile,
                'project-123',
                'org-123',
                mockUploadData
            );
        });

        it('should handle file with different types', async () => {
            const imageData: UploadData = {
                ...mockUploadData,
                type: 'image/png',
                file_name: 'image.png'
            };

            const imageFile: MulterFile = {
                ...mockFile,
                mimetype: 'image/png',
                originalname: 'image.png'
            };

            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(mockUser, 'project-123', 'org-123', imageData, imageFile);

            expect(fileService.uploadFile).toHaveBeenCalledWith(
                mockUser,
                imageFile,
                'project-123',
                'org-123',
                imageData
            );
        });

        it('should handle empty file buffer', async () => {
            const emptyFile: MulterFile = {
                ...mockFile,
                buffer: Buffer.from(''),
                size: 0
            };

            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(
                mockUser,
                'project-123',
                'org-123',
                mockUploadData,
                emptyFile
            );

            expect(fileService.uploadFile).toHaveBeenCalledWith(
                mockUser,
                emptyFile,
                'project-123',
                'org-123',
                mockUploadData
            );
        });

        it('should handle undefined file properties gracefully', async () => {
            const partialFile = {
                buffer: Buffer.from('test')
            } as MulterFile;

            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(
                mockUser,
                'project-123',
                'org-123',
                mockUploadData,
                partialFile
            );

            expect(fileService.uploadFile).toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        it('should delete file successfully', async () => {
            fileService.delete.mockResolvedValue(undefined);

            const result = await controller.delete(mockUser, 'project-123', 'org-123', 'file-123');

            expect(result).toEqual({});
            expect(fileService.delete).toHaveBeenCalledWith(
                'file-123',
                'org-123',
                'project-123',
                mockUser
            );
        });

        it('should handle service errors during deletion', async () => {
            const error = new Error('Delete failed');
            fileService.delete.mockRejectedValue(error);

            await expect(
                controller.delete(mockUser, 'project-123', 'org-123', 'file-123')
            ).rejects.toThrow('Delete failed');
        });

        it('should handle deletion of non-existent file', async () => {
            fileService.delete.mockRejectedValue(new Error('File not found'));

            await expect(
                controller.delete(mockUser, 'project-123', 'org-123', 'non-existent')
            ).rejects.toThrow('File not found');
        });

        it('should handle concurrent deletions', async () => {
            fileService.delete.mockResolvedValue(undefined);

            const promises = [
                controller.delete(mockUser, 'project-123', 'org-123', 'file-1'),
                controller.delete(mockUser, 'project-123', 'org-123', 'file-2'),
                controller.delete(mockUser, 'project-123', 'org-123', 'file-3')
            ];

            const results = await Promise.all(promises);

            expect(results).toEqual([{}, {}, {}]);
            expect(fileService.delete).toHaveBeenCalledTimes(3);
        });
    });

    describe('getFileByName', () => {
        it('should retrieve file content successfully', async () => {
            const fileContent = 'This is the file content';
            const mockReadFile = readFile as unknown as jest.Mock;
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                callback(null, fileContent);
            });

            const result = await controller.getFileByName(
                mockUser,
                'project-123',
                'org-123',
                'test.txt'
            );

            expect(result).toEqual({ data: fileContent });
            expect(mockReadFile).toHaveBeenCalledWith(
                expect.stringContaining('test.txt'),
                'utf8',
                expect.any(Function)
            );
        });

        it('should handle file read errors', async () => {
            const mockReadFile = readFile as unknown as jest.Mock;
            const error = new Error('File not found');
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                callback(error);
            });

            await expect(
                controller.getFileByName(mockUser, 'project-123', 'org-123', 'nonexistent.txt')
            ).rejects.toThrow('File not found');
        });

        it('should escape file names to prevent directory traversal', async () => {
            const mockReadFile = readFile as unknown as jest.Mock;
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                callback(null, 'content');
            });

            await controller.getFileByName(
                mockUser,
                'project-123',
                'org-123',
                '../../../etc/passwd'
            );

            expect(mockReadFile).toHaveBeenCalledWith(
                expect.not.stringContaining('..'),
                'utf8',
                expect.any(Function)
            );
        });

        it('should use custom download path from environment', async () => {
            const originalEnv = process.env['DOWNLOAD_PATH'];
            process.env['DOWNLOAD_PATH'] = '/custom/path';

            const mockReadFile = readFile as unknown as jest.Mock;
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                callback(null, 'content');
            });

            await controller.getFileByName(mockUser, 'project-123', 'org-123', 'test.txt');

            expect(mockReadFile).toHaveBeenCalledWith(
                expect.stringContaining('/custom/path'),
                'utf8',
                expect.any(Function)
            );

            process.env['DOWNLOAD_PATH'] = originalEnv;
        });

        it('should handle empty file content', async () => {
            const mockReadFile = readFile as unknown as jest.Mock;
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                callback(null, '');
            });

            const result = await controller.getFileByName(
                mockUser,
                'project-123',
                'org-123',
                'empty.txt'
            );

            expect(result).toEqual({ data: '' });
        });

        it('should handle large file content', async () => {
            const largeContent = 'x'.repeat(1000000); // 1MB of 'x'
            const mockReadFile = readFile as unknown as jest.Mock;
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                callback(null, largeContent);
            });

            const result = await controller.getFileByName(
                mockUser,
                'project-123',
                'org-123',
                'large.txt'
            );

            expect(result.data).toHaveLength(1000000);
        });

        it('should handle special characters in file names', async () => {
            const mockReadFile = readFile as unknown as jest.Mock;
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                callback(null, 'content');
            });

            const specialFileNames = [
                'file with spaces.txt',
                'file@special.txt',
                'file#hash.txt',
                'file$dollar.txt',
                'file%percent.txt'
            ];

            for (const fileName of specialFileNames) {
                await controller.getFileByName(mockUser, 'project-123', 'org-123', fileName);
            }

            expect(mockReadFile).toHaveBeenCalledTimes(specialFileNames.length);
        });

        it('should handle concurrent file reads', async () => {
            const mockReadFile = readFile as unknown as jest.Mock;
            mockReadFile.mockImplementation((_path, _encoding, callback) => {
                // Immediate callback instead of setTimeout
                callback(null, 'content');
            });

            const promises = [
                controller.getFileByName(mockUser, 'project-123', 'org-123', 'file1.txt'),
                controller.getFileByName(mockUser, 'project-123', 'org-123', 'file2.txt'),
                controller.getFileByName(mockUser, 'project-123', 'org-123', 'file3.txt')
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            expect(results).toEqual([
                { data: 'content' },
                { data: 'content' },
                { data: 'content' }
            ]);
            expect(mockReadFile).toHaveBeenCalledTimes(3);
        });
    });

    describe('Edge Cases', () => {
        it('should handle null parameters gracefully', async () => {
            // The controller doesn't validate null parameters, it just passes them to the service
            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(
                null as any,
                'project-123',
                'org-123',
                mockUploadData,
                mockFile
            );

            expect(fileService.uploadFile).toHaveBeenCalledWith(
                null,
                mockFile,
                'project-123',
                'org-123',
                mockUploadData
            );
        });

        it('should handle very long file names', async () => {
            const longFileName = `${'a'.repeat(255)}.txt`;
            const longUploadData: UploadData = {
                ...mockUploadData,
                file_name: longFileName
            };

            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(
                mockUser,
                'project-123',
                'org-123',
                longUploadData,
                mockFile
            );

            expect(fileService.uploadFile).toHaveBeenCalledWith(
                mockUser,
                mockFile,
                'project-123',
                'org-123',
                longUploadData
            );
        });

        it('should handle malformed upload data', async () => {
            const malformedData = {
                type: 'text/plain'
                // Missing required fields
            } as UploadData;

            fileService.uploadFile.mockResolvedValue(undefined);

            await controller.uploadFile(
                mockUser,
                'project-123',
                'org-123',
                malformedData,
                mockFile
            );

            expect(fileService.uploadFile).toHaveBeenCalledWith(
                mockUser,
                mockFile,
                'project-123',
                'org-123',
                malformedData
            );
        });
    });
});
