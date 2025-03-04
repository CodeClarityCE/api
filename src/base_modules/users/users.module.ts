import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from 'src/base_modules/users/users.entity';
import { Email } from 'src/entity/codeclarity/Email';
import { GitlabIntegrationTokenService } from '../integrations/gitlab/gitlabToken.service';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { UsersRepository } from './users.repository';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [User, Email, Organization, OrganizationMemberships],
            'codeclarity'
        ),
        forwardRef(() => AuthModule),
        EmailModule
    ],
    exports: [UsersRepository, UsersService],
    providers: [UsersService, UsersRepository, GitlabIntegrationTokenService, OrganizationsMemberService],
    controllers: [UsersController]
})
export class UsersModule {}
