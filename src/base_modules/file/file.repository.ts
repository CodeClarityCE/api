
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { File } from 'src/base_modules/file/file.entity';
import { FindOptionsWhere, ObjectId, Repository } from 'typeorm';

import { User } from '../users/users.entity';

/**
 * Injectable service to handle file operations using TypeORM.
 */
@Injectable()
export class FileRepository {
    /**
     * Constructor for the FileRepository.
     *
     * @param fileRepository - The injected repository instance for the File entity.
     */
    constructor(
        @InjectRepository(File, 'codeclarity')
        private fileRepository: Repository<File>
    ) {}

    /**
     * Removes a given file from the database.
     *
     * @param file - The file to be removed.
     */
    async remove(file: File) {
        await this.fileRepository.remove(file);
    }

    /**
     * Deletes files based on the provided criteria.
     *
     * @param files - Criteria or identifiers for the files to be deleted.
     */
    async deleteFiles(
        files:
            | string
            | number
            | string[]
            | Date
            | number[]
            | ObjectId
            | Date[]
            | ObjectId[]
            | FindOptionsWhere<File>
    ) {
        await this.fileRepository.delete(files);
    }

    /**
     * Saves a file to the database.
     *
     * @param file - The file to be saved.
     */
    async saveFile(file: File) {
        await this.fileRepository.save(file);
    }

    /**
     * Retrieves a file by its ID and the user who added it.
     *
     * @param fileId - The ID of the file to retrieve.
     * @param addedBy - The user who added the file.
     * @returns The retrieved file.
     * @throws Will throw an error if the file is not found.
     */
    async getById(fileId: string, addedBy: User): Promise<File> {
        const file = await this.fileRepository.findOne({
            where: {
                id: fileId,
                added_by: addedBy
            }
        });
        if (!file) {
            throw new Error('File not found');
        }
        return file;
    }
}
