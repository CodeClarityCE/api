import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from 'src/base_modules/file/file.entity';
import { FileController } from './file.controller';
import { FileRepository } from './file.repository';
import { FileService } from './file.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([File], 'codeclarity')
    ],
    exports: [FileRepository],
    providers: [FileService, FileRepository],
    controllers: [FileController]
})
export class FileModule {}
