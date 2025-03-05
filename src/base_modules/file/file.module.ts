import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { File } from 'src/entity/codeclarity/File';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        ProjectsModule,
        TypeOrmModule.forFeature([File], 'codeclarity')
    ],
    providers: [FileService],
    controllers: [FileController]
})
export class FileModule {}
