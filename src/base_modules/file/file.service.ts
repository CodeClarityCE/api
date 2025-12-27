import * as fs from "fs";
import { Injectable } from "@nestjs/common";
import { MulterFile } from "@webundsoehne/nest-fastify-file-upload";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { File as FileEntity } from "src/base_modules/file/file.entity";
import { MemberRole } from "src/base_modules/organizations/memberships/organization.memberships.entity";
import { validateAndJoinPath } from "src/utils/path-validator";
import {
  MembershipsRepository,
  ProjectsRepository,
  UsersRepository,
} from "../shared/repositories";
import { UploadData } from "./file.controller";
import { FileRepository } from "./file.repository";

@Injectable()
export class FileService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly fileRepository: FileRepository,
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
    queryParams: UploadData,
  ): Promise<void> {
    // Check if the user has the required role in the organization
    await this.membershipsRepository.hasRequiredRole(
      organization_id,
      user.userId,
      MemberRole.USER,
    );

    // Retrieve the project by ID and organization ID
    const project = await this.projectsRepository.getProjectByIdAndOrganization(
      project_id,
      organization_id,
    );

    // Retrieve the user who added the file
    const added_by = await this.usersRepository.getUserById(user.userId);

    // Define the folder path where the file will be saved
    const downloadPath = process.env["DOWNLOAD_PATH"] ?? "/private";
    const folderPath = validateAndJoinPath(
      downloadPath,
      project.added_by.id,
      project_id,
    );

    // Create the folder path if it doesn't exist
    // Path is validated using validateAndJoinPath to prevent traversal attacks
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(folderPath)) {
      // Path is validated using validateAndJoinPath to prevent traversal attacks
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Sanitize filename - extract base name without extension
    const baseName = queryParams.file_name.split(".", 1)[0];
    // Pad the id with zeros until it is 5 characters long
    const paddedId = queryParams.id.toString().padStart(5, "0");
    const fileNameWithSuffix = `${baseName}.part${paddedId}`;

    // If this is not the last chunk of the file
    if (queryParams.last === "false") {
      const filePath = validateAndJoinPath(folderPath, fileNameWithSuffix);

      // Path is validated using validateAndJoinPath to prevent traversal attacks
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fileStream = fs.createWriteStream(filePath, { flags: "a+" });

      // Handle errors during writing or opening the file
      fileStream.on("error", (err) => {
        console.error("File stream error:", err);
      });

      if (file.buffer) {
        await crypto.subtle
          .digest("SHA-256", Buffer.from(file.buffer).buffer)
          .then((hash) => {
            const hashArray = Array.from(new Uint8Array(hash));
            const stringHash = hashArray
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            if (queryParams.hash !== stringHash) {
              console.error("NOT THE SAME HASH!");
              console.error("Hash:", stringHash);
              console.error("Original Hash:", queryParams.hash);
            }
          });
      }

      // Write the file buffer to the file stream
      fileStream.write(file.buffer);

      await new Promise<void>((resolve, reject) => {
        fileStream.end(); // This automatically calls resolve on finish

        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
    } else {
      const filePath = validateAndJoinPath(folderPath, fileNameWithSuffix);

      // Path is validated using validateAndJoinPath to prevent traversal attacks
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fileStream = fs.createWriteStream(filePath, { flags: "a+" });

      // Write the file buffer to the file stream
      fileStream.write(file.buffer);

      await new Promise<void>((resolve, reject) => {
        fileStream.end(); // This automatically calls resolve on finish

        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      // Get all files in folderPath and sort them alphabetically by name
      // Path is validated using validateAndJoinPath to prevent traversal attacks
      // eslint-disable-next-line security/detect-non-literal-fs-filename
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
        const match = /(\d+)$/.exec(file);
        if (match) {
          const currentIdx = parseInt(match[1]!, 10);
          if (currentIdx !== index) {
            console.warn(`Missing chunk at index ${index} in file: ${file}`);
          }
          index++;
        }
      }

      // Concatenate their content to finalFileStream
      for (const chunkFileName of validFiles) {
        const finalFilePath = validateAndJoinPath(
          folderPath,
          queryParams.file_name,
        );

        // Path is validated using validateAndJoinPath to prevent traversal attacks
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const finalFileStream = fs.createWriteStream(finalFilePath, {
          flags: "a+",
        });

        // Handle errors during writing or opening the file
        finalFileStream.on("error", (err) => {
          console.error("File stream error:", err);
        });

        try {
          const chunkPath = validateAndJoinPath(folderPath, chunkFileName);
          // Path is validated using validateAndJoinPath to prevent traversal attacks
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          const fileContent = fs.readFileSync(chunkPath);
          finalFileStream.write(fileContent);
        } catch {
          console.error(`Error reading file ${chunkFileName}`);
        }

        // Remove the temp file after its content has been written to the final file
        if (chunkFileName !== queryParams.file_name) {
          try {
            const tempFilePath = validateAndJoinPath(folderPath, chunkFileName);
            // Path is validated using validateAndJoinPath to prevent traversal attacks
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            fs.unlinkSync(tempFilePath);
          } catch {
            console.error(`Error deleting temp file ${chunkFileName}`);
          }
        }

        await new Promise<void>((resolve, reject) => {
          finalFileStream.end();
          finalFileStream.on("finish", resolve);
          finalFileStream.on("error", reject);
        });
      }
    }

    // If this is not a chunked upload or if it's the last chunk
    if (queryParams.chunk === "false" || queryParams.last === "true") {
      // Save the file to the database
      const file_entity = new FileEntity();
      file_entity.added_by = added_by;
      file_entity.added_on = new Date();
      file_entity.project = project;
      file_entity.type = queryParams.type;
      file_entity.name = queryParams.file_name;

      await this.fileRepository.saveFile(file_entity);
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
    user: AuthenticatedUser,
  ): Promise<void> {
    // Check if the user has the required role in the organization
    await this.membershipsRepository.hasRequiredRole(
      organization_id,
      user.userId,
      MemberRole.USER,
    );

    // Retrieve the project by ID and organization ID
    const project = await this.projectsRepository.getProjectByIdAndOrganization(
      project_id,
      organization_id,
    );

    // Retrieve the user who added the file
    const added_by = await this.usersRepository.getUserById(user.userId);

    // Retrieve the file by ID and the user who added it
    const file = await this.fileRepository.getById(file_id, added_by);

    // Define the file path
    const downloadPath = process.env["DOWNLOAD_PATH"] ?? "/private";
    const filePath = validateAndJoinPath(
      downloadPath,
      project.added_by.id,
      project_id,
      file.name,
    );

    // Delete the file from the file system if it exists
    // Path is validated using validateAndJoinPath to prevent traversal attacks
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(filePath)) {
      // Path is validated using validateAndJoinPath to prevent traversal attacks
      // eslint-disable-next-line security/detect-non-literal-fs-filename
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
  async assembleChunks(_filename: string, _totalChunks: number): Promise<void> {
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
