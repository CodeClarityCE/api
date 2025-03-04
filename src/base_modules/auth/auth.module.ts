import { forwardRef, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RefreshJWTStrategy } from './strategies/refresh-token.strategy';
import { ApiKeysService } from 'src/base_modules/apiKeys/apiKeys.service';
import { CombinedAuthGuard } from './guards/combined.guard';
import { CONST_JWT_ALGORITHM, CONST_JWT_TOKEN_EXPIRES_IN } from './constants';
import { ConfigService } from '@nestjs/config';
import { GitlabIntegrationTokenService } from 'src/base_modules/integrations/gitlab/gitlabToken.service';
import { GithubIntegrationTokenService } from 'src/base_modules/integrations/github/githubToken.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { OrganizationsMemberService } from '../organizations/organizationMember.service';
import { GithubAuthController } from './github.controller';
import { GitlabAuthController } from './gitlab.controller';
import { EmailModule } from '../email/email.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { Email } from 'src/entity/codeclarity/Email';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Integration } from 'src/entity/codeclarity/Integration';

const fs = require('fs');

/**
 * Authentication module, that secures the endpoints of the API
 */
@Module({
    imports: [
        PassportModule,
        EmailModule,
        UsersModule,
        JwtModule.register({
            global: true,
            publicKey: fs.readFileSync('./jwt/public.pem', 'utf8'),
            privateKey: fs.readFileSync('./jwt/private.pem', 'utf8'),
            signOptions: { expiresIn: CONST_JWT_TOKEN_EXPIRES_IN, algorithm: CONST_JWT_ALGORITHM }
        }),
        TypeOrmModule.forFeature(
            [Email, Organization, OrganizationMemberships, Integration],
            'codeclarity'
        )
    ],
    providers: [
        ApiKeysService,
        AuthService,
        RefreshJWTStrategy,
        ConfigService,
        GitlabIntegrationTokenService,
        GithubIntegrationTokenService,
        IntegrationsService,
        OrganizationsMemberService,

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
