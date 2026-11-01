import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, Repository } from "typeorm";

import { File } from "src/base_modules/file/file.entity";

import { User } from "../users/users.entity";

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
    @InjectRepository(File, "codeclarity")
    private fileRepository: Repository<File>,
  ) {}

  /**
   * Removes a given file from the database.
   *
   * @param file - The file to be removed.
   */
  async remove(file: File): Promise<void> {
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
      | Date[]
      | FindOptionsWhere<File>,
  ): Promise<void> {
    await this.fileRepository.delete(files);
  }

  /**
   * Deletes every file row belonging to any of the given projects in a single
   * set-based statement (no per-row entity load).
   *
   * @param projectIds - The IDs of the projects whose files should be deleted.
   * @returns The number of file rows removed.
   */
  async deleteByProjectIds(projectIds: string[]): Promise<number> {
    if (projectIds.length === 0) return 0;
    const res = await this.fileRepository
      .createQueryBuilder()
      .delete()
      .where('"projectId" IN (:...projectIds)', { projectIds })
      .execute();
    return res.affected ?? 0;
  }

  /**
   * Saves a file to the database.
   *
   * @param file - The file to be saved.
   */
  async saveFile(file: File): Promise<void> {
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
        added_by: addedBy,
      },
    });
    if (!file) {
      throw new Error("File not found");
    }
    return file;
  }
}
