import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { File as FileEntity } from 'src/base_modules/file/file.entity';
import { UploadData } from './file.controller';
import { join } from 'path';
import { escapeString } from 'src/utils/cleaner';
import { MemberRole } from 'src/base_modules/organizations/memberships/organization.memberships.entity';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { FileRepository } from './file.repository';
import { MulterFile } from '@webundsoehne/nest-fastify-file-upload';

@Injectable()
export class FileService {
    constructor(
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly usersRepository: UsersRepository,
        private readonly projectsRepository: ProjectsRepository,
        private readonly fileRepository: FileRepository
    ) {}

    /**
     * Uploads a file to the server, checking user permissions and handling file chunks.
     *
     * @param user - The authenticated user uploading the file.
     * @param file - The file being uploaded.
     * @param project_id - The ID of the project to which the file belongs.
     * @param organization_id - The ID of the organization to which the project belongs.
     * @param queryParams - Additional data about the upload, such as file name, chunk information, etc.
     */
    async uploadFile(
        user: AuthenticatedUser,
        file: MulterFile,
        project_id: string,
        organization_id: string,
        queryParams: UploadData
    ): Promise<void> {
        // Check if the user has the required role in the organization
        await this.organizationsRepository.hasRequiredRole(
            organization_id,
            user.userId,
            MemberRole.USER
        );

        // Retrieve the project by ID and organization ID
        const project = await this.projectsRepository.getProjectByIdAndOrganization(
            project_id,
            organization_id
        );

        // Escape the project ID to prevent any potential issues with file paths
        const escapeProjectId = escapeString(project_id);

        // Retrieve the user who added the file
        const added_by = await this.usersRepository.getUserById(user.userId);

        // Define the folder path where the file will be saved
        const downloadPath = process.env.DOWNLOAD_PATH || '/private';
        const folderPath = join(downloadPath, project.added_by.id, escapeProjectId);

        // Create the folder path if it doesn't exist
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        // Escape the file name to prevent any potential issues with file paths
        const escapedFileName = escapeString(queryParams.file_name);
        const baseName = escapedFileName.split('.', 1)[0];
        // Pad the id with zeros until it is 5 characters long
        const paddedId = queryParams.id.toString().padStart(5, '0');
        const fileNameWithSuffix = `${baseName}.part${paddedId}`;

        // If this is not the last chunk of the file
        if (queryParams.last == 'false') {
            const filePath = join(folderPath, fileNameWithSuffix); // Define the file path

            // Create a write stream for appending to the file
            const fileStream = fs.createWriteStream(filePath, { flags: 'a+' });

            // Handle errors during writing or opening the file
            fileStream.on('error', (err) => {
                console.error('File stream error:', err);
            });

            if (file.buffer) {
                await crypto.subtle.digest('SHA-256', file.buffer).then((hash) => {
                    const hashArray = Array.from(new Uint8Array(hash));
                    const stringHash = hashArray
                        .map((b) => b.toString(16).padStart(2, '0'))
                        .join('');
                    if (queryParams.hash != stringHash) {
                        console.error('NOT THE SAME HASH!');
                        console.error('Hash:', stringHash);
                        console.error('Original Hash:', queryParams.hash);
                    }
                });
            }

            // Write the file buffer to the file stream
            fileStream.write(file.buffer);

            await new Promise<void>((resolve, reject) => {
                fileStream.end(); // This automatically calls resolve on finish

                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });
        } else {
            const filePath = join(folderPath, fileNameWithSuffix); // Define the file path

            // Create a write stream for appending to the file
            const fileStream = fs.createWriteStream(filePath, { flags: 'a+' });

            // Write the file buffer to the file stream
            fileStream.write(file.buffer);

            await new Promise<void>((resolve, reject) => {
                fileStream.end(); // This automatically calls resolve on finish

                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });

            // Get all files in folderPath and sort them alphabetically by name
            const files = fs.readdirSync(folderPath).sort();

            // Remove any files that don't match the expected pattern (e.g., .part01)
            const validFiles = [];
            for (const file of files) {
                if (/\.part\d{5}$/.test(file)) {
                    // Check if the file does not have a .partXX extension
                    validFiles.push(file); // Add to list but do not delete from disk
                }
            }

            let index = 0;
            for (const file of validFiles) {
                const match = file.match(/(\d+)$/);
                if (match) {
                    const currentIdx = parseInt(match[1], 10);
                    if (currentIdx !== index) {
                        console.log(`Missing chunk at index ${index} in file: ${file}`);
                    }
                    index++;
                }
            }

            // Concatenate their content to finalFileStream
            for (let i = 0; i < validFiles.length; i++) {
                const finalFilePath = join(folderPath, escapedFileName); // Define the final file path

                // Create a write stream for appending to the final file
                const finalFileStream = fs.createWriteStream(finalFilePath, { flags: 'a+' });

                // Handle errors during writing or opening the file
                finalFileStream.on('error', (err) => {
                    console.error('File stream error:', err);
                });

                try {
                    const fileContent = fs.readFileSync(join(folderPath, validFiles[i]));
                    finalFileStream.write(fileContent);
                } catch {
                    console.error(`Error reading file ${validFiles[i]}`);
                }

                // Remove the temp file after its content has been written to the final file
                if (validFiles[i] !== escapedFileName) {
                    try {
                        fs.unlinkSync(join(folderPath, validFiles[i]));
                    } catch {
                        console.error(`Error deleting temp file ${validFiles[i]}`);
                    }
                }

                await new Promise<void>((resolve, reject) => {
                    finalFileStream.end();
                    finalFileStream.on('finish', resolve);
                    finalFileStream.on('error', reject);
                });
            }
        }

        // If this is not a chunked upload or if it's the last chunk
        if (queryParams.chunk == 'false' || queryParams.last == 'true') {
            // Save the file to the database
            const file_entity = new FileEntity();
            file_entity.added_by = added_by;
            file_entity.added_on = new Date();
            file_entity.project = project;
            file_entity.type = queryParams.type;
            file_entity.name = escapedFileName;

            this.fileRepository.saveFile(file_entity);
        }
    }

