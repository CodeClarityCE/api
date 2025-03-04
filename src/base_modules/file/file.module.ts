import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { File } from 'src/entity/codeclarity/File';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'src/entity/codeclarity/Project';
import { OrganizationsMemberService } from '../../base_modules/organizations/organizationMember.service';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        UsersModule,
        TypeOrmModule.forFeature([File, Project, OrganizationMemberships], 'codeclarity')
    ],
    providers: [FileService, OrganizationsMemberService],
    controllers: [FileController]
})
export class FileModule {}
