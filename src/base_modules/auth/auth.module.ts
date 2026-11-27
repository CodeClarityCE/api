import { forwardRef, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import * as fs from "fs";

import { EmailModule } from "../email/email.module";
import { UsersModule } from "../users/users.module";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AUTH_SERVICE } from "./auth.tokens";
import { CONST_JWT_ALGORITHM, CONST_JWT_TOKEN_EXPIRES_IN } from "./constants";
import { CombinedAuthGuard } from "./guards/combined.guard";
import { RefreshToken } from "./refresh-token.entity";
import { RefreshTokenSweep } from "./refresh-token-sweep";
import { RefreshTokensService } from "./refresh-tokens.service";

/**
 * Authentication module, that secures the endpoints of the API
 */
@Module({
  imports: [
    EmailModule,
    TypeOrmModule.forFeature([RefreshToken], "codeclarity"),
    forwardRef(() => UsersModule), // Service-level circular dep: AuthService <-> UsersService
    JwtModule.register({
      global: true,
      publicKey: fs.readFileSync("./jwt/public.pem", "utf8"),
      privateKey: fs.readFileSync("./jwt/private.pem", "utf8"),
      signOptions: {
        expiresIn: CONST_JWT_TOKEN_EXPIRES_IN,
        algorithm: CONST_JWT_ALGORITHM,
      },
    }),
  ],
  providers: [
    AuthService,
    { provide: AUTH_SERVICE, useExisting: AuthService },
    RefreshTokensService,
    RefreshTokenSweep,

    // Globally enable the JWT & API key authentication
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService, AUTH_SERVICE],
})
export class AuthModule {}
