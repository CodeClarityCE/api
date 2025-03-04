import { Module } from '@nestjs/common';
import { AnalyzersController } from './analyzers.controller';
import { AnalyzersService } from './analyzers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationLoggerService } from '../organizations/organizationLogger.service';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { Analyzer } from 'src/entity/codeclarity/Analyzer';
import { User } from 'src/entity/codeclarity/User';
import { Log } from 'src/entity/codeclarity/Log';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [Organization, Analyzer, User, Log, OrganizationMemberships],
            'codeclarity'
        )
    ],
    exports: [AnalyzersService],
    providers: [AnalyzersService, OrganizationLoggerService, OrganizationsMemberService],
    controllers: [AnalyzersController]
})
export class AnalyzersModule {}
