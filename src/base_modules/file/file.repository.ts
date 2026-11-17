import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, FindOptionsWhere, Repository } from "typeorm";

import { File } from "src/base_modules/file/file.entity";

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
   * @param manager - Runs the delete in the caller's transaction when given.
   * @returns The number of file rows removed.
   */
  async deleteByProjectIds(
    projectIds: string[],
    manager?: EntityManager,
  ): Promise<number> {
    if (projectIds.length === 0) return 0;
    const repo = manager?.getRepository(File) ?? this.fileRepository;
    const res = await repo
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
   * @param addedById - The id of the user who added the file.
   * @returns The retrieved file.
   * @throws Will throw an error if the file is not found.
   */
  async getById(fileId: string, addedById: string): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: {
        id: fileId,
        added_by: { id: addedById },
      },
    });
    if (!file) {
      throw new Error("File not found");
    }
    return file;
  }
}
