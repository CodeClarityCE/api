import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { File } from 'src/entity/codeclarity/File';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'src/entity/codeclarity/Project';
import { User } from 'src/entity/codeclarity/User';

@Module({
    imports: [TypeOrmModule.forFeature([File, Project, User], 'codeclarity')],
    providers: [FileService],
    controllers: [FileController]
})
export class FileModule {}
