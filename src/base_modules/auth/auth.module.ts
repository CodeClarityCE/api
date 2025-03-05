import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { CombinedAuthGuard } from './guards/combined.guard';
import { CONST_JWT_ALGORITHM, CONST_JWT_TOKEN_EXPIRES_IN } from './constants';
import { GitlabIntegrationTokenService } from 'src/base_modules/integrations/gitlab/gitlabToken.service';
import { GithubAuthController } from './github.controller';
import { GitlabAuthController } from './gitlab.controller';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';

const fs = require('fs');

/**
 * Authentication module, that secures the endpoints of the API
 */
@Module({
    imports: [
        PassportModule,
        EmailModule,
        UsersModule,
        OrganizationsModule,
        JwtModule.register({
            global: true,
            publicKey: fs.readFileSync('./jwt/public.pem', 'utf8'),
            privateKey: fs.readFileSync('./jwt/private.pem', 'utf8'),
            signOptions: { expiresIn: CONST_JWT_TOKEN_EXPIRES_IN, algorithm: CONST_JWT_ALGORITHM }
        }),
    ],
    providers: [
        AuthService,
        GitlabIntegrationTokenService,

        // Globally enable the JWT & API key authentication
        {
            provide: APP_GUARD,
            useClass: CombinedAuthGuard
        }
    ],
    controllers: [AuthController, GitlabAuthController, GithubAuthController],
    exports: [AuthService]
})
export class AuthModule {}
