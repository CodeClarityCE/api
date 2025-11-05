import { File } from 'src/base_modules/file/file.entity';

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';

import { FileController } from './file.controller';
import { FileRepository } from './file.repository';
import { FileService } from './file.service';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        OrganizationsModule,
        forwardRef(() => ProjectsModule),
        TypeOrmModule.forFeature([File], 'codeclarity')
    ],
    exports: [FileRepository],
    providers: [FileService, FileRepository],
    controllers: [FileController]
})
export class FileModule {}
