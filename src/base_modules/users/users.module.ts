
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/base_modules/users/users.entity';

import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';

import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
    imports: [
        OrganizationsModule,
        EmailModule,
        ProjectsModule,
        forwardRef(() => AuthModule),
        TypeOrmModule.forFeature([User], 'codeclarity')
    ],
    exports: [UsersRepository, UsersService],
    providers: [UsersService, UsersRepository],
    controllers: [UsersController]
})
export class UsersModule {}