    /**
     * Deletes a file from the server, checking user permissions.
     *
     * @param file_id - The ID of the file to be deleted.
     * @param organization_id - The ID of the organization to which the file belongs.
     * @param project_id - The ID of the project to which the file belongs.
     * @param user - The authenticated user deleting the file.
     */
    async delete(
        file_id: string,
        organization_id: string,
        project_id: string,
        user: AuthenticatedUser
    ): Promise<void> {
        // Check if the user has the required role in the organization
        await this.organizationsRepository.hasRequiredRole(
            organization_id,
            user.userId,
            MemberRole.USER
        );

        // Retrieve the project by ID and organization ID
        const project = await this.projectsRepository.getProjectByIdAndOrganization(
            project_id,
            organization_id
        );

        // Escape the project ID to prevent any potential issues with file paths
        const escapeProjectId = escapeString(project_id);

        // Retrieve the user who added the file
        const added_by = await this.usersRepository.getUserById(user.userId);

        // Retrieve the file by ID and the user who added it
        const file = await this.fileRepository.getById(file_id, added_by);

        // Define the file path
        const downloadPath = process.env.DOWNLOAD_PATH || '/private';
        const filePath = join(downloadPath, project.added_by.id, escapeProjectId, file.name);

        // Delete the file from the file system if it exists
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete the file from the database
        await this.fileRepository.deleteFiles(file.id);
    }

    /**
     * Assembles chunks of a file into a single file.
     *
     * @param filename - The name of the final file to be created.
     * @param totalChunks - The total number of chunks that make up the file.
     */
    async assembleChunks(_filename: string, _totalChunks: number) {
        // Create a write stream for the final file
        // const writer = fs.createWriteStream(`./uploads/${_filename}`);
        // Iterate over each chunk and append its content to the final file
        // for (let i = 1; i <= _totalChunks; i++) {
        //   const chunkPath = `${CHUNKS_DIR}/${_filename}.${i}`;
        //   await pipeline(pump(fs.createReadStream(chunkPath)), pump(writer));
        //   fs.unlink(chunkPath, (err) => {
        //     if (err) {
        //       console.error('Error deleting chunk file:', err);
        //     }
        //   });
        // }
    }
}
