import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { type Request } from "express";
import { readFileSync } from "fs";
import type { Jwt } from "jsonwebtoken";
import { join } from "path";
import { Socket } from "socket.io";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import {
  claimsOfKind,
  TokenKind,
  verifyOptionsFor,
} from "src/base_modules/auth/token-kinds";
import {
  ORGANIZATION_TOKEN_PREFIX,
  OrganizationTokenScope,
  scopeIncludes,
} from "src/base_modules/organizations/tokens/organization-token.types";
import { OrganizationTokensService } from "src/base_modules/organizations/tokens/organization-tokens.service";
import { ORGANIZATION_TOKEN_SCOPE_KEY } from "src/decorators/OrganizationTokenDecorator";
import { SKIP_AUTH_KEY } from "src/decorators/SkipAuthDecorator";
import {
  AccountNotActivated,
  NotAuthenticated,
  NotAuthorized,
  OrganizationTokenScopeTooNarrow,
} from "src/types/error.types";

/** The parts of a Fastify request the token check reads. */
interface RoutedRequest {
  method: string;
  params?: Record<string, string>;
  routeOptions?: { url?: string };
}

/**
 * Guards every route that does not skip auth with a bearer JWT, or with an
 * Organization token on routes that allow one.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  publicKey: string;

  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private organizationTokens: OrganizationTokensService,
  ) {
    this.publicKey = readFileSync(
      join(process.cwd(), "jwt", "public.pem"),
      "utf8",
    );
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

    let authHeader: string | undefined;
    let request: Request | undefined = undefined;
    let socket: Socket | undefined = undefined;
    if (context.getType() === "ws") {
      // console.log(context.switchToWs().getClient());
      socket = context.switchToWs().getClient();
      authHeader = socket?.handshake.headers.authorization;
    } else {
      request = context.switchToHttp().getRequest();
      authHeader = request?.headers.authorization;
    }

    const jwtToken = this.extractJWTTokenFromHeader(authHeader);
    if (!jwtToken) {
      throw new NotAuthenticated();
    }

    if (jwtToken.startsWith(ORGANIZATION_TOKEN_PREFIX)) {
      if (!request) throw new NotAuthenticated();
      request.user = await this.authorizeOrganizationToken(
        jwtToken,
        context,
        request as unknown as RoutedRequest,
      );
      return true;
    }

    const [jwtTokenValid, userJWT] = await this.verifyJWTToken(jwtToken);
    if (!jwtTokenValid) throw new NotAuthenticated();
    if (!userJWT?.activated) throw new AccountNotActivated();
    if (request) {
      request.user = userJWT;
    } else if (socket) {
      (socket.data as { user?: AuthenticatedUser }).user = userJWT;
    }
    return true;
  }

  /**
   * Checks that the token may call this route in this organization, and
   * records the call in the organization's audit log.
   * @throws {NotAuthenticated} for an unknown or expired token
   * @throws {NotAuthorized} for a route or organization the token may not use
   * @throws {OrganizationTokenScopeTooNarrow} for a route that needs a wider scope
   */
  private async authorizeOrganizationToken(
    secret: string,
    context: ExecutionContext,
    request: RoutedRequest,
  ): Promise<AuthenticatedUser> {
    const token = await this.organizationTokens.authenticate(secret);
    const required = this.reflector.getAllAndOverride<
      OrganizationTokenScope | undefined
    >(ORGANIZATION_TOKEN_SCOPE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) throw new NotAuthorized();
    if (!scopeIncludes(token.scope, required)) {
      throw new OrganizationTokenScopeTooNarrow();
    }
    const orgId =
      request.params?.["org_id"] ?? request.params?.["organization_id"];
    if (orgId !== token.organizationId) throw new NotAuthorized();

    await this.organizationTokens.recordUse(
      token,
      `${request.method} ${request.routeOptions?.url ?? "an unknown route"}`,
    );
    const user = new AuthenticatedUser(token.id, [ROLE.USER], true);
    user.organizationToken = token;
    return user;
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
   * Verifies that a given JWT token is valid.
   * @param token the JWT token
   * @returns {Promise<[boolean, AuthenticatedUser|undefined]>} (1) a boolean indicating if it is valid, and (2) the user to which the JWT token belongs if valid otherwise undefined
   */
  private async verifyJWTToken(
    token: string,
  ): Promise<[boolean, AuthenticatedUser | undefined]> {
    try {
      // Only access tokens may be bearers; refresh and untyped tokens fail here.
      const verified = await this.jwtService.verifyAsync<Jwt>(token, {
        secret: this.publicKey,
        ...verifyOptionsFor(TokenKind.ACCESS),
      });
      const payload = claimsOfKind(verified, TokenKind.ACCESS);
      // TODO: get roles from payload
      return [
        true,
        new AuthenticatedUser(
          payload.userId,
          payload.roles,
          payload.activated ?? false,
        ),
      ];
    } catch {
      return [false, undefined];
    }
  }
}
