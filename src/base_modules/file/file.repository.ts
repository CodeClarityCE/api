import { Injectable } from '@nestjs/common';
import { File as FileEntity } from 'src/entity/codeclarity/File';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class FileRepository {
    constructor(
        @InjectRepository(FileEntity, 'codeclarity')
        private fileRepository: Repository<FileEntity>
    ) {}

    async remove(file: FileEntity) {
        await this.fileRepository.remove(file)
    }
}
