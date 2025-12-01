import * as fs from 'fs';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GitlabIntegrationTokenService } from 'src/base_modules/integrations/gitlab/gitlabToken.service';
import { EmailModule } from '../email/email.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CONST_JWT_ALGORITHM, CONST_JWT_TOKEN_EXPIRES_IN } from './constants';
import { GithubAuthController } from './github.controller';
import { GitlabAuthController } from './gitlab.controller';
import { CombinedAuthGuard } from './guards/combined.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshJWTStrategy } from './strategies/refresh-token.strategy';

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
        })
    ],
    providers: [
        AuthService,
        GitlabIntegrationTokenService,
        JwtStrategy,
        RefreshJWTStrategy,

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
