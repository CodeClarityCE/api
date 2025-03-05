import { forwardRef, Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { File } from 'src/base_modules/file/file.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { FileRepository } from './file.repository';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        forwardRef(() => ProjectsModule),
        TypeOrmModule.forFeature([File], 'codeclarity')
    ],
    exports: [FileRepository],
    providers: [FileService, FileRepository],
    controllers: [FileController]
})
export class FileModule { }
