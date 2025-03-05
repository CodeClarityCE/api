import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from 'src/base_modules/users/users.entity';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { UsersRepository } from './users.repository';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
    imports: [
        OrganizationsModule,
        EmailModule,
        forwardRef(() => AuthModule),
        TypeOrmModule.forFeature(
            [User],
            'codeclarity'
        ),
    ],
    exports: [UsersRepository, UsersService],
    providers: [UsersService, UsersRepository],
    controllers: [UsersController]
})
export class UsersModule { }
