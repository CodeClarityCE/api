import { Injectable } from '@nestjs/common';
import { File } from '@nest-lab/fastify-multer';
import * as fs from 'fs';
import { AuthenticatedUser } from 'src/types/auth/types';
import { File as FileEntity } from 'src/base_modules/file/file.entity';
import { Project } from 'src/base_modules/projects/project.entity';
import { UploadData } from './file.controller';
import { join } from 'path';
import { escapeString } from 'src/utils/cleaner';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemberRole } from 'src/base_modules/organizations/organization.memberships.entity';
import { UsersRepository } from '../users/users.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ProjectsRepository } from '../projects/projects.repository';

@Injectable()
export class FileService {
    constructor(
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly usersRepository: UsersRepository,
        private readonly projectsRepository: ProjectsRepository,
        @InjectRepository(FileEntity, 'codeclarity')
        private fileRepository: Repository<FileEntity>
    ) {}

    async uploadFile(
        user: AuthenticatedUser,
        file: File,
        project_id: string,
        organization_id: string,
        queryParams: UploadData
    ): Promise<void> {
        await this.organizationsRepository.hasRequiredRole(
            organization_id,
            user.userId,
            MemberRole.USER
        );
        // retrieve files from project
        const project = await this.projectsRepository.getProjectByIdAndOrganization(project_id, organization_id)
    
        const escapeProjectId = escapeString(project_id);

        // Retrieve the user who added the file
        const added_by = await this.usersRepository.getUserById(user.userId)
        if (!added_by) {
            throw new Error('User not found');
        }

        // Write the file to the file system
        const folderPath = join('/private', project.added_by.id, escapeProjectId);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const escapedFileName = escapeString(queryParams.file_name);
        const baseName = escapedFileName.split(".", 1)[0];
        // Pad the id with zeros until it is 5 characters long
        const paddedId = queryParams.id.toString().padStart(5, '0');
        const fileNameWithSuffix = `${baseName}.part${paddedId}`;

        if (queryParams.last == "false") {
            const filePath = join(folderPath, fileNameWithSuffix); // Replace with the desired file path
            const fileStream = fs.createWriteStream(filePath, {flags: "a+"});
    
            // Handle errors during writing or opening the file
            fileStream.on('error', (err) => {
                console.error('File stream error:', err);
            });

            if (file.buffer) {
                await crypto.subtle.digest('SHA-256', file.buffer).then((hash) => {
                    const hashArray = Array.from(new Uint8Array(hash));
                    const stringHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    if (queryParams.hash != stringHash) {
                        console.error("NOT THE SAME HASH!");
                        console.error('Hash:', stringHash);
                        console.error('Original Hash:', queryParams.hash)
                    }
                });
            }
            fileStream.write(file.buffer);
            await new Promise((resolve, reject) => {
                fileStream.end();  // This automatically calls resolve on finish
        
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });
        } else {
            const filePath = join(folderPath, fileNameWithSuffix); // Replace with the desired file path
            const fileStream = fs.createWriteStream(filePath, {flags: "a+"});
    
            fileStream.write(file.buffer);
            await new Promise((resolve, reject) => {
                fileStream.end();  // This automatically calls resolve on finish
        
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });

            // Get all files in folderPath and sort them alphabetically by name
            const files = fs.readdirSync(folderPath).sort();
            // Remove any files that don't match the expected pattern (e.g., .part01)
            const validFiles = [];
            for (const file of files) {
                if (/\.part\d{5}$/.test(file)) {  // Check if the file does not have a .partXX extension
                    validFiles.push(file);  // Add to list but do not delete from disk
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
                const finalFilePath = join(folderPath, escapedFileName); // Replace with the desired file path
                const finalFileStream = fs.createWriteStream(finalFilePath, {flags: "a+"});
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

                await new Promise((resolve, reject) => {
                    finalFileStream.end();
                    finalFileStream.on('finish', resolve);
                    finalFileStream.on('error', reject);
                });
            }
            
        }

        if (queryParams.chunk == "false" || queryParams.last == "true") {
            // Save the file to the database
            const file_entity = new FileEntity();
            file_entity.added_by = added_by;
            file_entity.added_on = new Date();  
            file_entity.project = project;
            file_entity.type = queryParams.type;
            file_entity.name = escapedFileName;

            this.fileRepository.save(file_entity);
        }
    }

    async delete(
        file_id: string,
        organization_id: string,
        project_id: string,
        user: AuthenticatedUser
    ): Promise<void> {
        await this.organizationsRepository.hasRequiredRole(
            organization_id,
            user.userId,
            MemberRole.USER
        );
        // retrieve files from project
        const project = await this.projectsRepository.getProjectByIdAndOrganization(project_id, organization_id)

        const escapeProjectId = escapeString(project_id);
        // Retrieve the user who added the file
        const added_by = await this.usersRepository.getUserById(user.userId)
        if (!added_by) {
            throw new Error('User not found');
        }

        // Retrieve the file
        const file = await this.fileRepository.findOne({
            where: {
                id: file_id,
                added_by: added_by
            }
        });
        if (!file) {
            throw new Error('File not found');
        }

        // Delete the file from the file system
        const filePath = join('/private', project.added_by.id, escapeProjectId, file.name);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete the file from the database
        await this.fileRepository.delete(file.id);
    }

    async assembleChunks(filename: string, totalChunks: number) {
        const writer = fs.createWriteStream(`./uploads/${filename}`);
        // for (let i = 1; i <= totalChunks; i++) {
        //   const chunkPath = `${CHUNKS_DIR}/${filename}.${i}`;
        //   await pipeline(pump(fs.createReadStream(chunkPath)), pump(writer));
        //   fs.unlink(chunkPath, (err) => {
        //     if (err) {
        //       console.error('Error deleting chunk file:', err);
        //     }
        //   });
        // }
      }
}
