import { readFileSync } from "fs";
import { join } from "path";
import { type Request } from "express";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Algorithm } from "jsonwebtoken";
import { Socket } from "socket.io";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { JWTPayload } from "src/base_modules/auth/guards/jwt.types";
import { SKIP_AUTH_KEY } from "src/decorators/SkipAuthDecorator";
import { NotAuthenticated, AccountNotActivated } from "src/types/error.types";

// import { ApiKeysService } from 'src/codeclarity_modules/apiKeys/apiKeys.service';

/**
 * This is a guard that combines JWT and API authentication.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  publicKey: string;
  algorithms: Algorithm[];

  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    // private apiKeyService: ApiKeysService
  ) {
    this.publicKey = readFileSync(
      join(process.cwd(), "jwt", "public.pem"),
      "utf8",
    );
    this.algorithms = ["ES512"];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this endpoint is a public / non-auth endpoint
    const isNonAuthEndpoint = this.reflector.getAllAndOverride<boolean>(
      SKIP_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isNonAuthEndpoint) {
      return true;
    }

    let authHeader: string | undefined = undefined;
    let apiHeader: string | string[] | undefined = undefined;
    let request: Request | undefined = undefined;
    let socket: Socket | undefined = undefined;
    if (context.getType() === "ws") {
      // console.log(context.switchToWs().getClient());
      socket = context.switchToWs().getClient();
      authHeader = socket?.handshake.headers.authorization;
    } else {
      // If the endpoint requires authentication, check jwt and api tokens
      request = context.switchToHttp().getRequest();
      authHeader = request?.headers.authorization;
      apiHeader =
        request?.headers["x-api-key"] ?? request?.headers["X-API-KEY"];
    }

    const jwtToken = this.extractJWTTokenFromHeader(authHeader);
    const apiToken = this.extractAPITokenFromHeader(apiHeader);

    // If neither api token nor jwt token are given, the user is not authenticated
    if (!jwtToken && !apiToken) {
      throw new NotAuthenticated();
    }

    if (jwtToken) {
      // 1. Verify jwt token (stateless no db lookup -> faster)
      const [jwtTokenValid, userJWT] = await this.verifyJWTToken(jwtToken);
      if (!userJWT?.activated) throw new AccountNotActivated();
      if (jwtTokenValid) {
        if (request) {
          request.user = userJWT;
        } else if (socket) {
          (socket.data as { user?: AuthenticatedUser }).user = userJWT;
        }
        return true;
      }
    }

    throw new Error("Not implemented");
    // TODO: Implement API token verification
    // if (apiToken) {
    //     // 2. Verify api token (costly, requires db lookup)
    //     const [apiTokenValid, userAPI] = await this.verifyAPIToken(apiToken);
    //     if (!userAPI?.activated) throw new AccountNotActivated();
    //     if (apiTokenValid) {
    //         await this.apiKeyService.addApiKeyUsageLog(
    //             await this.apiKeyService.getApiKeyDigest(apiToken),
    //             request.originalUrl,
    //             request.ip || ''
    //         );
    //         request['user'] = userAPI;
    //         return true;
    //     }
    // }
    // throw new NotAuthenticated();
  }

  /**
   * Extracts the JWT token from the HTTP headers
   * @param request Request object
   * @returns {Promise<string | undefined>} the bearer token, if present, otherwise undefined.
   */
  private extractJWTTokenFromHeader(
    authHeader: string | undefined,
  ): string | undefined {
    if (authHeader) {
      const [type, token] = authHeader.split(" ") ?? [];
      if (type === "Bearer") {
        return token;
      }
    }
    return undefined;
  }

  /**
   * Extracts the API token from the HTTP headers
   * @param request Request object
   * @returns {Promise<[string | undefined]>} the api token, if present, otherwise undefined.
   */
  private extractAPITokenFromHeader(
    apiHeader: string | string[] | undefined,
  ): string | undefined {
    if (apiHeader && typeof apiHeader === "string") {
      return apiHeader;
    }
    return undefined;
  }

  /**
   * Verifies that a given JWT token is valid.
   * @param token the JWT token
   * @returns {Promise<[boolean, AuthenticatedUser|undefined]>} (1) a boolean indicating if it is valid, and (2) the user to which the JWT token belongs if valid otherwise undefined
   */
  private async verifyJWTToken(
    token: string,
  ): Promise<[boolean, AuthenticatedUser | undefined]> {
    try {
      const payload: JWTPayload = await this.jwtService.verifyAsync(token, {
        secret: this.publicKey,
        algorithms: this.algorithms,
      });
      // TODO: get roles from payload
      return [
        true,
        new AuthenticatedUser(
          payload.userId,
          payload.roles as ROLE[],
          payload.activated,
        ),
      ];
    } catch {
      return [false, undefined];
    }
  }
}
