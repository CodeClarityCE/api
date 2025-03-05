import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { File } from 'src/entity/codeclarity/File';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'src/entity/codeclarity/Project';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        TypeOrmModule.forFeature([File, Project], 'codeclarity')
    ],
    providers: [FileService],
    controllers: [FileController]
})
export class FileModule {}
